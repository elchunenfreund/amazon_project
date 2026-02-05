import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Week-Restricted Date Picker Tests
 *
 * Tests for the Analytics page date picker that only allows selecting
 * complete weeks (Sunday-Saturday) where vendor report data exists.
 */

// Test credentials
const TEST_EMAIL = 'elchunenfreund@gmail.com';
const TEST_PASSWORD = 'Mechtig1';

// Mock data for available weeks (for UI tests)
const mockWeeks = [
  { start: '2025-01-26', end: '2025-02-01' },
  { start: '2025-01-19', end: '2025-01-25' },
  { start: '2025-01-12', end: '2025-01-18' },
  { start: '2025-01-05', end: '2025-01-11' },
];

// Helper to authenticate API requests
async function authenticatedRequest(request: APIRequestContext): Promise<APIRequestContext> {
  // Login to get session cookie
  await request.post('/api/auth/login', {
    data: {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    },
  });
  return request;
}

test.describe('Week-Restricted Date Picker', () => {
  test.describe('API Endpoint: /api/vendor-reports/weeks', () => {
    test.beforeEach(async ({ request }) => {
      // Authenticate before each API test
      await authenticatedRequest(request);
    });

    test('should return available weeks for MANUFACTURING distributor view', async ({ request }) => {
      const response = await request.get('/api/vendor-reports/weeks?distributorView=MANUFACTURING');

      expect(response.status()).toBe(200);

      const weeks = await response.json();
      expect(Array.isArray(weeks)).toBe(true);

      if (weeks.length > 0) {
        expect(weeks[0]).toHaveProperty('start');
        expect(weeks[0]).toHaveProperty('end');
        // API returns ISO timestamps (e.g., "2026-01-25T05:00:00.000Z") or date strings
        expect(weeks[0].start).toMatch(/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?$/);
        expect(weeks[0].end).toMatch(/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?$/);
      }
    });

    test('should return available weeks for SOURCING distributor view', async ({ request }) => {
      const response = await request.get('/api/vendor-reports/weeks?distributorView=SOURCING');

      expect(response.status()).toBe(200);

      const weeks = await response.json();
      expect(Array.isArray(weeks)).toBe(true);
    });

    test('should return all weeks when distributorView is ALL', async ({ request }) => {
      const response = await request.get('/api/vendor-reports/weeks?distributorView=ALL');

      expect(response.status()).toBe(200);

      const weeks = await response.json();
      expect(Array.isArray(weeks)).toBe(true);
    });

    test('should return weeks sorted by most recent first', async ({ request }) => {
      const response = await request.get('/api/vendor-reports/weeks?distributorView=MANUFACTURING');

      expect(response.status()).toBe(200);

      const weeks = await response.json();

      if (weeks.length > 1) {
        const firstDate = new Date(weeks[0].start);
        const secondDate = new Date(weeks[1].start);
        expect(firstDate.getTime()).toBeGreaterThan(secondDate.getTime());
      }
    });

    test('should handle missing distributorView parameter gracefully', async ({ request }) => {
      const response = await request.get('/api/vendor-reports/weeks');

      expect(response.status()).toBe(200);

      const weeks = await response.json();
      expect(Array.isArray(weeks)).toBe(true);
    });
  });

  test.describe('Analytics Page - Date Picker Integration', () => {
    // Setup all route mocks before each test
    test.beforeEach(async ({ page }) => {
      // Mock authentication endpoint
      await page.route('**/api/auth/me', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ user: { id: 1, email: TEST_EMAIL } }),
        });
      });

      // Mock general vendor-reports endpoint (with wildcard for query params)
      await page.route('**/api/vendor-reports?*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      // Mock vendor-reports base endpoint (no query params)
      await page.route('**/api/vendor-reports', async (route) => {
        if (route.request().url().includes('?')) return;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      // Mock vendor-reports/asins endpoint
      await page.route('**/api/vendor-reports/asins*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      // Mock weeks endpoint (registered last for highest priority)
      await page.route('**/api/vendor-reports/weeks*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockWeeks),
        });
      });

      await page.route('**/api/config', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ amazonDomain: 'amazon.ca' }),
        });
      });

      await page.route('**/api/csrf-token', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ csrfToken: 'test-token' }),
        });
      });
    });

    test('should load Analytics page and fetch available weeks', async ({ page }) => {
      let weeksFetched = false;

      // Override the weeks route to track if it's called
      await page.route('/api/vendor-reports/weeks*', async (route) => {
        weeksFetched = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockWeeks),
        });
      });

      await page.goto('/analytics');
      await page.waitForLoadState('networkidle');

      expect(weeksFetched).toBe(true);
    });

    test('should display date picker on Analytics page', async ({ page }) => {
      await page.goto('/analytics');
      await page.waitForLoadState('networkidle');

      const datePickerButton = page.locator('button').filter({ has: page.locator('svg.lucide-calendar') }).first();
      await expect(datePickerButton).toBeVisible({ timeout: 10000 });
    });

    test('should show week presets in date picker sidebar', async ({ page }) => {
      await page.goto('/analytics');
      await page.waitForLoadState('networkidle');

      const datePickerButton = page.locator('button').filter({ has: page.locator('svg.lucide-calendar') }).first();
      await expect(datePickerButton).toBeVisible({ timeout: 10000 });

      await datePickerButton.click();
      await page.waitForTimeout(500);

      // Look for "Available Weeks" text in the popover
      const availableWeeksLabel = page.locator('text=Available Weeks');
      await expect(availableWeeksLabel).toBeVisible({ timeout: 5000 });

      // Look for week preset buttons
      const presetButtons = page.locator('button').filter({ hasText: /jan \d+ - |feb \d+ - |mar \d+ - /i });
      const presetCount = await presetButtons.count();

      expect(presetCount).toBeGreaterThan(0);
    });

    test('should auto-select most recent week on page load', async ({ page }) => {
      await page.goto('/analytics');
      await page.waitForLoadState('networkidle');

      const datePickerButton = page.locator('button').filter({ has: page.locator('svg.lucide-calendar') }).first();
      await expect(datePickerButton).toBeVisible({ timeout: 10000 });

      // Wait for auto-select effect to run
      await page.waitForTimeout(1000);

      const buttonText = await datePickerButton.textContent();

      // The button should show actual dates, not placeholder text
      const hasDateText = buttonText && /\d{4}|jan|feb|mar|apr/i.test(buttonText);
      expect(hasDateText).toBe(true);
    });

    test('should update available weeks when distributor view changes', async ({ page }) => {
      let lastDistributorView = '';

      // Track distributor view parameter in weeks requests
      await page.route('**/api/vendor-reports/weeks*', async (route) => {
        const url = new URL(route.request().url());
        lastDistributorView = url.searchParams.get('distributorView') || '';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockWeeks),
        });
      });

      await page.goto('/analytics');
      await page.waitForLoadState('networkidle');

      // Find the distributor view dropdown (the one showing "Manufacturing")
      // It's the second combobox, or we can find it by its content
      const distributorDropdown = page.locator('[role="combobox"]').filter({ hasText: /manufacturing/i }).first();
      await expect(distributorDropdown).toBeVisible({ timeout: 10000 });

      // Click to open the dropdown
      await distributorDropdown.click();
      await page.waitForTimeout(300);

      // Click on SOURCING option
      const sourcingOption = page.locator('[role="option"]').filter({ hasText: /sourcing/i }).first();
      await expect(sourcingOption).toBeVisible({ timeout: 5000 });
      await sourcingOption.click();
      await page.waitForTimeout(500);

      expect(lastDistributorView).toBe('SOURCING');
    });
  });

  test.describe('Date Picker Calendar Behavior', () => {
    test.beforeEach(async ({ page }) => {
      // Mock authentication endpoint
      await page.route('**/api/auth/me', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ user: { id: 1, email: TEST_EMAIL } }),
        });
      });

      // Mock vendor-reports with query params
      await page.route('**/api/vendor-reports?*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      // Mock vendor-reports base endpoint
      await page.route('**/api/vendor-reports', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      // Mock vendor-reports/asins endpoint
      await page.route('**/api/vendor-reports/asins*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      // Mock weeks endpoint
      await page.route('**/api/vendor-reports/weeks*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockWeeks),
        });
      });

      await page.route('**/api/config', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ amazonDomain: 'amazon.ca' }),
        });
      });

      await page.route('**/api/csrf-token', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ csrfToken: 'test-token' }),
        });
      });
    });

    test('should display calendar when date picker is clicked', async ({ page }) => {
      await page.goto('/analytics');
      await page.waitForLoadState('networkidle');

      const datePickerButton = page.locator('button').filter({ has: page.locator('svg.lucide-calendar') }).first();
      await expect(datePickerButton).toBeVisible({ timeout: 10000 });

      await datePickerButton.click();
      await page.waitForTimeout(500);

      // Calendar should be visible
      const calendar = page.locator('[role="grid"], .rdp-months, .rdp');
      await expect(calendar.first()).toBeVisible({ timeout: 5000 });
    });

    test('should have disabled dates for non-available weeks', async ({ page }) => {
      await page.goto('/analytics');
      await page.waitForLoadState('networkidle');

      const datePickerButton = page.locator('button').filter({ has: page.locator('svg.lucide-calendar') }).first();
      await expect(datePickerButton).toBeVisible({ timeout: 10000 });

      await datePickerButton.click();
      await page.waitForTimeout(500);

      // Look for disabled day buttons
      const disabledDays = page.locator('button[disabled], button[aria-disabled="true"]').filter({ hasText: /^\d{1,2}$/ });
      const disabledCount = await disabledDays.count();

      expect(disabledCount).toBeGreaterThan(0);
    });

    test('should select full week when clicking a week preset', async ({ page }) => {
      await page.goto('/analytics');
      await page.waitForLoadState('networkidle');

      const datePickerButton = page.locator('button').filter({ has: page.locator('svg.lucide-calendar') }).first();
      await expect(datePickerButton).toBeVisible({ timeout: 10000 });

      await datePickerButton.click();
      await page.waitForTimeout(500);

      // Click on the first week preset (Jan 26 - Feb 01)
      const firstPreset = page.locator('button').filter({ hasText: /jan 26/i }).first();
      await expect(firstPreset).toBeVisible({ timeout: 5000 });
      await firstPreset.click();
      await page.waitForTimeout(500);

      // After clicking preset, check the date picker shows the selected range
      await expect(page.locator('button').filter({ hasText: /jan 26.*2025/i }).first()).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Error Handling', () => {
    test.beforeEach(async ({ page }) => {
      // Mock authentication endpoint
      await page.route('**/api/auth/me', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ user: { id: 1, email: TEST_EMAIL } }),
        });
      });

      // Mock vendor-reports/asins endpoint
      await page.route('**/api/vendor-reports/asins*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.route('**/api/config', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ amazonDomain: 'amazon.ca' }),
        });
      });

      await page.route('**/api/csrf-token', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ csrfToken: 'test-token' }),
        });
      });
    });

    test('should handle API error gracefully', async ({ page }) => {
      await page.route('/api/vendor-reports/weeks*', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        });
      });

      await page.route('/api/vendor-reports', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto('/analytics');
      await page.waitForLoadState('networkidle');

      // Page should still load without crashing
      await expect(page.locator('body')).toBeVisible();
    });

    test('should handle empty weeks response', async ({ page }) => {
      await page.route('/api/vendor-reports/weeks*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.route('/api/vendor-reports', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto('/analytics');
      await page.waitForLoadState('networkidle');

      // Page should still load
      await expect(page.locator('body')).toBeVisible();

      // Date picker should still be visible
      const datePickerButton = page.locator('button').filter({ has: page.locator('svg.lucide-calendar') }).first();
      await expect(datePickerButton).toBeVisible({ timeout: 10000 });
    });

    test('should handle network timeout', async ({ page }) => {
      await page.route('/api/vendor-reports/weeks*', async (route) => {
        await new Promise(resolve => setTimeout(resolve, 10000));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockWeeks),
        });
      });

      await page.route('/api/vendor-reports', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto('/analytics');

      // Page should still render while waiting for weeks data
      await expect(page.locator('body')).toBeVisible({ timeout: 5000 });
    });
  });
});
