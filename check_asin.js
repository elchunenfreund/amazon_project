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
        // 1. Navigate with a longer timeout
        await page.goto(url, { waitUntil: 'load', timeout: 60000 });

        // 2. WAIT: Give the page 5 seconds to settle and run its scripts
        await page.waitForTimeout(5000);

        // 3. TITLE EXTRACTION (Retry Logic)
        let header = "Unknown";
        const titleSelectors = ['span#productTitle', 'h1#title', '#title'];

        for (const selector of titleSelectors) {
            const loc = page.locator(selector).first();
            if (await loc.isVisible()) {
                header = (await loc.innerText()).trim();
                break;
            }
        }

        // 4. AVAILABILITY & PRICE
        // We look for the "Buybox" which contains both price and stock status
        const buyBox = page.locator('#buybox, #ppd, #rightCol').first();
        const buyBoxText = await buyBox.innerText().catch(() => "");

        const isUnavailable = buyBoxText.toLowerCase().includes("currently unavailable") || buyBoxText === "";
        let stockStatus = isUnavailable ? "Unavailable" : "In Stock";

        let seller = "N/A", price = "N/A", ranking = "N/A";

        if (!isUnavailable) {
            // Price - Try multiple common Amazon price IDs
            const priceSelectors = ['.a-price .a-offscreen', '#price_inside_buybox', '.a-color-price'];
            for (const sel of priceSelectors) {
                const pEl = page.locator(sel).first();
                if (await pEl.isVisible()) {
                    price = (await pEl.textContent()).trim();
                    break;
                }
            }

            // Seller
            seller = buyBoxText.toLowerCase().includes("amazon") ? "Yes (Amazon)" : "No (3rd Party)";

            // Ranking (Scrolling down slightly)
            await page.mouse.wheel(0, 1500);
            await page.waitForTimeout(1000);
            const bodyText = await page.innerText('body').catch(() => "");
            const rankMatch = bodyText.match(/#([0-9,]+)\s+in\s+([A-Za-z\s&,>]+)/);
            ranking = rankMatch ? rankMatch[0].split('(')[0].trim() : "N/A";
        }

        return { asin, header, availability: stockStatus, doggy: false, seller, price, ranking };
    } catch (err) {
        return { asin, header: "Timeout", availability: "Error", doggy: false, seller: "N/A", price: "N/A", ranking: "N/A" };
    }
}

(async () => {
    await client.connect();
    const userDataDir = path.join(__dirname, 'amazon_session');

    // --- STEALTH UPGRADE ---
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: true,
        // This makes your headless browser look like a standard Windows Chrome browser
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 }
    });

    const page = context.pages()[0] || await context.newPage();

    const dbRes = await client.query('SELECT asin FROM products');
    const asins = dbRes.rows.map(r => r.asin);

    console.log(`🚀 STARTING PROTECTED SCRAPE FOR ${asins.length} ITEMS...\n`);

    for (let i = 0; i < asins.length; i++) {
        const asin = asins[i];
        const data = await checkAsin(page, asin);

        // Standard Insert
        try {
            const prevRes = await client.query('SELECT price FROM daily_reports WHERE asin = $1 ORDER BY id DESC LIMIT 1', [asin]);
            let hasChanged = (prevRes.rows.length > 0 && prevRes.rows[0].price !== data.price);

            await client.query(`
                INSERT INTO daily_reports (asin, header, availability, is_doggy, seller, price, ranking, is_changed, check_date)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_DATE)
            `, [data.asin, data.header, data.availability, data.doggy, data.seller, data.price, data.ranking, hasChanged]);

            console.log(`[${i+1}] ${asin} | ${data.availability} | ${data.price} | ${data.header.substring(0, 25)}...`);
        } catch (dbErr) {
            console.error(`❌ DB Error: ${dbErr.message}`);
        }

        // --- THE RESET ---
        // Every 5 items, we wait longer to let the Amazon "Anti-Spam" cooling period pass
        const delay = (i > 0 && i % 5 === 0) ? 15000 : (8000 + Math.random() * 4000);
        await page.waitForTimeout(delay);
    }

    await context.close();
    await client.end();
})();
