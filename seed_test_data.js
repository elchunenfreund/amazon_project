const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://localhost:5432/amazon_tracker' });

async function seed() {
    await client.connect();

    // Clear existing reports for a clean test
    await client.query('TRUNCATE daily_reports RESTART IDENTITY');

    const yesterday = '2026-01-11';
    const today = '2026-01-12';

    const testData = [
        { asin: 'B0BWNTCR3R', header: 'Delon Rubbing Alcohol', price: '$9.99', stock: 'In Stock', rank: '#500' },
        { asin: 'B07MD5GM3J', header: 'Mala Ramen Noodle', price: '$12.49', stock: 'In Stock', rank: '#900' }
    ];

    console.log("🌱 Seeding Yesterday's data...");
    for (const item of testData) {
        await client.query(`
            INSERT INTO daily_reports (asin, header, availability, price, ranking, check_date, is_changed)
            VALUES ($1, $2, $3, $4, $5, $6, false)
        `, [item.asin, item.header, item.stock, item.price, item.rank, yesterday]);
    }

    console.log("🌱 Seeding Today's data (with changes)...");

    // Item 1: Price Change ($9.99 -> $11.99)
    await client.query(`
        INSERT INTO daily_reports (asin, header, availability, price, ranking, check_date, is_changed)
        VALUES ($1, $2, $3, $4, $5, $6, true)
    `, ['B0BWNTCR3R', 'Delon Rubbing Alcohol', 'In Stock', '$11.99', '#450', today]);

    // Item 2: Stock Change (In Stock -> Unavailable)
    await client.query(`
        INSERT INTO daily_reports (asin, header, availability, price, ranking, check_date, is_changed)
        VALUES ($1, $2, $3, $4, $5, $6, true)
    `, ['B07MD5GM3J', 'Mala Ramen Noodle', 'Unavailable', '$12.49', '#950', today]);

    console.log("✅ Seeding complete. You now have 2 days of data for 2 ASINs.");
    await client.end();
}

seed();
