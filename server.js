const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { spawn, exec } = require('child_process');
const { Pool } = require('pg');
const multer = require('multer');
const ExcelJS = require('exceljs');
const session = require('express-session');
const crypto = require('crypto');

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

// Session configuration for OAuth state management
app.use(session({
    secret: process.env.OAUTH_STATE_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // HTTPS only in production
        httpOnly: true,
        maxAge: 600000 // 10 minutes
    }
}));

// Configure multer for file uploads (memory storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
            'application/vnd.ms-excel', // .xls
            'text/csv', // .csv
            'application/csv', // .csv alternative
            'application/octet-stream' // fallback
        ];
        if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls|csv|numbers)$/i)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only Excel files (.xlsx, .xls), CSV files (.csv), or Numbers files (.numbers) are allowed.'));
        }
    }
});

// Database schema helper functions
async function getTableColumns() {
    const result = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'products'
        ORDER BY ordinal_position
    `);
    return result.rows.map(row => ({
        name: row.column_name,
        type: row.data_type
    }));
}

function sanitizeColumnName(name) {
    // Convert to lowercase, replace spaces/special chars with underscores, keep only alphanumeric and underscores
    let sanitized = name.toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^_|_$/g, '');

    // Ensure it starts with a letter or underscore
    if (!/^[a-z_]/.test(sanitized)) {
        sanitized = 'col_' + sanitized;
    }

    // PostgreSQL identifier limit is 63 characters
    if (sanitized.length > 63) {
        sanitized = sanitized.substring(0, 63);
    }

    // Ensure it's not empty
    if (!sanitized) {
        sanitized = 'column_' + Date.now();
    }

    return sanitized;
}

// Fuzzy matching function to find best matching database column for an Excel column
function findBestMatch(excelColName, dbColumns) {
    if (!excelColName || !dbColumns || dbColumns.length === 0) {
        return null;
    }

    const excelLower = excelColName.toLowerCase().trim();
    const excelSanitized = sanitizeColumnName(excelColName);

    // Priority 1: Exact match (case-insensitive)
    let match = dbColumns.find(col => col.name.toLowerCase() === excelLower);
    if (match) return match.name;

    // Priority 2: Sanitized match (excel name sanitized == db name)
    match = dbColumns.find(col => col.name === excelSanitized);
    if (match) return match.name;

    // Priority 3: DB column name contains Excel column name (or vice versa)
    match = dbColumns.find(col => {
        const dbLower = col.name.toLowerCase();
        return dbLower.includes(excelLower) || excelLower.includes(dbLower);
    });
    if (match) return match.name;

    // Priority 4: Sanitized Excel name contains DB name (or vice versa)
    match = dbColumns.find(col => {
        const dbLower = col.name.toLowerCase();
        return dbLower.includes(excelSanitized) || excelSanitized.includes(dbLower);
    });
    if (match) return match.name;

    // Priority 5: Word-based matching (check if key words match)
    const excelWords = excelLower.split(/[_\s-]+/).filter(w => w.length > 2);
    if (excelWords.length > 0) {
        match = dbColumns.find(col => {
            const dbLower = col.name.toLowerCase();
            return excelWords.some(word => dbLower.includes(word));
        });
        if (match) return match.name;
    }

    return null; // No match found
}

async function addColumnToTable(columnName, dataType) {
    const sanitized = sanitizeColumnName(columnName);

    // Map data types
    let pgType = 'TEXT';
    if (dataType === 'numeric' || dataType === 'number') {
        pgType = 'NUMERIC';
    }

    // Check if column already exists
    const existingColumns = await getTableColumns();
    if (existingColumns.some(col => col.name === sanitized)) {
        throw new Error(`Column ${sanitized} already exists`);
    }

    // Add column using parameterized query (column name must be sanitized, not parameterized)
    await pool.query(`ALTER TABLE products ADD COLUMN "${sanitized}" ${pgType}`);

    console.log(`Added column ${sanitized} (${pgType}) to products table`);
    return sanitized;
}

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
            metaMap[row.asin] = {
                comment: row.comment,
                snooze_until: row.snooze_until
            };
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
                const meta = metaMap[product.asin] || {};
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
                    comment: meta.comment || '',
                    snooze_until: meta.snooze_until,
                    isSnoozed: meta.snooze_until && new Date(meta.snooze_until) > new Date(),
                    hasReports: false,
                    history: [],
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
    } catch (err) {
        res.status(500).send(err.message);
    }
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

app.get('/products', async (req, res) => {
    try {
        // Get all products with all columns
        const result = await pool.query(`SELECT * FROM products ORDER BY asin`);

        // Get column information for dynamic rendering
        const columns = await getTableColumns();

        res.render('products', {
            products: result.rows,
            columns: columns.filter(col => col.name !== 'id') // Exclude id column from display
        });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// Get product table columns (must come before /:asin route)
app.get('/api/products/columns', async (req, res) => {
    try {
        const columns = await getTableColumns();
        res.json(columns);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Find duplicate ASINs (must come before /:asin route)
app.get('/api/products/duplicates', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT asin, COUNT(*) as count, array_agg(id ORDER BY id) as ids
            FROM products
            GROUP BY asin
            HAVING COUNT(*) > 1
            ORDER BY asin
        `);

        const duplicates = [];
        for (const row of result.rows) {
            // Get all entries for this ASIN
            const entriesResult = await pool.query(
                'SELECT * FROM products WHERE asin = $1 ORDER BY id',
                [row.asin]
            );

            duplicates.push({
                asin: row.asin,
                count: row.count,
                entries: entriesResult.rows
            });
        }

        res.json({ duplicates });
    } catch (err) {
        console.error('Find duplicates error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get single product by ASIN (must come AFTER specific routes like /duplicates)
app.get('/api/products/:asin', async (req, res) => {
    try {
        const { asin } = req.params;
        const result = await pool.query('SELECT * FROM products WHERE asin = $1', [asin]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete product by ID (for duplicate cleanup)
app.delete('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM products WHERE id = $1', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API Endpoints
app.post('/api/asins', async (req, res) => {
    try {
        const { asin, replace } = req.body;
        if (!asin || typeof asin !== 'string' || asin.trim().length === 0) {
            return res.status(400).json({ error: 'ASIN is required' });
        }

        const cleanAsin = asin.trim().toUpperCase();
        // Basic ASIN validation (10 characters, alphanumeric)
        if (!/^[A-Z0-9]{10}$/.test(cleanAsin)) {
            return res.status(400).json({ error: 'Invalid ASIN format. ASIN must be 10 alphanumeric characters.' });
        }

        // Check if ASIN already exists
        const existingCheck = await pool.query('SELECT asin FROM products WHERE asin = $1', [cleanAsin]);
        const exists = existingCheck.rows.length > 0;

        if (exists && !replace) {
            // Return info that it exists, but don't add it
            return res.json({
                success: false,
                exists: true,
                asin: cleanAsin,
                message: 'ASIN already exists in database'
            });
        }

        if (exists && replace) {
            // ASIN already exists, but user wants to replace - just return success (no-op since ASIN is the key)
            return res.json({ success: true, asin: cleanAsin, replaced: false, message: 'ASIN already exists (ASIN cannot be changed)' });
        }

        // Insert new ASIN
        await pool.query('INSERT INTO products (asin) VALUES ($1)', [cleanAsin]);
        res.json({ success: true, asin: cleanAsin, added: true });
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

// PUT endpoint for updating product fields (from products page edit modal)
app.put('/api/asins/:asin', async (req, res) => {
    try {
        const { asin } = req.params;
        const updateData = req.body;

        // Get current product data to compare
        const currentResult = await pool.query('SELECT * FROM products WHERE asin = $1', [asin]);
        if (currentResult.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const currentData = currentResult.rows[0];
        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;

        for (const [key, value] of Object.entries(updateData)) {
            if (key === 'asin' || key === 'id') continue; // Skip ASIN and ID

            // Normalize values for comparison
            let currentValue = currentData[key];
            let newValue = value;

            if (currentValue !== null && currentValue !== undefined) {
                if (currentValue instanceof Date) {
                    currentValue = currentValue.toISOString();
                } else {
                    currentValue = String(currentValue).trim();
                }
            } else {
                currentValue = null;
            }

            if (newValue !== null && newValue !== undefined) {
                if (newValue instanceof Date) {
                    newValue = newValue.toISOString();
                } else {
                    newValue = String(newValue).trim();
                }
            } else {
                newValue = null;
            }

            // Only update if value actually changed
            if (currentValue !== newValue) {
                updateFields.push(`"${key}" = $${paramIndex}`);
                updateValues.push(value);
                paramIndex++;
            }
        }

        if (updateFields.length === 0) {
            return res.json({ success: true, message: 'No changes detected' });
        }

        updateValues.push(asin);
        await pool.query(
            `UPDATE products SET ${updateFields.join(', ')} WHERE asin = $${paramIndex}`,
            updateValues
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Helper function to parse CSV (handles quoted values, commas in quotes, etc.)
function parseCSV(buffer) {
    const text = buffer.toString('utf-8');
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) return { headers: [], rows: [] };

    function parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];

            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    // Escaped quote
                    current += '"';
                    i++; // Skip next quote
                } else {
                    // Toggle quote state
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                // Field separator
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        // Add last value
        values.push(current.trim());

        return values;
    }

    // Parse header row
    const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, ''));

    // Parse data rows
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        // Pad with empty strings if row is shorter than headers
        while (values.length < headers.length) {
            values.push('');
        }
        // Only add row if it has at least one non-empty value
        if (values.some(v => v)) {
            rows.push(values);
        }
    }

    return { headers, rows };
}

// Helper function to detect file type
function detectFileType(filename, mimetype) {
    const ext = filename.toLowerCase().split('.').pop();
    if (ext === 'csv' || mimetype === 'text/csv' || mimetype === 'application/csv') {
        return 'csv';
    } else if (ext === 'numbers') {
        return 'numbers';
    } else {
        return 'excel';
    }
}

// Excel/CSV/Numbers Upload Endpoints
app.post('/api/upload-excel/preview', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const fileType = detectFileType(req.file.originalname, req.file.mimetype);
        let excelColumns = [];
        let rowCount = 0;

        if (fileType === 'csv') {
            // Parse CSV
            const { headers, rows } = parseCSV(req.file.buffer);
            rowCount = rows.length;

            excelColumns = headers.map((header, index) => ({
                name: header,
                index: index + 1,
                suggestedType: 'text'
            }));

            // Sample first 10 rows to determine data types
            const sampleSize = Math.min(10, rows.length);
            for (const col of excelColumns) {
                let allNumeric = true;
                let hasData = false;

                for (let rowNum = 0; rowNum < sampleSize; rowNum++) {
                    const value = rows[rowNum][col.index - 1];
                    if (value !== null && value !== undefined && value !== '') {
                        hasData = true;
                        if (isNaN(parseFloat(value))) {
                            allNumeric = false;
                            break;
                        }
                    }
                }

                if (hasData && allNumeric) {
                    col.suggestedType = 'numeric';
                }
            }
        } else if (fileType === 'numbers') {
            return res.status(400).json({
                error: 'Numbers files (.numbers) are not directly supported. Please export your Numbers file to CSV or Excel format first.',
                suggestion: 'In Numbers: File > Export To > CSV or Excel'
            });
        } else {
            // Excel file
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(req.file.buffer);

            const worksheet = workbook.getWorksheet(1) || workbook.worksheets[0];
            if (!worksheet) {
                return res.status(400).json({ error: 'Excel file has no worksheets' });
            }

            rowCount = worksheet.rowCount;

            // Get headers from first row
            const headerRow = worksheet.getRow(1);
            headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
                const headerValue = cell.text.trim();
                if (headerValue) {
                    excelColumns.push({
                        name: headerValue,
                        index: colNumber,
                        suggestedType: 'text' // Will be determined below
                    });
                }
            });

            // Sample first 10 rows to determine data types
            const sampleSize = Math.min(10, worksheet.rowCount - 1);
            for (const col of excelColumns) {
                let allNumeric = true;
                let hasData = false;

                for (let rowNum = 2; rowNum <= sampleSize + 1; rowNum++) {
                    const cell = worksheet.getCell(rowNum, col.index);
                    if (cell.value !== null && cell.value !== undefined && cell.value !== '') {
                        hasData = true;
                        const value = cell.value;
                        if (typeof value !== 'number' && (typeof value === 'string' && isNaN(parseFloat(value)))) {
                            allNumeric = false;
                            break;
                        }
                    }
                }

                if (hasData && allNumeric) {
                    col.suggestedType = 'numeric';
                }
            }
        }

        // Get current database columns
        const dbColumns = await getTableColumns();
        // Create a set of all possible column name variations for matching
        // DB columns are already sanitized when stored, so we compare sanitized versions
        const dbColumnMatches = new Set();
        dbColumns.forEach(col => {
            // Add exact name (case-insensitive)
            dbColumnMatches.add(col.name.toLowerCase());
            // Add sanitized version (in case DB column was created with sanitized name)
            dbColumnMatches.add(sanitizeColumnName(col.name));
        });

        // System columns to exclude
        const systemColumns = ['id', 'asin'];

        // Find new columns (not in DB and not system columns)
        const newColumns = excelColumns.filter(col => {
            const colNameLower = col.name.toLowerCase();
            const colSanitized = sanitizeColumnName(col.name);

            // Check if column exists in DB by comparing:
            // 1. Exact name match (case-insensitive): "Product Name" vs "Product Name"
            // 2. Sanitized name match: "Product Name" (sanitized to "product_name") vs "product_name" in DB
            const exactMatch = dbColumnMatches.has(colNameLower);
            const sanitizedMatch = dbColumnMatches.has(colSanitized);

            // Also check reverse: if DB column name (when sanitized) matches Excel column (when sanitized)
            const reverseMatch = dbColumns.some(dbCol => {
                const dbColSanitized = sanitizeColumnName(dbCol.name);
                return dbColSanitized === colSanitized || dbCol.name.toLowerCase() === colNameLower;
            });

            return !exactMatch &&
                   !sanitizedMatch &&
                   !reverseMatch &&
                   !systemColumns.includes(colNameLower) &&
                   colNameLower !== 'asin'; // Ensure ASIN column is not treated as new
        });

        // Find ASIN column (case-insensitive)
        const asinColumn = excelColumns.find(col =>
            col.name.toLowerCase() === 'asin' ||
            col.name.toLowerCase().includes('asin')
        );

        if (!asinColumn && newColumns.length === 0) {
            return res.status(400).json({ error: 'No ASIN column found in Excel file' });
        }

        // Generate suggested mappings for each Excel column
        const suggestedMappings = {};
        const existingDbColumns = dbColumns.filter(col => !systemColumns.includes(col.name));

        excelColumns.forEach(col => {
            if (!col.isAsin) {
                const bestMatch = findBestMatch(col.name, existingDbColumns);
                if (bestMatch) {
                    suggestedMappings[col.name] = bestMatch;
                }
            }
        });

        res.json({
            excelColumns: excelColumns.map(col => ({
                name: col.name,
                index: col.index,
                suggestedType: col.suggestedType,
                isAsin: col === asinColumn
            })),
            newColumns: newColumns.map(col => ({
                name: col.name,
                suggestedType: col.suggestedType,
                sanitizedName: sanitizeColumnName(col.name)
            })),
            existingColumns: existingDbColumns,
            asinColumnIndex: asinColumn ? asinColumn.index : null,
            suggestedMappings: suggestedMappings
        });
    } catch (err) {
        console.error('Excel preview error:', err);
        res.status(500).json({ error: err.message || 'Failed to parse Excel file' });
    }
});

app.post('/api/upload-excel/configure', async (req, res) => {
    try {
        const { columnsToAdd } = req.body;

        if (!columnsToAdd || !Array.isArray(columnsToAdd)) {
            return res.status(400).json({ error: 'columnsToAdd must be an array' });
        }

        const addedColumns = [];

        for (const col of columnsToAdd) {
            if (!col.name || !col.type) {
                continue;
            }

            try {
                const sanitizedName = await addColumnToTable(col.name, col.type);
                addedColumns.push({
                    originalName: col.name,
                    dbName: sanitizedName,
                    type: col.type
                });
            } catch (err) {
                console.error(`Error adding column ${col.name}:`, err);
                // Continue with other columns
            }
        }

        res.json({
            success: true,
            addedColumns,
            message: `Successfully added ${addedColumns.length} column(s) to database`
        });
    } catch (err) {
        console.error('Configure error:', err);
        res.status(500).json({ error: err.message || 'Failed to configure columns' });
    }
});

// Check for duplicate ASINs in the file
app.post('/api/upload-excel/check-duplicates', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const asinColumnIndex = req.body.asinColumnIndex;
        if (!asinColumnIndex) {
            return res.status(400).json({ error: 'asinColumnIndex is required' });
        }

        const fileType = detectFileType(req.file.originalname, req.file.mimetype);
        if (fileType === 'numbers') {
            return res.status(400).json({
                error: 'Numbers files (.numbers) are not directly supported. Please export your Numbers file to CSV or Excel format first.'
            });
        }

        let rows = [];
        let headers = [];

        if (fileType === 'csv') {
            const parsed = parseCSV(req.file.buffer);
            headers = parsed.headers;
            rows = parsed.rows;
        } else {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(req.file.buffer);
            const worksheet = workbook.getWorksheet(1) || workbook.worksheets[0];
            if (!worksheet) {
                return res.status(400).json({ error: 'Excel file has no worksheets' });
            }

            const headerRow = worksheet.getRow(1);
            headerRow.eachCell({ includeEmpty: false }, (cell, colNum) => {
                headers[colNum - 1] = cell.text.trim();
            });

            for (let rowNum = 2; rowNum <= worksheet.rowCount; rowNum++) {
                const row = worksheet.getRow(rowNum);
                const rowData = [];
                row.eachCell({ includeEmpty: true }, (cell, colNum) => {
                    rowData[colNum - 1] = cell.value;
                });
                if (rowData.some(v => v !== null && v !== undefined && v !== '')) {
                    rows.push(rowData);
                }
            }
        }

        // Extract ASINs from file
        const asinColIndex = parseInt(asinColumnIndex) - 1;
        const fileAsins = [];
        for (let i = 0; i < rows.length; i++) {
            const asin = String(rows[i][asinColIndex] || '').trim().toUpperCase();
            if (asin && /^[A-Z0-9]{10}$/.test(asin)) {
                fileAsins.push({ asin, rowNum: i + 2 });
            }
        }

        // Check which ASINs exist in database
        if (fileAsins.length === 0) {
            return res.json({ duplicates: [] });
        }

        const asinList = fileAsins.map(f => f.asin);
        const placeholders = asinList.map((_, i) => `$${i + 1}`).join(',');
        const existingResult = await pool.query(
            `SELECT asin FROM products WHERE asin IN (${placeholders})`,
            asinList
        );

        const existingAsins = new Set(existingResult.rows.map(r => r.asin));
        const duplicates = fileAsins
            .filter(f => existingAsins.has(f.asin))
            .map(f => ({ asin: f.asin, rowNum: f.rowNum }));

        res.json({ duplicates });
    } catch (err) {
        console.error('Check duplicates error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/upload-excel/import', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Parse columnMappings from FormData (it comes as JSON string)
        let columnMappings = {};
        if (req.body.columnMappings) {
            try {
                columnMappings = typeof req.body.columnMappings === 'string'
                    ? JSON.parse(req.body.columnMappings)
                    : req.body.columnMappings;
            } catch (e) {
                return res.status(400).json({ error: 'Invalid columnMappings format' });
            }
        }

        const asinColumnIndex = req.body.asinColumnIndex;

        if (!asinColumnIndex) {
            return res.status(400).json({ error: 'asinColumnIndex is required' });
        }

        const fileType = detectFileType(req.file.originalname, req.file.mimetype);

        if (fileType === 'numbers') {
            return res.status(400).json({
                error: 'Numbers files (.numbers) are not directly supported. Please export your Numbers file to CSV or Excel format first.',
                suggestion: 'In Numbers: File > Export To > CSV or Excel'
            });
        }

        // Get all current columns
        const dbColumns = await getTableColumns();
        const dbColumnMap = {};
        dbColumns.forEach(col => {
            dbColumnMap[col.name.toLowerCase()] = col.name;
        });

        let added = 0;
        let updated = 0;
        let skipped = 0;
        const errors = [];
        let rows = [];
        let headers = [];

        if (fileType === 'csv') {
            // Parse CSV
            const parsed = parseCSV(req.file.buffer);
            headers = parsed.headers;
            rows = parsed.rows;
        } else {
            // Parse Excel
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(req.file.buffer);

            const worksheet = workbook.getWorksheet(1) || workbook.worksheets[0];
            if (!worksheet) {
                return res.status(400).json({ error: 'Excel file has no worksheets' });
            }

            // Get headers
            const headerRow = worksheet.getRow(1);
            headerRow.eachCell({ includeEmpty: false }, (cell, colNum) => {
                headers[colNum - 1] = cell.text.trim();
            });

            // Convert Excel rows to array format
            for (let rowNum = 2; rowNum <= worksheet.rowCount; rowNum++) {
                const row = worksheet.getRow(rowNum);
                const rowData = [];
                row.eachCell({ includeEmpty: true }, (cell, colNum) => {
                    rowData[colNum - 1] = cell.value;
                });
                if (rowData.some(v => v !== null && v !== undefined && v !== '')) {
                    rows.push(rowData);
                }
            }
        }

        // Process each row
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
            try {
                const row = rows[rowIndex];
                const rowNum = rowIndex + 2; // +2 because row 1 is header

                // Get ASIN from specified column (convert to 0-based index)
                const asinColIndex = parseInt(asinColumnIndex) - 1;
                if (asinColIndex < 0 || asinColIndex >= row.length) {
                    skipped++;
                    continue;
                }

                let asin = String(row[asinColIndex] || '').trim().toUpperCase();

                if (!asin) {
                    skipped++;
                    continue;
                }

                // Validate ASIN format
                if (!/^[A-Z0-9]{10}$/.test(asin)) {
                    errors.push(`Row ${rowNum}: Invalid ASIN format: ${asin}`);
                    skipped++;
                    continue;
                }

                // Build data object from column mappings
                const data = { asin };

                // Create header map (column name to index)
                const headerMap = {};
                headers.forEach((header, idx) => {
                    if (header) {
                        headerMap[header] = idx;
                    }
                });

                for (const [excelColName, dbColName] of Object.entries(columnMappings)) {
                    if (dbColName && dbColName !== 'asin') {
                        const colIndex = headerMap[excelColName];

                        if (colIndex !== undefined && colIndex < row.length) {
                            let value = row[colIndex];

                            // Handle null/empty
                            if (value === null || value === undefined || value === '') {
                                value = null;
                            } else {
                                // Convert to string for TEXT columns, or keep number for NUMERIC
                                const dbCol = dbColumns.find(c => c.name === dbColName);
                                if (dbCol && (dbCol.type === 'numeric' || dbCol.type === 'double precision')) {
                                    value = parseFloat(value);
                                    if (isNaN(value)) value = null;
                                } else {
                                    value = String(value).trim() || null;
                                }
                            }

                            data[dbColName] = value;
                        }
                    }
                }

                // Parse duplicate decisions (which ASINs to replace vs skip)
                let duplicateDecisions = {};
                if (req.body.duplicateDecisions) {
                    try {
                        duplicateDecisions = typeof req.body.duplicateDecisions === 'string'
                            ? JSON.parse(req.body.duplicateDecisions)
                            : req.body.duplicateDecisions;
                    } catch (e) {
                        console.error('Error parsing duplicateDecisions:', e);
                        duplicateDecisions = {};
                    }
                }

                // Check if ASIN exists
                const existingCheck = await pool.query('SELECT asin FROM products WHERE asin = $1', [asin]);

                if (existingCheck.rows.length > 0) {
                    // ASIN already exists - check user's decision
                    const decision = duplicateDecisions[asin] || duplicateDecisions[asin.toUpperCase()] || duplicateDecisions[asin.toLowerCase()];

                    if (decision === 'replace') {
                        // Get current data to track changes
                        const currentResult = await pool.query('SELECT * FROM products WHERE asin = $1', [asin]);
                        const currentData = currentResult.rows[0] || {};
                        const changedFields = [];

                        // Update existing
                        const updateFields = [];
                        const updateValues = [];
                        let paramIndex = 1;

                        for (const [key, value] of Object.entries(data)) {
                            if (key !== 'asin') {
                                // Track changed fields
                                const currentValue = currentData[key];
                                let normalizedCurrent = currentValue !== null && currentValue !== undefined ? String(currentValue).trim() : null;
                                let normalizedNew = value !== null && value !== undefined ? String(value).trim() : null;

                                if (normalizedCurrent !== normalizedNew) {
                                    changedFields.push(key);
                                }

                                updateFields.push(`"${key}" = $${paramIndex}`);
                                updateValues.push(value);
                                paramIndex++;
                            }
                        }

                        if (updateFields.length > 0) {
                            updateValues.push(asin);
                            await pool.query(
                                `UPDATE products SET ${updateFields.join(', ')} WHERE asin = $${paramIndex}`,
                                updateValues
                            );
                            updated++;
                        } else {
                            // Even if no fields to update, if user chose replace, count it as updated
                            if (decision === 'replace') {
                                updated++;
                            } else {
                                skipped++;
                            }
                        }
                    } else {
                        // Skip this row (default if no decision provided or decision is 'skip')
                        skipped++;
                    }
                } else {
                    // Insert new
                    const insertFields = Object.keys(data).map(k => `"${k}"`).join(', ');
                    const insertValues = Object.keys(data).map((_, i) => `$${i + 1}`).join(', ');
                    await pool.query(
                        `INSERT INTO products (${insertFields}) VALUES (${insertValues})`,
                        Object.values(data)
                    );
                    added++;
                }
            } catch (err) {
                errors.push(`Row ${rowNum}: ${err.message}`);
                skipped++;
            }
        }

        res.json({
            success: true,
            stats: {
                added,
                updated,
                skipped,
                total: added + updated + skipped
            },
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (err) {
        console.error('Import error:', err);
        res.status(500).json({ error: err.message || 'Failed to import Excel data' });
    }
});

// Amazon SP-API OAuth Routes

// OAuth Login Route - Initiates the OAuth flow
app.get('/auth/amazon/login', (req, res) => {
    try {
        // Validate required environment variables
        if (!process.env.LWA_CLIENT_ID) {
            return res.status(500).json({ error: 'LWA_CLIENT_ID not configured' });
        }

        // Generate cryptographically secure state token for CSRF protection
        const stateToken = crypto.randomBytes(32).toString('hex');

        // Store state token in session for validation in callback
        req.session.oauthState = stateToken;
        req.session.oauthTimestamp = Date.now();

        // Build Amazon authorization URL
        const redirectUri = process.env.OAUTH_REDIRECT_URI ||
            `${req.protocol}://${req.get('host')}/auth/amazon/callback`;

        const scope = process.env.OAUTH_SCOPE || 'sellingpartnerapi::migration';

        const authUrl = new URL('https://sellercentral.amazon.com/apps/authorize/consent');
        authUrl.searchParams.set('application_id', process.env.LWA_CLIENT_ID);
        authUrl.searchParams.set('state', stateToken);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('version', 'beta');

        // Redirect to Amazon authorization page
        res.redirect(authUrl.toString());
    } catch (err) {
        console.error('OAuth login error:', err);
        res.status(500).json({ error: 'Failed to initiate OAuth flow', details: err.message });
    }
});

// OAuth Callback Route - Handles the callback from Amazon
app.get('/auth/amazon/callback', async (req, res) => {
    try {
        const { code, state, selling_partner_id, spapi_oauth_code } = req.query;
        const error = req.query.error;

        // Handle OAuth errors from Amazon
        if (error) {
            console.error('OAuth error from Amazon:', error, req.query.error_description);
            return res.status(400).json({
                error: 'OAuth authorization failed',
                details: req.query.error_description || error
            });
        }

        // Validate state token (CSRF protection)
        if (!state || !req.session.oauthState) {
            return res.status(400).json({ error: 'Invalid or missing state parameter' });
        }

        if (state !== req.session.oauthState) {
            return res.status(400).json({ error: 'State token mismatch - possible CSRF attack' });
        }

        // Check if state token is expired (10 minutes)
        const stateAge = Date.now() - (req.session.oauthTimestamp || 0);
        if (stateAge > 600000) {
            return res.status(400).json({ error: 'State token expired. Please try again.' });
        }

        // Validate required environment variables
        if (!process.env.LWA_CLIENT_ID || !process.env.LWA_CLIENT_SECRET) {
            return res.status(500).json({ error: 'OAuth credentials not configured' });
        }

        // Use spapi_oauth_code if available (newer flow), otherwise use code
        const authorizationCode = spapi_oauth_code || code;

        if (!authorizationCode) {
            return res.status(400).json({ error: 'Authorization code not provided' });
        }

        // Build redirect URI (must match exactly with registered callback URL)
        const redirectUri = process.env.OAUTH_REDIRECT_URI ||
            `${req.protocol}://${req.get('host')}/auth/amazon/callback`;

        // Exchange authorization code for tokens
        const tokenUrl = 'https://api.amazon.com/auth/o2/token';
        const tokenParams = new URLSearchParams({
            grant_type: 'authorization_code',
            code: authorizationCode,
            client_id: process.env.LWA_CLIENT_ID,
            client_secret: process.env.LWA_CLIENT_SECRET,
            redirect_uri: redirectUri
        });

        const tokenResponse = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: tokenParams.toString()
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error('Token exchange failed:', tokenResponse.status, errorText);
            return res.status(tokenResponse.status).json({
                error: 'Failed to exchange authorization code for tokens',
                details: errorText
            });
        }

        const tokenData = await tokenResponse.json();

        // Validate token response
        if (!tokenData.refresh_token) {
            return res.status(500).json({ error: 'No refresh token received from Amazon' });
        }

        // Store tokens securely
        // For testing: Store in database
        // For production: Use encrypted storage or AWS Secrets Manager
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS oauth_tokens (
                    id SERIAL PRIMARY KEY,
                    refresh_token TEXT NOT NULL,
                    access_token TEXT,
                    expires_at TIMESTAMP,
                    selling_partner_id TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Check if tokens already exist
            const existing = await pool.query(
                'SELECT id FROM oauth_tokens ORDER BY created_at DESC LIMIT 1'
            );

            if (existing.rows.length > 0) {
                // Update existing token
                await pool.query(
                    `UPDATE oauth_tokens
                     SET refresh_token = $1,
                         access_token = $2,
                         expires_at = $3,
                         selling_partner_id = $4,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE id = $5`,
                    [
                        tokenData.refresh_token,
                        tokenData.access_token || null,
                        tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
                        selling_partner_id || null,
                        existing.rows[0].id
                    ]
                );
            } else {
                // Insert new token
                await pool.query(
                    `INSERT INTO oauth_tokens (refresh_token, access_token, expires_at, selling_partner_id)
                     VALUES ($1, $2, $3, $4)`,
                    [
                        tokenData.refresh_token,
                        tokenData.access_token || null,
                        tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
                        selling_partner_id || null
                    ]
                );
            }
        } catch (dbError) {
            console.error('Database error storing tokens:', dbError);
            // Continue even if database storage fails - tokens are in response
        }

        // Clear OAuth state from session
        delete req.session.oauthState;
        delete req.session.oauthTimestamp;

        // Return success response with tokens (for API) or redirect (for web)
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            res.json({
                success: true,
                message: 'OAuth authorization successful',
                hasRefreshToken: !!tokenData.refresh_token,
                hasAccessToken: !!tokenData.access_token,
                expiresIn: tokenData.expires_in,
                sellingPartnerId: selling_partner_id || null
            });
        } else {
            // Redirect to success page or dashboard
            res.redirect('/?oauth=success');
        }
    } catch (err) {
        console.error('OAuth callback error:', err);
        res.status(500).json({
            error: 'OAuth callback processing failed',
            details: err.message
        });
    }
});

// Helper function to sign SP-API requests with AWS Signature V4
async function signSpApiRequest(url, method, accessToken, body = null) {
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
        throw new Error('AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.');
    }

    const urlObj = new URL(url);
    const region = urlObj.hostname.includes('sellingpartnerapi-na') ? 'us-east-1' :
                   urlObj.hostname.includes('sellingpartnerapi-eu') ? 'eu-west-1' :
                   urlObj.hostname.includes('sellingpartnerapi-fe') ? 'us-west-2' : 'us-east-1';

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '').slice(0, -1) + 'Z';
    const dateStamp = amzDate.slice(0, 8);

    // Create canonical request
    const canonicalUri = urlObj.pathname;
    const canonicalQueryString = urlObj.search.slice(1); // Remove leading '?'

    const bodyHash = body ? crypto.createHash('sha256').update(body).digest('hex') :
                      crypto.createHash('sha256').update('').digest('hex');

    const headers = {
        'host': urlObj.hostname,
        'x-amz-access-token': accessToken,
        'x-amz-date': amzDate
    };

    if (body) {
        headers['content-type'] = 'application/json';
        headers['content-length'] = Buffer.byteLength(body).toString();
    }

    // Sort headers for canonical headers
    const sortedHeaderKeys = Object.keys(headers).sort();
    const canonicalHeaders = sortedHeaderKeys.map(key =>
        `${key.toLowerCase()}:${headers[key].trim()}\n`
    ).join('');
    const signedHeaders = sortedHeaderKeys.map(key => key.toLowerCase()).join(';');

    const canonicalRequest = [
        method,
        canonicalUri,
        canonicalQueryString,
        canonicalHeaders,
        signedHeaders,
        bodyHash
    ].join('\n');

    // Create string to sign
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${region}/execute-api/aws4_request`;
    const stringToSign = [
        algorithm,
        amzDate,
        credentialScope,
        crypto.createHash('sha256').update(canonicalRequest).digest('hex')
    ].join('\n');

    // Calculate signature
    const kDate = crypto.createHmac('sha256', `AWS4${process.env.AWS_SECRET_ACCESS_KEY}`).update(dateStamp).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
    const kService = crypto.createHmac('sha256', kRegion).update('execute-api').digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    // Add authorization header
    headers['authorization'] = `${algorithm} Credential=${process.env.AWS_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return headers;
}

// Helper function to get a valid access token (refreshes if expired)
async function getValidAccessToken() {
    try {
        // Get the latest token from database
        const tokenResult = await pool.query(
            'SELECT refresh_token, access_token, expires_at FROM oauth_tokens ORDER BY created_at DESC LIMIT 1'
        );

        if (tokenResult.rows.length === 0) {
            throw new Error('No OAuth tokens found. Please complete OAuth authorization first.');
        }

        const token = tokenResult.rows[0];
        const now = new Date();

        // Check if access token exists and is still valid (with 5 minute buffer)
        if (token.access_token && token.expires_at && new Date(token.expires_at) > new Date(now.getTime() + 5 * 60 * 1000)) {
            return token.access_token;
        }

        // Access token expired or doesn't exist, refresh it
        console.log('Access token expired or missing, refreshing...');
        return await refreshAccessToken(token.refresh_token);
    } catch (err) {
        console.error('Error getting access token:', err);
        throw err;
    }
}

// Function to refresh access token using refresh token
async function refreshAccessToken(refreshToken) {
    try {
        if (!process.env.LWA_CLIENT_ID || !process.env.LWA_CLIENT_SECRET) {
            throw new Error('LWA credentials not configured');
        }

        const tokenUrl = 'https://api.amazon.com/auth/o2/token';
        const tokenParams = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: process.env.LWA_CLIENT_ID,
            client_secret: process.env.LWA_CLIENT_SECRET
        });

        const tokenResponse = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: tokenParams.toString()
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            throw new Error(`Token refresh failed: ${tokenResponse.status} - ${errorText}`);
        }

        const tokenData = await tokenResponse.json();

        if (!tokenData.access_token) {
            throw new Error('No access token received from refresh');
        }

        // Update database with new access token
        const expiresAt = tokenData.expires_in
            ? new Date(Date.now() + tokenData.expires_in * 1000)
            : new Date(Date.now() + 3600 * 1000); // Default 1 hour

        await pool.query(
            `UPDATE oauth_tokens
             SET access_token = $1,
                 expires_at = $2,
                 updated_at = CURRENT_TIMESTAMP
             WHERE refresh_token = $3`,
            [tokenData.access_token, expiresAt, refreshToken]
        );

        console.log('Access token refreshed successfully');
        return tokenData.access_token;
    } catch (err) {
        console.error('Error refreshing access token:', err);
        throw err;
    }
}

