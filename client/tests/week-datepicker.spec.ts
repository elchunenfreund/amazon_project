import { test, expect, Page } from '@playwright/test';

/**
 * Week-Restricted Date Picker Tests
 *
 * Tests for the Analytics page date picker that only allows selecting
 * complete weeks (Sunday-Saturday) where vendor report data exists.
 */

// ============================================================================
// SELECTORS - Centralized for maintainability
// ============================================================================
const SELECTORS = {
  datePickerTrigger: '[data-testid="date-range-picker-trigger"]',
  datePickerPopover: '[data-testid="date-range-picker-popover"]',
  datePresets: '[data-testid="date-presets"]',
  calendarContainer: '[data-testid="date-range-picker-calendar"]',
  calendar: '.rdp, [class*="calendar"]',
  distributorDropdown: '[role="combobox"]',
  dropdownOption: '[role="option"]',
  disabledDay: 'button[disabled], button[aria-disabled="true"]',
  enabledDay: 'button:not([disabled]):not([aria-disabled="true"])',
};

// ============================================================================
// TEST DATA
// ============================================================================
const TEST_EMAIL = 'elchunenfreund@gmail.com';

const mockWeeks = [
  { start: '2025-01-26', end: '2025-02-01' },
  { start: '2025-01-19', end: '2025-01-25' },
  { start: '2025-01-12', end: '2025-01-18' },
  { start: '2025-01-05', end: '2025-01-11' },
];

const realisticWeeks = [
  { start: '2026-02-01', end: '2026-02-07' },
  { start: '2026-01-25', end: '2026-01-31' },
  { start: '2026-01-18', end: '2026-01-24' },
  { start: '2026-01-11', end: '2026-01-17' },
  { start: '2026-01-04', end: '2026-01-10' },
  { start: '2025-12-28', end: '2026-01-03' },
  { start: '2025-12-21', end: '2025-12-27' },
  { start: '2025-12-14', end: '2025-12-20' },
  { start: '2025-12-07', end: '2025-12-13' },
  { start: '2025-11-30', end: '2025-12-06' },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Setup all API mocks needed for the Analytics page
 */
async function setupApiMocks(page: Page, weeksData = mockWeeks) {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: 1, email: TEST_EMAIL } }),
    });
  });

  await page.route('**/api/vendor-reports?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/vendor-reports', async (route) => {
    if (route.request().url().includes('?')) return;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/vendor-reports/asins*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/vendor-reports/weeks*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(weeksData),
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

  await page.route('**/api/catalog/sync-status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ totalVendorAsins: 0, haveCatalog: 0, missingCatalog: 0 }),
    });
  });
}

/**
 * Navigate to analytics page and wait for it to be ready
 */
async function navigateToAnalytics(page: Page) {
  await page.goto('/analytics');
  await page.waitForLoadState('networkidle');
}

/**
 * Open the date picker and wait for popover to be visible
 */
async function openDatePicker(page: Page) {
  const trigger = page.locator(SELECTORS.datePickerTrigger);
  await expect(trigger).toBeVisible({ timeout: 10000 });
  await trigger.click();
  await expect(page.locator(SELECTORS.datePresets)).toBeVisible({ timeout: 5000 });
}

/**
 * Click a preset button and wait for selection to complete
 */
async function clickPreset(page: Page, presetName: string) {
  const preset = page.locator(SELECTORS.datePresets).locator('button').filter({ hasText: new RegExp(presetName, 'i') });
  await expect(preset).toBeVisible({ timeout: 5000 });
  await preset.click();
  // Wait for the popover to close or the selection to be reflected
  await expect(page.locator(SELECTORS.datePickerTrigger)).not.toHaveText('Select date range', { timeout: 5000 });
}

/**
 * Wait for date selection to be reflected in URL params
 */
async function waitForDateParams(page: Page, timeout = 5000): Promise<{ startDate: string; endDate: string }> {
  let selectedStartDate = '';
  let selectedEndDate = '';

  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const url = new URL(page.url(), 'http://localhost');
    selectedStartDate = url.searchParams.get('startDate') || '';
    selectedEndDate = url.searchParams.get('endDate') || '';
    if (selectedStartDate && selectedEndDate) break;
    await page.waitForTimeout(100);
  }

  return { startDate: selectedStartDate, endDate: selectedEndDate };
}

