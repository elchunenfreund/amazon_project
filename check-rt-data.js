/**
 * Check RT data structure
 * Run: heroku run node check-rt-data.js
 */
const { Pool } = require('pg');
const { getDatabaseConfig } = require('./lib/db-config');

const pool = new Pool(getDatabaseConfig());

async function main() {
    console.log('='.repeat(60));
    console.log('RT DATA DIAGNOSTIC');
    console.log('='.repeat(60));

    // RT Sales
    const rtSales = await pool.query(`
        SELECT asin, data, report_date, data_start_date, data_end_date, report_request_date
        FROM vendor_reports
        WHERE report_type = 'GET_VENDOR_REAL_TIME_SALES_REPORT'
        ORDER BY report_request_date DESC
        LIMIT 3
    `);

    console.log('\nRT SALES RECORDS:', rtSales.rows.length);
    if (rtSales.rows.length > 0) {
        console.log('Sample data structure:');
        const sample = rtSales.rows[0];
        console.log('  ASIN:', sample.asin);
        console.log('  Report Date:', sample.report_date);
        console.log('  Request Date:', sample.report_request_date);
        console.log('  Data:', JSON.stringify(sample.data, null, 2));
    }

    // RT Inventory
    const rtInv = await pool.query(`
        SELECT asin, data, report_date, report_request_date
        FROM vendor_reports
        WHERE report_type = 'GET_VENDOR_REAL_TIME_INVENTORY_REPORT'
        ORDER BY report_request_date DESC
        LIMIT 3
    `);

    console.log('\n' + '='.repeat(60));
    console.log('RT INVENTORY RECORDS:', rtInv.rows.length);
    if (rtInv.rows.length > 0) {
        console.log('Sample data structure:');
        const sample = rtInv.rows[0];
        console.log('  ASIN:', sample.asin);
        console.log('  Report Date:', sample.report_date);
        console.log('  Request Date:', sample.report_request_date);
        console.log('  Data:', JSON.stringify(sample.data, null, 2));
    }

    // Last Ordered check
    const lastOrdered = await pool.query(`
        SELECT pli.asin, MAX(po.po_date) as last_po, COUNT(DISTINCT pli.po_number) as po_count
        FROM po_line_items pli
        JOIN purchase_orders po ON pli.po_number = po.po_number
        WHERE pli.asin IS NOT NULL
        GROUP BY pli.asin
        ORDER BY last_po DESC
        LIMIT 5
    `);

    console.log('\n' + '='.repeat(60));
    console.log('LAST ORDERED DATA (from po_line_items):');
    console.log(lastOrdered.rows);

    // Check po_line_items count
    const poLineCount = await pool.query('SELECT COUNT(*) FROM po_line_items');
    console.log('\nTotal po_line_items records:', poLineCount.rows[0].count);

    await pool.end();
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