// Test endpoint: Verify OAuth connection and get token status
app.get('/api/sp-api/connection-status', async (req, res) => {
    try {
        // Check if tokens exist in database
        const tokenResult = await pool.query(
            `SELECT id, created_at, expires_at, selling_partner_id,
                    CASE WHEN access_token IS NOT NULL THEN true ELSE false END as has_access_token,
                    CASE WHEN refresh_token IS NOT NULL THEN true ELSE false END as has_refresh_token
             FROM oauth_tokens ORDER BY created_at DESC LIMIT 1`
        );

        if (tokenResult.rows.length === 0) {
            return res.json({
                connected: false,
                message: 'No OAuth tokens found. Please complete OAuth authorization first.',
                action: 'Visit /auth/amazon/login to authorize'
            });
        }

        const token = tokenResult.rows[0];
        const now = new Date();
        const expiresAt = token.expires_at ? new Date(token.expires_at) : null;
        const isExpired = expiresAt ? expiresAt <= now : true;
        const expiresInMinutes = expiresAt ? Math.floor((expiresAt - now) / 1000 / 60) : null;

        // Try to get a valid access token (will refresh if needed)
        let accessTokenValid = false;
        let accessTokenError = null;
        try {
            const accessToken = await getValidAccessToken();
            accessTokenValid = !!accessToken;
        } catch (err) {
            accessTokenError = err.message;
        }

        res.json({
            connected: true,
            tokenInfo: {
                id: token.id,
                created_at: token.created_at,
                expires_at: token.expires_at,
                is_expired: isExpired,
                expires_in_minutes: expiresInMinutes,
                has_access_token: token.has_access_token,
                has_refresh_token: token.has_refresh_token,
                selling_partner_id: token.selling_partner_id,
                access_token_valid: accessTokenValid,
                access_token_error: accessTokenError
            },
            message: accessTokenValid
                ? 'OAuth connection is active and access token is valid'
                : 'OAuth tokens found but access token needs refresh'
        });
    } catch (err) {
        console.error('Connection status error:', err);
        res.status(500).json({
            connected: false,
            error: err.message
        });
    }
});

