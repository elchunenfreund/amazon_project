# Handoff Report: Week-Restricted Date Picker

## Status: DEPLOYED BUT NOT WORKING

The code has been pushed to GitHub and deployed to Heroku, but the feature is not functioning correctly on the live/local site.

---

## What Was Implemented

### Goal
Create a date picker for the Analytics page that only allows selecting complete weeks where vendor report data exists (Sunday-Saturday boundaries).

### Files Changed (Commit 2cae284f)

1. **server.js** - Added `/api/vendor-reports/weeks` endpoint
   - Returns distinct week boundaries from vendor_reports table
   - Filters by `distributorView` parameter (MANUFACTURING, SOURCING, or all)
   - Returns `{ start: string, end: string }[]` sorted by most recent first

2. **client/src/lib/api.ts** - Added `getWeeks()` function
   ```typescript
   getWeeks: (distributorView?: string) => {
     const params = new URLSearchParams()
     if (distributorView) params.set('distributorView', distributorView)
     const query = params.toString()
     return request<{ start: string; end: string }[]>(`/vendor-reports/weeks${query ? `?${query}` : ''}`)
   }
   ```

3. **client/src/hooks/useVendorReports.ts** - Added `useAvailableWeeks` hook
   ```typescript
   export function useAvailableWeeks(distributorView?: string) {
     return useQuery({
       queryKey: ['vendor-reports', 'weeks', distributorView],
       queryFn: () => vendorReportsApi.getWeeks(distributorView),
     })
   }
   ```

4. **client/src/components/shared/DateRangePicker.tsx** - Complete rewrite
   - Accepts `availableWeeks?: WeekBoundary[]` prop
   - Disables all dates except valid week start/end dates
   - Auto-selects full week when clicking any date in a week
   - Shows available weeks as clickable presets in sidebar (max 8)
   - Styles week starts (blue) and week ends (green) differently
   - Falls back to normal date picker behavior when no `availableWeeks` provided

5. **client/src/components/analytics/AnalyticsFilters.tsx** - Integration
   - Uses `useAvailableWeeks(distributorView)` hook
   - Passes available weeks to DateRangePicker
   - Auto-selects most recent week when page loads (if no date selected)

---

## Known Issues

### API Endpoint Not Responding
When testing locally, the browser console showed:
```
Failed to load resource: /api/vendor-reports/weeks?distributorView=MANUFACTURING
```

**Possible causes:**
1. Local server needs restart to pick up new `server.js` changes
2. The endpoint code might have a bug (query syntax, column names, etc.)

### Debug Steps Needed
1. Restart the backend server: `node server.js`
2. Test the endpoint directly: `curl http://localhost:3000/api/vendor-reports/weeks?distributorView=MANUFACTURING`
3. Check server logs for SQL errors
4. Verify `data_start_date` and `data_end_date` columns exist and have data

---

## Server Endpoint Code (server.js)

The endpoint was added around line ~1540 (search for `/api/vendor-reports/weeks`):

```javascript
app.get('/api/vendor-reports/weeks', async (req, res) => {
    try {
        const { distributorView } = req.query;

        let query = `
            SELECT DISTINCT data_start_date as start, data_end_date as end
            FROM vendor_reports
            WHERE report_type = 'GET_VENDOR_SALES_REPORT'
              AND data_start_date IS NOT NULL
              AND data_end_date IS NOT NULL
        `;
        const params = [];

        if (distributorView && distributorView !== 'ALL') {
            query += ` AND distributor_view = $1`;
            params.push(distributorView);
        }

        query += ` ORDER BY data_start_date DESC`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching available weeks:', error);
        res.status(500).json({ error: 'Failed to fetch available weeks' });
    }
});
```

---

## Expected Behavior When Working

1. **On page load**: DateRangePicker fetches available weeks from API
2. **Calendar display**:
   - Week start dates highlighted in blue
   - Week end dates highlighted in green
   - All other dates are disabled/grayed out
3. **Clicking a date**: Auto-selects the full week (Sunday-Saturday)
4. **Sidebar presets**: Shows list of available weeks for quick selection
5. **Auto-select**: Most recent week is auto-selected when page loads

---

## Testing Checklist

- [ ] Backend server running with latest code
- [ ] `/api/vendor-reports/weeks` returns data
- [ ] DateRangePicker shows week presets in sidebar
- [ ] Disabled dates are grayed out
- [ ] Clicking a week date selects the full week
- [ ] Switching distributor view updates available weeks
- [ ] Most recent week auto-selected on load

---

## Related Context

### Previous Work in This Session
- Fixed duplicate vendor report data by adding `distributor_view` column
- Added distributor view dropdown (Manufacturing/Sourcing/All) to Analytics
- Researched why SP-API numbers differ from Vendor Central (proration at month boundaries)
- Verified raw data includes all expected fields (orderedUnits, glanceViews, etc.)

### Database Schema Notes
- `vendor_reports` table has `data_start_date` and `data_end_date` columns (weekly boundaries)
- `distributor_view` column stores 'MANUFACTURING' or 'SOURCING'
- Unique constraint: `(report_type, asin, data_start_date, distributor_view)`

---

## Commands for Next Agent

```bash
# Start backend server
cd /Users/elchu/amazon_project
node server.js

# Start frontend dev server
cd /Users/elchu/amazon_project/client
npm run dev

# Test the weeks endpoint
curl "http://localhost:3000/api/vendor-reports/weeks?distributorView=MANUFACTURING"

# Check database for week data
psql $DATABASE_URL -c "SELECT DISTINCT data_start_date, data_end_date FROM vendor_reports WHERE data_start_date IS NOT NULL LIMIT 10;"
```
