// Sync catalog data for vendor report ASINs
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function getValidAccessToken() {
    // Get the stored token - same logic as server.js
    const result = await pool.query(`
        SELECT access_token, refresh_token, expires_at
        FROM oauth_tokens
        ORDER BY id DESC LIMIT 1
    `);

    if (!result.rows[0]) {
        throw new Error('No OAuth tokens found');
    }

    const { access_token, refresh_token, expires_at } = result.rows[0];

    // Check if token needs refresh (expires in next 5 minutes)
    const expiresAt = new Date(expires_at);
    const now = new Date();
    const fiveMinutes = 5 * 60 * 1000;

    if (expiresAt.getTime() - now.getTime() < fiveMinutes) {
        console.log('Token expired, refreshing...');
        // Refresh the token
        const clientId = process.env.LWA_CLIENT_ID;
        const clientSecret = process.env.LWA_CLIENT_SECRET;

        const response = await fetch('https://api.amazon.com/auth/o2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refresh_token,
                client_id: clientId,
                client_secret: clientSecret
            })
        });

        if (!response.ok) {
            throw new Error('Failed to refresh token');
        }

        const data = await response.json();
        const newExpiresAt = new Date(Date.now() + (data.expires_in * 1000));

        await pool.query(`
            UPDATE oauth_tokens
            SET access_token = $1, expires_at = $2
            WHERE refresh_token = $3
        `, [data.access_token, newExpiresAt, refresh_token]);

        console.log('Token refreshed');
        return data.access_token;
    }

    return access_token;
}

async function syncCatalog(limit = 100) {
    try {
        const accessToken = await getValidAccessToken();
        console.log('Got access token');

        // Get ASINs needing catalog data
        const result = await pool.query(`
            SELECT DISTINCT v.asin
            FROM vendor_reports v
            LEFT JOIN catalog_details c ON v.asin = c.asin
            WHERE c.asin IS NULL
            ORDER BY v.asin
            LIMIT $1
        `, [limit]);

        const asins = result.rows.map(r => r.asin);
        console.log(`Found ${asins.length} ASINs needing catalog data`);

        if (asins.length === 0) {
            console.log('All ASINs have catalog data!');
            return;
        }

        let success = 0, failed = 0;

        for (let i = 0; i < asins.length; i++) {
            const asin = asins[i];
            try {
                const url = `https://sellingpartnerapi-na.amazon.com/catalog/2022-04-01/items/${asin}?marketplaceIds=A2EUQ1WTGCTBG2&includedData=summaries,attributes,dimensions,identifiers,images,productTypes,salesRanks`;

                const response = await fetch(url, {
                    headers: {
                        'x-amz-access-token': accessToken,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    const summary = data.summaries?.[0] || {};

                    await pool.query(`
                        INSERT INTO catalog_details (asin, title, brand, product_type, images, attributes, dimensions, identifiers, sales_ranks, last_updated)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
                        ON CONFLICT (asin) DO UPDATE SET
                            title = EXCLUDED.title,
                            brand = EXCLUDED.brand,
                            product_type = EXCLUDED.product_type,
                            images = EXCLUDED.images,
                            attributes = EXCLUDED.attributes,
                            dimensions = EXCLUDED.dimensions,
                            identifiers = EXCLUDED.identifiers,
                            sales_ranks = EXCLUDED.sales_ranks,
                            last_updated = CURRENT_TIMESTAMP
                    `, [
                        asin,
                        summary.itemName,
                        summary.brand,
                        data.productTypes?.[0]?.productType,
                        JSON.stringify(data.images),
                        JSON.stringify(data.attributes),
                        JSON.stringify(data.dimensions),
                        JSON.stringify(data.identifiers),
                        JSON.stringify(data.salesRanks)
                    ]);

                    success++;
                    console.log(`[${i + 1}/${asins.length}] Fetched: ${asin} - ${summary.itemName?.substring(0, 50) || 'No title'}`);
                } else {
                    const errorData = await response.json().catch(() => ({}));
                    failed++;
                    console.log(`[${i + 1}/${asins.length}] Failed: ${asin} - ${response.status} ${errorData.errors?.[0]?.message || ''}`);
                }

                // Rate limit: 500ms between requests (2 per second)
                if (i < asins.length - 1) {
                    await new Promise(r => setTimeout(r, 500));
                }
            } catch (err) {
                failed++;
                console.log(`[${i + 1}/${asins.length}] Error: ${asin} - ${err.message}`);
            }
        }

        // Get remaining count
        const countResult = await pool.query(`
            SELECT COUNT(DISTINCT v.asin) as remaining
            FROM vendor_reports v
            LEFT JOIN catalog_details c ON v.asin = c.asin
            WHERE c.asin IS NULL
        `);

        console.log(`\nDone! Success: ${success}, Failed: ${failed}, Remaining: ${countResult.rows[0].remaining}`);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

// Run with limit from command line argument or default to 100
const limit = parseInt(process.argv[2]) || 100;
syncCatalog(limit);
