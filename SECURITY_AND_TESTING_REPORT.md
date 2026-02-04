# Amazon Tracker - Comprehensive Security & Testing Audit Report

**Generated:** 2026-02-03
**Audited by:** 17 parallel analysis agents
**Total Issues Found:** 150+

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Critical Issues (Fix Immediately)](#critical-issues-fix-immediately)
3. [High Priority Issues](#high-priority-issues)
4. [Medium Priority Issues](#medium-priority-issues)
5. [Low Priority Issues](#low-priority-issues)
6. [Testing Recommendations](#testing-recommendations)
7. [Implementation Order](#implementation-order)

---

## Executive Summary

This report consolidates findings from 17 specialized security and testing agents that analyzed the entire Amazon Tracker codebase. The application has several **critical security vulnerabilities** that require immediate attention before production deployment.

### Risk Overview

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 12 | Immediate action required |
| High | 18 | Fix within 1 week |
| Medium | 45+ | Fix within 1 month |
| Low | 20+ | Address when possible |

### Key Statistics

- **Backend:** 82 API routes analyzed, ALL unprotected
- **Frontend:** 47 React issues identified
- **Database:** 135 queries analyzed, SQL injection vectors found
- **Dependencies:** 0 npm audit vulnerabilities, 1 deprecated package with known issues
- **Test Coverage:** Only 8 basic E2E tests exist

---

## Critical Issues (Fix Immediately)

### CRIT-01: Exposed Heroku API Key

**Location:** `.claude/settings.local.json:4-10`

**Issue:** A Heroku API key is hardcoded in configuration files.

**Risk:** Full access to Heroku account, ability to deploy malicious code, access to all environment variables.

**Fix:**
1. Immediately rotate the Heroku API key in Heroku Dashboard
2. Delete `.claude/settings.local.json` or remove the key
3. Add `.claude/` to `.gitignore`
4. Check Heroku audit logs for unauthorized access

**Testing:**
```bash
# Verify old key no longer works
curl -H "Authorization: Bearer OLD_KEY" https://api.heroku.com/apps
# Should return 401 Unauthorized
```

---

### CRIT-02: All API Routes Lack Authentication

**Location:** `server.js` - All `/api/*` endpoints (82 routes)

**Issue:** The `requireAuth` middleware exists but is NEVER applied to any route. All 82 API endpoints are publicly accessible.

**Affected Routes (sample):**
- `POST /api/sp-api/update-token` - Update OAuth tokens
- `POST /api/sp-api/store-tokens` - Store new tokens
- `DELETE /api/products/:asin` - Delete products
- `POST /api/scraper/start` - Start scraper
- `POST /api/purchase-orders/sync` - Sync POs

**Fix:**
```javascript
// server.js - Add to all sensitive routes
const { requireAuth } = require('./middleware/auth');

// Protect all /api routes
app.use('/api', requireAuth);

// Or individually:
app.get('/api/products', requireAuth, async (req, res) => { ... });
```

**Testing:**
```bash
# Before fix - should return data
curl http://localhost:3000/api/products

# After fix - should return 401
curl http://localhost:3000/api/products
# Expected: {"error": "Authentication required"}
```

---

### CRIT-03: SQL Injection via Dynamic Column Names

**Location:** `server.js:1596, 2180, 2207`

**Issue:** User-controlled column names from `req.body` are interpolated directly into SQL queries:
```javascript
updateFields.push(`"${key}" = $${paramIndex}`);  // key from req.body
```

**Attack Vector:** Send request with key like `"asin"; DROP TABLE products; --"`

**Fix:**
```javascript
// Create a whitelist of allowed columns
const ALLOWED_PRODUCT_COLUMNS = ['comment', 'sku', 'snooze_until', 'available', 'price'];

// Validate before using
for (const [key, value] of Object.entries(req.body)) {
    if (!ALLOWED_PRODUCT_COLUMNS.includes(key)) {
        return res.status(400).json({ error: `Invalid field: ${key}` });
    }
    updateFields.push(`"${key}" = $${paramIndex}`);
    values.push(value);
    paramIndex++;
}
```

**Testing:**
```javascript
// Test malicious column names are rejected
const maliciousPayloads = [
    { 'asin"; DROP TABLE products; --': 'value' },
    { 'comment" OR "1"="1': 'value' },
];

for (const payload of maliciousPayloads) {
    const response = await fetch('/api/asins/B001234567', {
        method: 'PUT',
        body: JSON.stringify(payload)
    });
    expect(response.status).toBe(400);
}
```

---

### CRIT-04: Hardcoded Admin Credentials

**Location:** `seed-admin.js:13-14`

**Issue:** Admin credentials are hardcoded in source code:
```javascript
const ADMIN_EMAIL = 'admin';
const ADMIN_PASSWORD = 'mechtig';
```

**Fix:**
```javascript
// seed-admin.js - Use environment variables
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in environment');
    process.exit(1);
}
```

**Testing:**
```bash
# Verify old credentials don't work after changing
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin","password":"mechtig"}'
# Should return 401
```

---

### CRIT-05: Amazon Cookies Committed to Git

**Location:** `amazon_cookies.json`

**Issue:** Real Amazon session tokens are tracked in git and visible in repository.

**Fix:**
```bash
# 1. Add to .gitignore
echo "amazon_cookies.json" >> .gitignore

# 2. Remove from git history (use BFG Repo-Cleaner)
java -jar bfg.jar --delete-files amazon_cookies.json

# 3. Force push cleaned history
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force
```

**Testing:**
```bash
# Verify file is ignored
git status --ignored | grep amazon_cookies.json
```

---

### CRIT-06: No Security Headers

**Location:** `server.js` (missing entirely)

**Issue:** The application has ZERO security headers configured:
- No Content-Security-Policy
- No X-Frame-Options
- No X-Content-Type-Options
- No Strict-Transport-Security
- No helmet.js

**Fix:**
```bash
npm install helmet
```

```javascript
// server.js - Add near top after express initialization
const helmet = require('helmet');
app.use(helmet());
```

**Testing:**
```bash
# Check headers are present
curl -I http://localhost:3000 | grep -E "(X-Frame|X-Content|Strict-Transport)"
```

---

### CRIT-07: No Database Transactions for Multi-Table Operations

**Location:** `server.js:5108-5199` (PO sync), `server.js:4120-4151` (vendor reports)

**Issue:** Multi-table operations are not wrapped in transactions. If the server crashes mid-operation, data is left in inconsistent state.

**Fix:**
```javascript
const client = await pool.connect();
try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO purchase_orders ...`);
    await client.query(`INSERT INTO po_line_items ...`);
    await client.query('COMMIT');
} catch (error) {
    await client.query('ROLLBACK');
    throw error;
} finally {
    client.release();
}
```

**Testing:**
```javascript
it('should rollback on partial failure', async () => {
    // Cause constraint violation mid-transaction
    // Verify no partial data remains
});
```

---

### CRIT-08: Session Fixation Vulnerability

**Location:** `routes/auth.js:65-110` (login), `routes/auth.js:13-62` (registration)

**Issue:** Session is not regenerated after login, allowing session fixation attacks.

**Fix:**
```javascript
// routes/auth.js - Login handler
req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Session error' });
    req.session.userId = user.id;
    res.json({ success: true });
});
```

**Testing:**
```javascript
it('should regenerate session on login', async () => {
    const initialSessionId = getSessionId();
    await login();
    const newSessionId = getSessionId();
    expect(newSessionId).not.toBe(initialSessionId);
});
```

---

### CRIT-09: Socket.IO Event Names Don't Match (React Client Broken)

**Location:** `server.js:539-593`, `client/src/hooks/useSocket.ts:43-57`

**Issue:** Server and client use different event names - React socket integration is completely non-functional.

| Server Emits | Client Expects |
|--------------|----------------|
| `scraper-log` | `scraper:progress` |
| `scraper-done` | `scraper:complete` |
| (none) | `scraper:error` |

**Fix Option A - Update Server:**
```javascript
// Emit structured data with correct event names
io.emit('scraper:progress', {
    current: parseInt(progressMatch[1]),
    total: parseInt(progressMatch[2]),
    asin: progressMatch[3],
    status: 'checking'
});

io.emit('scraper:complete', { timestamp: new Date().toISOString() });
```

**Testing:**
```javascript
it('should receive scraper progress updates', async () => {
    const socket = io('http://localhost:3000');
    const messages = [];
    socket.on('scraper:progress', (data) => messages.push(data));
    await fetch('/api/scraper/start', { method: 'POST' });
    await wait(5000);
    expect(messages.length).toBeGreaterThan(0);
});
```

---

### CRIT-10: No Rate Limiting

**Location:** `server.js` (missing entirely)

**Issue:** No rate limiting on any endpoints. Vulnerable to brute force and DoS attacks.

**Fix:**
```bash
npm install express-rate-limit
```

```javascript
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many login attempts' }
});

