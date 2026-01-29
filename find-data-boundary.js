/**
 * Find where historical data starts for this vendor account
 * Uses binary search to efficiently find the boundary
 * Also tests MONTH aggregation which may have better historical coverage
 *
 * Run: heroku run node find-data-boundary.js
 */

const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

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

async function testReportPeriod(accessToken, reportType, startDate, endDate, period = 'WEEK') {
    const marketplaceId = 'A2EUQ1WTGCTBG2'; // Canada

    const reportSpec = {
        reportType: reportType,
        marketplaceIds: [marketplaceId],
        dataStartTime: startDate.toISOString(),
        dataEndTime: endDate.toISOString(),
        reportOptions: { reportPeriod: period }
    };

    if (reportType === 'GET_VENDOR_SALES_REPORT' || reportType === 'GET_VENDOR_INVENTORY_REPORT') {
        reportSpec.reportOptions.distributorView = 'MANUFACTURING';
        reportSpec.reportOptions.sellingProgram = 'RETAIL';
    }

    // Create report
    const createRes = await fetch('https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/reports', {
        method: 'POST',
        headers: {
            'x-amz-access-token': accessToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(reportSpec)
    });

    const createData = await createRes.json();
    if (!createRes.ok) {
        return { success: false, error: 'CREATE_FAILED', details: createData };
    }

    const reportId = createData.reportId;

    // Poll for completion (max 2 minutes)
    for (let i = 0; i < 24; i++) {
        await sleep(5000);

        const statusRes = await fetch(
            `https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/reports/${reportId}`,
            { headers: { 'x-amz-access-token': accessToken } }
        );

        const statusData = await statusRes.json();

        if (statusData.processingStatus === 'DONE') {
            return { success: true, documentId: statusData.reportDocumentId };
        } else if (statusData.processingStatus === 'FATAL' || statusData.processingStatus === 'CANCELLED') {
            return { success: false, error: statusData.processingStatus };
        }
    }

    return { success: false, error: 'TIMEOUT' };
}

async function findBoundary(accessToken, reportType, period) {
    console.log(`\nFinding data boundary for ${reportType} (${period})...`);

    const now = new Date();
    const testPoints = [];

    // Test specific points: 1 month, 3 months, 6 months, 1 year, 2 years, 3 years ago
    const monthsBack = [1, 3, 6, 12, 18, 24, 30, 36];

    for (const months of monthsBack) {
        const testDate = new Date(now);
        testDate.setMonth(testDate.getMonth() - months);

        // Create a date range for that period
        let startDate, endDate;

        if (period === 'MONTH') {
            // First day of month to last day of month
            startDate = new Date(testDate.getFullYear(), testDate.getMonth(), 1);
            endDate = new Date(testDate.getFullYear(), testDate.getMonth() + 1, 0, 23, 59, 59);
        } else {
            // Week: Sunday to Saturday
            const dayOfWeek = testDate.getDay();
            startDate = new Date(testDate);
            startDate.setDate(startDate.getDate() - dayOfWeek);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 6);
            endDate.setHours(23, 59, 59, 0);
        }

        testPoints.push({ months, startDate, endDate });
    }

    let lastSuccess = null;
    let firstFailure = null;

    for (const point of testPoints) {
        const label = `${point.months} months ago (${point.startDate.toDateString()} - ${point.endDate.toDateString()})`;
        process.stdout.write(`  Testing ${label}... `);

        const result = await testReportPeriod(accessToken, reportType, point.startDate, point.endDate, period);

        if (result.success) {
            console.log('✓ SUCCESS');
            lastSuccess = point;
        } else {
            console.log(`✗ ${result.error}`);
            if (!firstFailure) {
                firstFailure = point;
            }
            // Once we hit failures, we can stop
            if (lastSuccess) {
                break;
            }
        }

        await sleep(30000); // 30 second delay
    }

    return { lastSuccess, firstFailure };
}

async function main() {
    console.log('='.repeat(60));
    console.log('FINDING HISTORICAL DATA BOUNDARY');
    console.log('='.repeat(60));
    console.log('');
    console.log('This will test how far back data is available.');
    console.log('Testing both WEEK and MONTH aggregations.');
    console.log('');

    const accessToken = await getAccessToken();

    const results = {};

    // Test GET_VENDOR_SALES_REPORT with both periods
    const reportTypes = [
        'GET_VENDOR_SALES_REPORT',
        'GET_VENDOR_TRAFFIC_REPORT'
    ];

    for (const reportType of reportTypes) {
        console.log('\n' + '='.repeat(60));
        console.log(reportType);
        console.log('='.repeat(60));

        // Test WEEK first
        console.log('\n--- Testing WEEK aggregation ---');
        const weekResult = await findBoundary(accessToken, reportType, 'WEEK');

        // Test MONTH
        console.log('\n--- Testing MONTH aggregation ---');
        const monthResult = await findBoundary(accessToken, reportType, 'MONTH');

        results[reportType] = { week: weekResult, month: monthResult };
    }

    // Summary
    console.log('\n');
    console.log('='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));

    for (const [reportType, data] of Object.entries(results)) {
        console.log(`\n${reportType}:`);

        if (data.week.lastSuccess) {
            console.log(`  WEEK:  Data available up to ${data.week.lastSuccess.months} months back`);
        } else {
            console.log(`  WEEK:  No historical data found`);
        }

        if (data.month.lastSuccess) {
            console.log(`  MONTH: Data available up to ${data.month.lastSuccess.months} months back`);
        } else {
            console.log(`  MONTH: No historical data found`);
        }
    }

    console.log('\n');
    console.log('Based on these results, adjust your historical fetch accordingly.');

    await pool.end();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