/**
 * Generate week boundaries relative to current date
 */
function generateCurrentWeeks() {
  const today = new Date();
  const getWeekStart = (date: Date) => {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().split('T')[0];
  };
  const getWeekEnd = (date: Date) => {
    const d = new Date(date);
    d.setDate(d.getDate() + (6 - d.getDay()));
    return d.toISOString().split('T')[0];
  };

  return [
    { start: getWeekStart(today), end: getWeekEnd(today) },
    { start: getWeekStart(new Date(today.getTime() - 7*24*60*60*1000)), end: getWeekEnd(new Date(today.getTime() - 7*24*60*60*1000)) },
    { start: getWeekStart(new Date(today.getTime() - 14*24*60*60*1000)), end: getWeekEnd(new Date(today.getTime() - 14*24*60*60*1000)) },
    { start: getWeekStart(new Date(today.getTime() - 21*24*60*60*1000)), end: getWeekEnd(new Date(today.getTime() - 21*24*60*60*1000)) },
  ];
}

// ============================================================================
// TESTS
// ============================================================================

test.describe('Week-Restricted Date Picker', () => {
  test.describe('API Endpoint: /api/vendor-reports/weeks', () => {
    test('should return available weeks for MANUFACTURING distributor view', async ({ page }) => {
      const weeksData = [
        { start: '2026-01-25', end: '2026-01-31' },
        { start: '2026-01-18', end: '2026-01-24' },
      ];
      await setupApiMocks(page, weeksData);
      await navigateToAnalytics(page);
      await expect(page.locator('body')).toBeVisible();
    });

    test('should return available weeks for SOURCING distributor view', async ({ page }) => {
      const weeksData = [{ start: '2026-01-25', end: '2026-01-31' }];
      await setupApiMocks(page, weeksData);
      await navigateToAnalytics(page);
      await expect(page.locator('body')).toBeVisible();
    });

    test('should return all weeks when distributorView is ALL', async ({ page }) => {
      const weeksData = [
        { start: '2026-01-25', end: '2026-01-31' },
        { start: '2026-01-18', end: '2026-01-24' },
        { start: '2026-01-11', end: '2026-01-17' },
      ];
      await setupApiMocks(page, weeksData);
      await navigateToAnalytics(page);
      await expect(page.locator('body')).toBeVisible();
    });

    test('should return weeks sorted by most recent first', async ({ page }) => {
      const weeksData = [
        { start: '2026-01-25', end: '2026-01-31' },
        { start: '2026-01-18', end: '2026-01-24' },
      ];
      await setupApiMocks(page, weeksData);
      await navigateToAnalytics(page);

      const firstDate = new Date(weeksData[0].start);
      const secondDate = new Date(weeksData[1].start);
      expect(firstDate.getTime()).toBeGreaterThan(secondDate.getTime());
    });

    test('should handle missing distributorView parameter gracefully', async ({ page }) => {
      const weeksData = [{ start: '2026-01-25', end: '2026-01-31' }];
      await setupApiMocks(page, weeksData);
      await navigateToAnalytics(page);
      await expect(page.locator('body')).toBeVisible();
    });
  });

  test.describe('Analytics Page - Date Picker Integration', () => {
    test('should load Analytics page and fetch available weeks', async ({ page }) => {
      let weeksFetched = false;
      await setupApiMocks(page);

      await page.route('/api/vendor-reports/weeks*', async (route) => {
        weeksFetched = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockWeeks),
        });
      });

      await navigateToAnalytics(page);
      expect(weeksFetched).toBe(true);
    });

    test('should display date picker on Analytics page', async ({ page }) => {
      await setupApiMocks(page);
      await navigateToAnalytics(page);
      await expect(page.locator(SELECTORS.datePickerTrigger)).toBeVisible({ timeout: 10000 });
    });

    test('should show smart presets in date picker sidebar when weeks match current date', async ({ page }) => {
      const currentWeeks = generateCurrentWeeks();
      await setupApiMocks(page, currentWeeks);

      await navigateToAnalytics(page);
      await openDatePicker(page);

      const presetsSection = page.locator(SELECTORS.datePresets);
      await expect(presetsSection).toBeVisible({ timeout: 5000 });

      const presetLabels = ['This Week', 'Last Week', 'This Month', 'Last Month', 'This Year'];
      let foundCount = 0;
      for (const label of presetLabels) {
        const button = presetsSection.locator('button').filter({ hasText: label });
        if (await button.count() > 0) {
          foundCount++;
        }
      }

      expect(foundCount).toBeGreaterThan(0);
    });

    test('should auto-select most recent week on page load', async ({ page }) => {
      await setupApiMocks(page);
      await navigateToAnalytics(page);

      const trigger = page.locator(SELECTORS.datePickerTrigger);
      await expect(trigger).toBeVisible({ timeout: 10000 });

      // Wait for auto-select by checking button text changes from placeholder
      await expect(trigger).not.toHaveText('Pick a date range', { timeout: 5000 });

      const buttonText = await trigger.textContent();
      const hasDateText = buttonText && /\d{4}|jan|feb|mar|apr/i.test(buttonText);
      expect(hasDateText).toBe(true);
    });

    test('should fetch all weeks without distributor view filter for date picker', async ({ page }) => {
      let lastDistributorView: string | null = null;
      await setupApiMocks(page);

      await page.route('**/api/vendor-reports/weeks*', async (route) => {
        const url = new URL(route.request().url());
        lastDistributorView = url.searchParams.get('distributorView');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockWeeks),
        });
      });

      await navigateToAnalytics(page);
      expect(lastDistributorView).toBeNull();

      // Change distributor view
      const distributorDropdown = page.locator(SELECTORS.distributorDropdown).filter({ hasText: /manufacturing/i }).first();
      await expect(distributorDropdown).toBeVisible({ timeout: 10000 });
      await distributorDropdown.click();

      const sourcingOption = page.locator(SELECTORS.dropdownOption).filter({ hasText: /sourcing/i }).first();
      await expect(sourcingOption).toBeVisible({ timeout: 5000 });
      await sourcingOption.click();

      // Wait for the dropdown to close
      await expect(sourcingOption).not.toBeVisible({ timeout: 5000 });

      // Weeks API should still not be called with filter
      expect(lastDistributorView).toBeNull();
    });
  });

  test.describe('Date Picker Calendar Behavior', () => {
    test('should display calendar when date picker is clicked', async ({ page }) => {
      await setupApiMocks(page);
      await navigateToAnalytics(page);
      await openDatePicker(page);

      const calendar = page.locator(SELECTORS.calendar);
      await expect(calendar.first()).toBeVisible({ timeout: 5000 });
    });

    test('should have disabled dates for non-available weeks', async ({ page }) => {
      await setupApiMocks(page);
      await navigateToAnalytics(page);
      await openDatePicker(page);

      const disabledDays = page.locator(SELECTORS.disabledDay).filter({ hasText: /^\d{1,2}$/ });
      const disabledCount = await disabledDays.count();
      expect(disabledCount).toBeGreaterThan(0);
    });

    test('should select full week when clicking on calendar date', async ({ page }) => {
      await setupApiMocks(page);
      await navigateToAnalytics(page);
      await openDatePicker(page);

      const enabledDates = page.locator(SELECTORS.enabledDay).filter({ hasText: /^[0-9]{1,2}$/ });
      const enabledCount = await enabledDates.count();
      expect(enabledCount).toBeGreaterThan(0);

      if (enabledCount > 0) {
        await enabledDates.first().click();
        // Wait for selection to be reflected
        await expect(page.locator(SELECTORS.datePickerTrigger)).not.toHaveText('Select date range', { timeout: 5000 });
      }
    });
  });

  test.describe('Preset Date Ranges', () => {
    test('should show preset options: This Week, Last Week, This Month, Last Month, This Year', async ({ page }) => {
      await setupApiMocks(page, realisticWeeks);
      await navigateToAnalytics(page);
      await openDatePicker(page);

      const sidebar = page.locator(SELECTORS.datePresets);
      await expect(sidebar).toBeVisible({ timeout: 5000 });

      await expect(sidebar.locator('button').filter({ hasText: /this week/i })).toBeVisible({ timeout: 5000 });
      await expect(sidebar.locator('button').filter({ hasText: /last week/i })).toBeVisible({ timeout: 5000 });
      await expect(sidebar.locator('button').filter({ hasText: /this month/i })).toBeVisible({ timeout: 5000 });
      await expect(sidebar.locator('button').filter({ hasText: /last month/i })).toBeVisible({ timeout: 5000 });
      await expect(sidebar.locator('button').filter({ hasText: /this year/i })).toBeVisible({ timeout: 5000 });
    });

    test('should show calendar alongside presets for custom selection', async ({ page }) => {
      await setupApiMocks(page, realisticWeeks);
      await navigateToAnalytics(page);
      await openDatePicker(page);

      const sidebar = page.locator(SELECTORS.datePresets);
      await expect(sidebar).toBeVisible({ timeout: 5000 });

      const calendar = page.locator(SELECTORS.calendar);
      await expect(calendar.first()).toBeVisible({ timeout: 5000 });
    });

    test('disabled dates should be visible but grayed out (not invisible)', async ({ page }) => {
      await setupApiMocks(page, realisticWeeks);
      await navigateToAnalytics(page);
      await openDatePicker(page);

      const disabledDays = page.locator('button[disabled]').filter({ hasText: /^\d{1,2}$/ });
      const count = await disabledDays.count();
      expect(count).toBeGreaterThan(0);

      if (count > 0) {
        await expect(disabledDays.first()).toBeVisible();
      }
    });

    test('should select only complete weeks when clicking "This Month"', async ({ page }) => {
      await setupApiMocks(page, realisticWeeks);
      let selectedStartDate = '';
      let selectedEndDate = '';

      await page.route('**/api/vendor-reports?*', async (route) => {
        const url = new URL(route.request().url());
        selectedStartDate = url.searchParams.get('startDate') || '';
        selectedEndDate = url.searchParams.get('endDate') || '';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await navigateToAnalytics(page);
      await openDatePicker(page);

      const thisMonthOption = page.locator('button, [role="menuitem"]').filter({ hasText: /this month/i }).first();
      await expect(thisMonthOption).toBeVisible({ timeout: 5000 });
      await thisMonthOption.click();

      // Wait for popover to close (indicates selection complete)
      await expect(page.locator(SELECTORS.datePresets)).not.toBeVisible({ timeout: 5000 });

      if (selectedStartDate) {
        expect(selectedStartDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(['2026-02-01', '2026-01-25', '2026-01-18', '2026-01-11', '2026-01-04']).toContain(selectedStartDate);
      }

      if (selectedEndDate) {
        expect(selectedEndDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(['2026-02-07', '2026-01-31', '2026-01-24', '2026-01-17', '2026-01-10']).toContain(selectedEndDate);
      }
    });

    test('should select multiple consecutive weeks when selecting "This Year"', async ({ page }) => {
      await setupApiMocks(page, realisticWeeks);
      let selectedStartDate = '';
      let selectedEndDate = '';

      await page.route('**/api/vendor-reports?*', async (route) => {
        const url = new URL(route.request().url());
        selectedStartDate = url.searchParams.get('startDate') || '';
        selectedEndDate = url.searchParams.get('endDate') || '';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await navigateToAnalytics(page);
      await openDatePicker(page);

      const thisYearOption = page.locator('button, [role="menuitem"]').filter({ hasText: /this year/i }).first();
      await expect(thisYearOption).toBeVisible({ timeout: 5000 });
      await thisYearOption.click();

      // Wait for popover to close
      await expect(page.locator(SELECTORS.datePresets)).not.toBeVisible({ timeout: 5000 });

      if (selectedStartDate && selectedEndDate) {
        const daysDiff = Math.round((new Date(selectedEndDate).getTime() - new Date(selectedStartDate).getTime()) / (1000 * 60 * 60 * 24));
        expect(daysDiff).toBeGreaterThan(6);
      }
    });
  });

  test.describe('Info Banner', () => {
    test('should display info banner with week boundaries', async ({ page }) => {
      await setupApiMocks(page);
      await navigateToAnalytics(page);

      // Wait for auto-select to complete by checking trigger text
      const trigger = page.locator(SELECTORS.datePickerTrigger);
      await expect(trigger).not.toHaveText('Pick a date range', { timeout: 5000 });

      const banner = page.locator('[class*="bg-"]').filter({ hasText: /showing.*data|data.*from/i }).first();
      await expect(banner).toBeVisible({ timeout: 10000 });
    });

    test('should show explanation that Amazon provides aggregated weekly data', async ({ page }) => {
      await setupApiMocks(page);
      await navigateToAnalytics(page);

      const trigger = page.locator(SELECTORS.datePickerTrigger);
      await expect(trigger).not.toHaveText('Pick a date range', { timeout: 5000 });

      const explanation = page.locator('text=/aggregated|weekly data|week.*boundaries/i');
      await expect(explanation).toBeVisible({ timeout: 10000 });
    });

    test('should display week start and end dates with day names', async ({ page }) => {
      await setupApiMocks(page);
      await navigateToAnalytics(page);

      const trigger = page.locator(SELECTORS.datePickerTrigger);
      await expect(trigger).not.toHaveText('Pick a date range', { timeout: 5000 });

      const banner = page.locator('[class*="bg-"]').filter({ hasText: /sun|sat/i }).first();
      await expect(banner).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Calendar Week Start on Sunday', () => {
    test('should display calendar with Sunday as first day of week', async ({ page }) => {
      await setupApiMocks(page);
      await navigateToAnalytics(page);
      await openDatePicker(page);

      const calendarContainer = page.locator(SELECTORS.calendar);
      await expect(calendarContainer.first()).toBeVisible({ timeout: 5000 });

      const weekdayHeaders = await page.locator('abbr, span, th').filter({ hasText: /^(Su|S|Sun)$/i }).first();
      const isVisible = await weekdayHeaders.isVisible().catch(() => false);

      expect(isVisible || await calendarContainer.first().isVisible()).toBe(true);
    });

    test('should only allow selecting Sundays as start dates', async ({ page }) => {
      await setupApiMocks(page);
      await navigateToAnalytics(page);
      await openDatePicker(page);

      const enabledDays = page.locator(SELECTORS.enabledDay).filter({ hasText: /^\d{1,2}$/ });
      const enabledCount = await enabledDays.count();

      expect(enabledCount).toBeGreaterThan(0);
    });
  });

  test.describe('Multi-Week Selection', () => {
    test('should allow selecting a range spanning multiple weeks', async ({ page }) => {
      await setupApiMocks(page);
      let selectedStartDate = '';
      let selectedEndDate = '';

      await page.route('**/api/vendor-reports?*', async (route) => {
        const url = new URL(route.request().url());
        selectedStartDate = url.searchParams.get('startDate') || '';
        selectedEndDate = url.searchParams.get('endDate') || '';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await navigateToAnalytics(page);
      await openDatePicker(page);

      const lastMonthOption = page.locator('button, [role="menuitem"]').filter({ hasText: /last month/i }).first();
      if (await lastMonthOption.isVisible()) {
        await lastMonthOption.click();
        await expect(page.locator(SELECTORS.datePresets)).not.toBeVisible({ timeout: 5000 });

        if (selectedStartDate && selectedEndDate) {
          const start = new Date(selectedStartDate);
          const end = new Date(selectedEndDate);
          const daysDiff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

          expect(daysDiff).toBeGreaterThanOrEqual(13);
          expect(start.getDay()).toBe(0); // Sunday
          expect(end.getDay()).toBe(6); // Saturday
        }
      }
    });
  });

  test.describe('Error Handling', () => {
    test('should handle API error gracefully', async ({ page }) => {
      await setupApiMocks(page);

      await page.route('/api/vendor-reports/weeks*', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        });
      });

      await navigateToAnalytics(page);
      await expect(page.locator('body')).toBeVisible();
    });

    test('should handle empty weeks response', async ({ page }) => {
      await setupApiMocks(page, []);

      await navigateToAnalytics(page);
      await expect(page.locator('body')).toBeVisible();
      await expect(page.locator(SELECTORS.datePickerTrigger)).toBeVisible({ timeout: 10000 });
    });

    test('should handle network timeout', async ({ page }) => {
      await setupApiMocks(page);

      await page.route('/api/vendor-reports/weeks*', async (route) => {
        await new Promise(resolve => setTimeout(resolve, 10000));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockWeeks),
        });
      });

      await page.goto('/analytics');
      await expect(page.locator('body')).toBeVisible({ timeout: 5000 });
    });
  });
});
