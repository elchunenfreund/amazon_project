/**
 * Fetch historical vendor reports using MONTH aggregation
 * This gets 3 years of historical data (36 months)
 *
 * Run: heroku run:detached node fetch-historical-monthly.js
 */

const { Pool } = require('pg');
const { getDatabaseConfig } = require('./lib/db-config');

const pool = new Pool(getDatabaseConfig());

const REPORT_TYPES = [
    'GET_VENDOR_SALES_REPORT',
    'GET_VENDOR_TRAFFIC_REPORT',
    'GET_VENDOR_NET_PURE_PRODUCT_MARGIN_REPORT',
    'GET_VENDOR_INVENTORY_REPORT'
];

const REPORT_DATA_KEYS = {
    'GET_VENDOR_SALES_REPORT': 'salesByAsin',
    'GET_VENDOR_TRAFFIC_REPORT': 'trafficByAsin',
    'GET_VENDOR_NET_PURE_PRODUCT_MARGIN_REPORT': 'netPureProductMarginByAsin',
    'GET_VENDOR_INVENTORY_REPORT': 'inventoryByAsin'
};

// Rate limiting
const DELAY_BETWEEN_REQUESTS = 60000; // 60 seconds between requests
const QUOTA_EXCEEDED_DELAY = 300000; // 5 minutes when quota exceeded

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

    if (new Date(expires_at) > new Date(Date.now() + 5 * 60 * 1000)) {
        return access_token;
    }

    console.log('Refreshing token...');
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