// Helper endpoint: Manually store OAuth tokens (for testing/setup purposes)
// Note: In production, tokens should only be stored via OAuth callback
app.post('/api/sp-api/store-tokens', async (req, res) => {
    try {
        const { access_token, refresh_token, expires_in, selling_partner_id } = req.body;

        if (!refresh_token) {
            return res.status(400).json({ error: 'refresh_token is required' });
        }

        // Calculate expiration time
        const expiresAt = expires_in
            ? new Date(Date.now() + expires_in * 1000)
            : access_token
                ? new Date(Date.now() + 3600 * 1000) // Default 1 hour for access token
                : null;

        // Check if tokens already exist
        const existing = await pool.query(
            'SELECT id FROM oauth_tokens ORDER BY created_at DESC LIMIT 1'
        );

        if (existing.rows.length > 0) {
            // Update existing token
            await pool.query(
                `UPDATE oauth_tokens
                 SET refresh_token = $1,
                     access_token = $2,
                     expires_at = $3,
                     selling_partner_id = $4,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $5`,
                [refresh_token, access_token || null, expiresAt, selling_partner_id || null, existing.rows[0].id]
            );
        } else {
            // Insert new token
            await pool.query(
                `INSERT INTO oauth_tokens (refresh_token, access_token, expires_at, selling_partner_id)
                 VALUES ($1, $2, $3, $4)`,
                [refresh_token, access_token || null, expiresAt, selling_partner_id || null]
            );
        }

        res.json({
            success: true,
            message: 'Tokens stored successfully',
            has_access_token: !!access_token,
            has_refresh_token: !!refresh_token
        });
    } catch (err) {
        console.error('Error storing tokens:', err);
        res.status(500).json({ error: err.message });
    }
});

