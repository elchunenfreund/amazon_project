/**
 * Check what data is currently available in the database
 * Run: heroku run node check-data-coverage.js
 */

const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    console.log('='.repeat(70));
    console.log('DATA COVERAGE REPORT');
    console.log('='.repeat(70));
    console.log('');

    // Check vendor_reports coverage by report type
    const coverage = await pool.query(`
        SELECT
            report_type,
            COUNT(DISTINCT asin) as asin_count,
            COUNT(*) as record_count,
            MIN(report_date)::date as earliest,
            MAX(report_date)::date as latest,
            COUNT(DISTINCT TO_CHAR(report_date, 'YYYY-MM')) as months_covered
        FROM vendor_reports
        GROUP BY report_type
        ORDER BY report_type
    `);

    console.log('VENDOR REPORTS (SP-API)');
    console.log('-'.repeat(70));
    for (const row of coverage.rows) {
        console.log(`\n${row.report_type}`);
        console.log(`  Records: ${row.record_count} | Unique ASINs: ${row.asin_count}`);
        console.log(`  Date range: ${row.earliest} to ${row.latest}`);
        console.log(`  Months with data: ${row.months_covered}`);
    }

    // Check daily_reports (scanner data with ranking)
    const daily = await pool.query(`
        SELECT
            COUNT(DISTINCT asin) as asin_count,
            COUNT(*) as record_count,
            MIN(check_date)::date as earliest,
            MAX(check_date)::date as latest,
            COUNT(DISTINCT check_date) as days_covered
        FROM daily_reports
    `);

    console.log('\n');
    console.log('DAILY REPORTS (Scanner - includes ranking, price, availability)');
    console.log('-'.repeat(70));
    if (daily.rows[0].record_count > 0) {
        console.log(`Records: ${daily.rows[0].record_count} | Unique ASINs: ${daily.rows[0].asin_count}`);
        console.log(`Date range: ${daily.rows[0].earliest} to ${daily.rows[0].latest}`);
        console.log(`Days with data: ${daily.rows[0].days_covered}`);
    } else {
        console.log('No daily reports data');
    }

    // Check purchase orders
    const po = await pool.query(`
        SELECT
            COUNT(DISTINCT po.po_number) as po_count,
            COUNT(DISTINCT pli.asin) as asin_count,
            SUM(pli.ordered_quantity) as total_ordered,
            MIN(po.po_date)::date as earliest,
            MAX(po.po_date)::date as latest
        FROM purchase_orders po
        LEFT JOIN po_line_items pli ON po.po_number = pli.po_number
    `);

    console.log('\n');
    console.log('PURCHASE ORDERS');
    console.log('-'.repeat(70));
    console.log(`Total POs: ${po.rows[0].po_count} | Unique ASINs: ${po.rows[0].asin_count}`);
    console.log(`Total units ordered: ${po.rows[0].total_ordered || 0}`);
    console.log(`Date range: ${po.rows[0].earliest} to ${po.rows[0].latest}`);

    // Check tracked ASINs
    const asins = await pool.query('SELECT COUNT(*) as count FROM tracked_asins');
    console.log('\n');
    console.log('TRACKED ASINs: ' + asins.rows[0].count);

    // Summary of gaps
    console.log('\n');
    console.log('='.repeat(70));
    console.log('ANALYSIS & RECOMMENDATIONS');
    console.log('='.repeat(70));

    const reportTypes = {
        'GET_VENDOR_SALES_REPORT': null,
        'GET_VENDOR_TRAFFIC_REPORT': null,
        'GET_VENDOR_NET_PURE_PRODUCT_MARGIN_REPORT': null,
        'GET_VENDOR_INVENTORY_REPORT': null
    };

    for (const row of coverage.rows) {
        reportTypes[row.report_type] = row;
    }

    for (const [type, data] of Object.entries(reportTypes)) {
        const shortName = type.replace('GET_VENDOR_', '').replace('_REPORT', '');
        if (!data) {
            console.log(`\n${shortName}: NO DATA - needs full historical fetch`);
        } else if (data.months_covered < 36) {
            console.log(`\n${shortName}: PARTIAL - ${data.months_covered}/36 months`);
            console.log(`  Range: ${data.earliest} to ${data.latest}`);
            console.log(`  Missing months need to be fetched`);
        } else {
            console.log(`\n${shortName}: COMPLETE - ${data.months_covered} months of data`);
        }
    }

    await pool.end();
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
