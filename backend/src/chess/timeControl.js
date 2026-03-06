'use strict';

/**
 * Returns the category for a given time control (seconds).
 * Bullet  : < 3 min  (180s)
 * Blitz   : 3–9 min  (180–599s)
 * Rapid   : ≥ 10 min (600s+)
 */
function getCategory(timeControlSeconds) {
  if (timeControlSeconds < 180) return 'bullet';
  if (timeControlSeconds < 600) return 'blitz';
  return 'rapid';
}

/**
 * Returns the DB column names for rating and games_played for a category.
 */
function ratingColumns(category) {
  switch (category) {
    case 'bullet': return { rating: 'rating_bullet', played: 'bullet_played' };
    case 'blitz':  return { rating: 'rating_blitz',  played: 'blitz_played'  };
    default:       return { rating: 'rating_rapid',  played: 'rapid_played'  };
  }
}

module.exports = { getCategory, ratingColumns };
