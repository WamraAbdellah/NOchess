'use strict';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SQUARE_RE = /^[a-h][1-8]$/;
const PROMOTIONS = new Set(['q', 'r', 'b', 'n']);

const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
const isSquare = (v) => typeof v === 'string' && SQUARE_RE.test(v);
const isPromotion = (v) => v === null || v === undefined || (typeof v === 'string' && PROMOTIONS.has(v));
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Time controls offered by the frontend: "seconds+increment"
const MATCHMAKING_TIME_CONTROLS = new Set([
  '60+0', '120+1', '180+0', '300+0', '300+3', '600+0', '600+5', '1800+0',
]);
const BOT_TIME_CONTROLS = new Set([60, 120, 180, 300, 600, 1800]);

// Strip internal fields (player account ids, server bookkeeping) before a game
// object is sent to any client.
function publicGame(game) {
  if (!game) return game;
  // eslint-disable-next-line no-unused-vars
  const { white_player_id, black_player_id, drawOfferBy, ...rest } = game;
  return rest;
}

module.exports = {
  isUuid, isSquare, isPromotion, isPlainObject,
  MATCHMAKING_TIME_CONTROLS, BOT_TIME_CONTROLS, publicGame,
};
