const express = require('express');
const { Client } = require('pg');
const app = express();
const port = 3000;

const client = new Client({
    connectionString: 'postgresql://localhost:5432/amazon_tracker'
});
client.connect();

app.set('view engine', 'ejs');

// --- Main Report Page ---
app.get('/', async (req, res) => {
    try {
        const result = await client.query(`
            SELECT DISTINCT ON (asin) * FROM daily_reports
            WHERE check_date = CURRENT_DATE
            ORDER BY asin, id DESC
        `);
        res.render('index', { reports: result.rows });
    } catch (err) {
        res.send("Error: " + err.message);
    }
});

// --- History Page for a Specific ASIN ---
app.get('/history/:asin', async (req, res) => {
    const asin = req.params.asin;
    try {
        // Fetch every report for this ASIN, oldest to newest
        const result = await client.query(`
            SELECT * FROM daily_reports
            WHERE asin = $1
            ORDER BY check_date ASC
        `, [asin]);

        res.render('history', { reports: result.rows, asin: asin });
    } catch (err) {
        res.send("Error loading history: " + err.message);
    }
});

app.listen(port, () => {
    console.log(`📊 Dashboard running at http://localhost:${port}`);
});
