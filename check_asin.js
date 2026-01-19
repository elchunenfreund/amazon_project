const { chromium } = require('playwright-core'); // Standard light version
const { Client } = require('pg');
const fs = require('fs');

// --- REMOVED: chromium.use(stealth); <--- This was the cause of the error

const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/amazon_tracker',
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// --- SETTINGS ---
const USE_HEADLESS = true;
const COOKIE_FILE = 'amazon_cookies.json';
const POSTAL_CODE = "H2V3T9";
// ----------------

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function saveCookies(context) {
    try {
        const cookies = await context.cookies();
        fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
    } catch (e) { /* silent fail */ }
}

async function loadCookies(context) {
    try {
        if (fs.existsSync(COOKIE_FILE)) {
            const cookiesString = fs.readFileSync(COOKIE_FILE);
            const cookies = JSON.parse(cookiesString);
            await context.addCookies(cookies);
            console.log("🍪 Cookies loaded.");
            return true;
        }
    } catch (e) { console.log("⚠️ Could not load cookies."); }
    return false;
}

async function setLocation(page, postalCode) {
    const maxRetries = 2;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`📍 Connecting (Attempt ${attempt})...`);
            await page.goto('https://www.amazon.ca', { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(3000);

            if (await page.locator('form[action="/errors/validateCaptcha"]').count() > 0) {
                console.log("🚨 AMAZON CAPTCHA DETECTED!");
                if (!USE_HEADLESS) {
                    console.log("👉 Solve manual captcha now...");
                    await page.waitForSelector('#nav-global-location-popover-link', { timeout: 0 });
                } else {
                    return false;
                }
            }

            const locEl = page.locator('#nav-global-location-popover-link');
            if (await locEl.count() === 0) continue;

            const locationText = await locEl.innerText();
            if (locationText.includes(postalCode.substring(0, 3))) {
                console.log("✅ Location is correct.");
                return true;
            }

            console.log("   --> Setting new location...");
            await locEl.click();
            await page.waitForTimeout(2000);

            const zipInput = page.locator('#GLUXZipUpdateInput_0');
            if (await zipInput.isVisible()) {
                await zipInput.fill(postalCode.substring(0, 3));
                await page.locator('#GLUXZipUpdateInput_1').fill(postalCode.substring(3));
                await page.locator('#GLUXZipUpdate').click();
                await page.waitForTimeout(1000);

                const doneBtn = page.locator('button[name="glowDoneButton"]');
                if (await doneBtn.isVisible()) await doneBtn.click();

                await page.waitForTimeout(3000);
                return true;
            }
        } catch (e) { console.log(`   --> Location Error: ${e.message}`); }
    }
    return false;
}

