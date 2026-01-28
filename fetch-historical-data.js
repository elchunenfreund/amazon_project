/**
 * One-time script to fetch 3 years of historical vendor reports
 * Run on Heroku: heroku run node fetch-historical-data.js
 *
 * This fetches weekly reports for: Sales, Traffic, Margin, Inventory
 * Real-time reports are skipped as they only support 30 days back
 */

const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Report types that support historical data (weekly aggregation)
const HISTORICAL_REPORT_TYPES = [
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

// Rate limiting - Amazon has strict quotas on vendor reports
const DELAY_BETWEEN_REQUESTS = 90000; // 90 seconds between requests (safer)
const QUOTA_EXCEEDED_DELAY = 300000; // 5 minutes when quota exceeded
const MAX_RETRIES = 5;

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getAccessToken() {
    // Get stored token
    const result = await pool.query(
        'SELECT access_token, refresh_token, expires_at FROM oauth_tokens ORDER BY id DESC LIMIT 1'
    );

    if (!result.rows.length) {
        throw new Error('No OAuth tokens found. Please authenticate first.');
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
        throw new Error('Failed to refresh token: ' + JSON.stringify(data));
    }

    // Update stored token
    const newExpiresAt = new Date(Date.now() + data.expires_in * 1000);
    await pool.query(
        'UPDATE oauth_tokens SET access_token = $1, expires_at = $2 WHERE id = (SELECT id FROM oauth_tokens ORDER BY id DESC LIMIT 1)',
        [data.access_token, newExpiresAt]
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
        reportOptions: {
            reportPeriod: 'WEEK'
        }
    };

    // Add required options for certain reports
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
        throw new Error(`Create report failed: ${JSON.stringify(data)}`);
    }

    return data.reportId;
}

async function waitForReport(accessToken, reportId, maxAttempts = 60) {
    for (let i = 0; i < maxAttempts; i++) {
        await sleep(5000); // Check every 5 seconds

        const response = await fetch(
            `https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/reports/${reportId}`,
            {
                headers: {
                    'x-amz-access-token': accessToken,
                    'Content-Type': 'application/json'
                }
            }
        );

        const data = await response.json();

        if (data.processingStatus === 'DONE') {
            return data.reportDocumentId;
        } else if (data.processingStatus === 'CANCELLED' || data.processingStatus === 'FATAL') {
            throw new Error(`Report ${reportId} failed: ${data.processingStatus}`);
        }

        if (i % 6 === 0) { // Log every 30 seconds
            console.log(`  Waiting for report... status: ${data.processingStatus}`);
        }
    }

    throw new Error(`Report ${reportId} timed out after ${maxAttempts * 5} seconds`);
}

