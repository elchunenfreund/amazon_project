// Quick verification script for OAuth setup
const { Pool } = require('pg');
const { getDatabaseConfig } = require('./lib/db-config');

async function verifySetup() {
    console.log('🔍 Verifying OAuth Setup...\n');

    // Check environment variables
    const requiredVars = [
        'LWA_CLIENT_ID',
        'LWA_CLIENT_SECRET',
        'OAUTH_REDIRECT_URI',
        'OAUTH_STATE_SECRET'
    ];

    console.log('📋 Environment Variables:');
    let allSet = true;
    for (const varName of requiredVars) {
        const value = process.env[varName];
        if (value) {
            // Mask sensitive values
            if (varName.includes('SECRET') || varName.includes('CLIENT_SECRET')) {
                console.log(`  ✅ ${varName}: ${value.substring(0, 10)}...${value.substring(value.length - 4)}`);
            } else {
                console.log(`  ✅ ${varName}: ${value}`);
            }
        } else {
            console.log(`  ❌ ${varName}: NOT SET`);
            allSet = false;
        }
    }

    if (!allSet) {
        console.log('\n⚠️  Some environment variables are missing!');
        return;
    }

    // Verify redirect URI format
    console.log('\n🔗 Redirect URI Verification:');
    const redirectUri = process.env.OAUTH_REDIRECT_URI;
    if (redirectUri.startsWith('https://') && redirectUri.includes('/auth/amazon/callback')) {
        console.log(`  ✅ Format is correct: ${redirectUri}`);
    } else {
        console.log(`  ⚠️  Format might be incorrect: ${redirectUri}`);
        console.log('     Expected: https://YOUR-APP.herokuapp.com/auth/amazon/callback');
    }

    // Test database connection and table
    console.log('\n💾 Database Verification:');
    try {
        const pool = new Pool(getDatabaseConfig());

        // Check if oauth_tokens table exists
        const tableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'oauth_tokens'
            );
        `);

        if (tableCheck.rows[0].exists) {
            console.log('  ✅ oauth_tokens table exists');

            // Check for existing tokens
            const tokenCount = await pool.query('SELECT COUNT(*) FROM oauth_tokens');
            console.log(`  📊 Existing tokens: ${tokenCount.rows[0].count}`);
        } else {
            console.log('  ℹ️  oauth_tokens table will be created on first OAuth callback');
        }

        await pool.end();
    } catch (err) {
        console.log(`  ⚠️  Database check failed: ${err.message}`);
    }

    // Verify OAuth URLs
    console.log('\n🌐 Amazon Developer Console URLs:');
    console.log('  OAuth Login URI:');
    console.log(`     https://amazon-tracker-app-239d391c775f.herokuapp.com/auth/amazon/login`);
    console.log('  OAuth Redirect URI:');
    console.log(`     ${redirectUri}`);

    console.log('\n✅ Setup verification complete!');
    console.log('\n📝 Next steps:');
    console.log('  1. Ensure the URLs above are entered in Amazon Developer Console');
    console.log('  2. Test the OAuth flow by visiting:');
    console.log(`     https://amazon-tracker-app-239d391c775f.herokuapp.com/auth/amazon/login`);
}

verifySetup().catch(console.error);
