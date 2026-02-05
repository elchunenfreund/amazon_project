// Test Data Kiosk API access
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function getAccessToken() {
  const result = await pool.query('SELECT access_token, refresh_token, expires_at FROM oauth_tokens ORDER BY id DESC LIMIT 1');

  if (!result.rows.length) throw new Error('No tokens found');

  let { access_token, refresh_token, expires_at } = result.rows[0];

  // Check if expired
  if (new Date(expires_at) <= new Date()) {
    console.log('Token expired, refreshing...');
    const resp = await fetch('https://api.amazon.com/auth/o2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refresh_token,
        client_id: process.env.LWA_CLIENT_ID,
        client_secret: process.env.LWA_CLIENT_SECRET
      })
    });
    const data = await resp.json();
    if (data.error) {
      console.error('Token refresh error:', data);
      throw new Error(data.error_description || data.error);
    }
    await pool.query(
      'UPDATE oauth_tokens SET access_token = $1, expires_at = NOW() + interval \'1 hour\' WHERE id = (SELECT id FROM oauth_tokens ORDER BY id DESC LIMIT 1)',
      [data.access_token]
    );
    access_token = data.access_token;
  }
  return access_token;
}

async function testDataKiosk() {
  try {
    const accessToken = await getAccessToken();
    console.log('Got access token');

    // Test Data Kiosk getQueries endpoint
    console.log('\nTesting Data Kiosk API...');
    const response = await fetch('https://sellingpartnerapi-na.amazon.com/datakiosk/2023-11-15/queries', {
      method: 'GET',
      headers: {
        'x-amz-access-token': accessToken,
        'Content-Type': 'application/json'
      }
    });

    console.log('Status:', response.status);
    const text = await response.text();

    if (response.ok) {
      console.log('SUCCESS! Data Kiosk is accessible.');
      const data = JSON.parse(text);
      console.log('Existing queries:', data.queries?.length || 0);
    } else {
      console.log('Response:', text);

      if (response.status === 403) {
        console.log('\n⚠️  Access Denied - Brand Analytics role may be required');
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

testDataKiosk();
