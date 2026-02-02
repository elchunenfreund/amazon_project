/**
 * Scheduled Sync Script for Heroku Scheduler
 *
 * Syncs all vendor reports and purchase orders automatically.
 *
 * Usage:
 *   node scheduled-sync.js              # Sync everything (high memory usage)
 *   node scheduled-sync.js reports      # Sync only weekly vendor reports
 *   node scheduled-sync.js po           # Sync only purchase orders
 *   node scheduled-sync.js rt           # Sync both RT reports (may exceed 512MB on Basic dynos)
 *   node scheduled-sync.js rt-inv       # Sync only RT Inventory (lower memory)
 *   node scheduled-sync.js rt-sales     # Sync only RT Sales (lower memory)
 *
 * Recommended Heroku Scheduler setup for Basic dynos (512MB):
 *   - node scheduled-sync.js rt-inv     (Hourly at :00)
 *   - node scheduled-sync.js rt-sales   (Hourly at :30 or separate job)
 *   - node scheduled-sync.js reports    (Daily)
 *   - node scheduled-sync.js po         (Daily)
 *
 * Note: For memory-constrained environments, split RT reports into separate jobs
 *       using 'rt-inv' and 'rt-sales' instead of 'rt'
 */

const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const MARKETPLACE_ID = 'A2EUQ1WTGCTBG2'; // Canada

// Report types configuration
// requiresOptions lists which reportOptions each report type supports
const VENDOR_REPORT_TYPES = {
    'GET_VENDOR_REAL_TIME_INVENTORY_REPORT': {
        name: 'Real-Time Inventory',
        isRealTime: true,
        maxSpanDays: 7
    },
    'GET_VENDOR_REAL_TIME_SALES_REPORT': {
        name: 'Real-Time Sales',
        isRealTime: true,
        maxSpanDays: 14
    },
    'GET_VENDOR_SALES_REPORT': {
        name: 'Sales Report',
        isRealTime: false,
        requiresOptions: ['reportPeriod', 'distributorView', 'sellingProgram']
    },
    'GET_VENDOR_NET_PURE_PRODUCT_MARGIN_REPORT': {
        name: 'Net Pure Product Margin',
        isRealTime: false,
        requiresOptions: ['reportPeriod']  // Does NOT support distributorView or sellingProgram
    },
    'GET_VENDOR_TRAFFIC_REPORT': {
        name: 'Traffic Report',
        isRealTime: false,
        requiresOptions: ['reportPeriod']  // Does NOT support distributorView or sellingProgram
    },
    'GET_VENDOR_INVENTORY_REPORT': {
        name: 'Inventory Report',
        isRealTime: false,
        requiresOptions: ['reportPeriod', 'distributorView', 'sellingProgram']
    }
};

// ============================================
// OAuth Token Management
// ============================================

async function refreshAccessToken(refreshToken) {
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
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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

    const expiresAt = tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000)
        : new Date(Date.now() + 3600 * 1000);

    await pool.query(
        `UPDATE oauth_tokens SET access_token = $1, expires_at = $2, updated_at = CURRENT_TIMESTAMP WHERE refresh_token = $3`,
        [tokenData.access_token, expiresAt, refreshToken]
    );

    console.log('[Auth] Access token refreshed successfully');
    return tokenData.access_token;
}

async function getValidAccessToken() {
    const tokenResult = await pool.query(
        'SELECT refresh_token, access_token, expires_at FROM oauth_tokens ORDER BY created_at DESC LIMIT 1'
    );

    if (tokenResult.rows.length === 0) {
        throw new Error('No OAuth tokens found. Please complete OAuth authorization first.');
    }

    const token = tokenResult.rows[0];
    const now = new Date();

    if (token.access_token && token.expires_at && new Date(token.expires_at) > new Date(now.getTime() + 5 * 60 * 1000)) {
        return token.access_token;
    }

    console.log('[Auth] Access token expired, refreshing...');
    return await refreshAccessToken(token.refresh_token);
}

// ============================================
// Helper Functions
// ============================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            return response;
        } catch (err) {
            if (i === maxRetries - 1) throw err;
            console.log(`[Retry] Attempt ${i + 1} failed, retrying in ${(i + 1) * 2}s...`);
            await sleep((i + 1) * 2000);
        }
    }
}

// ============================================
// Vendor Reports Sync
// ============================================

