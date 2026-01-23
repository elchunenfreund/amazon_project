const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { spawn, exec } = require('child_process');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = process.env.PORT || 3000;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/amazon_tracker',
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

let currentScraperProcess = null;

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());

// Helper function to format time in Montreal timezone
function formatMontrealTime(date) {
    if (!date) return '--:--:--';
    return new Date(date).toLocaleTimeString('en-US', { timeZone: 'America/Montreal' });
}

function formatMontrealDateTime(date) {
    if (!date) return '';
    return new Date(date).toLocaleString('en-US', { timeZone: 'America/Montreal' });
}

app.get('/', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM daily_reports ORDER BY asin, check_date DESC`);
        const grouped = {};
        result.rows.forEach(row => {
            if (!grouped[row.asin]) grouped[row.asin] = [];
            grouped[row.asin].push(row);
        });

        // Get product metadata (comment, snooze_until) for each ASIN
        const productMeta = await pool.query(`SELECT asin, comment, snooze_until FROM products`);
        const metaMap = {};
        productMeta.rows.forEach(row => {
            metaMap[row.asin] = { comment: row.comment, snooze_until: row.snooze_until };
        });

        // Create Set of valid ASINs (only those in products table)
        const validAsins = new Set(productMeta.rows.map(row => row.asin));

        const dashboardData = [];

        // Process ASINs that have reports - only include those that still exist in products table
        for (const asin in grouped) {
            // Skip ASINs that have been deleted from products table
            if (!validAsins.has(asin)) {
                continue;
            }
            const history = grouped[asin];
            const latest = history[0];
            const previous = history[1];

            let hasChanged = false;
            if (previous) {
                if (latest.availability !== previous.availability) hasChanged = true;
                if (latest.stock_level !== previous.stock_level) hasChanged = true;
                if (latest.price !== previous.price) hasChanged = true;
                if (latest.seller !== previous.seller) hasChanged = true;
            }
            latest.hasChanged = hasChanged;

            // Add metadata
            const meta = metaMap[asin] || {};
            latest.comment = meta.comment || '';
            latest.snooze_until = meta.snooze_until;
            latest.isSnoozed = meta.snooze_until && new Date(meta.snooze_until) > new Date();
            latest.hasReports = true;
            latest.history = history.map(row => ({
                ...row,
                check_date_formatted: formatMontrealDateTime(row.check_date),
                isPriceChange: false,
                isStockChange: false,
                isSellerChange: false
            }));

            // Mark changes in history
            for(let i = 0; i < latest.history.length - 1; i++) {
                const curr = latest.history[i];
                const prev = latest.history[i + 1];
                curr.isPriceChange = (curr.price !== prev.price);
                curr.isStockChange = (curr.availability !== prev.availability) || (curr.stock_level !== prev.stock_level);
                curr.isSellerChange = (curr.seller !== prev.seller);
            }

            dashboardData.push(latest);
        }

        // Add ASINs from products table that don't have reports yet
        for (const product of productMeta.rows) {
            if (!grouped[product.asin]) {
                // Create placeholder entry for ASINs without reports
                const placeholder = {
                    asin: product.asin,
                    header: 'No data yet - Run report to fetch product info',
                    availability: 'Pending',
                    stock_level: 'N/A',
                    seller: 'N/A',
                    price: 'N/A',
                    ranking: 'N/A',
                    check_date: null,
                    hasChanged: false,
                    comment: product.comment || '',
                    snooze_until: product.snooze_until,
                    isSnoozed: product.snooze_until && new Date(product.snooze_until) > new Date(),
                    hasReports: false,
                    history: []
                };
                dashboardData.push(placeholder);
            }
        }

        const timeResult = await pool.query(`SELECT check_date FROM daily_reports ORDER BY check_date DESC LIMIT 1`);
        const lastSync = formatMontrealTime(timeResult.rows[0]?.check_date);

        // Sort: snoozed items to bottom, then by hasChanged, then by ASIN
        dashboardData.sort((a, b) => {
            if (a.isSnoozed !== b.isSnoozed) return a.isSnoozed ? 1 : -1;
            return (b.hasChanged - a.hasChanged) || a.asin.localeCompare(b.asin);
        });

        res.render('index', { reports: dashboardData, lastSyncTime: lastSync });
    } catch (err) { res.status(500).send(err.message); }
});

app.post('/run-report', (req, res) => {
    if (currentScraperProcess) return res.status(400).send("Running");

    // Spawn detached so we can track it better
    currentScraperProcess = spawn(process.execPath, ['check_asin.js']);

    currentScraperProcess.stdout.on('data', (data) => io.emit('scraper-log', data.toString().trim()));
    currentScraperProcess.stderr.on('data', (data) => io.emit('scraper-log', `⚠️ ${data}`));

    currentScraperProcess.on('close', () => {
        currentScraperProcess = null;
        io.emit('scraper-done', formatMontrealTime(new Date()));
    });

    res.sendStatus(200);
});

app.post('/run-report-selected', (req, res) => {
    if (currentScraperProcess) return res.status(400).json({ error: "A report is already running" });

    const { asins } = req.body;
    if (!asins || !Array.isArray(asins) || asins.length === 0) {
        return res.status(400).json({ error: "No ASINs selected" });
    }

    // Spawn with selected ASINs as arguments
    currentScraperProcess = spawn(process.execPath, ['check_asin.js', ...asins], {
        env: { ...process.env }
    });

    currentScraperProcess.stdout.on('data', (data) => io.emit('scraper-log', data.toString().trim()));
    currentScraperProcess.stderr.on('data', (data) => io.emit('scraper-log', `⚠️ ${data}`));

    currentScraperProcess.on('close', () => {
        currentScraperProcess = null;
        io.emit('scraper-done', formatMontrealTime(new Date()));
    });

    res.json({ success: true, count: asins.length });
});

// --- NUCLEAR STOP OPTION ---
app.post('/stop-report', (req, res) => {
    // 1. Kill the reference we know about
    if (currentScraperProcess) {
        currentScraperProcess.kill('SIGKILL');
        currentScraperProcess = null;
    }

    // 2. SAFETY NET: Execute system command to kill any lingering "check_asin.js" processes
    const platform = process.platform;
    const cmd = platform === 'win32'
        ? `wmic process where "CommandLine like '%check_asin.js%'" call terminate`
        : `pkill -f check_asin.js`;

    exec(cmd, (err, stdout, stderr) => {
        console.log("Force kill command executed.");
    });

    io.emit('scraper-log', "🛑 FORCE STOPPED ALL SCRAPERS");
    io.emit('scraper-done', formatMontrealTime(new Date()));

    res.sendStatus(200);
});

app.get('/history/:asin', async (req, res) => {
    const result = await pool.query(`SELECT * FROM daily_reports WHERE asin = $1 ORDER BY check_date DESC`, [req.params.asin]);
    const rows = result.rows;

    // Format dates for all rows first
    rows.forEach(row => {
        row.check_date_formatted = formatMontrealDateTime(row.check_date);
    });

    // Then compare adjacent rows for change detection
    for(let i=0; i<rows.length-1; i++) {
        const curr = rows[i];
        const prev = rows[i+1];
        curr.isPriceChange = (curr.price !== prev.price);
        curr.isStockChange = (curr.availability !== prev.availability) || (curr.stock_level !== prev.stock_level);
        curr.isSellerChange = (curr.seller !== prev.seller);
    }

    res.render('history', { reports: rows, asin: req.params.asin });
});

// API Endpoints
app.post('/api/asins', async (req, res) => {
    try {
        const { asin } = req.body;
        if (!asin || typeof asin !== 'string' || asin.trim().length === 0) {
            return res.status(400).json({ error: 'ASIN is required' });
        }

        const cleanAsin = asin.trim().toUpperCase();
        // Basic ASIN validation (10 characters, alphanumeric)
        if (!/^[A-Z0-9]{10}$/.test(cleanAsin)) {
            return res.status(400).json({ error: 'Invalid ASIN format. ASIN must be 10 alphanumeric characters.' });
        }

        await pool.query('INSERT INTO products (asin) VALUES ($1) ON CONFLICT (asin) DO NOTHING', [cleanAsin]);
        res.json({ success: true, asin: cleanAsin });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/asins/:asin', async (req, res) => {
    try {
        const { asin } = req.params;
        const result = await pool.query('DELETE FROM products WHERE asin = $1', [asin]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'ASIN not found' });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/asins/:asin/comment', async (req, res) => {
    try {
        const { asin } = req.params;
        const { comment } = req.body;
        const result = await pool.query(
            'UPDATE products SET comment = $1 WHERE asin = $2',
            [comment || null, asin]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'ASIN not found' });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/asins/:asin/snooze', async (req, res) => {
    try {
        const { asin } = req.params;
        const { snooze_until } = req.body;
        const result = await pool.query(
            'UPDATE products SET snooze_until = $1 WHERE asin = $2',
            [snooze_until || null, asin]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'ASIN not found' });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Check if scraper is currently running
app.get('/api/scraper-status', (req, res) => {
    // #region agent log
    const debugInfo = {
        timestamp: Date.now(),
        location: 'server.js:scraper-status',
        message: 'Checking scraper status',
        data: {
            currentScraperProcess: currentScraperProcess ? 'exists' : 'null',
            isRunning: !!currentScraperProcess
        },
        sessionId: 'debug-session',
        runId: 'run1',
        hypothesisId: 'A'
    };
    fetch('http://127.0.0.1:7242/ingest/fda94e7d-8ef6-44ca-a90c-9c591fc930f3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(debugInfo)}).catch(()=>{});
    // #endregion
    res.json({ running: !!currentScraperProcess });
});

server.listen(port, () => console.log(`Active on ${port}`));
