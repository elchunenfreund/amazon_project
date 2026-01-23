const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { spawn, exec } = require('child_process');
const { Pool } = require('pg');
const multer = require('multer');
const ExcelJS = require('exceljs');

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

// Configure multer for file uploads (memory storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
            'application/vnd.ms-excel', // .xls
            'application/octet-stream' // fallback
        ];
        if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls)$/i)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only Excel files (.xlsx, .xls) are allowed.'));
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

// Excel Upload Endpoints
app.post('/api/upload-excel/preview', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);

        const worksheet = workbook.getWorksheet(1) || workbook.worksheets[0];
        if (!worksheet) {
            return res.status(400).json({ error: 'Excel file has no worksheets' });
        }

        // Get headers from first row
        const headerRow = worksheet.getRow(1);
        const excelColumns = [];
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

        // Get current database columns
        const dbColumns = await getTableColumns();
        const dbColumnNames = dbColumns.map(col => col.name.toLowerCase());

        // System columns to exclude
        const systemColumns = ['id', 'asin'];

        // Find new columns (not in DB and not system columns)
        const newColumns = excelColumns.filter(col => {
            const colNameLower = col.name.toLowerCase();
            return !dbColumnNames.includes(colNameLower) &&
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
            existingColumns: dbColumns.filter(col => !systemColumns.includes(col.name)),
            asinColumnIndex: asinColumn ? asinColumn.index : null
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

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);

        const worksheet = workbook.getWorksheet(1) || workbook.worksheets[0];
        if (!worksheet) {
            return res.status(400).json({ error: 'Excel file has no worksheets' });
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

        // Process each row (starting from row 2, skipping header)
        for (let rowNum = 2; rowNum <= worksheet.rowCount; rowNum++) {
            try {
                const row = worksheet.getRow(rowNum);

                // Get ASIN from specified column
                const asinCell = row.getCell(parseInt(asinColumnIndex));
                if (!asinCell || !asinCell.value) {
                    skipped++;
                    continue;
                }

                let asin = String(asinCell.value).trim().toUpperCase();

                // Validate ASIN format
                if (!/^[A-Z0-9]{10}$/.test(asin)) {
                    errors.push(`Row ${rowNum}: Invalid ASIN format: ${asin}`);
                    skipped++;
                    continue;
                }

                // Build data object from column mappings
                const data = { asin };

                // Get header row once
                const headerRow = worksheet.getRow(1);
                const headerMap = {};
                headerRow.eachCell({ includeEmpty: false }, (cell, colNum) => {
                    headerMap[cell.text.trim()] = colNum;
                });

                for (const [excelColName, dbColName] of Object.entries(columnMappings)) {
                    if (dbColName && dbColName !== 'asin') {
                        const colIndex = headerMap[excelColName];

                        if (colIndex) {
                            const cell = row.getCell(colIndex);
                            let value = cell.value;

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

                // Check if ASIN exists
                const existingCheck = await pool.query('SELECT asin FROM products WHERE asin = $1', [asin]);

                if (existingCheck.rows.length > 0) {
                    // Update existing
                    const updateFields = [];
                    const updateValues = [];
                    let paramIndex = 1;

                    for (const [key, value] of Object.entries(data)) {
                        if (key !== 'asin') {
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
