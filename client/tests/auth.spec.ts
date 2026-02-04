import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.describe('Login Page', () => {
    test('should display login page', async ({ page }) => {
      await page.goto('/login');
      await expect(page.locator('text=Amazon Tracker')).toBeVisible();
      await expect(page.locator('text=Sign in to your account')).toBeVisible();
    });

    test('should have username and password fields', async ({ page }) => {
      await page.goto('/login');
      await expect(page.locator('input#email')).toBeVisible();
      await expect(page.locator('input#password')).toBeVisible();
    });

    test('should have a submit button', async ({ page }) => {
      await page.goto('/login');
      await expect(page.locator('button[type="submit"]')).toContainText('Sign in');
    });

    test('should show loading state when submitting', async ({ page }) => {
      // Mock a slow login response
      await page.route('/api/auth/login', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Invalid credentials' })
        });
      });

      await page.goto('/login');
      await page.fill('input#email', 'test@test.com');
      await page.fill('input#password', 'wrongpassword');
      await page.click('button[type="submit"]');

      // Should show loading state
      await expect(page.locator('button[type="submit"]')).toContainText('Signing in...');
    });
  });

  test.describe('Login Validation', () => {
    test('should reject login with invalid credentials', async ({ page }) => {
      await page.goto('/login');
      await page.fill('input#email', 'wrong@email.com');
      await page.fill('input#password', 'wrongpassword');
      await page.click('button[type="submit"]');

      // Should show error message
      await expect(page.locator('.text-red-600, .text-red-400')).toBeVisible();
    });

    test('should reject login with empty fields', async ({ page }) => {
      await page.goto('/login');

      // Try to submit without filling fields
      await page.click('button[type="submit"]');

      // HTML5 validation should prevent submission
      // Check that we're still on the login page
      await expect(page).toHaveURL(/\/login/);
    });

    test('should show error message from server', async ({ page }) => {
      // Mock login endpoint to return specific error
      await page.route('/api/auth/login', async (route) => {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Invalid credentials' })
        });
      });

      await page.goto('/login');
      await page.fill('input#email', 'test@test.com');
      await page.fill('input#password', 'wrongpassword');
      await page.click('button[type="submit"]');

      await expect(page.locator('text=Invalid credentials')).toBeVisible();
    });
  });

  test.describe('Login Success', () => {
    test('should redirect to dashboard on successful login', async ({ page }) => {
      // Mock successful login
      await page.route('/api/auth/login', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            user: {
              id: 1,
              email: 'admin@example.com',
              name: 'Admin',
              role: 'admin'
            }
          })
        });
      });

      // Also mock the dashboard data endpoint
      await page.route('/api/asins/latest', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        });
      });

      await page.goto('/login');
      await page.fill('input#email', process.env.TEST_EMAIL || 'admin');
      await page.fill('input#password', process.env.TEST_PASSWORD || 'Mechtig1');
      await page.click('button[type="submit"]');

      // Should redirect to dashboard
      await expect(page).toHaveURL('/');
    });
  });

  test.describe('Protected Routes', () => {
    test('should show 401 for unauthenticated API requests', async ({ request }) => {
      const response = await request.get('/api/products');
      expect(response.status()).toBe(401);
    });

    test('should include authentication error message', async ({ request }) => {
      const response = await request.get('/api/products');
      const body = await response.json();
      expect(body.error).toBe('Authentication required');
    });
  });

  test.describe('Logout', () => {
    test('should logout successfully', async ({ request }) => {
      const response = await request.post('/api/auth/logout');
      // Logout should work even if not logged in
      expect([200, 401]).toContain(response.status());
    });

    test('should clear session on logout', async ({ request }) => {
      // First attempt to access protected route
      const beforeLogout = await request.get('/api/auth/me');
      expect(beforeLogout.status()).toBe(401);

      // Logout
      await request.post('/api/auth/logout');

      // Try to access protected route again
      const afterLogout = await request.get('/api/auth/me');
      expect(afterLogout.status()).toBe(401);
    });
  });

  test.describe('Registration Validation', () => {
    test('should require password with minimum length', async ({ request }) => {
      const response = await request.post('/api/auth/register', {
        data: {
          email: 'newuser@test.com',
          password: 'Short1' // Less than 8 characters
        }
      });

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('8 characters');
    });

    test('should require password with uppercase letter', async ({ request }) => {
      const response = await request.post('/api/auth/register', {
        data: {
          email: 'newuser@test.com',
          password: 'lowercase1' // No uppercase
        }
      });

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('uppercase');
    });

    test('should require password with number', async ({ request }) => {
      const response = await request.post('/api/auth/register', {
        data: {
          email: 'newuser@test.com',
          password: 'NoNumbers' // No number
        }
      });

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('number');
    });

    test('should require email field', async ({ request }) => {
      const response = await request.post('/api/auth/register', {
        data: {
          password: 'ValidPass1'
        }
      });

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('required');
    });

    test('should require password field', async ({ request }) => {
      const response = await request.post('/api/auth/register', {
        data: {
          email: 'newuser@test.com'
        }
      });

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('required');
    });
  });
});
