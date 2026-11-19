const express = require('express');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_VERIFY_OPTIONS } = require('../config');
const { isUuid, publicGame } = require('../util/validate');

module.exports = function(pool, redisClient) {
  const router = express.Router();

  function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try { req.user = jwt.verify(token, JWT_SECRET, JWT_VERIFY_OPTIONS); next(); }
    catch { res.status(401).json({ error: 'Invalid token' }); }
  }

  // ⚠️  IMPORTANT: specific routes MUST come before /:id wildcard

  // Leaderboard — must be before /:id
  router.get('/leaderboard/top', async (req, res) => {
    try {
      const category = req.query.category || 'rapid'; // bullet | blitz | rapid
      // Column names come only from these fixed maps, never from user input
      const validCols = { bullet: 'rating_bullet', blitz: 'rating_blitz', rapid: 'rating_rapid' };
      const col = validCols[category] || 'rating_rapid';
      const playedCol = { bullet: 'bullet_played', blitz: 'blitz_played', rapid: 'rapid_played' }[category] || 'rapid_played';

      const result = await pool.query(`
        SELECT username, ${col} as rating, ${playedCol} as games_played, games_won
        FROM users
        WHERE ${playedCol} > 0
        ORDER BY ${col} DESC
        LIMIT 20
      `);
      res.json(result.rows);
    } catch (err) {
      console.error('Leaderboard error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Your own game history — must be before /:id
  router.get('/user/:userId', authMiddleware, async (req, res) => {
    if (req.params.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    try {
      const result = await pool.query(`
        SELECT g.id, g.white_username, g.black_username, g.white_rating, g.black_rating,
               g.status, g.result, g.winner_color, g.time_control, g.created_at,
               (SELECT COUNT(*) FROM game_moves WHERE game_id = g.id) as move_count
        FROM games g
        WHERE (g.white_player_id = $1 OR g.black_player_id = $1)
          AND g.status = 'finished'
        ORDER BY g.created_at DESC
        LIMIT 20
      `, [req.user.userId]);
      res.json(result.rows);
    } catch (err) {
      console.error('User games error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Get game by ID — wildcard, must be last
  router.get('/:id', async (req, res) => {
    if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Game not found' });
    try {
      let cached = null;
      try { cached = await redisClient.get(`game:${req.params.id}`); } catch (e) {}
      if (cached) return res.json(publicGame(JSON.parse(cached)));

      const result = await pool.query('SELECT * FROM games WHERE id = $1', [req.params.id]);
      if (!result.rows[0]) return res.status(404).json({ error: 'Game not found' });

      const game = result.rows[0];
      const movesResult = await pool.query(
        'SELECT * FROM game_moves WHERE game_id = $1 ORDER BY move_number',
        [req.params.id]
      );
      game.moveHistory = movesResult.rows;
      res.json(publicGame(game));
    } catch (err) {
      console.error('Get game error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
};
