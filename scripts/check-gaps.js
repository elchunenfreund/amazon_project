const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkDataGaps() {
    try {
        // Get date range of data by report type
        const coverageResult = await pool.query(`
            SELECT
                report_type,
                MIN(report_date)::date as min_date,
                MAX(report_date)::date as max_date,
                COUNT(DISTINCT report_date::date) as unique_dates,
                COUNT(*) as total_records
            FROM vendor_reports
            GROUP BY report_type
            ORDER BY report_type
        `);

        console.log('=== Data Coverage by Report Type ===\n');

        for (const row of coverageResult.rows) {
            const start = new Date(row.min_date);
            const end = new Date(row.max_date);
            const daysCovered = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
            const gapPct = ((1 - row.unique_dates / daysCovered) * 100).toFixed(1);

            console.log(`${row.report_type}:`);
            console.log(`  Date Range: ${row.min_date} to ${row.max_date}`);
            console.log(`  Days in range: ${daysCovered}`);
            console.log(`  Unique dates with data: ${row.unique_dates}`);
            console.log(`  Total records: ${row.total_records}`);
            console.log(`  Gap percentage: ${gapPct}%\n`);
        }

        // Check gaps for GET_VENDOR_SALES_REPORT specifically (most important)
        console.log('=== Gap Analysis for GET_VENDOR_SALES_REPORT ===\n');

        const gapsResult = await pool.query(`
            WITH date_range AS (
                SELECT MIN(report_date)::date as start_date, MAX(report_date)::date as end_date
                FROM vendor_reports
                WHERE report_type = 'GET_VENDOR_SALES_REPORT'
            ),
            date_series AS (
                SELECT generate_series(
                    (SELECT start_date FROM date_range),
                    (SELECT end_date FROM date_range),
                    '1 day'::interval
                )::date as expected_date
            ),
            actual_dates AS (
                SELECT DISTINCT report_date::date as actual_date
                FROM vendor_reports
                WHERE report_type = 'GET_VENDOR_SALES_REPORT'
            ),
            gaps AS (
                SELECT expected_date
                FROM date_series
                WHERE expected_date NOT IN (SELECT actual_date FROM actual_dates)
                ORDER BY expected_date
            )
            SELECT
                expected_date,
                expected_date - LAG(expected_date, 1, expected_date) OVER (ORDER BY expected_date) as days_since_last_gap
            FROM gaps
            ORDER BY expected_date
        `);

        if (gapsResult.rows.length === 0) {
            console.log('No gaps found! Data is complete.');
        } else {
            console.log(`Found ${gapsResult.rows.length} missing dates.\n`);

            // Group consecutive gaps
            let gapRanges = [];
            let currentStart = null;
            let currentEnd = null;

            for (const row of gapsResult.rows) {
                const date = row.expected_date;
                if (!currentStart) {
                    currentStart = date;
                    currentEnd = date;
                } else if (row.days_since_last_gap <= 1) {
                    currentEnd = date;
                } else {
                    gapRanges.push({ start: currentStart, end: currentEnd });
                    currentStart = date;
                    currentEnd = date;
                }
            }
            if (currentStart) {
                gapRanges.push({ start: currentStart, end: currentEnd });
            }

            console.log(`Gap ranges (${gapRanges.length} gaps):`);
            gapRanges.slice(0, 20).forEach((range, i) => {
                const start = new Date(range.start).toISOString().split('T')[0];
                const end = new Date(range.end).toISOString().split('T')[0];
                const days = Math.ceil((new Date(range.end) - new Date(range.start)) / (1000*60*60*24)) + 1;
                console.log(`  ${i+1}. ${start} to ${end} (${days} day${days > 1 ? 's' : ''})`);
            });

            if (gapRanges.length > 20) {
                console.log(`  ... and ${gapRanges.length - 20} more gap ranges`);
            }
        }

        // Check data for the last 3 years
        console.log('\n=== 3-Year Coverage Check ===\n');

        const threeYearsAgo = new Date();
        threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
        const threeYearsStr = threeYearsAgo.toISOString().split('T')[0];

        const recentResult = await pool.query(`
            SELECT
                COUNT(DISTINCT report_date::date) as days_with_data,
                MIN(report_date)::date as earliest,
                MAX(report_date)::date as latest
            FROM vendor_reports
            WHERE report_type = 'GET_VENDOR_SALES_REPORT'
              AND report_date >= $1
        `, [threeYearsStr]);

        const recentRow = recentResult.rows[0];
        const expectedDays = Math.ceil((new Date() - threeYearsAgo) / (1000*60*60*24));

        console.log(`Looking back from: ${threeYearsStr}`);
        console.log(`Expected days: ~${expectedDays}`);
        console.log(`Days with data: ${recentRow.days_with_data}`);
        console.log(`Earliest data: ${recentRow.earliest}`);
        console.log(`Latest data: ${recentRow.latest}`);
        console.log(`Coverage: ${((recentRow.days_with_data / expectedDays) * 100).toFixed(1)}%`);

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await pool.end();
    }
}

checkDataGaps();
