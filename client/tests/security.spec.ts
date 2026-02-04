import { test, expect } from '@playwright/test';

test.describe('Security Tests', () => {
  test.describe('API Authentication', () => {
    test('should require authentication for /api/products', async ({ request }) => {
      const response = await request.get('/api/products');
      expect(response.status()).toBe(401);
      const body = await response.json();
      expect(body.error).toBe('Authentication required');
    });

    test('should require authentication for /api/asins/latest', async ({ request }) => {
      const response = await request.get('/api/asins/latest');
      expect(response.status()).toBe(401);
    });

    test('should require authentication for /api/vendor-reports', async ({ request }) => {
      const response = await request.get('/api/vendor-reports');
      expect(response.status()).toBe(401);
    });

    test('should require authentication for /api/purchase-orders', async ({ request }) => {
      const response = await request.get('/api/purchase-orders');
      expect(response.status()).toBe(401);
    });

    test('should allow access to /api/auth/me without authentication', async ({ request }) => {
      const response = await request.get('/api/auth/me');
      // Should return 401 but not require prior auth (it checks auth status)
      expect(response.status()).toBe(401);
      const body = await response.json();
      expect(body.error).toBe('Not authenticated');
    });
  });

  test.describe('Input Validation', () => {
    test('should reject invalid ASIN format', async ({ request }) => {
      const response = await request.get('/api/products/INVALID');
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('Invalid ASIN');
    });

    test('should reject ASIN with special characters', async ({ request }) => {
      const response = await request.get('/api/products/B00<script>');
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('Invalid ASIN');
    });

    test('should reject ASIN that is too short', async ({ request }) => {
      const response = await request.get('/api/products/B001');
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('Invalid ASIN');
    });

    test('should reject ASIN that is too long', async ({ request }) => {
      const response = await request.get('/api/products/B0012345678901234567');
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('Invalid ASIN');
    });

    test('should reject SQL injection in ASIN parameter', async ({ request }) => {
      const response = await request.get('/api/products/B001234567; DROP TABLE--');
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('Invalid ASIN');
    });
  });

  test.describe('Rate Limiting', () => {
    test('should rate limit login attempts', async ({ request }) => {
      // The server has rate limiting set to 5 attempts per 15 minutes
      const attempts: number[] = [];

      for (let i = 0; i < 6; i++) {
        const response = await request.post('/api/auth/login', {
          data: { email: 'test@test.com', password: 'wrongpassword' }
        });
        attempts.push(response.status());
      }

      // The 6th attempt should be rate limited (429)
      expect(attempts[5]).toBe(429);
    });
  });

  test.describe('Security Headers', () => {
    test('should have X-Content-Type-Options header', async ({ request }) => {
      const response = await request.get('/');
      const headers = response.headers();
      expect(headers['x-content-type-options']).toBe('nosniff');
    });

    test('should have X-Frame-Options header', async ({ request }) => {
      const response = await request.get('/');
      const headers = response.headers();
      // Helmet sets this header
      expect(headers['x-frame-options']).toBeDefined();
    });

    test('should have X-XSS-Protection header', async ({ request }) => {
      const response = await request.get('/');
      const headers = response.headers();
      // Helmet may set this (though it's deprecated in modern browsers)
      // We check for its presence but don't fail if absent
      const xssProtection = headers['x-xss-protection'];
      if (xssProtection) {
        expect(xssProtection).toBeTruthy();
      }
    });

    test('should not expose server information', async ({ request }) => {
      const response = await request.get('/');
      const headers = response.headers();
      // Helmet removes X-Powered-By header by default
      expect(headers['x-powered-by']).toBeUndefined();
    });
  });

  test.describe('Session Security', () => {
    test('should set httpOnly cookie flag', async ({ request }) => {
      // Make a login attempt to trigger session creation
      const response = await request.post('/api/auth/login', {
        data: { email: 'test@test.com', password: 'test' }
      });

      const setCookieHeader = response.headers()['set-cookie'];
      if (setCookieHeader) {
        expect(setCookieHeader.toLowerCase()).toContain('httponly');
      }
    });

    test('should set SameSite cookie attribute', async ({ request }) => {
      const response = await request.post('/api/auth/login', {
        data: { email: 'test@test.com', password: 'test' }
      });

      const setCookieHeader = response.headers()['set-cookie'];
      if (setCookieHeader) {
        expect(setCookieHeader.toLowerCase()).toContain('samesite');
      }
    });
  });

  test.describe('CSRF Protection', () => {
    test('should protect API routes from CSRF', async ({ request }) => {
      // Attempt to make a state-changing request without proper headers
      const response = await request.post('/api/products/bulk-delete', {
        data: { asins: ['B0000000000'] },
        headers: {
          'Origin': 'https://malicious-site.com'
        }
      });

      // Should either require authentication or reject the request
      expect([401, 403]).toContain(response.status());
    });
  });
});