// Helper to align date to week boundary (Sunday = start, Saturday = end)
function getWeekBoundaries(daysBack = 30) {
    const now = new Date();

    // Find the most recent Saturday that's at least 3 days ago (for data availability)
    // Saturday = 6 in JavaScript Date
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    let endSaturday = new Date(threeDaysAgo);
    while (endSaturday.getDay() !== 6) {
        endSaturday.setDate(endSaturday.getDate() - 1);
    }

    // Find the Sunday that starts the week containing our target start date
    // Go back daysBack days, then find the previous Sunday
    let startDate = new Date(endSaturday.getTime() - daysBack * 24 * 60 * 60 * 1000);
    let startSunday = new Date(startDate);
    while (startSunday.getDay() !== 0) {
        startSunday.setDate(startSunday.getDate() - 1);
    }

    return {
        start: startSunday,
        end: endSaturday
    };
}

async function createReport(accessToken, reportType, startDate, endDate) {
    const reportConfig = VENDOR_REPORT_TYPES[reportType];

    const reportSpec = {
        reportType: reportType,
        marketplaceIds: [MARKETPLACE_ID]
    };

    if (reportConfig.isRealTime) {
        reportSpec.dataStartTime = startDate.toISOString();
        reportSpec.dataEndTime = endDate.toISOString();
    } else {
        // Weekly reports need dates aligned to week boundaries
        // Amazon uses Sunday-Saturday weeks
        // Also need 3+ day lag for data availability
        const weekBounds = getWeekBoundaries(30);

        // Format as date-only strings with time component
        reportSpec.dataStartTime = weekBounds.start.toISOString().split('T')[0] + 'T00:00:00Z';
        reportSpec.dataEndTime = weekBounds.end.toISOString().split('T')[0] + 'T23:59:59Z';

        console.log(`[${reportType}] Aligned to week boundaries: ${reportSpec.dataStartTime} to ${reportSpec.dataEndTime}`);

        // Build reportOptions based on what each report type supports
        // Sales and Inventory support: reportPeriod, distributorView, sellingProgram
        // Margin and Traffic only support: reportPeriod
        const requiresOptions = reportConfig.requiresOptions || [];
        reportSpec.reportOptions = {
            reportPeriod: 'WEEK'
        };

        // Only add distributorView and sellingProgram if the report supports them
        if (requiresOptions.includes('distributorView')) {
            reportSpec.reportOptions.distributorView = 'MANUFACTURING';
        }
        if (requiresOptions.includes('sellingProgram')) {
            reportSpec.reportOptions.sellingProgram = 'RETAIL';
        }

        console.log(`[${reportType}] Report options:`, JSON.stringify(reportSpec.reportOptions));
    }

    const response = await fetchWithRetry('https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/reports', {
        method: 'POST',
        headers: {
            'x-amz-access-token': accessToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(reportSpec)
    });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(`Non-JSON response (${response.status}): ${text.substring(0, 200)}`);
    }

    const data = await response.json();

    if (!response.ok) {
        throw new Error(`Create report failed: ${JSON.stringify(data)}`);
    }

    return data.reportId;
}

async function downloadErrorDocument(accessToken, reportDocumentId) {
    try {
        const docResponse = await fetchWithRetry(`https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/documents/${reportDocumentId}`, {
            headers: {
                'x-amz-access-token': accessToken,
                'Content-Type': 'application/json'
            }
        });

        const docData = await docResponse.json();
        const downloadUrl = docData.url;

        const contentResponse = await fetchWithRetry(downloadUrl);
        let content;

        if (docData.compressionAlgorithm === 'GZIP') {
            const zlib = require('zlib');
            const buffer = await contentResponse.arrayBuffer();
            content = zlib.gunzipSync(Buffer.from(buffer)).toString('utf-8');
        } else {
            content = await contentResponse.text();
        }

        return content.substring(0, 2000); // Limit to first 2000 chars
    } catch (err) {
        return `Failed to download error document: ${err.message}`;
    }
}

