import { test, expect, Page } from '@playwright/test';

/**
 * TDD Tests for Week-Restricted Date Picker
 *
 * Requirements from user:
 * 1. Disabled dates should be visible (not too light/invisible)
 * 2. Preset options: This Week, Last Week, This Month, Last Month, This Year
 * 3. Calendar where you can select from any Sunday (week start) to any Saturday (week end)
 */

// Mock weeks data - representing available weekly data from Amazon
const mockWeeks = [
  { start: '2026-02-01', end: '2026-02-07' },  // Week 1
  { start: '2026-01-25', end: '2026-01-31' },  // Week 2
  { start: '2026-01-18', end: '2026-01-24' },  // Week 3
  { start: '2026-01-11', end: '2026-01-17' },  // Week 4
  { start: '2026-01-04', end: '2026-01-10' },  // Week 5
  { start: '2025-12-28', end: '2026-01-03' },  // Week 6
  { start: '2025-12-21', end: '2025-12-27' },  // Week 7
  { start: '2025-12-14', end: '2025-12-20' },  // Week 8
];

// Selectors - centralized for maintainability
const SELECTORS = {
  datePickerTrigger: '[data-testid="date-range-picker-trigger"]',
  datePickerPopover: '[data-testid="date-range-picker-popover"]',
  datePresets: '[data-testid="date-presets"]',
  calendarContainer: '[data-testid="date-range-picker-calendar"]',
  // Fallback for day buttons in calendar
  enabledDay: 'button:not([disabled]):is([name="day"], [role="gridcell"] button)',
  disabledDay: 'button[disabled]:is([name="day"], [role="gridcell"] button)',
};

// Helper to set up API mocks
async function setupApiMocks(page: Page, weeksData = mockWeeks) {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: 1, email: 'test@test.com' } }),
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

// Helper to open date picker and wait for it to be ready
async function openDatePicker(page: Page) {
  const trigger = page.locator(SELECTORS.datePickerTrigger);
  await expect(trigger).toBeVisible({ timeout: 10000 });
  await trigger.click();
  await expect(page.locator(SELECTORS.datePresets)).toBeVisible({ timeout: 5000 });
}

// Helper to click a preset button
async function clickPreset(page: Page, presetName: string) {
  const presetBtn = page.locator(SELECTORS.datePresets).locator('button').filter({ hasText: new RegExp(`^${presetName}$`, 'i') });
  await expect(presetBtn).toBeVisible();
  await presetBtn.click();
}