async function downloadReport(accessToken, reportDocumentId) {
    const response = await fetch(
        `https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/documents/${reportDocumentId}`,
        {
            headers: {
                'x-amz-access-token': accessToken,
                'Content-Type': 'application/json'
            }
        }
    );

    const docInfo = await response.json();
    const reportUrl = docInfo.url;
    const compressionAlgorithm = docInfo.compressionAlgorithm;

    const reportResponse = await fetch(reportUrl);

    let reportContent;
    if (compressionAlgorithm === 'GZIP') {
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

async function fetchHistoricalData() {
    console.log('='.repeat(60));
    console.log('HISTORICAL DATA FETCH - 3 YEARS');
    console.log('='.repeat(60));
    console.log('Started at:', new Date().toISOString());
    console.log('');

    // Calculate date ranges - go back 3 years in weekly chunks
    const endDate = new Date();
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

    // Generate weekly date ranges (Sunday to Saturday)
    const dateRanges = [];
    let current = new Date(endDate);

    // Align to last Saturday
    const dayOfWeek = current.getDay();
    current.setDate(current.getDate() - dayOfWeek - 1);
    current.setHours(23, 59, 59, 0);

    while (current > threeYearsAgo) {
        const weekEnd = new Date(current);
        const weekStart = new Date(current);
        weekStart.setDate(weekStart.getDate() - 6);
        weekStart.setHours(0, 0, 0, 0);

        if (weekStart >= threeYearsAgo) {
            dateRanges.push({ start: weekStart, end: weekEnd });
        }

        current.setDate(current.getDate() - 7);
    }

    console.log(`Generated ${dateRanges.length} weekly periods to fetch`);
    console.log(`From: ${threeYearsAgo.toDateString()} to ${endDate.toDateString()}`);
    console.log('');

    // Check existing data to skip already fetched periods
    const existingData = await pool.query(`
        SELECT DISTINCT report_type, report_date
        FROM vendor_reports
        WHERE report_date >= $1
        ORDER BY report_date
    `, [threeYearsAgo]);

    const existingSet = new Set(
        existingData.rows.map(r => `${r.report_type}:${r.report_date.toISOString().split('T')[0]}`)
    );

    console.log(`Found ${existingData.rows.length} existing report entries`);
    console.log('');

    let totalFetched = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    // Process each report type
    for (const reportType of HISTORICAL_REPORT_TYPES) {
        console.log('-'.repeat(60));
        console.log(`Processing: ${reportType}`);
        console.log('-'.repeat(60));

        let typeFetched = 0;
        let typeSkipped = 0;

        for (let i = 0; i < dateRanges.length; i++) {
            const { start, end } = dateRanges[i];
            const dateKey = `${reportType}:${end.toISOString().split('T')[0]}`;

            // Skip if already have data for this period
            if (existingSet.has(dateKey)) {
                typeSkipped++;
                continue;
            }

            const progress = `[${i + 1}/${dateRanges.length}]`;
            console.log(`${progress} ${start.toDateString()} - ${end.toDateString()}`);

            let retries = 0;
            while (retries < MAX_RETRIES) {
                try {
                    const accessToken = await getAccessToken();

                    // Create report
                    const reportId = await createReport(accessToken, reportType, start, end);
                    console.log(`  Created report: ${reportId}`);

                    // Wait for completion
                    const documentId = await waitForReport(accessToken, reportId);
                    console.log(`  Report ready: ${documentId}`);

                    // Download and save
                    const reportData = await downloadReport(accessToken, documentId);
                    const savedCount = await saveReportData(reportType, reportData, start, end);
                    console.log(`  Saved ${savedCount} ASIN records`);

                    typeFetched++;
                    totalFetched++;
                    break;

                } catch (err) {
                    retries++;
                    console.error(`  ERROR (attempt ${retries}/${MAX_RETRIES}): ${err.message}`);

                    if (retries < MAX_RETRIES) {
                        // Check if quota exceeded - need longer wait
                        const isQuotaError = err.message.includes('QuotaExceeded');
                        const waitTime = isQuotaError ? QUOTA_EXCEEDED_DELAY : 60000;
                        console.log(`  Retrying in ${waitTime / 1000} seconds...${isQuotaError ? ' (quota exceeded)' : ''}`);
                        await sleep(waitTime);
                    } else {
                        totalErrors++;
                    }
                }
            }

            // Rate limit delay
            if (i < dateRanges.length - 1) {
                console.log(`  Waiting ${DELAY_BETWEEN_REQUESTS / 1000}s for rate limit...`);
                await sleep(DELAY_BETWEEN_REQUESTS);
            }
        }

        console.log(`${reportType}: Fetched ${typeFetched}, Skipped ${typeSkipped} (already had data)`);
        totalSkipped += typeSkipped;
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total periods fetched: ${totalFetched}`);
    console.log(`Total periods skipped: ${totalSkipped}`);
    console.log(`Total errors: ${totalErrors}`);
    console.log(`Completed at: ${new Date().toISOString()}`);
}

// Run the script
fetchHistoricalData()
    .then(() => {
        console.log('Done!');
        process.exit(0);
    })
    .catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
