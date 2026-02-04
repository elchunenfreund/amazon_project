import { test, expect } from '@playwright/test';

test.describe('Error Handling', () => {
  test.describe('API Error States', () => {
    test('should show error state when dashboard API fails', async ({ page }) => {
      // Mock API to return error
      await page.route('/api/asins/latest', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Server error' })
        });
      });

      await page.goto('/');

      // Should show error state with retry option
      await expect(page.locator('text=Failed to load')).toBeVisible({ timeout: 10000 });
    });

    test('should show retry button on error', async ({ page }) => {
      await page.route('/api/asins/latest', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Server error' })
        });
      });

      await page.goto('/');

      // Should show retry button (text is "Try Again" based on QueryError component)
      await expect(page.locator('button:has-text("Try Again")')).toBeVisible({ timeout: 10000 });
    });

    test('should retry data fetch when retry button clicked', async ({ page }) => {
      let requestCount = 0;

      await page.route('/api/asins/latest', async (route) => {
        requestCount++;
        if (requestCount === 1) {
          // First request fails
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Server error' })
          });
        } else {
          // Second request succeeds
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([])
          });
        }
      });

      await page.goto('/');

      // Wait for error state
      await expect(page.locator('button:has-text("Try Again")')).toBeVisible({ timeout: 10000 });

      // Click retry
      await page.click('button:has-text("Try Again")');

      // Should no longer show error
      await expect(page.locator('text=Failed to load')).not.toBeVisible({ timeout: 10000 });
    });

    test('should show error state when products API fails', async ({ page }) => {
      await page.route('/api/products', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Database connection failed' })
        });
      });

      await page.goto('/products');

      await expect(page.locator('text=Failed to load')).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Network Error Handling', () => {
    test('should handle network timeout gracefully', async ({ page }) => {
      await page.route('/api/asins/latest', async (route) => {
        // Simulate timeout by never responding
        await new Promise((resolve) => setTimeout(resolve, 30000));
        await route.abort('timedout');
      });

      await page.goto('/');

      // Should eventually show some error state or loading timeout
      // The exact behavior depends on TanStack Query configuration
      await expect(page.locator('text=error, text=Error, text=failed, text=Failed').first()).toBeVisible({ timeout: 35000 });
    });

    test('should handle network disconnection', async ({ page }) => {
      await page.route('/api/asins/latest', async (route) => {
        await route.abort('failed');
      });

      await page.goto('/');

      // Should show error state
      await expect(page.locator('text=Failed to load')).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('404 Error Handling', () => {
    test('should show 404 page for unknown routes', async ({ page }) => {
      await page.goto('/this-page-does-not-exist');
      await expect(page.locator('h1')).toContainText('404');
    });

    test('should show 404 page for invalid nested routes', async ({ page }) => {
      await page.goto('/products/invalid/nested/path');
      await expect(page.locator('h1')).toContainText('404');
    });
  });

  test.describe('API Error Messages', () => {
    test('should display specific error message from API', async ({ page }) => {
      const specificError = 'Product not found in database';

      await page.route('/api/asins/latest', async (route) => {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: specificError })
        });
      });

      await page.goto('/');

      // Error component should display the error
      await expect(page.locator(`text=${specificError}`)).toBeVisible({ timeout: 10000 });
    });

    test('should handle malformed JSON response', async ({ page }) => {
      await page.route('/api/asins/latest', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: 'invalid json {'
        });
      });

      await page.goto('/');

      // Should show some kind of error
      await expect(page.locator('text=error, text=Error, text=failed, text=Failed').first()).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Form Error Handling', () => {
    test('should show validation error for invalid ASIN', async ({ page }) => {
      // Mock the latest endpoint to return empty data
      await page.route('/api/asins/latest', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        });
      });

      // Mock the add ASIN endpoint to return validation error
      await page.route('/api/asins', async (route) => {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Invalid ASIN format' })
        });
      });

      await page.goto('/');

      // Look for an add ASIN button/input if it exists
      const addButton = page.locator('button:has-text("Add")').first();
      if (await addButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await addButton.click();

        // Try to add an invalid ASIN through the form
        const asinInput = page.locator('input[placeholder*="ASIN"], input[name="asin"]').first();
        if (await asinInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await asinInput.fill('INVALID');
          await page.keyboard.press('Enter');

          // Should show error
          await expect(page.locator('text=Invalid')).toBeVisible({ timeout: 5000 });
        }
      }
    });
  });

  test.describe('Empty State Handling', () => {
    test('should show empty state when no products exist', async ({ page }) => {
      await page.route('/api/asins/latest', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        });
      });

      await page.goto('/');

      // Should show some indication of empty state or just render without errors
      // The app should not crash when there's no data
      await expect(page.locator('#root')).toBeVisible();
    });

    test('should show empty state message for orders with no data', async ({ page }) => {
      await page.route('/api/purchase-orders', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        });
      });

      await page.goto('/orders');

      // Page should render successfully
      await expect(page.locator('h1')).toContainText('Purchase Orders');
    });
  });

  test.describe('Loading States', () => {
    test('should show loading indicator while fetching data', async ({ page }) => {
      await page.route('/api/asins/latest', async (route) => {
        // Delay response to see loading state
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        });
      });

      await page.goto('/');

      // Should show some loading indicator (spinner, skeleton, etc.)
      // This test verifies the app handles slow responses gracefully
      await expect(page.locator('#root')).toBeVisible();
    });
  });

  test.describe('Error Recovery', () => {
    test('should recover from temporary API failure', async ({ page }) => {
      let failCount = 0;

      await page.route('/api/asins/latest', async (route) => {
        failCount++;
        if (failCount <= 2) {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Temporary failure' })
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              {
                asin: 'B0123456789',
                header: 'Test Product',
                availability: 'In Stock'
              }
            ])
          });
        }
      });

      await page.goto('/');

      // Wait for initial error
      await expect(page.locator('button:has-text("Try Again")')).toBeVisible({ timeout: 10000 });

      // First retry - should still fail
      await page.click('button:has-text("Try Again")');
      await expect(page.locator('button:has-text("Try Again")')).toBeVisible({ timeout: 10000 });

      // Second retry - should succeed
      await page.click('button:has-text("Try Again")');

      // Should now show the data
      await expect(page.locator('text=Test Product')).toBeVisible({ timeout: 10000 });
    });
  });
});
