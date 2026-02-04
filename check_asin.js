const { chromium } = require('playwright-core'); // Standard light version
const { Client } = require('pg');
const fs = require('fs');
const { getDatabaseConfig } = require('./lib/db-config');

// --- REMOVED: chromium.use(stealth); <--- This was the cause of the error

const client = new Client(getDatabaseConfig());

// --- SETTINGS ---
const USE_HEADLESS = true;
const COOKIE_FILE = 'amazon_cookies.json';
const POSTAL_CODE = "H2V3T9";
// Amazon domain configuration - allows switching between amazon.ca, amazon.com, etc.
const AMAZON_DOMAIN = process.env.AMAZON_DOMAIN || 'amazon.ca';
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
            await page.goto(`https://www.${AMAZON_DOMAIN}`, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(3000);

            if (await page.locator('form[action="/errors/validateCaptcha"]').count() > 0) {
                console.log("🚨 AMAZON CAPTCHA DETECTED!");
                if (!USE_HEADLESS) {
                    console.log("👉 Solve manual captcha now...");
                    await page.waitForSelector('#nav-global-location-popover-link', { timeout: 5 * 60 * 1000 });
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

        const response = await Promise.race([
            page.goto(`https://www.${AMAZON_DOMAIN}/dp/${asin.trim()}?th=1&psc=1`, { waitUntil: 'domcontentloaded', timeout: 45000 }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Navigation timeout")), 45000))
        ]);

        // Check for 404 or invalid page status
        if (response && response.status() === 404) {
            console.log(`   --> 🐕 404 - Page Not Found`);
            return {
                header: 'Page Not Found',
                price: 'N/A',
                seller: 'N/A',
                availability: 'Doggy',
                stock_level: 'Invalid Page',
                ranking: 'N/A'
            };
        }

        if (await page.locator('form[action="/errors/validateCaptcha"]').count() > 0) {
            console.log(`   --> 🤖 CAPTCHA HIT on product page!`);
            return null;
        }

        // Check for Amazon error pages (404, page not found, etc.)
        const pageContent = await page.content();
        const pageText = await page.evaluate(() => document.body.innerText);

        // Check for common Amazon error indicators
        if (pageText.includes("We're sorry") &&
            (pageText.includes("We couldn't find that page") ||
             pageText.includes("Page Not Found") ||
             pageText.includes("Sorry, we just need to make sure you're not a robot"))) {
            console.log(`   --> 🐕 Invalid Page Detected`);
            return {
                header: 'Invalid Page',
                price: 'N/A',
                seller: 'N/A',
                availability: 'Doggy',
                stock_level: 'Invalid Page',
                ranking: 'N/A'
            };
        }

        await Promise.race([
            page.waitForSelector('#ppd', { timeout: 8000 }),
            new Promise((resolve) => setTimeout(() => resolve(), 8000))
        ]).catch(() => {});

        // Check if product page elements exist, if not, might be invalid
        // Wrap evaluate in timeout to prevent hanging
        const hasProductPage = await Promise.race([
            page.evaluate(() => {
                return !!document.querySelector('#productTitle') ||
                       !!document.querySelector('#ppd') ||
                       !!document.querySelector('#dp-container');
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Evaluate timeout")), 10000))
        ]).catch(() => false);

        if (!hasProductPage) {
            // Check if it's an error page
            const isErrorPage = await page.evaluate(() => {
                const bodyText = document.body.innerText.toLowerCase();
                return bodyText.includes("we're sorry") ||
                       bodyText.includes("page not found") ||
                       bodyText.includes("we couldn't find");
            });

            if (isErrorPage) {
                console.log(`   --> 🐕 Invalid Page - No Product Found`);
                return {
                    header: 'Invalid Page',
                    price: 'N/A',
                    seller: 'N/A',
                    availability: 'Doggy',
                    stock_level: 'Invalid Page',
                    ranking: 'N/A'
                };
            }
        }

        // Wrap main evaluate in aggressive timeout to prevent infinite hangs
        const result = await Promise.race([
            page.evaluate(() => {
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

            // Determine seller early (needed for back-order logic)
            let seller = "N/A";
            if (isOrderable) {
                const merchantDiv = document.querySelector('#merchantInfoFeature_feature_div');
                const buyBoxDiv = document.querySelector('#buybox');
                const sellerText = (merchantDiv ? merchantDiv.innerText : "") + (buyBoxDiv ? buyBoxDiv.innerText : "");

                if (sellerText.toLowerCase().includes("amazon")) seller = "Amazon";
                else seller = "3rd Party";
            }

            // Check for unavailable indicators FIRST
            // These take priority over back-order indicators
            const unavailableIndicators = [
                "currently unavailable",
                "unavailable",
                "we don't know when or if this item will be back in stock",
                "this item is not available",
                "temporarily unavailable",
                "not available"
            ];

            // Check for "out of stock" but exclude "temporarily out of stock" (which is back-order if orderable)
            const isOutOfStock = availLower.includes("out of stock") && !availLower.includes("temporarily out of stock");
            const isUnavailable = unavailableIndicators.some(indicator => availLower.includes(indicator)) || isOutOfStock;

            if (isUnavailable) {
                // Truly unavailable items cannot be ordered
                availability = "Unavailable";
            } else if (isOrderable) {
                // Item is orderable - check for back-order indicators
                availability = "In Stock";

                // Check for strong back-order indicators (only if orderable)
                const hasStrongBackOrderIndicator = availLower.includes("not yet released") ||
                                                    availLower.includes("temporarily out of stock");

                if (hasStrongBackOrderIndicator) {
                    // Strong back-order indicators mean back-order (regardless of seller)
                    availability = "Back Order";
                } else {
                    // Additional back-order detection for shipping delays
                    const hasShippingDelay = availLower.includes("usually ships") ||
                                            availLower.includes("ships from") ||
                                            availLower.includes("weeks") ||
                                            availLower.includes("months");

                    if (hasShippingDelay && seller === "3rd Party") {
                        // Third-party sellers with shipping delays = back-order
                        availability = "Back Order";
                    } else if (hasShippingDelay && seller === "Amazon") {
                        // Amazon with "Usually ships within X" is just a shipping estimate, NOT back-order
                        // Keep as "In Stock"
                    }
                }
            }

            if (!availText.startsWith("In Stock") && availability !== "Unavailable") {
                const lowStockMatch = availText.match(/Only\s+(\d+)\s+left/i);
                if (lowStockMatch) {
                    stockLevel = `Low Stock: ${lowStockMatch[1]}`;
                    availability = "In Stock";
                }
            } else if (availability === "In Stock") {
                stockLevel = "Normal";
            }

            // Seller already determined above for back-order logic

            // Price extraction: prioritize buy box price, set N/A for unavailable items
            let price = "N/A";
            if (availability !== "Unavailable") {
                // First, try to get price from buy box-specific containers
                const buyBoxPrice = document.querySelector('#price_inside_buybox')?.innerText?.trim() ||
                                    document.querySelector('#buybox .a-price .a-offscreen')?.innerText?.trim() ||
                                    document.querySelector('#exports_desktop_qualifiedBuybox_price_feature_div .a-price .a-offscreen')?.innerText?.trim() ||
                                    document.querySelector('#qualifiedBuybox .a-price .a-offscreen')?.innerText?.trim() ||
                                    document.querySelector('#exports_desktop_qualifiedBuybox_price_feature_div .a-price-whole')?.innerText?.trim();

                if (buyBoxPrice) {
                    price = buyBoxPrice;
                } else if (isOrderable) {
                    // Fallback to general price selectors only if item is orderable
                    const generalPrice = document.querySelector('.a-price .a-offscreen')?.innerText?.trim();
                    price = generalPrice || "N/A";
                }
            }

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
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Main evaluate timeout")), 20000))
        ]);

        return result;
    } catch (e) {
        console.log(`   --> Error: ${e.message}`);
        return null;
    }
}

(async () => {
    let browserInstance = null;
    let context = null;
    let page = null;

    // Helper to start/restart browser
    const launchBrowser = async () => {
        // Properly close and cleanup old browser instance
        if (page) {
            try {
                await page.close().catch(() => {});
            } catch (e) {
                // Ignore errors if page is already closed
            }
            page = null;
        }
        if (context) {
            try {
                await context.close().catch(() => {});
            } catch (e) {
                // Ignore errors if context is already closed
            }
            context = null;
        }
        if (browserInstance) {
            console.log("♻️  Closing old browser to free memory...");
            try {
                await browserInstance.close();
            } catch (e) {
                console.error("Error closing browser:", e.message);
            }
            browserInstance = null;
        }

        // Small delay to allow cleanup to complete
        await sleep(1000);

        console.log("🚀 Launching Fresh Browser...");

        // Try multiple environment variables and paths for Chrome
        // The new chrome-for-testing buildpack may set different variables
        const possiblePaths = [
            process.env.CHROME_BIN,
            process.env.CHROMIUM_PATH,
            process.env.GOOGLE_CHROME_BIN,
            process.env.CHROME_FOR_TESTING_BIN,
            '/app/.chrome-for-testing/chrome-linux64/chrome',
            '/app/.chrome-for-testing/chrome-linux64/chrome-headless-shell',
            '/usr/bin/google-chrome',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser'
        ].filter(Boolean); // Remove undefined/null values

        // Find the first path that exists (if we can check) or use the first available env var
        let chromePath = possiblePaths.find(path => {
            try {
                return fs.existsSync(path);
            } catch {
                return false;
            }
        }) || possiblePaths[0];

        const launchOptions = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--disable-extensions',
                '--disable-plugins',
                '--disable-images', // Don't load images to save memory
                '--disable-javascript-harmony-shipping',
                '--disable-background-networking',
                '--disable-background-timer-throttling',
                '--disable-renderer-backgrounding',
                '--disable-backgrounding-occluded-windows',
                '--disable-software-rasterizer',
                '--disable-features=TranslateUI',
                '--disable-ipc-flooding-protection'
            ]
        };

        // Set executablePath if we found a valid path
        if (chromePath) {
            launchOptions.executablePath = chromePath;
            console.log(`   --> Using Chrome at: ${chromePath}`);
        } else {
            // If no path found, try to let Playwright find Chrome automatically
            // This works if Chrome is in PATH or Playwright has a bundled version
            console.log(`   --> No explicit Chrome path found, attempting auto-detection`);
        }

        try {
            browserInstance = await chromium.launch(launchOptions);
        } catch (error) {
            // If launch fails with explicit path, try without it (let Playwright find it)
            if (launchOptions.executablePath && error.message.includes("executable doesn't exist")) {
                console.log(`   --> Chrome not found at ${launchOptions.executablePath}, trying auto-detection...`);
                delete launchOptions.executablePath;
                browserInstance = await chromium.launch(launchOptions);
            } else {
                throw error;
            }
        }
        context = await browserInstance.newContext({
             userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
             viewport: { width: 1920, height: 1080 }
        });
        await loadCookies(context);
        page = await context.newPage();
        await page.setViewportSize({ width: 1920, height: 1080 });
        await setLocation(page, POSTAL_CODE);
    };

    try {
        console.log('🚀 Starting scraper...');

        await client.connect();

        await launchBrowser(); // Initial launch

        // Get list of valid ASINs from products table first
        const validAsinsResult = await client.query('SELECT asin FROM products');
        const validAsins = new Set(validAsinsResult.rows.map(row => row.asin));

        // Check if ASINs were passed as command line arguments or environment variable
        let asinsToProcess = [];
        if (process.argv.length > 2) {
            // ASINs passed as command line arguments
            asinsToProcess = process.argv.slice(2);
        } else if (process.env.SELECTED_ASINS) {
            // ASINs passed as environment variable (comma-separated)
            asinsToProcess = process.env.SELECTED_ASINS.split(',').map(a => a.trim());
        }

        let rows;
        if (asinsToProcess.length > 0) {
            // Filter out ASINs that don't exist in products table
            const validSelectedAsins = asinsToProcess.filter(asin => {
                const trimmed = asin.trim();
                if (!validAsins.has(trimmed)) {
                    console.log(`   ⚠️ Skipping ${trimmed} - ASIN not found in products table`);
                    return false;
                }
                return true;
            });

            if (validSelectedAsins.length === 0) {
                console.log('❌ No valid ASINs to process');
                return;
            }

            console.log(`📋 Processing ${validSelectedAsins.length} selected ASINs...`);
            rows = validSelectedAsins.map(asin => ({ asin: asin.trim() }));
        } else {
            // Process all ASINs (default behavior)
            rows = validAsinsResult.rows;
            console.log(`📋 Processing ${rows.length} ASINs...`);
        }

        let consecutiveFailures = 0;
        const MAX_CONSECUTIVE_FAILURES = 3;
        let lastProgressTime = Date.now();
        const MAX_STALL_TIME = 120000; // 2 minutes without progress = force restart

        console.log(`📋 Starting to process ${rows.length} ASINs...`);

        for (let [index, row] of rows.entries()) {
            // Watchdog: If we've been stuck for too long, force browser restart
            const timeSinceLastProgress = Date.now() - lastProgressTime;
            if (timeSinceLastProgress > MAX_STALL_TIME) {
                console.log(`   --> ⚠️ Watchdog: No progress for ${Math.round(timeSinceLastProgress/1000)}s, forcing browser restart...`);
                try {
                    await launchBrowser();
                    consecutiveFailures = 0;
                    lastProgressTime = Date.now();
                } catch (err) {
                    console.error("⚠️ Watchdog restart failed:", err);
                }
            }
            // --- FULL RESTART EVERY 25 ITEMS (reduced from 50 to prevent memory issues) ---
            if (index > 0 && index % 25 === 0) {
                try {
                    console.log(`   --> 🔄 Restarting browser at item ${index + 1} to free memory...`);
                    await launchBrowser();
                    consecutiveFailures = 0; // Reset failure counter on successful restart
                    lastProgressTime = Date.now(); // Update progress time
                } catch (err) {
                    console.error("⚠️ Browser restart failed, trying to continue:", err);
                }
            }
            // -----------------------------------

            // Force browser restart if too many consecutive failures
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                console.log(`   --> 🔄 Too many consecutive failures (${consecutiveFailures}), restarting browser...`);
                try {
                    await launchBrowser();
                    consecutiveFailures = 0;
                } catch (err) {
                    console.error("⚠️ Browser restart failed:", err);
                }
            }

            const asin = row.asin.trim();
            console.log(`[${index + 1}/${rows.length}] 🔍 Checking ${asin}...`);

            // Add a timeout race so one bad page doesn't freeze the script forever
            // Reduced timeout to 50 seconds with aggressive recovery
            const startTime = Date.now();

            try {
                // Create timeout promise first
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => {
                        reject(new Error("Overall timeout"));
                    }, 50000);
                });

                const data = await Promise.race([
                    scrapeAsin(page, asin),
                    timeoutPromise
                ]);


                if (data) {
                    console.log(`   --> ${data.availability} | ${data.stock_level} | ${data.seller}`);
                    await client.query(`
                        INSERT INTO daily_reports (asin, header, availability, stock_level, seller, price, ranking, check_date)
                        VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP)`,
                        [asin, data.header, data.availability, data.stock_level, data.seller, data.price, data.ranking]);
                    consecutiveFailures = 0; // Reset on success
                    lastProgressTime = Date.now(); // Update progress time
                } else {
                    console.log(`   --> ⚠️ Skipped (No Data)`);
                    consecutiveFailures++; // Count as failure
                    lastProgressTime = Date.now(); // Still counts as progress
                }
            } catch (innerError) {
                const elapsed = Date.now() - startTime;
                console.error(`   --> ❌ Failed ${asin}: ${innerError.message} (took ${elapsed}ms)`);
                consecutiveFailures++;
                lastProgressTime = Date.now(); // Error still counts as progress (we're not stuck)

                // Enhanced recovery: try to recover from timeouts and hangs
                if (innerError.message === "Timeout" || innerError.message === "Overall timeout" || innerError.message.includes("timeout")) {
                    console.log("   --> 🔄 Timeout detected, attempting recovery...");
                    try {
                        // Properly close old page before creating new one
                        if (page) {
                            try {
                                await page.close();
                            } catch (e) {
                                // Ignore errors if page is already closed
                            }
                        }
                        // Small delay to allow cleanup
                        await sleep(500);
                        page = await context.newPage();
                        await page.setViewportSize({ width: 1920, height: 1080 });
                        console.log("   --> ✅ Page recreated, continuing...");
                    } catch (recoveryError) {
                        console.error("   --> ⚠️ Recovery failed:", recoveryError.message);
                        // Force browser restart if page recovery fails
                        try {
                            await launchBrowser();
                            consecutiveFailures = 0; // Reset on successful restart
                            lastProgressTime = Date.now(); // Update progress time
                        } catch (err) {
                            console.error("⚠️ Browser restart failed:", err);
                        }
                    }
                }
            }

            if(Math.random() > 0.8) await saveCookies(context);
        }
    } catch (e) {
        console.error("❌ Fatal Script Error:", e);
    } finally {
        try {
            if (browserInstance) await browserInstance.close();
        } catch (browserErr) {
            console.error("⚠️ Error closing browser:", browserErr.message);
        }
        try {
            await client.end();
        } catch (clientErr) {
            console.error("⚠️ Error closing database connection:", clientErr.message);
        }
        console.log("🏁 Done.");
        process.exit(0);
    }
})();
