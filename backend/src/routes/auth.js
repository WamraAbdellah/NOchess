const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

module.exports = function(pool) {
  const router = express.Router();
  const JWT_SECRET = process.env.JWT_SECRET || 'nochess_secret_key';

  // Register
  router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 3-20 characters' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
      const existing = await pool.query(
        'SELECT id FROM users WHERE username = $1 OR email = $2',
        [username, email]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Username or email already taken' });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const result = await pool.query(
        `INSERT INTO users (username, email, password_hash) 
         VALUES ($1, $2, $3) RETURNING id, username, email, rating`,
        [username, email, passwordHash]
      );

      const user = result.rows[0];
      const token = jwt.sign(
        { userId: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.status(201).json({ token, user: {
        id: user.id, username: user.username, email: user.email,
        rating: user.rating,
        rating_bullet: user.rating_bullet,
        rating_blitz: user.rating_blitz,
        rating_rapid: user.rating_rapid
      } });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Login
  router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    try {
      const result = await pool.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = result.rows[0];
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      await pool.query('UPDATE users SET last_seen = NOW() WHERE id = $1', [user.id]);

      const token = jwt.sign(
        { userId: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        token,
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
  router.get('/me', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
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
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  return router;
};
