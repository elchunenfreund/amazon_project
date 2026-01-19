const { Client } = require('pg');
const ExcelJS = require('exceljs');

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

(async () => {
    try {
        console.log("📂 Reading asins.xlsx...");
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile('asins.xlsx');

        // Assume data is in the first sheet
        const worksheet = workbook.getWorksheet(1);
        const asins = [];

        // Iterate rows (assuming Row 1 is header, starting from Row 2)
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) { // Skip header
                // Change getCell(1) if your ASIN is in a different column (A=1, B=2)
                const asin = row.getCell(1).text.trim();
                if (asin && asin.length > 5) { // Basic validation
                    asins.push(asin);
                }
            }
        });

        console.log(`🔗 Connecting to database to upload ${asins.length} ASINs...`);
        await client.connect();

        let added = 0;
        let skipped = 0;

        for (const asin of asins) {
            try {
                // 'ON CONFLICT DO NOTHING' prevents errors if ASIN already exists
                const res = await client.query(
                    `INSERT INTO products (asin) VALUES ($1) ON CONFLICT (asin) DO NOTHING`,
                    [asin]
                );
                if (res.rowCount > 0) added++;
                else skipped++;
            } catch (err) {
                console.error(`❌ Error adding ${asin}:`, err.message);
            }
        }

        console.log(`✅ Finished! Added: ${added}, Skipped (Duplicates): ${skipped}`);

    } catch (e) {
        console.error("❌ Fatal Error:", e.message);
    } finally {
        await client.end();
        process.exit(0);
    }
})();
