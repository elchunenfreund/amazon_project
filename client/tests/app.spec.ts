import { test, expect } from '@playwright/test';

// Helper to mock authenticated user
async function mockAuthenticatedUser(page: import('@playwright/test').Page) {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: 1, email: 'test@test.com', name: 'Test User', role: 'admin' } })
    });
  });
  await page.route('**/api/csrf-token', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ csrfToken: 'test-token' })
    });
  });
  await page.route('**/api/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ amazonDomain: 'amazon.ca' })
    });
  });
  await page.route('**/api/asins/latest**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });
  await page.route('**/api/scraper/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ running: false })
    });
  });
}

test.describe('App Foundation', () => {
  test('should load the app', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Amazon Tracker/);
  });

  test('should render the main app container', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();
  });

  test('should display Dashboard title', async ({ page }) => {
    await mockAuthenticatedUser(page);
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Dashboard');
  });
});

test.describe('Navigation', () => {
  test('should navigate to Products page', async ({ page }) => {
    await mockAuthenticatedUser(page);
    await page.route('**/api/products**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });
    await page.goto('/');
    await page.click('a[href="/products"]');
    await expect(page.locator('h1')).toContainText('Products');
  });

  test('should navigate to Analytics page', async ({ page }) => {
    await mockAuthenticatedUser(page);
    await page.route('**/api/vendor-reports', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });
    await page.route('**/api/vendor-reports/weeks**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });
    await page.route('**/api/vendor-reports/asins**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });
    await page.goto('/');
    await page.click('a[href="/analytics"]');
    await expect(page.locator('h1')).toContainText('Vendor Analytics');
  });

  test('should navigate to Orders page', async ({ page }) => {
    await mockAuthenticatedUser(page);
    await page.route('**/api/purchase-orders', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });
    await page.route('**/api/purchase-orders/vendors', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });
    await page.route('**/api/purchase-orders/calendar/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({})
      });
    });
    await page.goto('/');
    await page.click('a[href="/orders"]');
    await expect(page.locator('h1')).toContainText('Purchase Orders');
  });

  test('should show 404 page for unknown routes', async ({ page }) => {
    await mockAuthenticatedUser(page);
    await page.goto('/unknown-page');
    await expect(page.locator('h1')).toContainText('404');
  });
});

test.describe('Navbar', () => {
  test('should render navbar with logo', async ({ page }) => {
    await mockAuthenticatedUser(page);
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('text=Amazon Tracker').first()).toBeVisible();
  });

  test('should have active state on current page link', async ({ page }) => {
    await mockAuthenticatedUser(page);
    await page.route('**/api/products**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });
    await page.goto('/products');
    const productsLink = page.locator('a[href="/products"]').first();
    await expect(productsLink).toHaveClass(/text-accent/);
  });
});
