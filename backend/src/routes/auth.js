const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { JWT_SECRET, JWT_SIGN_OPTIONS, JWT_VERIFY_OPTIONS } = require('../config');

// 3–20 letters, digits or underscores
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
// Names the server uses for guests and bots must not be claimable by real accounts
const RESERVED_PREFIX_RE = /^(guest|bot)/i;
// Pragmatic email check (one @, a dot in the domain, no spaces)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72; // bcrypt ignores everything after 72 bytes

// Dummy hash so a login for an unknown email costs the same time as a real one
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', 12);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only failed attempts count toward the limit
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipFailedRequests: true, // only accounts actually created count
  message: { error: 'Too many accounts created from this address. Try again later.' },
});

const meLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

function signToken(user) {
  return jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, JWT_SIGN_OPTIONS);
}

module.exports = function(pool) {
  const router = express.Router();

  // Register
  router.post('/register', registerLimiter, async (req, res) => {
    const { username, email, password } = req.body || {};
    if (typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string'
        || !username || !email || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }
    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-20 letters, numbers or underscores' });
    }
    if (RESERVED_PREFIX_RE.test(username)) {
      return res.status(400).json({ error: 'Usernames cannot start with "guest" or "bot"' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail.length > 254 || !EMAIL_RE.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }
    if (password.length < MIN_PASSWORD) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters` });
    }
    if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD) {
      return res.status(400).json({ error: `Password must be at most ${MAX_PASSWORD} characters` });
    }

    try {
      const existing = await pool.query(
        'SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = $2',
        [username, normalizedEmail]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Username or email already taken' });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const result = await pool.query(
        `INSERT INTO users (username, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, username, email, rating, rating_bullet, rating_blitz, rating_rapid`,
        [username, normalizedEmail, passwordHash]
      );

      const user = result.rows[0];
      res.status(201).json({ token: signToken(user), user: {
        id: user.id, username: user.username, email: user.email,
        rating: user.rating,
        rating_bullet: user.rating_bullet,
        rating_blitz: user.rating_blitz,
        rating_rapid: user.rating_rapid
      } });
    } catch (err) {
      if (err.code === '23505') { // unique violation (two signups racing)
        return res.status(409).json({ error: 'Username or email already taken' });
      }
      console.error('Register error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Login
  router.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    if (email.length > 254 || Buffer.byteLength(password, 'utf8') > MAX_PASSWORD) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    try {
      const result = await pool.query(
        'SELECT * FROM users WHERE LOWER(email) = $1',
        [email.trim().toLowerCase()]
      );
      const user = result.rows[0];
      const valid = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
      if (!user || !valid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      await pool.query('UPDATE users SET last_seen = NOW() WHERE id = $1', [user.id]);

      res.json({
        token: signToken(user),
        user: {
          id: user.id, username: user.username, email: user.email,
          rating: user.rating,
          rating_bullet: user.rating_bullet,
          rating_blitz: user.rating_blitz,
          rating_rapid: user.rating_rapid,
          gamesPlayed: user.games_played,
          gamesWon: user.games_won
        }
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Get current user
  router.get('/me', meLimiter, async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET, JWT_VERIFY_OPTIONS);
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }

    try {
      const result = await pool.query(
        `SELECT id, username, email, rating, rating_bullet, rating_blitz, rating_rapid,
                games_played, games_won, games_lost, games_drawn,
                bullet_played, blitz_played, rapid_played, created_at
         FROM users WHERE id = $1`,
        [decoded.userId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
      res.json(result.rows[0]);
    } catch (err) {
      console.error('Me error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
};
