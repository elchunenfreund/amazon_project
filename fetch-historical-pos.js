/**
 * Fetch all historical Purchase Orders from Amazon SP-API
 * Uses pagination to get all POs going back 3 years
 *
 * Run: heroku run node fetch-historical-pos.js
 */

const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const DELAY_BETWEEN_REQUESTS = 5000; // 5 seconds between requests
const MAX_PAGES = 100; // Safety limit

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getAccessToken() {
    const result = await pool.query(
        'SELECT access_token, refresh_token, expires_at FROM oauth_tokens ORDER BY id DESC LIMIT 1'
    );

    if (!result.rows.length) {
        throw new Error('No OAuth tokens found');
    }

    const { access_token, refresh_token, expires_at } = result.rows[0];

    // Check if token is still valid (with 5 min buffer)
    if (new Date(expires_at) > new Date(Date.now() + 5 * 60 * 1000)) {
        return access_token;
    }

    // Refresh token
    console.log('Refreshing access token...');
    const response = await fetch('https://api.amazon.com/auth/o2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refresh_token,
            client_id: process.env.LWA_CLIENT_ID,
            client_secret: process.env.LWA_CLIENT_SECRET
        })
    });

    const data = await response.json();
    if (!data.access_token) {
        throw new Error('Token refresh failed: ' + JSON.stringify(data));
    }

    await pool.query(
        'UPDATE oauth_tokens SET access_token = $1, expires_at = $2 WHERE id = (SELECT id FROM oauth_tokens ORDER BY id DESC LIMIT 1)',
        [data.access_token, new Date(Date.now() + data.expires_in * 1000)]
    );

    return data.access_token;
}

