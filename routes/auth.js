const express = require('express');
const bcrypt = require('bcrypt');

const router = express.Router();
const SALT_ROUNDS = 10;

/**
 * Validates password strength
 * @param {string} password - The password to validate
 * @returns {string|null} - Error message if invalid, null if valid
 */
function validatePassword(password) {
    if (!password || password.length < 8) {
        return 'Password must be at least 8 characters';
    }
    if (!/[A-Z]/.test(password)) {
        return 'Password must contain at least one uppercase letter';
    }
    if (!/[0-9]/.test(password)) {
        return 'Password must contain at least one number';
    }
    return null;
}

/**
 * Initialize auth routes with database pool
 * @param {Pool} pool - PostgreSQL connection pool
 */
function createAuthRoutes(pool) {
    // POST /api/auth/register - Create new user
    router.post('/register', async (req, res) => {
        try {
            const { email, password, name } = req.body;

            if (!email || !password) {
                return res.status(400).json({ error: 'Email and password are required' });
            }

            // Validate password strength
            const passwordError = validatePassword(password);
            if (passwordError) {
                return res.status(400).json({ error: passwordError });
            }

            // Check if user already exists
            const existing = await pool.query(
                'SELECT id FROM users WHERE email = $1',
                [email.toLowerCase()]
            );

            if (existing.rows.length > 0) {
                return res.status(400).json({ error: 'User already exists' });
            }

            // Hash password
            const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

            // Create user
            const result = await pool.query(
                `INSERT INTO users (email, password_hash, name, role)
                 VALUES ($1, $2, $3, 'user')
                 RETURNING id, email, name, role`,
                [email.toLowerCase(), passwordHash, name || null]
            );

            const user = result.rows[0];

            // Regenerate session to prevent session fixation attacks
            req.session.regenerate((err) => {
                if (err) {
                    console.error('Session regeneration error:', err);
                    return res.status(500).json({ error: 'Session error' });
                }

                // Auto-login after registration
                req.session.userId = user.id;
                req.session.userEmail = user.email;
                req.session.userRole = user.role;

                res.json({
                    success: true,
                    user: {
                        id: user.id,
                        email: user.email,
                        name: user.name,
                        role: user.role
                    }
                });
            });
        } catch (err) {
            console.error('Registration error:', err);
            res.status(500).json({ error: 'Registration failed' });
        }
    });

    // POST /api/auth/login - Login user
    router.post('/login', async (req, res) => {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({ error: 'Email and password are required' });
            }

            // Find user
            const result = await pool.query(
                'SELECT id, email, password_hash, name, role FROM users WHERE email = $1',
                [email.toLowerCase()]
            );

            if (result.rows.length === 0) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const user = result.rows[0];

            // Verify password
            const valid = await bcrypt.compare(password, user.password_hash);

            if (!valid) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            // Regenerate session to prevent session fixation attacks
            req.session.regenerate((err) => {
                if (err) {
                    console.error('Session regeneration error:', err);
                    return res.status(500).json({ error: 'Session error' });
                }

                // Create session
                req.session.userId = user.id;
                req.session.userEmail = user.email;
                req.session.userRole = user.role;

                res.json({
                    success: true,
                    user: {
                        id: user.id,
                        email: user.email,
                        name: user.name,
                        role: user.role
                    }
                });
            });
        } catch (err) {
            console.error('Login error:', err);
            res.status(500).json({ error: 'Login failed' });
        }
    });

    // POST /api/auth/logout - Logout user
    router.post('/logout', (req, res) => {
        req.session.destroy((err) => {
            if (err) {
                console.error('Logout error:', err);
                return res.status(500).json({ error: 'Logout failed' });
            }
            res.clearCookie('connect.sid');
            res.json({ success: true });
        });
    });

    // GET /api/auth/me - Get current user
    router.get('/me', async (req, res) => {
        if (!req.session || !req.session.userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        try {
            const result = await pool.query(
                'SELECT id, email, name, role FROM users WHERE id = $1',
                [req.session.userId]
            );

            if (result.rows.length === 0) {
                req.session.destroy();
                return res.status(401).json({ error: 'User not found' });
            }

            res.json({
                user: result.rows[0]
            });
        } catch (err) {
            console.error('Get user error:', err);
            res.status(500).json({ error: 'Failed to get user' });
        }
    });

    return router;
}

module.exports = createAuthRoutes;
module.exports.validatePassword = validatePassword;
