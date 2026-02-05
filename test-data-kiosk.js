// Test Data Kiosk API access with proper AWS SigV4 signing
const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// AWS Signature V4 signing
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

    // Test 1: Try the standard Reports API to see what's available
    console.log('\n=== Test 1: Check existing vendor reports access ===');
    await testReportsAPI(accessToken);

    // Test 2: Try Data Kiosk with different query
    console.log('\n=== Test 2: Data Kiosk API ===');
    await testDataKioskAPI(accessToken);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

async function testReportsAPI(accessToken) {
  // This should work - we use it already
  const url = 'https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/reports?pageSize=5&reportTypes=GET_VENDOR_SALES_REPORT';

  let headers = {
    'x-amz-access-token': accessToken,
    'Content-Type': 'application/json'
  };

  headers = signRequest('GET', url, headers, '', process.env.AWS_ACCESS_KEY_ID, process.env.AWS_SECRET_ACCESS_KEY, 'us-east-1', 'execute-api');

  const response = await fetch(url, { method: 'GET', headers });
  console.log('Reports API Status:', response.status);

  if (response.ok) {
    const data = await response.json();
    console.log('✅ Reports API works - found', data.reports?.length || 0, 'reports');
  } else {
    const text = await response.text();
    console.log('Reports API Response:', text.substring(0, 200));
  }
}

async function testDataKioskAPI(accessToken) {
  const url = 'https://sellingpartnerapi-na.amazon.com/datakiosk/2023-11-15/queries';

  let headers = {
    'x-amz-access-token': accessToken,
    'Content-Type': 'application/json'
  };

  headers = signRequest('GET', url, headers, '', process.env.AWS_ACCESS_KEY_ID, process.env.AWS_SECRET_ACCESS_KEY, 'us-east-1', 'execute-api');

  console.log('Testing Data Kiosk GET /queries...');
  const response = await fetch(url, { method: 'GET', headers });
  console.log('Data Kiosk Status:', response.status);
  const text = await response.text();

  if (response.ok) {
    console.log('✅ Data Kiosk is accessible!');
    const data = JSON.parse(text);
    console.log('Existing queries:', data.queries?.length || 0);

    // Try creating a query
    await createVendorAnalyticsQuery(accessToken);
  } else {
    console.log('Response:', text);

    // Check if it's a specific error we can diagnose
    try {
      const err = JSON.parse(text);
      if (err.errors?.[0]?.code === 'Unauthorized') {
        console.log('\n❌ Data Kiosk access denied.');
        console.log('This could mean:');
        console.log('1. Need to re-authorize app to get fresh tokens');
        console.log('2. Data Kiosk not available for this account type');
        console.log('3. Canada marketplace may have limited Data Kiosk support');
      }
    } catch (e) {}
  }
}

async function createVendorAnalyticsQuery(accessToken) {
  const url = 'https://sellingpartnerapi-na.amazon.com/datakiosk/2023-11-15/queries';

  // CORRECT: Use vendor analytics dataset (not seller salesAndTraffic)
  // Vendors must use analytics_vendorAnalytics_2024_09_30 with manufacturingView or sourcingView
  const query = `{
    analytics_vendorAnalytics_2024_09_30 {
      manufacturingView(
        startDate: "2026-01-01"
        endDate: "2026-01-31"
        aggregateBy: WEEK
        marketplaceIds: ["A2EUQ1WTGCTBG2"]
      ) {
        startDate
        endDate
        asin
        shippedRevenue { amount currencyCode }
        shippedUnits
        orderedRevenue { amount currencyCode }
        orderedUnits
      }
    }
  }`;

  let headers = {
    'x-amz-access-token': accessToken,
    'Content-Type': 'application/json'
  };

  const body = JSON.stringify({ query });
  headers = signRequest('POST', url, headers, body, process.env.AWS_ACCESS_KEY_ID, process.env.AWS_SECRET_ACCESS_KEY, 'us-east-1', 'execute-api');

  console.log('\nTrying to create a query...');
  const response = await fetch(url, { method: 'POST', headers, body });
  console.log('Create Query Status:', response.status);
  const text = await response.text();
  console.log('Response:', text.substring(0, 500));
}

testDataKiosk();
