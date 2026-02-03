import { test, expect } from '@playwright/test';

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
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Dashboard');
  });
});

test.describe('Navigation', () => {
  test('should navigate to Products page', async ({ page }) => {
    await page.goto('/');
    await page.click('a[href="/products"]');
    await expect(page.locator('h1')).toContainText('Products');
  });

  test('should navigate to Analytics page', async ({ page }) => {
    await page.goto('/');
    await page.click('a[href="/analytics"]');
    await expect(page.locator('h1')).toContainText('Vendor Analytics');
  });

  test('should navigate to Orders page', async ({ page }) => {
    await page.goto('/');
    await page.click('a[href="/orders"]');
    await expect(page.locator('h1')).toContainText('Purchase Orders');
  });

  test('should show 404 page for unknown routes', async ({ page }) => {
    await page.goto('/unknown-page');
    await expect(page.locator('h1')).toContainText('404');
  });
});

test.describe('Navbar', () => {
  test('should render navbar with logo', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('text=Amazon Tracker').first()).toBeVisible();
  });

  test('should have active state on current page link', async ({ page }) => {
    await page.goto('/products');
    const productsLink = page.locator('a[href="/products"]').first();
    await expect(productsLink).toHaveClass(/text-accent/);
  });
});