async function scrapeAsin(page, asin) {
    try {
        const delay = Math.floor(Math.random() * (5000 - 2000 + 1) + 2000);
        await sleep(delay);

        await page.goto(`https://www.amazon.ca/dp/${asin.trim()}?th=1&psc=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });

        if (await page.locator('form[action="/errors/validateCaptcha"]').count() > 0) {
            console.log(`   --> 🤖 CAPTCHA HIT on product page!`);
            return null;
        }

        await page.waitForSelector('#ppd', { timeout: 8000 }).catch(() => {});

        return await page.evaluate(() => {
            const cartBtn = document.querySelector('#add-to-cart-button') ||
                            document.querySelector('input[name="submit.add-to-cart"]') ||
                            document.querySelector('#exports_desktop_qualifiedBuybox_addToCart_feature_div') ||
                            document.querySelector('.a-button-stack input[type="submit"]');

            const buyNowBtn = document.querySelector('#buy-now-button') ||
                              document.querySelector('input[name="submit.buy-now"]');

            const isOrderable = !!(cartBtn || buyNowBtn);

            const availContainer = document.querySelector('#availability') ||
                                   document.querySelector('#availabilityInsideBuyBox_feature_div') ||
                                   document.querySelector('#exports_desktop_qualifiedBuybox_availabilityInsideBuyBox');

            const availText = availContainer ? availContainer.innerText.trim() : "";
            const availLower = availText.toLowerCase();

            let availability = "Unavailable";
            let stockLevel = "Normal";

            if (isOrderable) {
                availability = "In Stock";
                if (availLower.includes("usually ships") ||
                    availLower.includes("ships from") ||
                    availLower.includes("weeks") ||
                    availLower.includes("months") ||
                    availLower.includes("not yet released") ||
                    availLower.includes("temporarily out of stock")) {

                    if(!availLower.includes("ships from amazon")) {
                        availability = "Back Order";
                    }
                }
            }

            if (!availText.startsWith("In Stock")) {
                const lowStockMatch = availText.match(/Only\s+(\d+)\s+left/i);
                if (lowStockMatch) {
                    stockLevel = `Low Stock: ${lowStockMatch[1]}`;
                    availability = "In Stock";
                }
            } else {
                stockLevel = "Normal";
            }

            let seller = "N/A";
            if (isOrderable) {
                const merchantDiv = document.querySelector('#merchantInfoFeature_feature_div');
                const buyBoxDiv = document.querySelector('#buybox');
                const sellerText = (merchantDiv ? merchantDiv.innerText : "") + (buyBoxDiv ? buyBoxDiv.innerText : "");

                if (sellerText.toLowerCase().includes("amazon")) seller = "Amazon";
                else seller = "3rd Party";
            }

            const price = document.querySelector('.a-price .a-offscreen')?.innerText ||
                          document.querySelector('#price_inside_buybox')?.innerText || "N/A";

            let rank = "N/A";
            const rankMatch = document.body.innerText.match(/#([0-9,]+) in [a-zA-Z &]+/);
            if(rankMatch) rank = rankMatch[0];

            return {
                header: document.querySelector('#productTitle')?.innerText.trim() || document.title,
                price,
                seller,
                availability,
                stock_level: stockLevel,
                ranking: rank
            };
        });
    } catch (e) {
        console.log(`   --> Error: ${e.message}`);
        return null;
    }
}

(async () => {
    let browserInstance; // Renamed to avoid confusion
    try {
        console.log(`🚀 Launching (Headless: ${USE_HEADLESS})...`);
        await client.connect();

        // Launch using playwright-core with native stealth args
        browserInstance = await chromium.launch({
            headless: true,
            // Add this specific line to point to the Heroku Buildpack browser:
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/google-chrome',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--window-size=1920,1080'
            ]
        });

        const context = await browserInstance.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });

        await loadCookies(context);

        const page = await context.newPage();
        await page.setViewportSize({ width: 1920, height: 1080 });

        const locSuccess = await setLocation(page, POSTAL_CODE);

        if (locSuccess) {
            await saveCookies(context);
            const { rows } = await client.query('SELECT asin FROM products');
            console.log(`📋 Processing ${rows.length} ASINs...`);

            for (let row of rows) {
                const asin = row.asin.trim();
                console.log(`🔍 Checking ${asin}...`);
                const data = await scrapeAsin(page, asin);

                if (data) {
                    console.log(`   --> ${data.availability} | ${data.stock_level} | ${data.seller}`);
                    await client.query(`
                        INSERT INTO daily_reports (asin, header, availability, stock_level, seller, price, ranking, check_date)
                        VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP)`,
                        [asin, data.header, data.availability, data.stock_level, data.seller, data.price, data.ranking]);
                } else {
                    console.log(`   --> ⚠️ Skipped`);
                }

                if(Math.random() > 0.8) await saveCookies(context);
            }
        }
    } catch (e) { console.error("Fatal:", e); }
    finally {
        if (browserInstance) await browserInstance.close();
        await client.end();
        console.log("🏁 Done.");
        process.exit(0);
    }
})();
