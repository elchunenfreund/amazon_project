/**
 * Check the actual structure of PO data in the database
 * Run: heroku run node check-po-structure.js
 */

const { Pool } = require('pg');
const { getDatabaseConfig } = require('./lib/db-config');

const pool = new Pool(getDatabaseConfig());

async function main() {
    console.log('='.repeat(60));
    console.log('PO DATA STRUCTURE DIAGNOSTIC');
    console.log('='.repeat(60));
    console.log('');

    // Get a sample PO with raw_data
    const sample = await pool.query(`
        SELECT po_number, po_date, po_status, items, raw_data
        FROM purchase_orders
        LIMIT 1
    `);

    if (sample.rows.length > 0) {
        const po = sample.rows[0];
        console.log('Sample PO Number:', po.po_number);
        console.log('po_date column:', po.po_date);
        console.log('po_status column:', po.po_status);
        console.log('');

        // Check raw_data structure
        const rawData = typeof po.raw_data === 'string' ? JSON.parse(po.raw_data) : po.raw_data;
        console.log('RAW DATA KEYS:', Object.keys(rawData));
        console.log('');

        // Look for date fields
        console.log('DATE FIELDS IN RAW DATA:');
        for (const [key, value] of Object.entries(rawData)) {
            if (key.toLowerCase().includes('date') || key.toLowerCase().includes('time')) {
                console.log(`  ${key}:`, value);
            }
        }
        console.log('');

        // Look for items
        console.log('ITEMS FIELD:');
        if (rawData.items) {
            console.log('  items exists, type:', typeof rawData.items);
            if (Array.isArray(rawData.items)) {
                console.log('  items is array with', rawData.items.length, 'items');
                if (rawData.items.length > 0) {
                    console.log('  First item structure:', JSON.stringify(rawData.items[0], null, 2));
                }
            }
        } else {
            console.log('  items field NOT FOUND');
            // Look for similar fields
            for (const [key, value] of Object.entries(rawData)) {
                if (key.toLowerCase().includes('item') || key.toLowerCase().includes('line') || key.toLowerCase().includes('product')) {
                    console.log(`  Found: ${key} (type: ${typeof value})`);
                    if (Array.isArray(value) && value.length > 0) {
                        console.log(`    Sample:`, JSON.stringify(value[0], null, 2));
                    }
                }
            }
        }

        console.log('');
        console.log('FULL RAW DATA (first 2000 chars):');
        console.log(JSON.stringify(rawData, null, 2).substring(0, 2000));
    } else {
        console.log('No POs found in database');
    }

    await pool.end();
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
