/**
 * Migrate existing PO data to po_line_items table
 * This populates the denormalized table from purchase_orders.items JSONB
 *
 * Run: heroku run node migrate-po-line-items.js
 */

const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    console.log('='.repeat(60));
    console.log('MIGRATE PO LINE ITEMS');
    console.log('='.repeat(60));
    console.log('');

    // Check current state
    const beforeCount = await pool.query('SELECT COUNT(*) FROM po_line_items');
    console.log('Current po_line_items records:', beforeCount.rows[0].count);

    // Get all purchase orders with items
    const pos = await pool.query(`
        SELECT po_number, items, raw_data
        FROM purchase_orders
        WHERE items IS NOT NULL
    `);

    console.log(`Found ${pos.rows.length} purchase orders to process`);
    console.log('');

    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const po of pos.rows) {
        let items = [];

        // Try to parse items from the items column
        if (po.items) {
            if (typeof po.items === 'string') {
                try {
                    items = JSON.parse(po.items);
                } catch (e) {
                    console.log(`  Warning: Could not parse items for ${po.po_number}`);
                }
            } else if (Array.isArray(po.items)) {
                items = po.items;
            }
        }

        // Fallback to raw_data.items if needed
        if (items.length === 0 && po.raw_data) {
            const rawData = typeof po.raw_data === 'string' ? JSON.parse(po.raw_data) : po.raw_data;
            if (rawData.items && Array.isArray(rawData.items)) {
                items = rawData.items;
            }
        }

        if (!items.length) {
            skippedCount++;
            continue;
        }

        for (const item of items) {
            const asin = item.amazonProductIdentifier;
            if (!asin) continue;

            try {
                const result = await pool.query(
                    `INSERT INTO po_line_items (
                        po_number, asin, vendor_sku, ordered_quantity,
                        acknowledged_quantity, net_cost_amount, net_cost_currency
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (po_number, asin) DO UPDATE SET
                        vendor_sku = EXCLUDED.vendor_sku,
                        ordered_quantity = EXCLUDED.ordered_quantity,
                        acknowledged_quantity = EXCLUDED.acknowledged_quantity,
                        net_cost_amount = EXCLUDED.net_cost_amount,
                        net_cost_currency = EXCLUDED.net_cost_currency
                    RETURNING (xmax = 0) AS inserted`,
                    [
                        po.po_number,
                        asin,
                        item.vendorProductIdentifier || null,
                        item.orderedQuantity?.amount ? parseInt(item.orderedQuantity.amount) : null,
                        item.acknowledgedQuantity?.amount ? parseInt(item.acknowledgedQuantity.amount) : null,
                        item.netCost?.amount ? parseFloat(item.netCost.amount) : null,
                        item.netCost?.currencyCode || null
                    ]
                );

                if (result.rows[0].inserted) {
                    insertedCount++;
                } else {
                    updatedCount++;
                }
            } catch (err) {
                console.log(`  Error inserting ${asin} for ${po.po_number}:`, err.message);
            }
        }
    }

    // Final count
    const afterCount = await pool.query('SELECT COUNT(*) FROM po_line_items');

    console.log('');
    console.log('='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`POs processed: ${pos.rows.length}`);
    console.log(`POs skipped (no items): ${skippedCount}`);
    console.log(`Line items inserted: ${insertedCount}`);
    console.log(`Line items updated: ${updatedCount}`);
    console.log(`Total po_line_items now: ${afterCount.rows[0].count}`);

    // Show sample data
    const sample = await pool.query(`
        SELECT pli.asin, pli.po_number, pli.ordered_quantity, pli.acknowledged_quantity,
               po.po_date
        FROM po_line_items pli
        JOIN purchase_orders po ON pli.po_number = po.po_number
        ORDER BY po.po_date DESC
        LIMIT 5
    `);

    if (sample.rows.length > 0) {
        console.log('');
        console.log('Sample data:');
        console.table(sample.rows);
    }

    await pool.end();
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
