/**
 * Diagnostic script - fetch just last 4 weeks to verify reports work
 * Run: heroku run node fetch-recent-reports.js
 */

const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const REPORT_TYPES = [
    'GET_VENDOR_SALES_REPORT',
    'GET_VENDOR_TRAFFIC_REPORT',
    'GET_VENDOR_NET_PURE_PRODUCT_MARGIN_REPORT',
    'GET_VENDOR_INVENTORY_REPORT'
];

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

async function testReport(accessToken, reportType, startDate, endDate) {
    const marketplaceId = 'A2EUQ1WTGCTBG2'; // Canada

    const reportSpec = {
        reportType: reportType,
        marketplaceIds: [marketplaceId],
        dataStartTime: startDate.toISOString(),
        dataEndTime: endDate.toISOString(),
        reportOptions: { reportPeriod: 'WEEK' }
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
        return { status: 'CREATE_FAILED', error: createData };
    }

    const reportId = createData.reportId;
    console.log(`    Report ID: ${reportId}`);

    // Poll for completion (max 2 minutes)
    for (let i = 0; i < 24; i++) {
        await sleep(5000);

        const statusRes = await fetch(
            `https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/reports/${reportId}`,
            { headers: { 'x-amz-access-token': accessToken } }
        );

        const statusData = await statusRes.json();

        if (statusData.processingStatus === 'DONE') {
            return { status: 'SUCCESS', documentId: statusData.reportDocumentId };
        } else if (statusData.processingStatus === 'FATAL' || statusData.processingStatus === 'CANCELLED') {
            return { status: statusData.processingStatus };
        }

        if (i % 4 === 0) {
            console.log(`    Status: ${statusData.processingStatus}...`);
        }
    }

    return { status: 'TIMEOUT' };
}

async function main() {
    console.log('='.repeat(60));
    console.log('REPORT DIAGNOSTIC - Testing Recent Weeks');
    console.log('='.repeat(60));
    console.log('');

    // Test last 4 weeks
    const now = new Date();
    const weeks = [];

    for (let i = 1; i <= 4; i++) {
        const end = new Date(now);
        end.setDate(end.getDate() - (i * 7));
        // Align to Saturday
        end.setDate(end.getDate() - end.getDay() - 1);
        end.setHours(23, 59, 59, 0);

        const start = new Date(end);
        start.setDate(start.getDate() - 6);
        start.setHours(0, 0, 0, 0);

        weeks.push({ start, end, label: `Week ${i} (${start.toDateString()} - ${end.toDateString()})` });
    }

    const accessToken = await getAccessToken();
    const results = {};

    for (const reportType of REPORT_TYPES) {
        console.log(`\n${reportType}`);
        console.log('-'.repeat(50));
        results[reportType] = [];

        for (const week of weeks) {
            console.log(`  ${week.label}`);

            try {
                const result = await testReport(accessToken, reportType, week.start, week.end);
                results[reportType].push({ week: week.label, ...result });
                console.log(`    Result: ${result.status}`);
            } catch (err) {
                results[reportType].push({ week: week.label, status: 'ERROR', error: err.message });
                console.log(`    Result: ERROR - ${err.message}`);
            }

            await sleep(30000); // 30 second delay between requests
        }
    }

    console.log('\n');
    console.log('='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));

    for (const [reportType, weekResults] of Object.entries(results)) {
        const successful = weekResults.filter(r => r.status === 'SUCCESS').length;
        const fatal = weekResults.filter(r => r.status === 'FATAL').length;
        console.log(`${reportType}: ${successful} SUCCESS, ${fatal} FATAL, ${4 - successful - fatal} OTHER`);
    }

    // Check existing data in DB
    console.log('\n');
    console.log('='.repeat(60));
    console.log('EXISTING DATA IN DATABASE');
    console.log('='.repeat(60));

    const dbData = await pool.query(`
        SELECT report_type, COUNT(*) as count, MIN(report_date) as earliest, MAX(report_date) as latest
        FROM vendor_reports
        GROUP BY report_type
        ORDER BY report_type
    `);

    if (dbData.rows.length === 0) {
        console.log('No vendor reports in database yet.');
    } else {
        for (const row of dbData.rows) {
            console.log(`${row.report_type}: ${row.count} records (${row.earliest?.toISOString().split('T')[0]} to ${row.latest?.toISOString().split('T')[0]})`);
        }
    }

    await pool.end();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
