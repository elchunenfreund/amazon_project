const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const { Client } = require('pg');
const path = require('path');

chromium.use(stealth);

const client = new Client({
    connectionString: 'postgresql://localhost:5432/amazon_tracker'
});

async function checkAsin(page, asin) {
    const url = `https://www.amazon.ca/dp/${asin}?th=1&psc=1`;
    try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        const pageTitle = await page.title();
        const isDogImage = await page.locator('img#dog-image, img[alt="Dogs of Amazon"]').first().isVisible();

        if (pageTitle.includes("Page Not Found") || isDogImage) {
            return { asin, header: "N/A", availability: "N/A", doggy: true, status: "❌ 404" };
        }

        // Quick extraction
        const titleLoc = page.locator('span#productTitle').first();
        await titleLoc.waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
        const headerShort = (await titleLoc.innerText().catch(() => "Unknown")).trim().split(/\s+/).slice(0, 4).join(' ');

        return { asin, header: headerShort, availability: "In Stock", doggy: false, status: "✅ Success" };
    } catch (err) {
        return { asin, header: "Error", status: "⚠️ Timeout" };
    }
}

(async () => {
    try {
        await client.connect();
        console.log("--- DEBUG: DATABASE CONNECTED SUCCESSFULLY ---");
    } catch (e) {
        console.error("--- DEBUG: DATABASE CONNECTION FAILED ---", e.message);
        process.exit(1);
    }

    const userDataDir = path.join(__dirname, 'amazon_session');
    const context = await chromium.launchPersistentContext(userDataDir, { headless: true });
    const page = context.pages()[0] || await context.newPage();

    const dbRes = await client.query('SELECT asin FROM products');
    const asins = dbRes.rows.map(r => r.asin);

    // NEW LOG - IF YOU DON'T SEE THIS EXACT TEXT, YOU ARE RUNNING THE WRONG FILE
    console.log(`🚀 DATABASE-LINKED SCAN STARTING FOR ${asins.length} ITEMS...\n`);

    for (let i = 0; i < asins.length; i++) {
        const asin = asins[i];
        const data = await checkAsin(page, asin);

        // --- THE DATABASE ATTEMPT ---
        console.log(`--- DEBUG: ATTEMPTING TO SAVE ASIN ${asin} TO POSTGRES ---`);

        try {
            const dbSave = await client.query(`
                INSERT INTO daily_reports (asin, header, availability, is_doggy, check_date)
                VALUES ($1, $2, $3, $4, CURRENT_DATE)
                RETURNING id
            `, [data.asin, data.header, data.availability, data.doggy]);

            console.log(`[${i+1}/${asins.length}] ✅ SAVED TO DB | ID: ${dbSave.rows[0].id} | ASIN: ${data.asin}`);
        } catch (dbErr) {
            console.error(`❌ DATABASE INSERT FAILED: ${dbErr.message}`);
        }

        await page.waitForTimeout(3000);
    }

    await context.close();
    await client.end();
})();