async function waitForReport(accessToken, reportId, maxWaitMs = 120000) {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
        const response = await fetchWithRetry(`https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/reports/${reportId}`, {
            headers: {
                'x-amz-access-token': accessToken,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.processingStatus === 'DONE') {
            return data.reportDocumentId;
        } else if (data.processingStatus === 'FATAL' || data.processingStatus === 'CANCELLED') {
            console.error(`[Report ${data.processingStatus}] Full response:`, JSON.stringify(data, null, 2));

            // Try to download the error document if available
            if (data.reportDocumentId) {
                console.log(`[Report ${data.processingStatus}] Downloading error document...`);
                const errorContent = await downloadErrorDocument(accessToken, data.reportDocumentId);
                console.error(`[Report ${data.processingStatus}] Error document content:`, errorContent);
            }

            throw new Error(`Report ${data.processingStatus}: ${data.reportType || 'unknown'} - ${JSON.stringify(data.errors || data)}`);
        }

        await sleep(3000);
    }

    throw new Error(`Report timed out after ${maxWaitMs}ms`);
}

async function downloadAndSaveReport(accessToken, reportDocumentId, reportType) {
    // Get document URL
    const docResponse = await fetchWithRetry(`https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/documents/${reportDocumentId}`, {
        headers: {
            'x-amz-access-token': accessToken,
            'Content-Type': 'application/json'
        }
    });

    const docData = await docResponse.json();
    const downloadUrl = docData.url;
    const compressionAlgorithm = docData.compressionAlgorithm;

    // Download report content
    const contentResponse = await fetchWithRetry(downloadUrl);
    let reportContent;

    if (compressionAlgorithm === 'GZIP') {
        const zlib = require('zlib');
        const buffer = await contentResponse.arrayBuffer();
        reportContent = zlib.gunzipSync(Buffer.from(buffer)).toString('utf-8');
    } else {
        reportContent = await contentResponse.text();
    }

    // Parse JSON
    let reportData;
    try {
        reportData = JSON.parse(reportContent);
        // Clear raw content to free memory
        reportContent = null;
    } catch (e) {
        console.error(`[${reportType}] Failed to parse report JSON`);
        return 0;
    }

    // Extract ASIN data
    let dataKey = reportType.includes('INVENTORY') ? 'inventoryByAsin' :
                  reportType.includes('SALES') ? 'salesByAsin' :
                  reportType.includes('TRAFFIC') ? 'trafficByAsin' :
                  reportType.includes('MARGIN') ? 'netPureProductMarginByAsin' : null;

    let asinData = reportData[dataKey] || reportData.reportData || [];
    // Clear reportData to free memory - we only need asinData now
    reportData = null;

    if (!Array.isArray(asinData)) asinData = [];

    if (asinData.length === 0) {
        console.log(`[${reportType}] No ASIN data found in report`);
        return 0;
    }

    console.log(`[${reportType}] Processing ${asinData.length} items...`);

    // Collect unique dates for deletion
    const uniqueDates = new Set();
    for (const item of asinData) {
        if (item.asin) {
            const reportDate = item.endDate || item.startDate || item.date || new Date().toISOString().split('T')[0];
            uniqueDates.add(reportDate);
        }
    }

    // Batch delete existing records for these dates
    if (uniqueDates.size > 0) {
        await pool.query(
            `DELETE FROM vendor_reports WHERE report_type = $1 AND report_date = ANY($2)`,
            [reportType, Array.from(uniqueDates)]
        );
    }

    // Process in smaller chunks (200 instead of 500) to reduce memory spikes
    const chunkSize = 200;
    let savedCount = 0;

    for (let i = 0; i < asinData.length; i += chunkSize) {
        const chunk = asinData.slice(i, Math.min(i + chunkSize, asinData.length));
        const values = [];
        const params = [];
        let paramIndex = 1;

        for (const item of chunk) {
            if (!item.asin) continue;

            const reportDate = item.endDate || item.startDate || item.date || new Date().toISOString().split('T')[0];
            values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, CURRENT_TIMESTAMP)`);
            params.push(reportType, item.asin, reportDate, JSON.stringify(item), item.startDate || null, item.endDate || null);
            paramIndex += 6;
            savedCount++;
        }

        if (values.length > 0) {
            await pool.query(
                `INSERT INTO vendor_reports (report_type, asin, report_date, data, data_start_date, data_end_date, report_request_date)
                 VALUES ${values.join(', ')}`,
                params
            );
        }
    }

    // Clear asinData to free memory
    asinData = null;

    return savedCount;
}

async function syncVendorReport(reportType, daysBack = 14) {
    const reportConfig = VENDOR_REPORT_TYPES[reportType];
    console.log(`\n[${reportConfig.name}] Starting sync...`);

    try {
        const accessToken = await getValidAccessToken();

        const endDate = new Date();
        let startDate;

        if (reportConfig.isRealTime) {
            // RT reports have limited span - use millisecond arithmetic for accuracy
            const maxSpan = reportConfig.maxSpanDays || 7;
            const daysToGoBack = Math.min(daysBack, maxSpan);
            startDate = new Date(endDate.getTime() - daysToGoBack * 24 * 60 * 60 * 1000);
        } else {
            // Weekly reports - use millisecond arithmetic
            startDate = new Date(endDate.getTime() - daysBack * 24 * 60 * 60 * 1000);
        }

        console.log(`[${reportConfig.name}] Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
        console.log(`[${reportConfig.name}] Days span: ${Math.round((endDate - startDate) / (1000 * 60 * 60 * 24))} days`);

        const reportId = await createReport(accessToken, reportType, startDate, endDate);
        console.log(`[${reportConfig.name}] Report created: ${reportId}`);

        const reportDocumentId = await waitForReport(accessToken, reportId);
        console.log(`[${reportConfig.name}] Report ready: ${reportDocumentId}`);

        const savedCount = await downloadAndSaveReport(accessToken, reportDocumentId, reportType);
        console.log(`[${reportConfig.name}] Saved ${savedCount} items`);

        return { success: true, savedCount };
    } catch (err) {
        console.error(`[${reportConfig.name}] Error:`, err.message);
        return { success: false, error: err.message };
    }
}

// ============================================
// Purchase Orders Sync
// ============================================

async function syncPurchaseOrders(daysBack = 30) {
    console.log('\n[Purchase Orders] Starting sync...');

    try {
        const accessToken = await getValidAccessToken();

        const createdAfter = new Date();
        createdAfter.setDate(createdAfter.getDate() - daysBack);

        let allOrders = [];
        let nextToken = null;
        let pageCount = 0;
        const maxPages = 50;

        do {
            let url = `https://sellingpartnerapi-na.amazon.com/vendor/orders/v1/purchaseOrders?limit=100&createdAfter=${encodeURIComponent(createdAfter.toISOString())}`;
            if (nextToken) url += `&nextToken=${encodeURIComponent(nextToken)}`;

            const response = await fetchWithRetry(url, {
                headers: {
                    'x-amz-access-token': accessToken,
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(`PO fetch failed: ${JSON.stringify(data)}`);
            }

            const orders = data.payload?.orders || [];
            allOrders = allOrders.concat(orders);
            nextToken = data.payload?.pagination?.nextToken;
            pageCount++;

            console.log(`[Purchase Orders] Page ${pageCount}: ${orders.length} orders (total: ${allOrders.length})`);

        } while (nextToken && pageCount < maxPages);

        // Save orders to database
        let savedCount = 0;
        for (const order of allOrders) {
            try {
                const details = order.orderDetails || {};
                const items = details.items || [];

                // Parse window string format: "2026-01-26T08:00:00Z--2026-01-30T10:00:00Z"
                let shipStart = null, shipEnd = null;
                if (details.shipWindow && typeof details.shipWindow === 'string') {
                    const parts = details.shipWindow.split('--');
                    if (parts.length === 2) {
                        shipStart = parts[0];
                        shipEnd = parts[1];
                    }
                }

                let deliveryStart = null, deliveryEnd = null;
                if (details.deliveryWindow && typeof details.deliveryWindow === 'string') {
                    const parts = details.deliveryWindow.split('--');
                    if (parts.length === 2) {
                        deliveryStart = parts[0];
                        deliveryEnd = parts[1];
                    }
                }

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
                        ship_window_start = EXCLUDED.ship_window_start,
                        ship_window_end = EXCLUDED.ship_window_end,
                        delivery_window_start = EXCLUDED.delivery_window_start,
                        delivery_window_end = EXCLUDED.delivery_window_end,
                        buying_party = EXCLUDED.buying_party,
                        selling_party = EXCLUDED.selling_party,
                        ship_to_party = EXCLUDED.ship_to_party,
                        bill_to_party = EXCLUDED.bill_to_party,
                        items = EXCLUDED.items,
                        raw_data = EXCLUDED.raw_data,
                        updated_at = CURRENT_TIMESTAMP`,
                    [
                        order.purchaseOrderNumber,
                        details.purchaseOrderDate || null,
                        order.purchaseOrderState,
                        shipStart, shipEnd,
                        deliveryStart, deliveryEnd,
                        JSON.stringify(details.buyingParty),
                        JSON.stringify(details.sellingParty),
                        JSON.stringify(details.shipToParty),
                        JSON.stringify(details.billToParty),
                        JSON.stringify(items),
                        JSON.stringify(order)
                    ]
                );

                // Save line items
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
                    }
                }

                savedCount++;
            } catch (dbErr) {
                console.error(`[Purchase Orders] Error saving ${order.purchaseOrderNumber}:`, dbErr.message);
            }
        }

        console.log(`[Purchase Orders] Synced ${savedCount} of ${allOrders.length} orders`);
        return { success: true, totalFetched: allOrders.length, savedCount, pagesFetched: pageCount };
    } catch (err) {
        console.error('[Purchase Orders] Error:', err.message);
        return { success: false, error: err.message };
    }
}

// ============================================
// Main Entry Point
// ============================================

// Helper to trigger garbage collection if available
function tryGC() {
    if (global.gc) {
        console.log('[Memory] Triggering garbage collection...');
        global.gc();
    }
}

async function main() {
    const args = process.argv.slice(2);
    const mode = args[0] || 'all';

    console.log('='.repeat(60));
    console.log(`SCHEDULED SYNC - ${new Date().toISOString()}`);
    console.log(`Mode: ${mode}`);
    console.log(`Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB used`);
    console.log('='.repeat(60));

    const results = {
        startTime: new Date().toISOString(),
        mode,
        reports: {},
        purchaseOrders: null
    };

    try {
        // Sync based on mode
        // SPLIT RT MODES: Use 'rt-inv' or 'rt-sales' separately to reduce memory usage
        // Or use 'rt' to run both (may exceed memory on Basic dynos)

        if (mode === 'rt-inv') {
            // RT Inventory only - lighter memory footprint
            results.reports['RT_INVENTORY'] = await syncVendorReport('GET_VENDOR_REAL_TIME_INVENTORY_REPORT', 7);
            tryGC();
        }

        if (mode === 'rt-sales') {
            // RT Sales only - lighter memory footprint
            results.reports['RT_SALES'] = await syncVendorReport('GET_VENDOR_REAL_TIME_SALES_REPORT', 14);
            tryGC();
        }

        if (mode === 'all' || mode === 'reports' || mode === 'rt') {
            // Real-time reports (run frequently - every 10 min or hourly)
            // WARNING: Running both RT reports together may exceed memory on Basic dynos
            // Consider using 'rt-inv' and 'rt-sales' separately instead
            if (mode === 'all' || mode === 'rt') {
                results.reports['RT_INVENTORY'] = await syncVendorReport('GET_VENDOR_REAL_TIME_INVENTORY_REPORT', 7);
                tryGC();
                console.log(`[Memory] After RT Inventory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB used`);

                results.reports['RT_SALES'] = await syncVendorReport('GET_VENDOR_REAL_TIME_SALES_REPORT', 14);
                tryGC();
                console.log(`[Memory] After RT Sales: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB used`);
            }

            // Weekly reports (run daily or less frequently)
            if (mode === 'all' || mode === 'reports') {
                results.reports['SALES'] = await syncVendorReport('GET_VENDOR_SALES_REPORT', 30);
                tryGC();
                results.reports['MARGIN'] = await syncVendorReport('GET_VENDOR_NET_PURE_PRODUCT_MARGIN_REPORT', 30);
                tryGC();
                results.reports['TRAFFIC'] = await syncVendorReport('GET_VENDOR_TRAFFIC_REPORT', 30);
                tryGC();
                results.reports['INVENTORY'] = await syncVendorReport('GET_VENDOR_INVENTORY_REPORT', 30);
                tryGC();
            }
        }

        if (mode === 'all' || mode === 'po') {
            results.purchaseOrders = await syncPurchaseOrders(30);
            tryGC();
        }

        results.endTime = new Date().toISOString();
        results.success = true;

        console.log('\n' + '='.repeat(60));
        console.log('SYNC COMPLETE');
        console.log('='.repeat(60));
        console.log(JSON.stringify(results, null, 2));

    } catch (err) {
        console.error('\nFATAL ERROR:', err);
        results.success = false;
        results.error = err.message;
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
