const { Client } = require('pg');
const { getDatabaseConfig } = require('./lib/db-config');

const client = new Client(getDatabaseConfig());

(async () => {
    try {
        await client.connect();
        console.log("🛠️ Initializing database tables...");

        // 1. Create the Products table (where you store ASINs to track)
        await client.query(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                asin TEXT UNIQUE NOT NULL,
                comment TEXT,
                snooze_until TIMESTAMP
            );
        `);
        console.log("✅ Table 'products' is ready.");

        // Add new columns if they don't exist (for existing databases)
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='comment') THEN
                    ALTER TABLE products ADD COLUMN comment TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='snooze_until') THEN
                    ALTER TABLE products ADD COLUMN snooze_until TIMESTAMP;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='updated_fields') THEN
                    ALTER TABLE products ADD COLUMN updated_fields JSONB;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='updated_at') THEN
                    ALTER TABLE products ADD COLUMN updated_at TIMESTAMP;
                END IF;
            END $$;
        `);
        console.log("✅ Table 'products' columns verified.");

        // 2. Create the Daily Reports table (where results are saved)
        await client.query(`
            CREATE TABLE IF NOT EXISTS daily_reports (
                id SERIAL PRIMARY KEY,
                asin TEXT NOT NULL,
                header TEXT,
                availability TEXT,
                stock_level TEXT,
                seller TEXT,
                price TEXT,
                ranking TEXT,
                check_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Table 'daily_reports' is ready.");

        // 3. Create the Vendor Reports table (for SP-API analytics reports)
        await client.query(`
            CREATE TABLE IF NOT EXISTS vendor_reports (
                id SERIAL PRIMARY KEY,
                report_type TEXT NOT NULL,
                report_id TEXT,
                asin TEXT,
                report_date DATE NOT NULL,
                data JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        // Add index for faster queries
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vendor_reports_asin_date ON vendor_reports(asin, report_date);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vendor_reports_type_date ON vendor_reports(report_type, report_date);
        `);
        // Add unique constraint for upserts (skip if duplicates exist)
        try {
            await client.query(`
                CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_reports_unique
                ON vendor_reports(report_type, asin, report_date);
            `);
        } catch (indexErr) {
            console.log("⚠️ Note: vendor_reports unique index skipped (may have duplicates)");
        }
        // Add new columns for tracking actual data period (for RT reports fix)
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendor_reports' AND column_name='data_start_date') THEN
                    ALTER TABLE vendor_reports ADD COLUMN data_start_date DATE;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendor_reports' AND column_name='data_end_date') THEN
                    ALTER TABLE vendor_reports ADD COLUMN data_end_date DATE;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendor_reports' AND column_name='report_request_date') THEN
                    ALTER TABLE vendor_reports ADD COLUMN report_request_date TIMESTAMP;
                END IF;
            END $$;
        `);
        console.log("✅ Table 'vendor_reports' is ready.");

        // 4. Create the Catalog Details table (for product catalog info)
        await client.query(`
            CREATE TABLE IF NOT EXISTS catalog_details (
                id SERIAL PRIMARY KEY,
                asin TEXT UNIQUE NOT NULL,
                title TEXT,
                brand TEXT,
                product_type TEXT,
                images JSONB,
                attributes JSONB,
                dimensions JSONB,
                identifiers JSONB,
                sales_ranks JSONB,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Table 'catalog_details' is ready.");

        // 5. Create the Purchase Orders table (for vendor PO tracking)
        await client.query(`
            CREATE TABLE IF NOT EXISTS purchase_orders (
                id SERIAL PRIMARY KEY,
                po_number TEXT UNIQUE NOT NULL,
                po_date TIMESTAMP,
                po_status TEXT,
                ship_window_start TIMESTAMP,
                ship_window_end TIMESTAMP,
                delivery_window_start TIMESTAMP,
                delivery_window_end TIMESTAMP,
                buying_party JSONB,
                selling_party JSONB,
                ship_to_party JSONB,
                bill_to_party JSONB,
                items JSONB,
                raw_data JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_purchase_orders_date ON purchase_orders(po_date);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(po_status);
        `);
        console.log("✅ Table 'purchase_orders' is ready.");

        // 5b. Create PO Line Items table (denormalized for faster ASIN queries)
        await client.query(`
            CREATE TABLE IF NOT EXISTS po_line_items (
                id SERIAL PRIMARY KEY,
                po_number TEXT NOT NULL,
                asin TEXT NOT NULL,
                vendor_sku TEXT,
                ordered_quantity INTEGER,
                acknowledged_quantity INTEGER,
                net_cost_amount DECIMAL(10,2),
                net_cost_currency TEXT,
                product_title TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_po_line_items_asin ON po_line_items(asin);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_po_line_items_po ON po_line_items(po_number);
        `);
        await client.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_po_line_items_unique ON po_line_items(po_number, asin);
        `);
        // Add received_quantity column if it doesn't exist
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='po_line_items' AND column_name='received_quantity') THEN
                    ALTER TABLE po_line_items ADD COLUMN received_quantity INTEGER;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='po_line_items' AND column_name='receiving_status') THEN
                    ALTER TABLE po_line_items ADD COLUMN receiving_status TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='po_line_items' AND column_name='last_receiving_date') THEN
                    ALTER TABLE po_line_items ADD COLUMN last_receiving_date TIMESTAMP;
                END IF;
            END $$;
        `);
        console.log("✅ Table 'po_line_items' is ready.");

        // 6. Create OAuth Tokens table (if not exists)
        await client.query(`
            CREATE TABLE IF NOT EXISTS oauth_tokens (
                id SERIAL PRIMARY KEY,
                refresh_token TEXT,
                access_token TEXT,
                expires_at TIMESTAMP,
                selling_partner_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Table 'oauth_tokens' is ready.");

        // 7. Create Users table (for authentication)
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                name VARCHAR(255),
                role VARCHAR(50) DEFAULT 'user',
                company_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Table 'users' is ready.");

        // 8. Create Session table for connect-pg-simple
        await client.query(`
            CREATE TABLE IF NOT EXISTS "user_sessions" (
                "sid" varchar NOT NULL COLLATE "default",
                "sess" json NOT NULL,
                "expire" timestamp(6) NOT NULL,
                CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
            );
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "user_sessions" ("expire");
        `);
        console.log("✅ Table 'user_sessions' is ready.");

        // 9. Add performance indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_daily_reports_asin_date ON daily_reports(asin, check_date DESC);
        `);
        // Index for daily_reports queries by date only
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(check_date DESC);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_po_line_items_asin_receiving ON po_line_items(asin, last_receiving_date DESC);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vendor_reports_asin_type_date ON vendor_reports(asin, report_type, report_date DESC);
        `);
        // Index for vendor_reports queries by ASIN only
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vendor_reports_asin ON vendor_reports(asin);
        `);
        // Index for vendor_reports queries by date only
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vendor_reports_date ON vendor_reports(report_date DESC);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_products_updated_at ON products(updated_at DESC);
        `);
        // Index for products filtering by snooze status
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_products_snooze ON products(snooze_until);
        `);
        console.log("✅ Performance indexes are ready.");

    } catch (e) {
        console.error("❌ Database Initialization Error:", e.message);
    } finally {
        await client.end();
        console.log("🏁 Initialization script finished.");
    }
})();