// Test endpoint: Make a simple SP-API call to verify connection
app.get('/api/sp-api/test', async (req, res) => {
    try {
        // Get valid access token (automatically refreshes if needed)
        const accessToken = await getValidAccessToken();

        // Get selling partner ID from database
        const spIdResult = await pool.query(
            'SELECT selling_partner_id FROM oauth_tokens ORDER BY created_at DESC LIMIT 1'
        );
        const sellingPartnerId = spIdResult.rows[0]?.selling_partner_id;

        // Try marketplace participations endpoint (standard test endpoint)
        // Note: For Draft apps, some endpoints may not work
        const spApiUrl = `https://sellingpartnerapi-na.amazon.com/sellers/v1/marketplaceParticipations`;

        // First, try without AWS signing (simple request with just access token)
        let spApiResponse = await fetch(spApiUrl, {
            method: 'GET',
            headers: {
                'x-amz-access-token': accessToken,
                'Content-Type': 'application/json'
            }
        });

        // If it fails with 403 and we have AWS credentials, try with signing
        if (!spApiResponse.ok && spApiResponse.status === 403 &&
            process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
            console.log('Request failed without signing, trying with AWS signing...');
            try {
                const signedHeaders = await signSpApiRequest(spApiUrl, 'GET', accessToken);
                spApiResponse = await fetch(spApiUrl, {
                    method: 'GET',
                    headers: signedHeaders
                });
            } catch (signError) {
                console.error('AWS signing error:', signError);
                // Continue with original response
            }
        }

        if (!spApiResponse.ok) {
            const errorText = await spApiResponse.text();
            let errorDetails = errorText;
            try {
                const errorJson = JSON.parse(errorText);
                errorDetails = errorJson;
            } catch (e) {
                // Keep as text if not JSON
            }
            
            return res.status(spApiResponse.status).json({
                success: false,
                error: 'SP-API call failed',
                status: spApiResponse.status,
                details: errorDetails,
                tried_without_signing: true,
                tried_with_signing: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
                iam_arn: process.env.IAM_ARN || 'Not set',
                app_status_note: spApiResponse.status === 403
                    ? '403 Unauthorized. Possible causes: 1) App is in Draft status (may need to be published/activated), 2) Missing IAM ARN link (but no field found in SPP), 3) Missing required roles/permissions, 4) Access token not authorized for this endpoint. Check your app status and roles in Solutions Provider Portal.'
                    : 'Check your access token and app permissions.'
            });
        }

        const data = await spApiResponse.json();
        res.json({
            success: true,
            message: 'SP-API connection verified successfully',
            selling_partner_id: sellingPartnerId,
            used_aws_signing: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && spApiResponse.status !== 403),
            data
        });
    } catch (err) {
        console.error('SP-API test error:', err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// API Explorer - List of available SP-API endpoints for testing
const availableApis = [
    {
        id: 'catalog-search',
        name: 'Catalog Search',
        description: 'Search for products in the Amazon catalog by keywords',
        icon: '🔍',
        color: 'blue',
        method: 'GET',
        endpoint: '/catalog/2022-04-01/items',
        vendorOnly: false,
        params: [
            { key: 'keywords', name: 'Keywords', required: true, default: '', placeholder: 'e.g., wireless headphones', description: 'Search terms' },
            { key: 'marketplaceIds', name: 'Marketplace ID', required: true, default: 'A2EUQ1WTGCTBG2', description: 'Canada: A2EUQ1WTGCTBG2, US: ATVPDKIKX0DER' },
            { key: 'pageSize', name: 'Page Size', required: false, default: '10', description: 'Number of results (1-20)' }
        ],
        buildUrl: (params) => `https://sellingpartnerapi-na.amazon.com/catalog/2022-04-01/items?marketplaceIds=${params.marketplaceIds}&keywords=${encodeURIComponent(params.keywords)}&pageSize=${params.pageSize || 10}`
    },
    {
        id: 'catalog-item',
        name: 'Get Catalog Item',
        description: 'Get detailed information about a specific product by ASIN',
        icon: '📦',
        color: 'indigo',
        method: 'GET',
        endpoint: '/catalog/2022-04-01/items/{asin}',
        vendorOnly: false,
        params: [
            { key: 'asin', name: 'ASIN', required: true, default: '', placeholder: 'e.g., B08N5WRWNW', description: '10-character Amazon product ID' },
            { key: 'marketplaceIds', name: 'Marketplace ID', required: true, default: 'A2EUQ1WTGCTBG2', description: 'Canada: A2EUQ1WTGCTBG2' },
            { key: 'includedData', name: 'Include Data', required: false, default: 'summaries,images,productTypes', description: 'Comma-separated: summaries,attributes,dimensions,identifiers,images,productTypes,relationships,salesRanks' }
        ],
        buildUrl: (params) => `https://sellingpartnerapi-na.amazon.com/catalog/2022-04-01/items/${params.asin}?marketplaceIds=${params.marketplaceIds}&includedData=${params.includedData || 'summaries'}`
    },
    {
        id: 'vendor-orders',
        name: 'Vendor Purchase Orders',
        description: 'Get purchase orders from Amazon for your vendor account',
        icon: '📋',
        color: 'purple',
        method: 'GET',
        endpoint: '/vendor/orders/v1/purchaseOrders',
        vendorOnly: true,
        params: [
            { key: 'limit', name: 'Limit', required: false, default: '10', description: 'Number of orders to return (1-100)' },
            { key: 'createdAfter', name: 'Created After', required: false, default: '', placeholder: 'e.g., 2026-01-01T00:00:00Z', description: 'ISO 8601 date-time' },
            { key: 'createdBefore', name: 'Created Before', required: false, default: '', placeholder: 'e.g., 2026-01-31T23:59:59Z', description: 'ISO 8601 date-time' }
        ],
        buildUrl: (params) => {
            let url = `https://sellingpartnerapi-na.amazon.com/vendor/orders/v1/purchaseOrders?limit=${params.limit || 10}`;
            if (params.createdAfter) url += `&createdAfter=${encodeURIComponent(params.createdAfter)}`;
            if (params.createdBefore) url += `&createdBefore=${encodeURIComponent(params.createdBefore)}`;
            return url;
        }
    },
    {
        id: 'vendor-order-details',
        name: 'Vendor Order Details',
        description: 'Get details of a specific purchase order',
        icon: '📄',
        color: 'violet',
        method: 'GET',
        endpoint: '/vendor/orders/v1/purchaseOrders/{poNumber}',
        vendorOnly: true,
        params: [
            { key: 'purchaseOrderNumber', name: 'PO Number', required: true, default: '', placeholder: 'e.g., 15K7Y24W', description: 'Purchase order number from Amazon' }
        ],
        buildUrl: (params) => `https://sellingpartnerapi-na.amazon.com/vendor/orders/v1/purchaseOrders/${params.purchaseOrderNumber}`
    },
    {
        id: 'vendor-shipments',
        name: 'Vendor Shipments',
        description: 'Get shipment details for your vendor orders',
        icon: '🚚',
        color: 'green',
        method: 'GET',
        endpoint: '/vendor/shipping/v1/shipments',
        vendorOnly: true,
        params: [
            { key: 'limit', name: 'Limit', required: false, default: '10', description: 'Number of shipments to return' },
            { key: 'createdAfter', name: 'Created After', required: false, default: '', placeholder: 'e.g., 2026-01-01T00:00:00Z', description: 'ISO 8601 date-time' }
        ],
        buildUrl: (params) => {
            let url = `https://sellingpartnerapi-na.amazon.com/vendor/shipping/v1/shipments?limit=${params.limit || 10}`;
            if (params.createdAfter) url += `&createdAfter=${encodeURIComponent(params.createdAfter)}`;
            return url;
        }
    },
    {
        id: 'reports-list',
        name: 'List Reports',
        description: 'Get a list of generated reports by type',
        icon: '📊',
        color: 'cyan',
        method: 'GET',
        endpoint: '/reports/2021-06-30/reports',
        vendorOnly: true,
        params: [
            { key: 'reportTypes', name: 'Report Type', required: true, default: 'GET_VENDOR_INVENTORY_REPORT', placeholder: 'GET_VENDOR_INVENTORY_REPORT', description: 'Report type (GET_VENDOR_INVENTORY_REPORT, GET_VENDOR_SALES_REPORT, etc.)' },
            { key: 'pageSize', name: 'Page Size', required: false, default: '10', description: 'Number of reports to return' }
        ],
        buildUrl: (params) => {
            let url = `https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/reports?pageSize=${params.pageSize || 10}`;
            url += `&reportTypes=${encodeURIComponent(params.reportTypes)}`;
            return url;
        }
    },
    {
        id: 'token-info',
        name: 'Token Info',
        description: 'Validate your access token and see app details',
        icon: '🔑',
        color: 'slate',
        method: 'GET',
        endpoint: '/auth/o2/tokeninfo',
        vendorOnly: false,
        params: [],
        isTokenInfo: true,
        buildUrl: () => 'https://api.amazon.com/auth/o2/tokeninfo'
    }
];

// API Explorer page route
app.get('/api-explorer', (req, res) => {
    res.render('api-explorer', { apis: availableApis });
});

// API Explorer test endpoint
app.post('/api/sp-api/explorer/test', async (req, res) => {
    try {
        const { apiId, params } = req.body;

        // Find the API definition
        const api = availableApis.find(a => a.id === apiId);
        if (!api) {
            return res.status(400).json({ success: false, error: 'Unknown API endpoint' });
        }

        // Validate required parameters
        if (api.params) {
            const missingParams = api.params
                .filter(p => p.required && !params?.[p.key])
                .map(p => p.name);

            if (missingParams.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: `Missing required parameter(s): ${missingParams.join(', ')}`
                });
            }
        }

        // Get access token
        const accessToken = await getValidAccessToken();

        // Build URL
        const url = api.buildUrl(params || {});

        let response;

        if (api.isTokenInfo) {
            // Token info uses different auth
            response = await fetch(`${url}?access_token=${accessToken}`);
        } else if (api.method === 'POST' && api.buildBody) {
            // POST request with body
            const body = JSON.stringify(api.buildBody(params || {}));
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'x-amz-access-token': accessToken,
                    'Content-Type': 'application/json'
                },
                body: body
            });
        } else {
            // GET request
            response = await fetch(url, {
                method: api.method || 'GET',
                headers: {
                    'x-amz-access-token': accessToken,
                    'Content-Type': 'application/json'
                }
            });
        }

        const data = await response.json();

        res.json({
            success: response.ok,
            status: response.status,
            endpoint: api.endpoint,
            url: url,
            data: data
        });

    } catch (err) {
        console.error('API Explorer test error:', err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// Comprehensive SP-API Diagnostic endpoint - tests multiple APIs to identify the issue
app.get('/api/sp-api/diagnose', async (req, res) => {
    const results = {
        timestamp: new Date().toISOString(),
        environment: {},
        tokenStatus: {},
        endpointTests: [],
        diagnosis: [],
        recommendations: []
    };

    try {
        // Step 1: Check environment configuration
        results.environment = {
            hasLwaClientId: !!process.env.LWA_CLIENT_ID,
            hasLwaClientSecret: !!process.env.LWA_CLIENT_SECRET,
            hasAwsAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
            hasAwsSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
            hasIamArn: !!process.env.IAM_ARN,
            iamArnValue: process.env.IAM_ARN || 'Not set',
            iamArnType: process.env.IAM_ARN
                ? (process.env.IAM_ARN.includes(':user/') ? 'USER (should be ROLE)' :
                   process.env.IAM_ARN.includes(':role/') ? 'ROLE (correct)' : 'UNKNOWN')
                : 'Not set'
        };

        if (process.env.IAM_ARN && process.env.IAM_ARN.includes(':user/')) {
            results.diagnosis.push('⚠️ IAM ARN is a User ARN, but Amazon requires a Role ARN');
            results.recommendations.push('Create an IAM Role and use its ARN instead of the User ARN');
        }

        // Step 2: Check token status
        try {
            const tokenResult = await pool.query(
                `SELECT refresh_token, access_token, expires_at, selling_partner_id, created_at
                 FROM oauth_tokens ORDER BY created_at DESC LIMIT 1`
            );

            if (tokenResult.rows.length === 0) {
                results.tokenStatus = { hasTokens: false, error: 'No tokens found in database' };
                results.diagnosis.push('❌ No OAuth tokens found - authorization not completed');
                results.recommendations.push('Complete OAuth flow at /auth/amazon/login');
            } else {
                const token = tokenResult.rows[0];
                const now = new Date();
                const expiresAt = token.expires_at ? new Date(token.expires_at) : null;

                results.tokenStatus = {
                    hasTokens: true,
                    hasRefreshToken: !!token.refresh_token,
                    hasAccessToken: !!token.access_token,
                    sellingPartnerId: token.selling_partner_id || 'Not set',
                    tokenCreatedAt: token.created_at,
                    accessTokenExpired: expiresAt ? expiresAt <= now : true,
                    expiresAt: token.expires_at
                };

                if (!token.selling_partner_id) {
                    results.diagnosis.push('⚠️ No selling_partner_id stored - may indicate incomplete authorization');
                }
            }
        } catch (dbErr) {
            results.tokenStatus = { error: dbErr.message };
        }

        // Step 3: Try to get a valid access token
        let accessToken = null;
        try {
            accessToken = await getValidAccessToken();
            results.tokenStatus.accessTokenValid = true;
            results.tokenStatus.accessTokenRefreshed = true;
        } catch (tokenErr) {
            results.tokenStatus.accessTokenValid = false;
            results.tokenStatus.accessTokenError = tokenErr.message;
            results.diagnosis.push(`❌ Cannot get valid access token: ${tokenErr.message}`);
        }

        // Step 4: Test multiple endpoints (if we have an access token)
        if (accessToken) {
            const canadaMarketplaceId = 'A2EUQ1WTGCTBG2';
            const usMarketplaceId = 'ATVPDKIKX0DER';

            const endpointsToTest = [
                {
                    name: 'Sellers - Marketplace Participations (Seller-only)',
                    url: 'https://sellingpartnerapi-na.amazon.com/sellers/v1/marketplaceParticipations',
                    method: 'GET',
                    expectedForVendor: 'FAIL',
                    note: 'This endpoint is for Seller accounts only, NOT Vendor accounts'
                },
                {
                    name: 'Catalog Items - Search (Works for both)',
                    url: `https://sellingpartnerapi-na.amazon.com/catalog/2022-04-01/items?marketplaceIds=${canadaMarketplaceId}&keywords=test`,
                    method: 'GET',
                    expectedForVendor: 'SHOULD WORK',
                    note: 'Catalog API works for both Sellers and Vendors'
                },
                {
                    name: 'Vendor Direct Fulfillment - Orders (Vendor-only)',
                    url: 'https://sellingpartnerapi-na.amazon.com/vendor/directFulfillment/orders/2021-12-28/purchaseOrders?shipFromPartyId=test',
                    method: 'GET',
                    expectedForVendor: 'SHOULD WORK (if role enabled)',
                    note: 'Vendor Direct Fulfillment API - for Vendor accounts'
                },
                {
                    name: 'Vendor Orders - Purchase Orders (Vendor-only)',
                    url: 'https://sellingpartnerapi-na.amazon.com/vendor/orders/v1/purchaseOrders',
                    method: 'GET',
                    expectedForVendor: 'SHOULD WORK (if role enabled)',
                    note: 'Vendor Retail Procurement Orders API'
                },
                {
                    name: 'Token Info - Verify token details',
                    url: 'https://api.amazon.com/auth/o2/tokeninfo',
                    method: 'GET',
                    isTokenInfo: true,
                    note: 'Validates the access token and shows associated app/user'
                }
            ];

            for (const endpoint of endpointsToTest) {
                const testResult = {
                    name: endpoint.name,
                    url: endpoint.url,
                    expectedForVendor: endpoint.expectedForVendor,
                    note: endpoint.note
                };

                try {
                    let response;

                    if (endpoint.isTokenInfo) {
                        // Token info endpoint uses different auth
                        response = await fetch(`${endpoint.url}?access_token=${accessToken}`, {
                            method: endpoint.method
                        });
                    } else {
                        // Try without AWS signing first
                        response = await fetch(endpoint.url, {
                            method: endpoint.method,
                            headers: {
                                'x-amz-access-token': accessToken,
                                'Content-Type': 'application/json'
                            }
                        });

                        // If 403 and we have AWS creds, try with signing
                        if (response.status === 403 && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
                            testResult.triedAwsSigning = true;
                            try {
                                const signedHeaders = await signSpApiRequest(endpoint.url, endpoint.method, accessToken);
                                response = await fetch(endpoint.url, {
                                    method: endpoint.method,
                                    headers: signedHeaders
                                });
                            } catch (signErr) {
                                testResult.awsSigningError = signErr.message;
                            }
                        }
                    }

                    testResult.status = response.status;
                    testResult.statusText = response.statusText;

                    const responseText = await response.text();
                    try {
                        testResult.response = JSON.parse(responseText);
                    } catch {
                        testResult.response = responseText.substring(0, 500);
                    }

                    if (response.ok) {
                        testResult.success = true;
                    } else {
                        testResult.success = false;

                        // Analyze specific error
                        if (response.status === 403) {
                            if (endpoint.name.includes('Seller')) {
                                testResult.analysis = 'Expected for Vendor account - this is a Seller-only endpoint';
                            } else {
                                testResult.analysis = 'Access denied - check roles/permissions in SPP';
                            }
                        } else if (response.status === 401) {
                            testResult.analysis = 'Authentication failed - token may be invalid or expired';
                        } else if (response.status === 400) {
                            testResult.analysis = 'Bad request - may indicate endpoint works but parameters are wrong';
                        }
                    }
                } catch (fetchErr) {
                    testResult.success = false;
                    testResult.error = fetchErr.message;
                }

                results.endpointTests.push(testResult);
            }

            // Analyze results
            const sellerEndpoint = results.endpointTests.find(t => t.name.includes('Seller'));
            const catalogEndpoint = results.endpointTests.find(t => t.name.includes('Catalog'));
            const vendorEndpoints = results.endpointTests.filter(t => t.name.includes('Vendor'));
            const tokenInfo = results.endpointTests.find(t => t.name.includes('Token Info'));

            if (sellerEndpoint?.status === 403 && catalogEndpoint?.status === 403) {
                results.diagnosis.push('❌ Both Seller and Catalog endpoints return 403 - likely a token/authorization issue');
                results.recommendations.push('Verify your refresh token is from the correct account');
                results.recommendations.push('Re-authorize the app in Solutions Provider Portal');
            } else if (sellerEndpoint?.status === 403 && catalogEndpoint?.success) {
                results.diagnosis.push('✅ Catalog works but Seller endpoint fails - CONFIRMS you have a Vendor account');
                results.recommendations.push('Use Vendor-specific APIs instead of Seller APIs');
            } else if (sellerEndpoint?.status === 403 && vendorEndpoints.some(v => v.success)) {
                results.diagnosis.push('✅ Vendor endpoints work! You have a properly configured Vendor account');
            }

            if (tokenInfo?.success && tokenInfo?.response) {
                results.tokenInfo = tokenInfo.response;
                results.diagnosis.push(`ℹ️ Token belongs to app: ${tokenInfo.response.app_id || 'unknown'}`);
            }

            // Check if ALL endpoints fail with 403
            const all403 = results.endpointTests.every(t => t.status === 403);
            if (all403) {
                results.diagnosis.push('❌ ALL endpoints return 403 - this suggests:');
                results.diagnosis.push('   1. Token is from wrong account');
                results.diagnosis.push('   2. App not properly authorized');
                results.diagnosis.push('   3. IAM Role not linked to app');
                results.recommendations.push('Delete stored tokens and re-authorize from scratch');
                results.recommendations.push('Verify IAM Role ARN is configured in your app settings');
            }
        }

        // Final summary
        results.summary = {
            environmentOk: results.environment.hasLwaClientId && results.environment.hasLwaClientSecret,
            tokensOk: results.tokenStatus.hasTokens && results.tokenStatus.accessTokenValid,
            accountType: results.endpointTests.find(t => t.name.includes('Seller'))?.status === 403 ? 'Likely VENDOR' : 'Unknown',
            likelyIssue: results.diagnosis.length > 0 ? results.diagnosis[0] : 'Unable to determine'
        };

        res.json(results);
    } catch (err) {
        console.error('Diagnostic error:', err);
        res.status(500).json({
            error: err.message,
            partialResults: results
        });
    }
});

// Check if scraper is currently running
app.get('/api/scraper-status', (req, res) => {
    res.json({ running: !!currentScraperProcess });
});

// ============================================
// VENDOR ANALYTICS - Reports API Integration
// ============================================

// Report types configuration
const VENDOR_REPORT_TYPES = {
    'GET_VENDOR_REAL_TIME_INVENTORY_REPORT': {
        name: 'Real-Time Inventory',
        shortName: 'RT Inventory',
        dataKey: 'inventoryByAsin',
        metrics: ['asin', 'highlyAvailableInventory']
    },
    'GET_VENDOR_REAL_TIME_SALES_REPORT': {
        name: 'Real-Time Sales',
        shortName: 'RT Sales',
        dataKey: 'salesByAsin',
        metrics: ['asin', 'orderedUnits', 'orderedRevenue']
    },
    'GET_VENDOR_SALES_REPORT': {
        name: 'Sales Report',
        shortName: 'Sales',
        dataKey: 'salesByAsin',
        metrics: ['asin', 'shippedUnits', 'shippedRevenue', 'shippedCogs', 'orderedUnits', 'orderedRevenue']
    },
    'GET_VENDOR_NET_PURE_PRODUCT_MARGIN_REPORT': {
        name: 'Net Pure Product Margin',
        shortName: 'Margin',
        dataKey: 'netPureProductMarginByAsin',
        metrics: ['asin', 'netPureProductMargin']
    },
    'GET_VENDOR_TRAFFIC_REPORT': {
        name: 'Traffic Report',
        shortName: 'Traffic',
        dataKey: 'trafficByAsin',
        metrics: ['asin', 'glanceViews']
    },
    'GET_VENDOR_INVENTORY_REPORT': {
        name: 'Inventory Report',
        shortName: 'Inventory',
        dataKey: 'inventoryByAsin',
        metrics: ['asin', 'sellableOnHandInventoryUnits', 'sellableOnHandInventoryCost', 'unsellableOnHandInventoryUnits']
    },
    'GET_SALES_AND_TRAFFIC_REPORT': {
        name: 'Sales & Traffic',
        shortName: 'Sales+Traffic',
        dataKey: 'salesAndTrafficByAsin',
        metrics: ['asin', 'orderedProductSales', 'totalOrderItems', 'pageViews', 'sessions']
    }
};

// Vendor Analytics Page
app.get('/vendor-analytics', async (req, res) => {
    try {
        // Get all tracked ASINs
        const asinsResult = await pool.query('SELECT DISTINCT asin FROM products ORDER BY asin');
        const asins = asinsResult.rows.map(r => r.asin);

        // Get date range from query params or default to last 30 days
        const endDate = req.query.endDate || new Date().toISOString().split('T')[0];
        const startDate = req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // Get stored report data for the date range
        const reportsResult = await pool.query(
            `SELECT asin, report_type, report_date, data
             FROM vendor_reports
             WHERE report_date >= $1 AND report_date <= $2
             ORDER BY report_date DESC`,
            [startDate, endDate]
        );

        // Organize data by ASIN
        const dataByAsin = {};
        for (const asin of asins) {
            dataByAsin[asin] = {};
            for (const reportType of Object.keys(VENDOR_REPORT_TYPES)) {
                dataByAsin[asin][reportType] = null;
            }
        }

        // Fill in report data
        for (const row of reportsResult.rows) {
            if (dataByAsin[row.asin]) {
                if (!dataByAsin[row.asin][row.report_type]) {
                    dataByAsin[row.asin][row.report_type] = row.data;
                }
            }
        }

        res.render('vendor-analytics', {
            asins,
            dataByAsin,
            reportTypes: VENDOR_REPORT_TYPES,
            startDate,
            endDate
        });
    } catch (err) {
        console.error('Vendor analytics error:', err);
        res.status(500).send('Error loading vendor analytics: ' + err.message);
    }
});

// Purchase Orders Page
app.get('/purchase-orders', async (req, res) => {
    try {
        // Get POs from database
        const posResult = await pool.query(
            `SELECT * FROM purchase_orders ORDER BY po_date DESC LIMIT 100`
        );

        res.render('purchase-orders', {
            purchaseOrders: posResult.rows
        });
    } catch (err) {
        console.error('Purchase orders error:', err);
        res.status(500).send('Error loading purchase orders: ' + err.message);
    }
});

// Catalog Details Page
app.get('/catalog/:asin', async (req, res) => {
    try {
        const { asin } = req.params;

        // Get catalog details from database
        const catalogResult = await pool.query(
            'SELECT * FROM catalog_details WHERE asin = $1',
            [asin]
        );

        let catalogData = catalogResult.rows[0] || null;

        res.render('catalog-details', {
            asin,
            catalogData
        });
    } catch (err) {
        console.error('Catalog details error:', err);
        res.status(500).send('Error loading catalog details: ' + err.message);
    }
});

// API: Create a report request
app.post('/api/vendor-reports/create', async (req, res) => {
    try {
        const { reportType, startDate, endDate, reportOptions } = req.body;

        if (!reportType || !VENDOR_REPORT_TYPES[reportType]) {
            return res.status(400).json({ error: 'Invalid report type' });
        }

        const accessToken = await getValidAccessToken();
        const marketplaceId = 'A2EUQ1WTGCTBG2'; // Canada

        // Build report specification based on report type
        const reportSpec = {
            reportType: reportType,
            marketplaceIds: [marketplaceId]
        };

        // Add date range for reports that support it
        if (startDate) reportSpec.dataStartTime = startDate + 'T00:00:00Z';
        if (endDate) reportSpec.dataEndTime = endDate + 'T23:59:59Z';

        // Add report options if provided
        if (reportOptions) {
            reportSpec.reportOptions = reportOptions;
        } else {
            // Default options for different report types
            if (reportType === 'GET_VENDOR_SALES_REPORT' ||
                reportType === 'GET_VENDOR_INVENTORY_REPORT' ||
                reportType === 'GET_VENDOR_NET_PURE_PRODUCT_MARGIN_REPORT' ||
                reportType === 'GET_VENDOR_TRAFFIC_REPORT') {
                reportSpec.reportOptions = {
                    reportPeriod: 'DAY'
                };
            }
            if (reportType === 'GET_VENDOR_SALES_REPORT' || reportType === 'GET_VENDOR_INVENTORY_REPORT') {
                reportSpec.reportOptions = {
                    ...reportSpec.reportOptions,
                    distributorView: 'MANUFACTURING',
                    sellingProgram: 'RETAIL'
                };
            }
        }

        // Create report request
        const createUrl = 'https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/reports';
        const response = await fetch(createUrl, {
            method: 'POST',
            headers: {
                'x-amz-access-token': accessToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(reportSpec)
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                success: false,
                error: 'Failed to create report',
                details: data
            });
        }

        res.json({
            success: true,
            reportId: data.reportId,
            message: 'Report request created successfully'
        });
    } catch (err) {
        console.error('Create report error:', err);
        res.status(500).json({ error: err.message });
    }
});

// API: Check report status
app.get('/api/vendor-reports/status/:reportId', async (req, res) => {
    try {
        const { reportId } = req.params;
        const accessToken = await getValidAccessToken();

        const statusUrl = `https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/reports/${reportId}`;
        const response = await fetch(statusUrl, {
            headers: {
                'x-amz-access-token': accessToken,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        res.json({
            success: response.ok,
            status: data.processingStatus,
            reportDocumentId: data.reportDocumentId,
            data
        });
    } catch (err) {
        console.error('Report status error:', err);
        res.status(500).json({ error: err.message });
    }
});

// API: Download and parse report document
app.get('/api/vendor-reports/download/:reportDocumentId', async (req, res) => {
    try {
        const { reportDocumentId } = req.params;
        const { reportType, saveToDb } = req.query;
        const accessToken = await getValidAccessToken();

        // Get report document info (includes download URL)
        const docUrl = `https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/documents/${reportDocumentId}`;
        const docResponse = await fetch(docUrl, {
            headers: {
                'x-amz-access-token': accessToken,
                'Content-Type': 'application/json'
            }
        });

        const docData = await docResponse.json();

        if (!docResponse.ok) {
            return res.status(docResponse.status).json({
                success: false,
                error: 'Failed to get report document',
                details: docData
            });
        }

        // Download the actual report content
        const downloadUrl = docData.url;
        const compressionAlgorithm = docData.compressionAlgorithm;

        const reportResponse = await fetch(downloadUrl);

        if (!reportResponse.ok) {
            return res.status(reportResponse.status).json({
                success: false,
                error: 'Failed to download report content'
            });
        }

        let reportContent;

        if (compressionAlgorithm === 'GZIP') {
            const zlib = require('zlib');
            const buffer = await reportResponse.arrayBuffer();
            reportContent = zlib.gunzipSync(Buffer.from(buffer)).toString('utf8');
        } else {
            reportContent = await reportResponse.text();
        }

        // Parse JSON report
        let reportData;
        try {
            reportData = JSON.parse(reportContent);
        } catch (parseErr) {
            // Some reports might be CSV or other formats
            reportData = { rawContent: reportContent };
        }

        // Optionally save to database
        if (saveToDb === 'true' && reportType && reportData) {
            const reportConfig = VENDOR_REPORT_TYPES[reportType];
            if (reportConfig && reportData[reportConfig.dataKey]) {
                // Extract ASIN-level data and save
                const asinData = reportData[reportConfig.dataKey] || [];
                for (const item of asinData) {
                    if (item.asin) {
                        const reportDate = item.startDate || item.endDate || new Date().toISOString().split('T')[0];
                        await pool.query(
                            `INSERT INTO vendor_reports (report_type, asin, report_date, data)
                             VALUES ($1, $2, $3, $4)
                             ON CONFLICT DO NOTHING`,
                            [reportType, item.asin, reportDate, JSON.stringify(item)]
                        );
                    }
                }
            }
        }

        res.json({
            success: true,
            compressionAlgorithm,
            reportData
        });
    } catch (err) {
        console.error('Download report error:', err);
        res.status(500).json({ error: err.message });
    }
});

// API: Fetch all reports for a specific type and date range
app.get('/api/vendor-reports/fetch', async (req, res) => {
    try {
        const { reportType, startDate, endDate, pageSize } = req.query;
        const accessToken = await getValidAccessToken();

        let url = `https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/reports?pageSize=${pageSize || 10}`;

        if (reportType) {
            url += `&reportTypes=${encodeURIComponent(reportType)}`;
        }
        if (startDate) {
            url += `&createdAfter=${encodeURIComponent(startDate + 'T00:00:00Z')}`;
        }
        if (endDate) {
            url += `&createdBefore=${encodeURIComponent(endDate + 'T23:59:59Z')}`;
        }

        const response = await fetch(url, {
            headers: {
                'x-amz-access-token': accessToken,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        res.json({
            success: response.ok,
            data
        });
    } catch (err) {
        console.error('Fetch reports error:', err);
        res.status(500).json({ error: err.message });
    }
});

// API: Sync Purchase Orders from SP-API
app.post('/api/purchase-orders/sync', async (req, res) => {
    try {
        const { createdAfter, createdBefore } = req.body;
        const accessToken = await getValidAccessToken();

        let url = 'https://sellingpartnerapi-na.amazon.com/vendor/orders/v1/purchaseOrders?limit=100';
        if (createdAfter) url += `&createdAfter=${encodeURIComponent(createdAfter)}`;
        if (createdBefore) url += `&createdBefore=${encodeURIComponent(createdBefore)}`;

        const response = await fetch(url, {
            headers: {
                'x-amz-access-token': accessToken,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                success: false,
                error: 'Failed to fetch purchase orders',
                details: data
            });
        }

        // Save POs to database
        const orders = data.payload?.orders || [];
        let savedCount = 0;

        for (const order of orders) {
            try {
                await pool.query(
                    `INSERT INTO purchase_orders (
                        po_number, po_date, po_status,
                        ship_window_start, ship_window_end,
                        delivery_window_start, delivery_window_end,
                        buying_party, selling_party, ship_to_party, bill_to_party,
                        items, raw_data, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
                    ON CONFLICT (po_number) DO UPDATE SET
                        po_status = EXCLUDED.po_status,
                        items = EXCLUDED.items,
                        raw_data = EXCLUDED.raw_data,
                        updated_at = CURRENT_TIMESTAMP`,
                    [
                        order.purchaseOrderNumber,
                        order.purchaseOrderDate,
                        order.purchaseOrderState,
                        order.shipWindow?.start,
                        order.shipWindow?.end,
                        order.deliveryWindow?.start,
                        order.deliveryWindow?.end,
                        JSON.stringify(order.buyingParty),
                        JSON.stringify(order.sellingParty),
                        JSON.stringify(order.shipToParty),
                        JSON.stringify(order.billToParty),
                        JSON.stringify(order.items),
                        JSON.stringify(order)
                    ]
                );
                savedCount++;
            } catch (dbErr) {
                console.error('Error saving PO:', order.purchaseOrderNumber, dbErr.message);
            }
        }

        res.json({
            success: true,
            totalFetched: orders.length,
            savedCount,
            nextToken: data.payload?.pagination?.nextToken
        });
    } catch (err) {
        console.error('Sync POs error:', err);
        res.status(500).json({ error: err.message });
    }
});

// API: Fetch catalog details for an ASIN
app.post('/api/catalog/fetch/:asin', async (req, res) => {
    try {
        const { asin } = req.params;
        const accessToken = await getValidAccessToken();
        const marketplaceId = 'A2EUQ1WTGCTBG2'; // Canada

        const includedData = 'summaries,attributes,dimensions,identifiers,images,productTypes,salesRanks';
        const url = `https://sellingpartnerapi-na.amazon.com/catalog/2022-04-01/items/${asin}?marketplaceIds=${marketplaceId}&includedData=${includedData}`;

        const response = await fetch(url, {
            headers: {
                'x-amz-access-token': accessToken,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                success: false,
                error: 'Failed to fetch catalog data',
                details: data
            });
        }

        // Extract relevant data
        const summary = data.summaries?.[0] || {};
        const catalogData = {
            asin,
            title: summary.itemName,
            brand: summary.brand,
            product_type: data.productTypes?.[0]?.productType,
            images: data.images,
            attributes: data.attributes,
            dimensions: data.dimensions,
            identifiers: data.identifiers,
            sales_ranks: data.salesRanks
        };

        // Save to database
        await pool.query(
            `INSERT INTO catalog_details (asin, title, brand, product_type, images, attributes, dimensions, identifiers, sales_ranks, last_updated)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
             ON CONFLICT (asin) DO UPDATE SET
                title = EXCLUDED.title,
                brand = EXCLUDED.brand,
                product_type = EXCLUDED.product_type,
                images = EXCLUDED.images,
                attributes = EXCLUDED.attributes,
                dimensions = EXCLUDED.dimensions,
                identifiers = EXCLUDED.identifiers,
                sales_ranks = EXCLUDED.sales_ranks,
                last_updated = CURRENT_TIMESTAMP`,
            [
                asin,
                catalogData.title,
                catalogData.brand,
                catalogData.product_type,
                JSON.stringify(catalogData.images),
                JSON.stringify(catalogData.attributes),
                JSON.stringify(catalogData.dimensions),
                JSON.stringify(catalogData.identifiers),
                JSON.stringify(catalogData.sales_ranks)
            ]
        );

        res.json({
            success: true,
            catalogData: data
        });
    } catch (err) {
        console.error('Fetch catalog error:', err);
        res.status(500).json({ error: err.message });
    }
});

// API: Get stored vendor report data for analytics page
app.get('/api/vendor-analytics/data', async (req, res) => {
    try {
        const { startDate, endDate, asins } = req.query;

        let query = `
            SELECT asin, report_type, report_date, data
            FROM vendor_reports
            WHERE report_date >= $1 AND report_date <= $2
        `;
        const params = [startDate, endDate];

        if (asins) {
            const asinList = asins.split(',');
            query += ` AND asin = ANY($3)`;
            params.push(asinList);
        }

        query += ` ORDER BY asin, report_type, report_date DESC`;

        const result = await pool.query(query, params);

        // Organize by ASIN and report type
        const organized = {};
        for (const row of result.rows) {
            if (!organized[row.asin]) {
                organized[row.asin] = {};
            }
            if (!organized[row.asin][row.report_type]) {
                organized[row.asin][row.report_type] = [];
            }
            organized[row.asin][row.report_type].push({
                date: row.report_date,
                data: row.data
            });
        }

        res.json({
            success: true,
            data: organized,
            reportTypes: VENDOR_REPORT_TYPES
        });
    } catch (err) {
        console.error('Vendor analytics data error:', err);
        res.status(500).json({ error: err.message });
    }
});

server.listen(port, () => console.log(`Active on ${port}`));
