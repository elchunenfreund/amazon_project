-- Migration 001: Add performance indexes
-- Run with: psql $DATABASE_URL -f migrations/001_add_indexes.sql
-- Safe to re-run (uses IF NOT EXISTS)

-- Daily Reports - frequently queried by ASIN and date for product history
CREATE INDEX IF NOT EXISTS idx_daily_reports_asin_date
    ON daily_reports(asin, check_date DESC);

-- PO Line Items - compound index for receiving queries ordered by date
CREATE INDEX IF NOT EXISTS idx_po_line_items_asin_receiving
    ON po_line_items(asin, last_receiving_date DESC);

-- Vendor Reports - compound index for ASIN + type + date queries
CREATE INDEX IF NOT EXISTS idx_vendor_reports_asin_type_date
    ON vendor_reports(asin, report_type, report_date DESC);

-- Products - for changelog and update tracking queries
CREATE INDEX IF NOT EXISTS idx_products_updated_at
    ON products(updated_at DESC);

-- Purchase Orders - additional index for date range queries
CREATE INDEX IF NOT EXISTS idx_purchase_orders_po_date_desc
    ON purchase_orders(po_date DESC);

-- Verify indexes were created
DO $$
DECLARE
    idx_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO idx_count
    FROM pg_indexes
    WHERE tablename IN ('daily_reports', 'po_line_items', 'vendor_reports', 'products', 'purchase_orders')
    AND indexname LIKE 'idx_%';

    RAISE NOTICE 'Total performance indexes: %', idx_count;
END $$;
