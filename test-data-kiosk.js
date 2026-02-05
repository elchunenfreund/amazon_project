// Test Data Kiosk API access with proper AWS SigV4 signing
const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// AWS Signature V4 signing (same as in server.js)
function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = crypto.createHmac('sha256', 'AWS4' + key).update(dateStamp).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest();
  const kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest();
  const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
  return kSigning;
}

function signRequest(method, url, headers, body, accessKeyId, secretAccessKey, region, service) {
  const urlObj = new URL(url);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  headers['x-amz-date'] = amzDate;
  headers['host'] = urlObj.host;

  const canonicalUri = urlObj.pathname;
  const canonicalQuerystring = urlObj.searchParams.toString();

  const signedHeadersList = Object.keys(headers).map(k => k.toLowerCase()).sort();
  const signedHeaders = signedHeadersList.join(';');

  const canonicalHeaders = signedHeadersList
    .map(key => `${key}:${headers[Object.keys(headers).find(k => k.toLowerCase() === key)]}\n`)
    .join('');

  const payloadHash = crypto.createHash('sha256').update(body || '').digest('hex');

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex')
  ].join('\n');

  const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  headers['Authorization'] = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return headers;
}

async function getAccessToken() {
  const result = await pool.query('SELECT access_token, refresh_token, expires_at FROM oauth_tokens ORDER BY id DESC LIMIT 1');

  if (!result.rows.length) throw new Error('No tokens found');

  let { access_token, refresh_token, expires_at } = result.rows[0];

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

    const url = 'https://sellingpartnerapi-na.amazon.com/datakiosk/2023-11-15/queries';

    let headers = {
      'x-amz-access-token': accessToken,
      'Content-Type': 'application/json'
    };

    // Sign with AWS SigV4
    headers = signRequest(
      'GET',
      url,
      headers,
      '',
      process.env.AWS_ACCESS_KEY_ID,
      process.env.AWS_SECRET_ACCESS_KEY,
      'us-east-1',
      'execute-api'
    );

    console.log('\nTesting Data Kiosk API (with SigV4 signing)...');
    const response = await fetch(url, {
      method: 'GET',
      headers
    });

    console.log('Status:', response.status);
    const text = await response.text();

    if (response.ok) {
      console.log('✅ SUCCESS! Data Kiosk is accessible.');
      const data = JSON.parse(text);
      console.log('Existing queries:', data.queries?.length || 0);

      // Now try to create a test query for vendor analytics
      console.log('\nTrying to create a vendor analytics query...');
      await testVendorAnalyticsQuery(accessToken);
    } else {
      console.log('Response:', text);
      if (response.status === 403) {
        console.log('\n⚠️  Still getting 403 - checking if it\'s a permissions issue...');
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

async function testVendorAnalyticsQuery(accessToken) {
  const url = 'https://sellingpartnerapi-na.amazon.com/datakiosk/2023-11-15/queries';

  // Simple query to test access to vendor analytics
  const query = `
    query VendorAnalyticsTest {
      analytics_vendorAnalytics_2024_09_30 {
        salesByAsin(
          startDate: "2026-01-01"
          endDate: "2026-01-31"
          aggregateBy: WEEK
          marketplaceIds: ["A2EUQ1WTGCTBG2"]
        ) {
          asin
          startDate
          endDate
          orderedUnits { amount }
          orderedRevenue { amount currencyCode }
          netOrderedGMS { amount currencyCode }
          confirmedUnits { amount }
        }
      }
    }
  `;

  let headers = {
    'x-amz-access-token': accessToken,
    'Content-Type': 'application/json'
  };

  const body = JSON.stringify({ query: query.trim() });

  headers = signRequest(
    'POST',
    url,
    headers,
    body,
    process.env.AWS_ACCESS_KEY_ID,
    process.env.AWS_SECRET_ACCESS_KEY,
    'us-east-1',
    'execute-api'
  );

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body
  });

  console.log('Create Query Status:', response.status);
  const text = await response.text();
  console.log('Response:', text.substring(0, 500));
}

testDataKiosk();
