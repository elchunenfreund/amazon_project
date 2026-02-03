// Seed script to create admin user
// Run with: node seed-admin.js

const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/amazon_tracker',
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

const ADMIN_EMAIL = 'admin';
const ADMIN_PASSWORD = 'mechtig';
const SALT_ROUNDS = 10;

async function seedAdmin() {
    try {
        console.log('Creating admin user...');

        // Check if admin exists
        const existing = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [ADMIN_EMAIL]
        );

        if (existing.rows.length > 0) {
            console.log('Admin user already exists, updating password...');
            const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);
            await pool.query(
                'UPDATE users SET password_hash = $1, role = $2 WHERE email = $3',
                [passwordHash, 'admin', ADMIN_EMAIL]
            );
            console.log('Admin password updated!');
        } else {
            const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);
            await pool.query(
                `INSERT INTO users (email, password_hash, name, role)
                 VALUES ($1, $2, $3, $4)`,
                [ADMIN_EMAIL, passwordHash, 'Administrator', 'admin']
            );
            console.log('Admin user created!');
        }

        console.log('\nCredentials:');
        console.log('  Email: admin');
        console.log('  Password: mechtig');

    } catch (err) {
        console.error('Error seeding admin:', err);
    } finally {
        await pool.end();
    }
}

seedAdmin();
