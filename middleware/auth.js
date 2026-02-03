// Authentication middleware for protecting routes

/**
 * Middleware to require authentication
 * Checks if user is logged in via session
 */
function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }

    // Check if this is an API request or page request
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    // For page requests, redirect to login
    return res.redirect('/login');
}

/**
 * Middleware to require specific role
 * @param {string[]} allowedRoles - Array of allowed roles
 */
function requireRole(allowedRoles) {
    return (req, res, next) => {
        if (!req.session || !req.session.userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!allowedRoles.includes(req.session.userRole)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        next();
    };
}

/**
 * Middleware to attach user info to request
 * Use after requireAuth to get full user details
 */
function attachUser(pool) {
    return async (req, res, next) => {
        if (req.session && req.session.userId) {
            try {
                const result = await pool.query(
                    'SELECT id, email, name, role, company_id FROM users WHERE id = $1',
                    [req.session.userId]
                );
                if (result.rows.length > 0) {
                    req.user = result.rows[0];
                }
            } catch (err) {
                console.error('Error attaching user:', err);
            }
        }
        next();
    };
}

module.exports = {
    requireAuth,
    requireRole,
    attachUser
};