async function fetchPurchaseOrders(accessToken, createdAfter, nextToken = null) {
    let url = 'https://sellingpartnerapi-na.amazon.com/vendor/orders/v1/purchaseOrders?limit=100';
    url += `&createdAfter=${encodeURIComponent(createdAfter)}`;

    if (nextToken) {
        url += `&nextToken=${encodeURIComponent(nextToken)}`;
    }

    const response = await fetch(url, {
        headers: {
            'x-amz-access-token': accessToken,
            'Content-Type': 'application/json'
        }
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(`API error: ${JSON.stringify(data)}`);
    }

    return data;
}

async function savePurchaseOrder(order) {
    // Data is nested in orderDetails
    const details = order.orderDetails || {};
    const items = details.items || [];

    // Parse deliveryWindow string format: "2026-01-26T08:00:00Z--2026-01-30T10:00:00Z"
    let deliveryStart = null, deliveryEnd = null;
    if (details.deliveryWindow && typeof details.deliveryWindow === 'string') {
        const parts = details.deliveryWindow.split('--');
        if (parts.length === 2) {
            deliveryStart = parts[0];
            deliveryEnd = parts[1];
        }
    }

    // Save to purchase_orders
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
            po_date = COALESCE(EXCLUDED.po_date, purchase_orders.po_date),
            items = EXCLUDED.items,
            raw_data = EXCLUDED.raw_data,
            updated_at = CURRENT_TIMESTAMP`,
        [
            order.purchaseOrderNumber,
            details.purchaseOrderDate || null,
            order.purchaseOrderState,
            null, // shipWindow not in this format
            null,
            deliveryStart,
            deliveryEnd,
            JSON.stringify(details.buyingParty),
            JSON.stringify(details.sellingParty),
            JSON.stringify(details.shipToParty),
            JSON.stringify(details.billToParty),
            JSON.stringify(items),
            JSON.stringify(order)
        ]
    );

    // Save to po_line_items for faster ASIN queries
    let lineItemCount = 0;
    for (const item of items) {
        const asin = item.amazonProductIdentifier;
        if (asin) {
            await pool.query(
                `INSERT INTO po_line_items (
                    po_number, asin, vendor_sku, ordered_quantity,
                    acknowledged_quantity, net_cost_amount, net_cost_currency
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (po_number, asin) DO UPDATE SET
                    vendor_sku = EXCLUDED.vendor_sku,
                    ordered_quantity = EXCLUDED.ordered_quantity,
                    acknowledged_quantity = EXCLUDED.acknowledged_quantity,
                    net_cost_amount = EXCLUDED.net_cost_amount,
                    net_cost_currency = EXCLUDED.net_cost_currency`,
                [
                    order.purchaseOrderNumber,
                    asin,
                    item.vendorProductIdentifier || null,
                    item.orderedQuantity?.amount ? parseInt(item.orderedQuantity.amount) : null,
                    item.acknowledgedQuantity?.amount ? parseInt(item.acknowledgedQuantity.amount) : null,
                    item.netCost?.amount ? parseFloat(item.netCost.amount) : null,
                    item.netCost?.currencyCode || null
                ]
            );
            lineItemCount++;
        }
    }

    return lineItemCount;
}

async function main() {
    console.log('='.repeat(60));
    console.log('FETCH HISTORICAL PURCHASE ORDERS');
    console.log('='.repeat(60));
    console.log('Started:', new Date().toISOString());
    console.log('');

    // Go back 3 years
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    const createdAfter = threeYearsAgo.toISOString();

    console.log(`Fetching POs created after: ${createdAfter}`);
    console.log('');

    // Check current state
    const beforePO = await pool.query('SELECT COUNT(*) FROM purchase_orders');
    const beforeLines = await pool.query('SELECT COUNT(*) FROM po_line_items');
    console.log(`Current records: ${beforePO.rows[0].count} POs, ${beforeLines.rows[0].count} line items`);
    console.log('');

    let totalPOs = 0;
    let totalLineItems = 0;
    let pageCount = 0;
    let nextToken = null;

    try {
        do {
            pageCount++;
            const accessToken = await getAccessToken();

            console.log(`Page ${pageCount}: Fetching...`);
            const data = await fetchPurchaseOrders(accessToken, createdAfter, nextToken);

            const orders = data.payload?.orders || [];
            console.log(`  Found ${orders.length} orders`);

            for (const order of orders) {
                try {
                    const lineItems = await savePurchaseOrder(order);
                    totalPOs++;
                    totalLineItems += lineItems;
                } catch (err) {
                    console.error(`  Error saving PO ${order.purchaseOrderNumber}:`, err.message);
                }
            }

            nextToken = data.payload?.pagination?.nextToken;

            if (nextToken && pageCount < MAX_PAGES) {
                console.log(`  Next page available, waiting ${DELAY_BETWEEN_REQUESTS / 1000}s...`);
                await sleep(DELAY_BETWEEN_REQUESTS);
            }

        } while (nextToken && pageCount < MAX_PAGES);

    } catch (err) {
        console.error('Error:', err.message);
    }

    // Final counts
    const afterPO = await pool.query('SELECT COUNT(*) FROM purchase_orders');
    const afterLines = await pool.query('SELECT COUNT(*) FROM po_line_items');

    console.log('');
    console.log('='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Pages fetched: ${pageCount}`);
    console.log(`POs saved: ${totalPOs}`);
    console.log(`Line items saved: ${totalLineItems}`);
    console.log('');
    console.log(`Total POs in database: ${afterPO.rows[0].count}`);
    console.log(`Total line items: ${afterLines.rows[0].count}`);
    console.log('');
    console.log('Finished:', new Date().toISOString());

    // Show sample of recent POs
    const sample = await pool.query(`
        SELECT po_number, po_date, po_status,
               (SELECT COUNT(*) FROM po_line_items WHERE po_number = po.po_number) as item_count
        FROM purchase_orders po
        ORDER BY po_date DESC
        LIMIT 5
    `);

    if (sample.rows.length > 0) {
        console.log('');
        console.log('Recent POs:');
        console.table(sample.rows);
    }

    await pool.end();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
