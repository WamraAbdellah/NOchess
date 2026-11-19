const express = require('express');

module.exports = function(pool) {
  const router = express.Router();

  // Public profile. The internal user id is deliberately not returned.
  router.get('/:username', async (req, res) => {
    if (req.params.username.length > 50) {
      return res.status(404).json({ error: 'User not found' });
    }
    try {
      const result = await pool.query(
        `SELECT username, rating, rating_bullet, rating_blitz, rating_rapid,
                games_played, games_won, games_lost, games_drawn,
                bullet_played, blitz_played, rapid_played, created_at
         FROM users WHERE username = $1`,
        [req.params.username]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
      res.json(result.rows[0]);
    } catch (err) {
      console.error('User profile error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
};
