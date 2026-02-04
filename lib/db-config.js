/**
 * Database Configuration Module
 *
 * Provides centralized PostgreSQL SSL configuration for the application.
 *
 * SSL Configuration Notes:
 * - Heroku PostgreSQL uses self-signed certificates, requiring rejectUnauthorized: false
 * - This is a known limitation of Heroku's managed PostgreSQL service
 * - For enhanced security, you can provide a CA certificate via DATABASE_CA_CERT env var
 * - Local development connections (localhost) don't use SSL
 *
 * Environment Variables:
 * - DATABASE_URL: PostgreSQL connection string (required for remote connections)
 * - DATABASE_CA_CERT: Base64-encoded CA certificate for SSL verification (optional)
 * - NODE_ENV: When 'production', enables SSL for remote connections
 */

const fs = require('fs');

/**
 * Determines if the connection string points to localhost
 * @param {string} connectionString - PostgreSQL connection string
 * @returns {boolean} - True if connection is to localhost
 */
function isLocalConnection(connectionString) {
    if (!connectionString) return true;
    return connectionString.includes('localhost') ||
           connectionString.includes('127.0.0.1') ||
           connectionString.includes('::1');
}

/**
 * Gets the SSL configuration for PostgreSQL connections
 *
 * Security Notes:
 * - For Heroku PostgreSQL, rejectUnauthorized must be false due to self-signed certs
 * - If DATABASE_CA_CERT is provided, full certificate validation is enabled
 * - Local connections don't use SSL
 *
 * @param {string} connectionString - PostgreSQL connection string
 * @returns {boolean|object} - SSL configuration for pg Pool/Client
 */
function getSSLConfig(connectionString) {
    const connString = connectionString || process.env.DATABASE_URL;

    // No SSL for local connections
    if (isLocalConnection(connString)) {
        return false;
    }

    // Check for custom CA certificate (enables full validation)
    const caCert = process.env.DATABASE_CA_CERT;
    if (caCert) {
        try {
            // CA cert can be base64 encoded or a file path
            let ca;
            if (caCert.startsWith('/') && fs.existsSync(caCert)) {
                ca = fs.readFileSync(caCert, 'utf8');
            } else {
                // Assume base64 encoded
                ca = Buffer.from(caCert, 'base64').toString('utf8');
            }

            return {
                rejectUnauthorized: true,
                ca: ca
            };
        } catch (err) {
            console.warn('[DB Config] Failed to load CA certificate, falling back to insecure mode:', err.message);
        }
    }

    // Default: Heroku-compatible SSL (self-signed certs)
    // This is required for Heroku PostgreSQL which uses self-signed certificates
    // Log a warning in development to remind about this security limitation
    if (process.env.NODE_ENV !== 'production') {
        console.warn('[DB Config] Using SSL with rejectUnauthorized: false. ' +
            'This is required for Heroku PostgreSQL but disables certificate verification. ' +
            'Set DATABASE_CA_CERT for enhanced security.');
    }

    return {
        rejectUnauthorized: false
    };
}

/**
 * Creates a PostgreSQL Pool/Client configuration object
 * @param {string} connectionString - Optional connection string override
 * @returns {object} - Configuration object for pg Pool/Client
 */
function getDatabaseConfig(connectionString) {
    const connString = connectionString || process.env.DATABASE_URL || 'postgresql://localhost:5432/amazon_tracker';

    return {
        connectionString: connString,
        ssl: getSSLConfig(connString)
    };
}

module.exports = {
    getSSLConfig,
    getDatabaseConfig,
    isLocalConnection
};