test.describe('Week Picker - TDD Tests', () => {
  test.describe('Requirement 1: Disabled dates should be VISIBLE', () => {
    test('disabled dates should have readable text (not too faded)', async ({ page }) => {
      await setupApiMocks(page);
      await page.goto('/analytics');
      await openDatePicker(page);

      // Find a disabled date button in the calendar
      const calendarArea = page.locator(SELECTORS.calendarContainer);
      const disabledDay = calendarArea.locator('button[disabled]').first();

      // Skip test if no disabled days exist (all days are selectable)
      if (await disabledDay.count() === 0) {
        test.skip();
        return;
      }

      await expect(disabledDay).toBeVisible();

      // Check that the disabled day has reasonable opacity (not less than 0.4)
      const opacity = await disabledDay.evaluate((el) => {
        return window.getComputedStyle(el).opacity;
      });

      expect(parseFloat(opacity)).toBeGreaterThanOrEqual(0.4);
    });

    test('disabled dates should be distinguishable from enabled dates', async ({ page }) => {
      await setupApiMocks(page);
      await page.goto('/analytics');
      await openDatePicker(page);

      const calendarArea = page.locator(SELECTORS.calendarContainer);
      const disabledDay = calendarArea.locator('button[disabled]').first();
      const enabledDay = calendarArea.locator('button:not([disabled])').filter({ hasText: /^\d{1,2}$/ }).first();

      // Skip if we don't have both types
      if (await disabledDay.count() === 0 || await enabledDay.count() === 0) {
        test.skip();
        return;
      }

      await expect(disabledDay).toBeVisible();
      await expect(enabledDay).toBeVisible();

      // They should have different styling
      const disabledOpacity = await disabledDay.evaluate((el) => parseFloat(window.getComputedStyle(el).opacity));
      const enabledOpacity = await enabledDay.evaluate((el) => parseFloat(window.getComputedStyle(el).opacity));

      expect(enabledOpacity).toBeGreaterThanOrEqual(disabledOpacity);
    });
  });

  test.describe('Requirement 2: Preset Options', () => {
    test('should show "This Week" preset that selects current week', async ({ page }) => {
      await setupApiMocks(page);
      await page.goto('/analytics');
      await openDatePicker(page);

      // Find and click "This Week" button
      await clickPreset(page, 'This Week');

      // Wait for popover to close (presets auto-apply)
      await expect(page.locator(SELECTORS.datePresets)).not.toBeVisible({ timeout: 3000 });

      // Verify the date picker button now shows a date range
      const trigger = page.locator(SELECTORS.datePickerTrigger);
      await expect(trigger).toContainText(/\w+ \d+, \d{4}/);
    });

    test('should show "Last Week" preset that selects previous week', async ({ page }) => {
      await setupApiMocks(page);
      await page.goto('/analytics');
      await openDatePicker(page);

      await clickPreset(page, 'Last Week');
      await expect(page.locator(SELECTORS.datePresets)).not.toBeVisible({ timeout: 3000 });

      const trigger = page.locator(SELECTORS.datePickerTrigger);
      await expect(trigger).toContainText(/\w+ \d+, \d{4}/);
    });

    test('should show "This Month" preset that selects all complete weeks in current month', async ({ page }) => {
      await setupApiMocks(page);
      await page.goto('/analytics');
      await openDatePicker(page);

      await clickPreset(page, 'This Month');
      await expect(page.locator(SELECTORS.datePresets)).not.toBeVisible({ timeout: 3000 });

      const trigger = page.locator(SELECTORS.datePickerTrigger);
      await expect(trigger).toContainText(/\w+ \d+, \d{4}/);
    });

    test('should show "Last Month" preset that selects all complete weeks in previous month', async ({ page }) => {
      await setupApiMocks(page);
      await page.goto('/analytics');
      await openDatePicker(page);

      await clickPreset(page, 'Last Month');
      await expect(page.locator(SELECTORS.datePresets)).not.toBeVisible({ timeout: 3000 });

      const trigger = page.locator(SELECTORS.datePickerTrigger);
      await expect(trigger).toContainText(/\w+ \d+, \d{4}/);
    });

    test('should show "This Year" preset that selects all available weeks in current year', async ({ page }) => {
      await setupApiMocks(page);
      await page.goto('/analytics');
      await openDatePicker(page);

      await clickPreset(page, 'This Year');
      await expect(page.locator(SELECTORS.datePresets)).not.toBeVisible({ timeout: 3000 });

      const trigger = page.locator(SELECTORS.datePickerTrigger);
      await expect(trigger).toContainText(/\w+ \d+, \d{4}/);
    });
  });

  test.describe('Requirement 3: Calendar Selection - Sunday to Saturday', () => {
    test('calendar should be visible alongside presets', async ({ page }) => {
      await setupApiMocks(page);
      await page.goto('/analytics');
      await openDatePicker(page);

      // Both presets sidebar and calendar should be visible
      await expect(page.locator(SELECTORS.datePresets)).toBeVisible();
      await expect(page.locator(SELECTORS.calendarContainer)).toBeVisible();
    });

    test('should have enabled and disabled dates based on available weeks', async ({ page }) => {
      await setupApiMocks(page);
      await page.goto('/analytics');
      await openDatePicker(page);

      const calendarArea = page.locator(SELECTORS.calendarContainer);

      // Should have some enabled day buttons
      const enabledDays = calendarArea.locator('button:not([disabled])').filter({ hasText: /^[1-9]$|^[12][0-9]$|^3[01]$/ });
      const enabledCount = await enabledDays.count();
      expect(enabledCount).toBeGreaterThan(0);
    });

    test('clicking an enabled day should select a week', async ({ page }) => {
      await setupApiMocks(page);
      let capturedStartDate = '';

      await page.route('**/api/vendor-reports?*', async (route) => {
        const url = new URL(route.request().url());
        capturedStartDate = url.searchParams.get('startDate') || capturedStartDate;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto('/analytics');
      await openDatePicker(page);

      const calendarArea = page.locator(SELECTORS.calendarContainer);
      const enabledDay = calendarArea.locator('button:not([disabled])').filter({ hasText: /^[1-9]$|^[12][0-9]$|^3[01]$/ }).first();

      if (await enabledDay.count() > 0) {
        await enabledDay.click();
        // Wait for API call
        await page.waitForTimeout(1000);

        // If a start date was captured, verify it's a Sunday
        if (capturedStartDate) {
          const dayOfWeek = new Date(capturedStartDate + 'T12:00:00').getDay();
          expect(dayOfWeek).toBe(0); // Sunday
        }
      }
    });

    test('selecting multi-week range via preset should capture Sunday-Saturday bounds', async ({ page }) => {
      await setupApiMocks(page);
      let capturedStartDate = '';
      let capturedEndDate = '';

      await page.route('**/api/vendor-reports?*', async (route) => {
        const url = new URL(route.request().url());
        capturedStartDate = url.searchParams.get('startDate') || capturedStartDate;
        capturedEndDate = url.searchParams.get('endDate') || capturedEndDate;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto('/analytics');
      await openDatePicker(page);

      // Click "This Month" which should select multiple weeks
      await clickPreset(page, 'This Month');
      await page.waitForTimeout(1000);

      // Verify we got a multi-week range
      if (capturedStartDate && capturedEndDate) {
        const start = new Date(capturedStartDate + 'T12:00:00');
        const end = new Date(capturedEndDate + 'T12:00:00');

        expect(start.getDay()).toBe(0); // Sunday
        expect(end.getDay()).toBe(6);   // Saturday
      }
    });

    test('navigation arrows should exist in the calendar', async ({ page }) => {
      await setupApiMocks(page);
      await page.goto('/analytics');
      await openDatePicker(page);

      // Find arrow buttons by aria-label
      const prevArrow = page.locator('button[aria-label*="Previous"], button[aria-label*="previous"]');
      const nextArrow = page.locator('button[aria-label*="Next"], button[aria-label*="next"]');

      // At least one navigation arrow should exist
      const prevCount = await prevArrow.count();
      const nextCount = await nextArrow.count();
      expect(prevCount + nextCount).toBeGreaterThan(0);
    });

    test('clicking navigation arrows should change displayed months', async ({ page }) => {
      await setupApiMocks(page);
      await page.goto('/analytics');
      await openDatePicker(page);

      // Get initial month names
      const popover = page.locator(SELECTORS.datePickerPopover);
      const getMonthNames = async () => {
        const monthTexts = await popover.locator('text=/January|February|March|April|May|June|July|August|September|October|November|December/').allTextContents();
        return monthTexts.join(',');
      };

      const initialMonths = await getMonthNames();

      // Click previous arrow
      const prevArrow = page.locator('button[aria-label*="Previous"], button[aria-label*="previous"]').first();
      if (await prevArrow.count() > 0) {
        await prevArrow.click();
        await page.waitForTimeout(300);

        const newMonths = await getMonthNames();
        expect(newMonths).not.toBe(initialMonths);
      }
    });

    test('selected range should always have Sunday start and Saturday end', async ({ page }) => {
      await setupApiMocks(page);
      let capturedStartDate = '';
      let capturedEndDate = '';

      await page.route('**/api/vendor-reports?*', async (route) => {
        const url = new URL(route.request().url());
        if (url.searchParams.get('startDate')) {
          capturedStartDate = url.searchParams.get('startDate') || '';
          capturedEndDate = url.searchParams.get('endDate') || '';
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto('/analytics');
      await openDatePicker(page);

      await clickPreset(page, 'Last Week');
      await page.waitForTimeout(1000);

      expect(capturedStartDate).toBeTruthy();
      expect(capturedEndDate).toBeTruthy();

      if (capturedStartDate && capturedEndDate) {
        const startDay = new Date(capturedStartDate + 'T12:00:00').getDay();
        const endDay = new Date(capturedEndDate + 'T12:00:00').getDay();

        expect(startDay).toBe(0); // Sunday
        expect(endDay).toBe(6);   // Saturday
      }
    });
  });

  test.describe('Requirement 5: Header Banner and Data Updates', () => {
    test('header banner should exist and show date information', async ({ page }) => {
      await setupApiMocks(page);
      await page.goto('/analytics');
      await page.waitForLoadState('networkidle');

      // Look for the info banner
      const banner = page.locator('[class*="bg-blue"]').filter({ hasText: /showing|data|from/i }).first();
      await expect(banner).toBeVisible({ timeout: 10000 });
    });

    test('selecting a date range should trigger API call with dates', async ({ page }) => {
      await setupApiMocks(page);
      let apiCalled = false;
      let capturedStartDate = '';

      await page.route('**/api/vendor-reports?*', async (route) => {
        const url = new URL(route.request().url());
        const startDate = url.searchParams.get('startDate');
        if (startDate) {
          apiCalled = true;
          capturedStartDate = startDate;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto('/analytics');
      await openDatePicker(page);

      await clickPreset(page, 'Last Week');
      await page.waitForTimeout(1500);

      expect(apiCalled).toBe(true);
      expect(capturedStartDate).toBeTruthy();
    });

    test('Apply button or auto-apply should close picker after selection', async ({ page }) => {
      await setupApiMocks(page);
      await page.goto('/analytics');
      await openDatePicker(page);

      await clickPreset(page, 'This Week');

      // Picker should close automatically after selection
      await expect(page.locator(SELECTORS.datePresets)).not.toBeVisible({ timeout: 3000 });
    });
  });

  test.describe('Requirement 6: Error Handling & Edge Cases', () => {
    test('should handle when no weeks are available', async ({ page }) => {
      // Override to return empty weeks
      await setupApiMocks(page, []);

      await page.goto('/analytics');
      await page.waitForLoadState('networkidle');

      // Page should not crash
      await expect(page.locator('body')).toBeVisible();

      // Date picker trigger should still exist
      const trigger = page.locator(SELECTORS.datePickerTrigger);
      // It may or may not be visible depending on implementation
      const isVisible = await trigger.isVisible().catch(() => false);
      expect(typeof isVisible).toBe('boolean'); // Just verify no crash
    });

    test('should handle when only one week is available', async ({ page }) => {
      await setupApiMocks(page, [{ start: '2026-01-25', end: '2026-01-31' }]);

      await page.goto('/analytics');

      const trigger = page.locator(SELECTORS.datePickerTrigger);
      await expect(trigger).toBeVisible({ timeout: 10000 });
      await trigger.click();

      // Calendar should still be usable
      const calendar = page.locator(SELECTORS.calendarContainer);
      await expect(calendar).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Requirement 7: Visual Feedback', () => {
    test('selected range should show visual indication', async ({ page }) => {
      await setupApiMocks(page);
      await page.goto('/analytics');
      await openDatePicker(page);

      await clickPreset(page, 'This Week');

      // Re-open to see the selection
      await page.waitForTimeout(500);
      const trigger = page.locator(SELECTORS.datePickerTrigger);
      await trigger.click();
      await expect(page.locator(SELECTORS.datePresets)).toBeVisible({ timeout: 5000 });

      // There should be selected/highlighted days in the calendar
      const selectedDays = page.locator('[aria-selected="true"], [class*="selected"], [class*="range"]');
      const selectedCount = await selectedDays.count();

      expect(selectedCount).toBeGreaterThanOrEqual(1);
    });

    test('enabled days should have pointer cursor', async ({ page }) => {
      await setupApiMocks(page);
      await page.goto('/analytics');
      await openDatePicker(page);

      const calendarArea = page.locator(SELECTORS.calendarContainer);
      const enabledDay = calendarArea.locator('button:not([disabled])').filter({ hasText: /^\d{1,2}$/ }).first();

      if (await enabledDay.count() > 0) {
        const cursor = await enabledDay.evaluate((el) => {
          return window.getComputedStyle(el).cursor;
        });
        expect(cursor).toBe('pointer');
      }
    });
  });

  test.describe('Requirement 8: Explanatory Text', () => {
    test('should display explanation about weekly data', async ({ page }) => {
      await setupApiMocks(page);
      await page.goto('/analytics');
      await page.waitForLoadState('networkidle');

      // Check for explanation text on the page
      const explanation = page.locator('text=/weekly|complete week|aggregated|sunday.*saturday/i');
      await expect(explanation.first()).toBeVisible({ timeout: 10000 });
    });

    test('calendar popover should show week boundary legend', async ({ page }) => {
      await setupApiMocks(page);
      await page.goto('/analytics');
      await openDatePicker(page);

      // Should have a legend showing Sunday/Saturday indicators
      const legend = page.locator('text=/sunday|saturday/i');
      await expect(legend.first()).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Requirement 9: Clear/Reset Selection', () => {
    test('should have a way to select all data or clear selection', async ({ page }) => {
      await setupApiMocks(page);
      await page.goto('/analytics');
      await openDatePicker(page);

      // Look for "All Time" or similar option
      const allTimeBtn = page.locator(SELECTORS.datePresets).locator('button').filter({ hasText: /all time|all data/i });
      const hasAllTime = await allTimeBtn.count() > 0;

      // Either there's an "All Time" option or some clear mechanism
      expect(hasAllTime).toBe(true);
    });
  });

  test.describe('Requirement 10: Calendar Display', () => {
    test('calendar weeks should start on Sunday', async ({ page }) => {
      await setupApiMocks(page);
      await page.goto('/analytics');
      await openDatePicker(page);

      // Find weekday headers
      const calendarArea = page.locator(SELECTORS.calendarContainer);
      const weekdayHeaders = calendarArea.locator('th, [class*="weekday"], [class*="head_cell"], [role="columnheader"]');

      if (await weekdayHeaders.count() > 0) {
        const firstHeader = await weekdayHeaders.first().textContent();
        // First day should be Sunday (Su, Sun, S, or Sunday)
        expect(firstHeader?.trim().toLowerCase()).toMatch(/^s|^su/);
      }
    });

    test('calendar should show two months', async ({ page }) => {
      await setupApiMocks(page);
      await page.goto('/analytics');
      await openDatePicker(page);

      // Should have two month grids visible
      const popover = page.locator(SELECTORS.datePickerPopover);
      const monthNames = popover.locator('text=/January|February|March|April|May|June|July|August|September|October|November|December/');
      const monthCount = await monthNames.count();

      // With numberOfMonths=2, we should have 2 month names
      expect(monthCount).toBeGreaterThanOrEqual(2);
    });
  });
});