app.use('/api/auth/login', authLimiter);
```

**Testing:**
```javascript
it('should rate limit after 5 login attempts', async () => {
    for (let i = 0; i < 6; i++) {
        const response = await fetch('/api/auth/login', { method: 'POST', body: '{}' });
        if (i === 5) expect(response.status).toBe(429);
    }
});
```

---

### CRIT-11: OAuth Tokens Stored in Plaintext

**Location:** `server.js:2354-2409`

**Issue:** Refresh and access tokens are stored as plaintext in the database.

**Fix:**
```javascript
const crypto = require('crypto');
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY;

function encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

// Use when storing
await pool.query('INSERT INTO oauth_tokens ... VALUES ($1, ...)', [encrypt(token)]);
```

**Testing:**
```javascript
it('should store tokens encrypted', async () => {
    await storeTokens({ refresh_token: 'test_token_123' });
    const result = await pool.query('SELECT refresh_token FROM oauth_tokens');
    expect(result.rows[0].refresh_token).not.toContain('test_token_123');
});
```

---

### CRIT-12: Missing CSRF Protection

**Location:** All state-changing endpoints

**Issue:** No CSRF tokens implemented.

**Fix:**
```bash
npm install csurf
```

```javascript
const csrf = require('csurf');
app.use(csrf({ cookie: true }));

