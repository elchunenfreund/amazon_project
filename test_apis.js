const { Pool } = require('pg');
const { getDatabaseConfig } = require('./lib/db-config');

(async () => {
  const pool = new Pool(getDatabaseConfig());

  try {
    // Get refresh token
    const tokenResult = await pool.query('SELECT refresh_token FROM oauth_tokens ORDER BY created_at DESC LIMIT 1');
    const refreshToken = tokenResult.rows[0]?.refresh_token;

    if (!refreshToken) {
      console.log('No refresh token found');
      return;
    }

    // Get access token
    const tokenResp = await fetch('https://api.amazon.com/auth/o2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.LWA_CLIENT_ID,
        client_secret: process.env.LWA_CLIENT_SECRET
      }).toString()
    });

    const tokenData = await tokenResp.json();
    if (!tokenData.access_token) {
      console.log('Token error:', tokenData);
      return;
    }

    console.log('✅ Access token obtained');
    console.log('');

    // Test 1: Catalog API (should work for both Seller and Vendor)
    console.log('=== TEST 1: Catalog API ===');
    const catalogResp = await fetch(
      'https://sellingpartnerapi-na.amazon.com/catalog/2022-04-01/items?marketplaceIds=A2EUQ1WTGCTBG2&keywords=test&pageSize=1',
      {
        headers: {
          'x-amz-access-token': tokenData.access_token,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('Status:', catalogResp.status);
    const catalogData = await catalogResp.json();
    if (catalogResp.ok) {
      console.log('✅ SUCCESS - Found', catalogData.numberOfResults, 'results');
    } else {
      console.log('❌ FAILED:', JSON.stringify(catalogData));
    }
    console.log('');

    // Test 2: Seller API (should FAIL for Vendor)
    console.log('=== TEST 2: Sellers API (Seller-only) ===');
    const sellerResp = await fetch(
      'https://sellingpartnerapi-na.amazon.com/sellers/v1/marketplaceParticipations',
      {
        headers: {
          'x-amz-access-token': tokenData.access_token,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('Status:', sellerResp.status);
    const sellerData = await sellerResp.json();
    if (sellerResp.ok) {
      console.log('✅ SUCCESS');
    } else {
      console.log('❌ FAILED (expected for Vendor):', sellerData.errors?.[0]?.message || JSON.stringify(sellerData));
    }
    console.log('');

    // Test 3: Vendor Orders API (should work for Vendor)
    console.log('=== TEST 3: Vendor Orders API ===');
    const vendorResp = await fetch(
      'https://sellingpartnerapi-na.amazon.com/vendor/orders/v1/purchaseOrders',
      {
        headers: {
          'x-amz-access-token': tokenData.access_token,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('Status:', vendorResp.status);
    const vendorData = await vendorResp.json();
    if (vendorResp.ok) {
      const orders = vendorData.payload?.orders || [];
      console.log('✅ SUCCESS - Found', orders.length, 'purchase orders');
      if (orders.length > 0) {
        console.log('   First PO#:', orders[0].purchaseOrderNumber);
      }
    } else {
      console.log('❌ FAILED:', vendorData.errors?.[0]?.message || JSON.stringify(vendorData));
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    pool.end();
  }
})();