async function createReport(accessToken, reportType, startDate, endDate) {
    const marketplaceId = 'A2EUQ1WTGCTBG2'; // Canada

    const reportSpec = {
        reportType: reportType,
        marketplaceIds: [marketplaceId],
        dataStartTime: startDate.toISOString(),
        dataEndTime: endDate.toISOString(),
        reportOptions: { reportPeriod: 'MONTH' }
    };

    if (reportType === 'GET_VENDOR_SALES_REPORT' || reportType === 'GET_VENDOR_INVENTORY_REPORT') {
        reportSpec.reportOptions.distributorView = 'MANUFACTURING';
        reportSpec.reportOptions.sellingProgram = 'RETAIL';
    }

    const response = await fetch('https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/reports', {
        method: 'POST',
        headers: {
            'x-amz-access-token': accessToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(reportSpec)
    });

    const data = await response.json();

    if (!response.ok) {
        const err = new Error(`Create report failed: ${JSON.stringify(data)}`);
        if (data.errors?.[0]?.code === 'QuotaExceeded') {
            err.isQuotaExceeded = true;
        }
        throw err;
    }

    return data.reportId;
}

async function waitForReport(accessToken, reportId) {
    for (let i = 0; i < 60; i++) { // Max 5 minutes
        await sleep(5000);

        const response = await fetch(
            `https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/reports/${reportId}`,
            { headers: { 'x-amz-access-token': accessToken } }
        );

        const data = await response.json();

        if (data.processingStatus === 'DONE') {
            return data.reportDocumentId;
        } else if (data.processingStatus === 'FATAL' || data.processingStatus === 'CANCELLED') {
            const err = new Error(`Report ${reportId} failed: ${data.processingStatus}`);
            err.isFatal = true;
            throw err;
        }

        if (i % 6 === 0) {
            console.log(`    Status: ${data.processingStatus}...`);
        }
    }

    throw new Error(`Report ${reportId} timed out`);
}

async function downloadReport(accessToken, reportDocumentId) {
    const response = await fetch(
        `https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/documents/${reportDocumentId}`,
        { headers: { 'x-amz-access-token': accessToken } }
    );

    const docInfo = await response.json();
    const reportResponse = await fetch(docInfo.url);

    let reportContent;
    if (docInfo.compressionAlgorithm === 'GZIP') {
        const zlib = require('zlib');
        const buffer = await reportResponse.arrayBuffer();
        reportContent = zlib.gunzipSync(Buffer.from(buffer)).toString('utf8');
    } else {
        reportContent = await reportResponse.text();
    }

    return JSON.parse(reportContent);
}

async function saveReportData(reportType, reportData, startDate, endDate) {
    const dataKey = REPORT_DATA_KEYS[reportType];
    let asinData = [];

    if (dataKey && reportData[dataKey]) {
        asinData = reportData[dataKey];
    } else if (Array.isArray(reportData)) {
        asinData = reportData;
    } else if (reportData.reportData && Array.isArray(reportData.reportData)) {
        asinData = reportData.reportData;
    }

    let savedCount = 0;
    for (const item of asinData) {
        if (item.asin) {
            const reportDate = item.endDate || item.startDate || endDate.toISOString().split('T')[0];
            const dataStartDate = item.startDate || startDate.toISOString().split('T')[0];
            const dataEndDate = item.endDate || endDate.toISOString().split('T')[0];

            await pool.query(
                `DELETE FROM vendor_reports WHERE report_type = $1 AND asin = $2 AND report_date = $3`,
                [reportType, item.asin, reportDate]
            );
            await pool.query(
                `INSERT INTO vendor_reports (report_type, asin, report_date, data, data_start_date, data_end_date, report_request_date)
                 VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
                [reportType, item.asin, reportDate, JSON.stringify(item), dataStartDate, dataEndDate]
            );
            savedCount++;
        }
    }

    return savedCount;
}

async function main() {
    console.log('='.repeat(60));
    console.log('HISTORICAL DATA FETCH - MONTHLY (3 YEARS)');
    console.log('='.repeat(60));
    console.log('Started:', new Date().toISOString());
    console.log('');

    // Generate 36 monthly periods (3 years)
    const months = [];
    const now = new Date();

    for (let i = 1; i <= 36; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const startDate = new Date(date.getFullYear(), date.getMonth(), 1);
        const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);

        months.push({
            label: `${startDate.toLocaleString('default', { month: 'short' })} ${startDate.getFullYear()}`,
            startDate,
            endDate
        });
    }

    console.log(`Will fetch ${months.length} months × ${REPORT_TYPES.length} report types = ${months.length * REPORT_TYPES.length} total reports`);
    console.log('');

    // Check existing data
    const existingData = await pool.query(`
        SELECT DISTINCT report_type,
               TO_CHAR(report_date, 'YYYY-MM') as month
        FROM vendor_reports
        WHERE report_date >= NOW() - INTERVAL '3 years'
    `);

    const existingSet = new Set(
        existingData.rows.map(r => `${r.report_type}:${r.month}`)
    );

    console.log(`Found ${existingSet.size} existing month/report combinations`);
    console.log('');

    let totalFetched = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (const reportType of REPORT_TYPES) {
        console.log('-'.repeat(60));
        console.log(reportType);
        console.log('-'.repeat(60));

        for (let i = 0; i < months.length; i++) {
            const month = months[i];
            const monthKey = `${month.startDate.getFullYear()}-${String(month.startDate.getMonth() + 1).padStart(2, '0')}`;
            const existKey = `${reportType}:${monthKey}`;

            // Skip if already have data
            if (existingSet.has(existKey)) {
                console.log(`[${i + 1}/${months.length}] ${month.label} - skipped (already have data)`);
                totalSkipped++;
                continue;
            }

            console.log(`[${i + 1}/${months.length}] ${month.label}`);

            let retries = 0;
            const maxRetries = 3;

            while (retries < maxRetries) {
                try {
                    const accessToken = await getAccessToken();

                    const reportId = await createReport(accessToken, reportType, month.startDate, month.endDate);
                    console.log(`    Created: ${reportId}`);

                    const documentId = await waitForReport(accessToken, reportId);
                    console.log(`    Ready: ${documentId}`);

                    const reportData = await downloadReport(accessToken, documentId);
                    const savedCount = await saveReportData(reportType, reportData, month.startDate, month.endDate);
                    console.log(`    Saved ${savedCount} ASIN records`);

                    totalFetched++;

                    // Wait between successful requests
                    console.log(`    Waiting ${DELAY_BETWEEN_REQUESTS / 1000}s...`);
                    await sleep(DELAY_BETWEEN_REQUESTS);
                    break;

                } catch (err) {
                    retries++;
                    console.log(`    ERROR: ${err.message}`);

                    if (err.isFatal) {
                        console.log(`    Skipping (FATAL)`);
                        totalErrors++;
                        break;
                    }

                    if (err.isQuotaExceeded) {
                        console.log(`    Quota exceeded, waiting 5 minutes...`);
                        await sleep(QUOTA_EXCEEDED_DELAY);
                    } else if (retries < maxRetries) {
                        console.log(`    Retrying in 60s... (${retries}/${maxRetries})`);
                        await sleep(60000);
                    } else {
                        totalErrors++;
                    }
                }
            }
        }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Fetched: ${totalFetched}`);
    console.log(`Skipped: ${totalSkipped}`);
    console.log(`Errors:  ${totalErrors}`);
    console.log(`Finished: ${new Date().toISOString()}`);

    await pool.end();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
