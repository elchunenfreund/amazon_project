const { Client } = require('pg');

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

(async () => {
    try {
        await client.connect();
        console.log("🛠️ Initializing database tables...");

        // 1. Create the Products table (where you store ASINs to track)
        await client.query(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                asin TEXT UNIQUE NOT NULL
            );
        `);
        console.log("✅ Table 'products' is ready.");

        // 2. Create the Daily Reports table (where results are saved)
        await client.query(`
            CREATE TABLE IF NOT EXISTS daily_reports (
                id SERIAL PRIMARY KEY,
                asin TEXT NOT NULL,
                header TEXT,
                availability TEXT,
                stock_level TEXT,
                seller TEXT,
                price TEXT,
                ranking TEXT,
                check_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Table 'daily_reports' is ready.");

    } catch (e) {
        console.error("❌ Database Initialization Error:", e.message);
    } finally {
        await client.end();
        console.log("🏁 Initialization script finished.");
    }
})();