app.get('/api/csrf-token', (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
});
```

---

## High Priority Issues

### HIGH-01: Missing Global Error Handler

**Location:** `server.js` (missing)

**Fix:**
```javascript
// Add at END of all routes
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
});
```

---

### HIGH-02: 60+ Error Messages Leak Internal Details

**Location:** `server.js` - Multiple locations

**Issue:** Raw `err.message` sent to clients.

**Fix:**
```javascript
function handleApiError(res, err, userMessage = 'An error occurred') {
    console.error('API Error:', err);  // Log full error server-side
    res.status(500).json({ error: userMessage });  // Generic to client
}
```

---

### HIGH-03: No ASIN Validation on Most Endpoints

**Location:** 6+ endpoints in `server.js`

**Fix:**
```javascript
function validateAsin(req, res, next) {
    const asin = req.params.asin;
    if (!/^[A-Z0-9]{10}$/.test(asin?.toUpperCase())) {
        return res.status(400).json({ error: 'Invalid ASIN format' });
    }
    next();
}

app.get('/api/asins/:asin/history', validateAsin, async (req, res) => { ... });
```

---

### HIGH-04: Missing Password Strength Validation

**Location:** `routes/auth.js`

**Fix:**
```javascript
function validatePassword(password) {
    if (password.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(password)) return 'Must contain uppercase letter';
    if (!/[0-9]/.test(password)) return 'Must contain number';
    return null;
}
```

---

### HIGH-05: Scraper Cleanup Issues

**Location:** `check_asin.js:588-593`

**Fix:**
```javascript
} finally {
    try { if (browserInstance) await browserInstance.close(); } catch (e) {}
    try { await client.end(); } catch (e) {}
}
```

---

### HIGH-06: Infinite Timeout for CAPTCHA

**Location:** `check_asin.js:52`

**Fix:**
```javascript
await page.waitForSelector('#nav-global-location-popover-link', { timeout: 5 * 60 * 1000 });
```

---

### HIGH-07: Missing `sameSite` Cookie Attribute

**Location:** `server.js:36-40`

**Fix:**
```javascript
cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',  // Add this
    maxAge: 24 * 60 * 60 * 1000
}
```

---

### HIGH-08: Socket.IO No Authentication

**Location:** `server.js:16`

**Fix:**
```javascript
io.use((socket, next) => {
    const sessionId = socket.handshake.auth?.sessionId;
    if (!sessionId) return next(new Error('Authentication required'));
    // Verify session...
    next();
});
```

---

### HIGH-09: Multer 1.x Deprecated

**Location:** `package.json`

**Fix:** Monitor for multer 2.x release and upgrade. Until then, add strict file validation.

---

### HIGH-10: N+1 Query Problems

**Location:** `server.js:1426-1437, 2152-2213, 5173-5197`

**Fix:** Use bulk INSERT/UPDATE operations instead of loops.

---

## Medium Priority Issues

### MED-01: Frontend Missing Error States

**Location:** `Dashboard.tsx`, `Analytics.tsx`, `Products.tsx`

**Fix:**
```typescript
const { data, isLoading, isError, error, refetch } = useLatestAsins(filters);
if (isError) return <QueryError error={error} onRetry={refetch} />;
```

---

### MED-02: Zod Schema Defined But Not Connected

**Location:** `AddAsinModal.tsx`

**Fix:**
```typescript
const form = useForm({
    resolver: zodResolver(singleAsinSchema),  // Add this
    defaultValues: { asin: '', comment: '' },
});
```

---

### MED-03: Missing React.memo on Expensive Components

**Location:** `AnalyticsCharts`, `DashboardTable`, `DataTable`, `OrdersCalendar`

**Fix:**
```typescript
export const AnalyticsCharts = React.memo(function AnalyticsCharts(props) { ... });
```

---

### MED-04: Missing ARIA Labels

**Location:** Calendar and icon buttons

**Fix:**
```typescript
<Button aria-label="Previous month"><ChevronLeft /></Button>
```

---

### MED-05: Polling Without Condition

**Location:** `useScraper.ts`

**Fix:**
```typescript
refetchInterval: (query) => query.state.data?.running ? 2000 : false
```

---

### MED-06 to MED-10: Various Issues

- SSL certificate validation disabled
- Memory session store
- No request timeouts
- Large bundle size (1.3MB)
- Animation on large tables

---

## Low Priority Issues

- Hardcoded `amazon.ca` domain in 5 files
- Duplicated HistoryModal components
- TypeScript type assertions
- Console logging in production
- Missing indexes on some database queries

---

## Testing Recommendations

### E2E Tests Needed

1. **Authentication:** Login, logout, registration, session persistence
2. **ASIN Management:** Add, edit, delete, snooze, bulk operations
3. **Scraper:** Start, stop, progress updates, completion
4. **Data Display:** Tables, filtering, sorting, export
5. **Error Handling:** API failures, network errors, validation

### Security Tests Needed

1. SQL injection payloads on all inputs
2. XSS payloads in form fields
3. CSRF token validation
4. Rate limiting verification
5. Authentication bypass attempts

---

## Implementation Order

### Week 1 (Critical)
1. Rotate Heroku API key
2. Add `.gitignore` entries, remove sensitive files
3. Add `requireAuth` to all API routes
4. Add column name whitelist for SQL
5. Install helmet.js
6. Fix Socket.IO event names

### Week 2 (High)
7. Add global error handler
8. Add session regeneration
9. Encrypt OAuth tokens
10. Add rate limiting
11. Add CSRF protection
12. Fix ASIN validation

### Week 3 (Medium)
13. Add frontend error states
14. Connect Zod schemas
15. Add database transactions
16. Fix N+1 queries
17. Add React.memo
18. Add connection pool config

### Week 4 (Low + Testing)
19. Add E2E tests
20. Add unit tests
21. Fix accessibility issues
22. Optimize bundle size
23. Code cleanup

---

## Quick Reference Commands

```bash
# Install all security packages
npm install helmet express-rate-limit csurf connect-pg-simple

# Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Find all error exposures
grep -n "res.status(500).*err.message" server.js

# Run security audit
npm audit
```

---

**Report Generated:** 2026-02-03
**Next Review:** After implementing Critical and High priority fixes
