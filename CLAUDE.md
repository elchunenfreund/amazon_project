# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Amazon Tracker is a full-stack web application for tracking Amazon product availability, vendor analytics, and purchase orders. It features a React frontend with a Node.js/Express backend, integrates with Amazon SP-API (Selling Partner API) for vendor data, and uses Playwright for scraping product pages.

## Agent & Skills Usage Guidelines

**Always use specialized agents** for complex, multi-step tasks. Prefer the Task tool with appropriate subagent types:

- `Explore` - For codebase exploration, finding files, understanding architecture
- `Plan` - For designing implementation strategies before coding
- `feature-dev:code-reviewer` - For code reviews
- `feature-dev:code-explorer` - For deep analysis of existing features
- `feature-dev:code-architect` - For designing feature architectures

**Utilize npx skills** for common development workflows. Available skill categories:

| Category | Skills |
|----------|--------|
| **Development** | `feature-dev:feature-dev`, `frontend-design:frontend-design`, `tools:api-scaffold` |
| **Testing/TDD** | `tools:tdd-red`, `tools:tdd-green`, `tools:tdd-refactor`, `workflows:tdd-cycle` |
| **Code Quality** | `tools:refactor-clean`, `tools:tech-debt`, `code-review:code-review`, `workflows:full-review` |
| **Security** | `tools:security-scan`, `tools:deps-audit`, `workflows:security-hardening` |
| **Debugging** | `tools:smart-debug`, `tools:error-analysis`, `tools:debug-trace` |
| **Git/PR** | `workflows:git-workflow`, `tools:pr-enhance`, `tools:issue` |
| **Documentation** | `tools:doc-generate`, `tools:code-explain`, `tools:onboard` |

**Skill discovery**: When you can't find an appropriate skill or need additional functionality, run `npx skills find <query>` to search for available skills that might help.

**Parallel execution**: When tasks are independent, launch multiple agents in parallel using multiple Task tool calls in a single message for efficiency.

## Commands

```bash
# Install dependencies (root and client)
npm install
cd client && npm install

# Run the backend server (development)
node server.js

# Run the frontend dev server (in client/)
cd client && npm run dev

# Build frontend for production
cd client && npm run build

# Run frontend tests (Playwright)
cd client && npm test

# Initialize database tables
node init_db.js

# Run scheduled sync tasks (for Heroku Scheduler)
node scheduled-sync.js              # Sync everything
node scheduled-sync.js reports      # Sync only weekly vendor reports
node scheduled-sync.js po           # Sync only purchase orders
node scheduled-sync.js rt-inv       # Sync only RT Inventory
node scheduled-sync.js rt-sales     # Sync only RT Sales

# Run the product checker/scraper
node check_asin.js
```

## Architecture

### Tech Stack
- **Frontend**: React 19 + TypeScript + Vite
  - TanStack Query (data fetching/caching)
  - TanStack Table (data tables)
  - Radix UI + shadcn/ui-style components
  - Tailwind CSS
  - Recharts (charts/visualizations)
  - React Router (routing)
  - Socket.IO client (real-time updates)
- **Backend**: Express 5 (Node.js)
- **Database**: PostgreSQL (via `pg` library)
- **Real-time**: Socket.IO for live updates during scraper runs
- **Scraping**: Playwright-core for Amazon product page scraping
- **API Integration**: Amazon SP-API for vendor analytics and purchase orders
- **Testing**: Playwright for frontend E2E tests

### Key Files & Directories

| Path | Purpose |
|------|---------|
| `server.js` | Main Express application with all API routes (~5000 lines, monolithic) |
| `init_db.js` | Database schema initialization script |
| `check_asin.js` | Playwright-based Amazon scraper for product availability |
| `scheduled-sync.js` | Heroku Scheduler tasks for syncing vendor reports and POs |
| `views/*.ejs` | Legacy EJS templates (being replaced by React) |
| `client/` | React frontend application |
| `client/src/pages/` | Page components (Dashboard, Analytics, Products, Orders, History, etc.) |
| `client/src/components/` | Reusable UI components organized by feature |
| `client/src/hooks/` | Custom React hooks for data fetching (useAsins, useProducts, etc.) |
| `client/src/lib/api.ts` | API client with all backend endpoint functions |

### Frontend Structure (client/src/)

```
components/
├── analytics/    # Analytics page components (charts, filters, table)
├── dashboard/    # Dashboard components (ASIN table, modals, scraper progress)
├── layout/       # App shell, navbar, page wrappers
├── orders/       # Purchase order components
├── products/     # Products page components
├── shared/       # Shared components (DataTable, Modal, DateRangePicker)
└── ui/           # Base UI primitives (button, card, dialog, etc.)
pages/
├── Dashboard.tsx     # Main ASIN tracking dashboard
├── Analytics.tsx     # Vendor analytics with charts
├── Products.tsx      # Products management
├── Orders.tsx        # Purchase orders
├── History.tsx       # Historical data viewer
├── CatalogDetails.tsx # Product catalog details
└── ApiExplorer.tsx   # API debugging tool
hooks/
├── useAsins.ts       # ASIN data fetching
├── useProducts.ts    # Products data fetching
├── usePurchaseOrders.ts # PO data fetching
├── useVendorReports.ts  # Vendor reports data
├── useScraper.ts     # Scraper control
└── useSocket.ts      # Socket.IO connection
```

### Database Tables (PostgreSQL)

- `products` - ASINs to track with comments and snooze settings
- `daily_reports` - Scraped product data (availability, price, seller, ranking)
- `vendor_reports` - SP-API analytics data (sales, inventory, traffic)
- `purchase_orders` - Amazon vendor purchase orders
- `po_line_items` - Denormalized PO items for fast ASIN queries
- `catalog_details` - Product catalog info from SP-API
- `oauth_tokens` - Amazon SP-API OAuth credentials

### Authentication

The app uses Amazon SP-API OAuth flow:
1. `/auth/amazon/login` initiates OAuth
2. `/auth/amazon/callback` handles OAuth callback and stores tokens
3. Tokens are stored in `oauth_tokens` table and refreshed automatically

### Environment Variables

See `.env.example` for required configuration:
- `DATABASE_URL` - PostgreSQL connection string
- `LWA_CLIENT_ID` / `LWA_CLIENT_SECRET` - Amazon OAuth credentials
- `OAUTH_REDIRECT_URI` - OAuth callback URL
- `OAUTH_STATE_SECRET` - Secret for signing OAuth state tokens
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` - AWS credentials for SP-API
- `HEROKU_API` - Heroku API key (for deployment automation)

## API Patterns

All API routes are in `server.js`. Key patterns:
- Product CRUD: `/api/products/*`, `/api/asins/*`
- SP-API integration: `/api/sp-api/*`
- Vendor reports: `/api/vendor-reports/*`
- Purchase orders: `/api/purchase-orders/*`
- Catalog: `/api/catalog/*`

## Deployment

Configured for Heroku deployment:
- Uses `.buildpacks` and `.slugignore` for Heroku configuration
- Database SSL is auto-enabled when `DATABASE_URL` is present
- Scheduled tasks via Heroku Scheduler (see scheduled-sync.js header for recommended setup)
- Frontend is built with `npm run build` in `client/` and served statically
