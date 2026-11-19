'use strict';

const { parseFEN, makeMove, applyMove, getGameStatus, getAllLegalMoves, getMoveNotation, INITIAL_FEN, COLOR, idxToSquare } = require('../chess/engine');
const { getBotMove, BOT_LEVELS } = require('../chess/bot');
const { getCategory, ratingColumns } = require('../chess/timeControl');
const { randomUUID: uuidv4 } = require('crypto');
const {
  isUuid, isSquare, isPromotion, isPlainObject,
  MATCHMAKING_TIME_CONTROLS, BOT_TIME_CONTROLS, publicGame,
} = require('../util/validate');

const waitingQueues = {};
const gameTimeouts = {};

// Online tracking: userId -> Set<socketId> (same user on multiple tabs = 1 person)
const onlineUsers = new Map();

function addOnline(userId, socketId) {
  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId).add(socketId);
}
function removeOnline(userId, socketId) {
  const sockets = onlineUsers.get(userId);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) onlineUsers.delete(userId);
}
function getOnlineCount() { return onlineUsers.size; }

// Which side (if any) this user plays in this game. Spectators and strangers get null.
function getPlayerColor(game, userId) {
  if (!game || !userId) return null;
  if (game.white_player_id === userId) return 'w';
  if (game.black_player_id === userId) return 'b';
  return null;
}

function removeFromAllQueues(socketId) {
  for (const key of Object.keys(waitingQueues)) {
    waitingQueues[key] = waitingQueues[key].filter(p => p.socketId !== socketId);
    if (waitingQueues[key].length === 0) delete waitingQueues[key];
  }
}

// Serialise everything that reads-then-writes a game's state, so two events
// (a move and a timeout, two moves, a double resign...) can't interleave.
const gameLocks = new Map();
function withGameLock(gameId, fn) {
  const prev = gameLocks.get(gameId) || Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => {});
  gameLocks.set(gameId, tail);
  tail.then(() => { if (gameLocks.get(gameId) === tail) gameLocks.delete(gameId); });
  return run;
}

// Simple per-socket rate limiting
const EVENT_WINDOW_MS = 5000;
const EVENT_LIMIT = 40;           // any events per window
const GAME_CREATE_COOLDOWN_MS = 2000; // bot:start / matchmaking:join

module.exports = function setupSocketHandlers(io, pool, redisClient) {

  async function getGameState(gameId) {
    try {
      const cached = await redisClient.get(`game:${gameId}`);
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    try {
      const result = await pool.query('SELECT * FROM games WHERE id = $1', [gameId]);
      if (!result.rows[0]) return null;
      const g = result.rows[0];
      if (typeof g.moves === 'string') g.moves = JSON.parse(g.moves);
      return g;
    } catch (e) { return null; }
  }

  async function saveGameState(gameId, state) {
    try { await redisClient.setEx(`game:${gameId}`, 7200, JSON.stringify(state)); } catch (e) {}
  }

  function clearGameTimeouts(gameId) {
    const t = gameTimeouts[gameId];
    if (!t) return;
    if (t.white) clearTimeout(t.white);
    if (t.black) clearTimeout(t.black);
    delete gameTimeouts[gameId];
  }

  function scheduleTimeout(gameId, color, ms) {
    // Clear previous timeout for this color
    if (gameTimeouts[gameId]) {
      if (color === 'w' && gameTimeouts[gameId].white) clearTimeout(gameTimeouts[gameId].white);
      if (color === 'b' && gameTimeouts[gameId].black) clearTimeout(gameTimeouts[gameId].black);
    }
    if (!gameTimeouts[gameId]) gameTimeouts[gameId] = {};

    if (ms <= 0) {
      finishGame(gameId, 'timeout', color === 'w' ? 'b' : 'w').catch(e => console.error('finishGame error:', e));
      return;
    }

    const handle = setTimeout(() => withGameLock(gameId, async () => {
      const game = await getGameState(gameId);
      if (!game || game.status !== 'active') return;
      const winnerColor = color === 'w' ? 'b' : 'w';
      console.log(`⏰ Timeout: ${color} ran out in game ${gameId}`);
      await finishGame(gameId, 'timeout', winnerColor);
    }).catch(e => console.error('Timeout handler error:', e)), ms + 300);

    if (color === 'w') gameTimeouts[gameId].white = handle;
    else gameTimeouts[gameId].black = handle;
  }

  function calcElo(ra, rb, resultA) {
    return Math.round(32 * (resultA - 1 / (1 + Math.pow(10, (rb - ra) / 400))));
  }

  async function finishGame(gameId, result, winnerColor) {
    const game = await getGameState(gameId);
    if (!game || game.status === 'finished') return;

    clearGameTimeouts(gameId);

    const updated = { ...game, status: 'finished', result, winner_color: winnerColor, drawOfferBy: null };
    await saveGameState(gameId, updated);

    // Only the call that actually flips the row to 'finished' may touch ratings,
    // so a game can never be scored twice.
    let firstToFinish = false;
    try {
      const r = await pool.query(
        `UPDATE games SET status=$1, result=$2, winner_color=$3, updated_at=NOW()
         WHERE id=$4 AND status <> 'finished' RETURNING id`,
        ['finished', result, winnerColor || null, gameId]
      );
      firstToFinish = r.rowCount === 1;
    } catch (e) { console.error('finishGame DB error:', e.message); }

    const wId = game.white_player_id;
    const bId = game.black_player_id;
    const isBotGame = (wId && wId.startsWith('bot')) || (bId && bId.startsWith('bot'));
    const wReal = wId && !wId.startsWith('guest') && !wId.startsWith('bot');
    const bReal = bId && !bId.startsWith('guest') && !bId.startsWith('bot');

    if (firstToFinish && !isBotGame && wReal && bReal && wId !== bId) {
      let wR = 0.5, bR = 0.5;
      if (winnerColor === 'w') { wR = 1; bR = 0; }
      else if (winnerColor === 'b') { wR = 0; bR = 1; }

      // Determine category and which rating column to update
      const category = getCategory(game.time_control || 600);
      const cols = ratingColumns(category);

      const wRating = game.white_rating || 1200;
      const bRating = game.black_rating || 1200;
      const wDelta = calcElo(wRating, bRating, wR);
      const bDelta = calcElo(bRating, wRating, bR);

      try {
        await pool.query(`UPDATE users SET
          ${cols.rating} = GREATEST(100, ${cols.rating} + $1),
          ${cols.played} = ${cols.played} + 1,
          games_played = games_played + 1,
          games_won  = games_won  + $2,
          games_lost = games_lost + $3,
          games_drawn= games_drawn+ $4
          WHERE id = $5`,
          [wDelta, wR===1?1:0, wR===0?1:0, wR===0.5?1:0, wId]);

        await pool.query(`UPDATE users SET
          ${cols.rating} = GREATEST(100, ${cols.rating} + $1),
          ${cols.played} = ${cols.played} + 1,
          games_played = games_played + 1,
          games_won  = games_won  + $2,
          games_lost = games_lost + $3,
          games_drawn= games_drawn+ $4
          WHERE id = $5`,
          [bDelta, bR===1?1:0, bR===0?1:0, bR===0.5?1:0, bId]);

        console.log(`📊 ELO [${category}] white ${wRating}${wDelta>=0?'+':''}${wDelta} | black ${bRating}${bDelta>=0?'+':''}${bDelta}`);

        io.to(gameId).emit('game:ratingChange', {
          category,
          white: { change: wDelta, newRating: wRating + wDelta },
          black: { change: bDelta, newRating: bRating + bDelta }
        });
      } catch (e) { console.error('ELO error:', e.message); }
    }

    io.to(gameId).emit('game:over', { result, winnerColor: winnerColor || null, gameId });
  }

  async function executeBotMove(gameId, botLevel, botColor) {
    // Small delay to feel natural
    await new Promise(r => setTimeout(r, 400 + Math.random() * 600));
    try {
      await withGameLock(gameId, () => executeBotMoveLocked(gameId, botLevel, botColor));
    } catch (e) { console.error('Bot move error:', e); }
  }

  async function executeBotMoveLocked(gameId, botLevel, botColor) {
    const game = await getGameState(gameId);
    if (!game || game.status !== 'active') return;

    const state = parseFEN(game.current_fen);
    if (state.turn !== botColor) return;

    const botMove = getBotMove(state, botLevel);
    if (!botMove) return;

    const fromSq = idxToSquare(botMove.from);
    const toSq = idxToSquare(botMove.to);
    const result = makeMove(state, fromSq, toSq, botMove.promotion || null);
    if (!result) return;

    const now = Date.now();
    const elapsed = game.lastMoveTime ? now - game.lastMoveTime : 0;
    if (botColor === 'w') game.timeWhite = Math.max(0, (game.timeWhite||0) - elapsed);
    else game.timeBlack = Math.max(0, (game.timeBlack||0) - elapsed);
    game.lastMoveTime = now;

    const notation = getMoveNotation(state, botMove);
    game.moves = [...(game.moves || []), { from: fromSq, to: toSq, promotion: botMove.promotion||null, notation }];
    game.current_fen = result.fen;
    game.drawOfferBy = null;

    await saveGameState(gameId, game);
    try { await pool.query('UPDATE games SET current_fen=$1, updated_at=NOW() WHERE id=$2', [result.fen, gameId]); } catch(e){}

    const { status, winner } = result.gameStatus;

    io.to(gameId).emit('game:move', {
      from: fromSq, to: toSq, promotion: botMove.promotion||null,
      fen: result.fen,
      timeWhite: game.timeWhite, timeBlack: game.timeBlack,
      check: status === 'check', checkmate: status === 'checkmate',
      notation, moveNumber: game.moves.length
    });

    if (status === 'checkmate' || status === 'stalemate' || status === 'draw') {
      await finishGame(gameId, status === 'checkmate' ? 'checkmate' : 'draw', winner || null);
    } else {
      const humanColor = botColor === 'w' ? 'b' : 'w';
      const humanTime = humanColor === 'w' ? game.timeWhite : game.timeBlack;
      scheduleTimeout(gameId, humanColor, humanTime);
    }
  }

  // ─── Socket events ───────────────────────────────────────────

  io.on('connection', (socket) => {
    addOnline(socket.userId, socket.id);
    io.emit('lobby:online', { count: getOnlineCount() });
    console.log(`🔌 ${socket.username} connected | online: ${getOnlineCount()}`);

    // Rate limiting state for this connection
    let windowStart = Date.now();
    let eventCount = 0;
    let lastGameCreate = 0;

    function allowEvent() {
      const now = Date.now();
      if (now - windowStart > EVENT_WINDOW_MS) { windowStart = now; eventCount = 0; }
      eventCount += 1;
      if (eventCount === EVENT_LIMIT * 3) {
        console.warn(`🚫 Disconnecting ${socket.username}: event flood`);
        socket.disconnect(true);
      }
      return eventCount <= EVENT_LIMIT;
    }

    function allowGameCreate() {
      const now = Date.now();
      if (now - lastGameCreate < GAME_CREATE_COOLDOWN_MS) return false;
      lastGameCreate = now;
      return true;
    }

    // Every handler goes through here: payload must be a plain object, events are
    // rate-limited, and any error (sync or async) is caught instead of crashing
    // the server for everyone.
    function on(event, handler) {
      socket.on(event, (payload) => {
        if (!allowEvent()) return socket.emit('error', { message: 'Slow down' });
        if (payload === undefined) payload = {};
        if (!isPlainObject(payload)) return socket.emit('error', { message: 'Invalid request' });
        Promise.resolve()
          .then(() => handler(payload))
          .catch((err) => {
            console.error(`Socket handler "${event}" error:`, err);
            socket.emit('error', { message: 'Server error' });
          });
      });
    }

    // Load a game the caller is playing in, or reply with an error and return null.
    async function loadOwnGame(gameId) {
      if (!isUuid(gameId)) { socket.emit('error', { message: 'Invalid game' }); return null; }
      const game = await getGameState(gameId);
      if (!game) { socket.emit('error', { message: 'Game not found' }); return null; }
      const color = getPlayerColor(game, socket.userId);
      if (!color) { socket.emit('error', { message: 'You are not a player in this game' }); return null; }
      return { game, color };
    }

    on('lobby:getOnline', () => {
      socket.emit('lobby:online', { count: getOnlineCount() });
    });

    // ---- Matchmaking ----
    on('matchmaking:join', async ({ timeControl = 600, increment = 0 }) => {
      const key = `${timeControl}+${increment}`;
      if (!Number.isInteger(timeControl) || !Number.isInteger(increment) || !MATCHMAKING_TIME_CONTROLS.has(key)) {
        return socket.emit('error', { message: 'Invalid time control' });
      }
      if (!allowGameCreate()) return socket.emit('error', { message: 'Slow down' });

      // A socket can only wait in one queue at a time
      removeFromAllQueues(socket.id);
      if (!waitingQueues[key]) waitingQueues[key] = [];
      // ...and the same account can't queue twice (e.g. two tabs)
      waitingQueues[key] = waitingQueues[key].filter(p => p.userId !== socket.userId);

      const opp = waitingQueues[key].find(p => p.userId !== socket.userId);
      if (opp) {
        waitingQueues[key] = waitingQueues[key].filter(p => p.socketId !== opp.socketId);
        const oppSocket = io.sockets.sockets.get(opp.socketId);
        if (!oppSocket) {
          waitingQueues[key].push({ socketId: socket.id, userId: socket.userId, username: socket.username });
          socket.matchmakingKey = key;
          socket.emit('matchmaking:waiting', { key });
          return;
        }
        oppSocket.matchmakingKey = null;
        socket.matchmakingKey = null;

        const gameId = uuidv4();
        const [ws, bs] = Math.random() > 0.5 ? [socket, oppSocket] : [oppSocket, socket];

        let wR = 1200, bR = 1200;
        const cat = getCategory(timeControl);
        const rcols = ratingColumns(cat);
        if (!ws.isGuest) { try { const r = await pool.query(`SELECT ${rcols.rating} as rating FROM users WHERE id=$1`, [ws.userId]); if(r.rows[0]) wR=r.rows[0].rating; } catch(e){} }
        if (!bs.isGuest) { try { const r = await pool.query(`SELECT ${rcols.rating} as rating FROM users WHERE id=$1`, [bs.userId]); if(r.rows[0]) bR=r.rows[0].rating; } catch(e){} }

        const gs = {
          id: gameId,
          white_player_id: ws.userId, black_player_id: bs.userId,
          white_username: ws.username, black_username: bs.username,
          white_rating: wR, black_rating: bR,
          time_control: timeControl, increment,
          status: 'active', current_fen: INITIAL_FEN, moves: [],
          timeWhite: timeControl*1000, timeBlack: timeControl*1000, lastMoveTime: null,
          drawOfferBy: null
        };

        try {
          await pool.query(`INSERT INTO games (id,white_player_id,black_player_id,white_username,black_username,white_rating,black_rating,time_control,increment,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active')`,
            [gameId, gs.white_player_id, gs.black_player_id, gs.white_username, gs.black_username, wR, bR, timeControl, increment]);
        } catch(e) { console.error('matchmaking game insert:', e.message); }

        await saveGameState(gameId, gs);
        ws.join(gameId); bs.join(gameId);
        ws.currentGameId = gameId; bs.currentGameId = gameId;

        // White's clock starts ticking immediately
        scheduleTimeout(gameId, 'w', timeControl * 1000);

        ws.emit('game:start', { gameId, color: 'w', opponent: bs.username, gameState: publicGame(gs) });
        bs.emit('game:start', { gameId, color: 'b', opponent: ws.username, gameState: publicGame(gs) });
        console.log(`♟ ${gameId} | ${ws.username} vs ${bs.username} [${timeControl}+${increment}]`);
      } else {
        waitingQueues[key].push({ socketId: socket.id, userId: socket.userId, username: socket.username });
        socket.emit('matchmaking:waiting', { key });
        socket.matchmakingKey = key;
      }
    });

    on('matchmaking:cancel', () => {
      removeFromAllQueues(socket.id);
      socket.matchmakingKey = null;
      socket.emit('matchmaking:cancelled');
    });

    // ---- Bot game ----
    on('bot:start', async ({ level = 'intermediate', playerColor = 'w', timeControl = 600 }) => {
      if (typeof level !== 'string' || !Object.prototype.hasOwnProperty.call(BOT_LEVELS, level)) {
        return socket.emit('error', { message: 'Invalid bot level' });
      }
      if (playerColor !== 'w' && playerColor !== 'b') {
        return socket.emit('error', { message: 'Invalid color' });
      }
      if (!Number.isInteger(timeControl) || !BOT_TIME_CONTROLS.has(timeControl)) {
        return socket.emit('error', { message: 'Invalid time control' });
      }
      if (!allowGameCreate()) return socket.emit('error', { message: 'Slow down' });

      const cfg = BOT_LEVELS[level];
      const gameId = uuidv4();
      const botId = `bot_${level}`;
      const botName = `🤖 ${cfg.name} (${cfg.rating})`;

      const gs = {
        id: gameId,
        white_player_id: playerColor === 'w' ? socket.userId : botId,
        black_player_id: playerColor === 'b' ? socket.userId : botId,
        white_username: playerColor === 'w' ? socket.username : botName,
        black_username: playerColor === 'b' ? socket.username : botName,
        white_rating: playerColor === 'w' ? 1200 : cfg.rating,
        black_rating: playerColor === 'b' ? 1200 : cfg.rating,
        time_control: timeControl, increment: 0,
        status: 'active', current_fen: INITIAL_FEN, moves: [],
        timeWhite: timeControl*1000, timeBlack: timeControl*1000, lastMoveTime: null,
        isBot: true, botLevel: level, botColor: playerColor === 'w' ? 'b' : 'w',
        drawOfferBy: null
      };

      try {
        await pool.query(`INSERT INTO games (id,white_player_id,black_player_id,white_username,black_username,white_rating,black_rating,time_control,increment,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active')`,
          [gameId, gs.white_player_id, gs.black_player_id, gs.white_username, gs.black_username, gs.white_rating, gs.black_rating, timeControl, 0]);
      } catch(e) { console.error('bot game insert:', e.message); }

      await saveGameState(gameId, gs);
      socket.join(gameId);
      socket.currentGameId = gameId;
      socket.emit('game:start', { gameId, color: playerColor, opponent: botName, gameState: publicGame(gs), isBot: true });

      if (playerColor === 'b') {
        // Bot (white) goes first
        setTimeout(() => executeBotMove(gameId, level, 'w'), 600);
      } else {
        // Human (white) starts — schedule their clock
        scheduleTimeout(gameId, 'w', timeControl * 1000);
      }
    });

    // ---- Reconnect ----
    on('game:reconnect', async ({ gameId }) => {
      if (!isUuid(gameId)) return socket.emit('error', { message: 'Game not found' });
      const game = await getGameState(gameId);
      if (!game) return socket.emit('error', { message: 'Game not found' });
      const color = getPlayerColor(game, socket.userId); // null = watch as spectator
      socket.join(gameId);
      socket.currentGameId = gameId;
      socket.emit('game:state', { gameState: publicGame(game), color });
    });

    // ---- Move ----
    on('game:move', ({ gameId, from, to, promotion }) => withGameLock(gameId, async () => {
      if (!isSquare(from) || !isSquare(to) || !isPromotion(promotion)) {
        return socket.emit('error', { message: 'Invalid move' });
      }
      const own = await loadOwnGame(gameId);
      if (!own) return;
      const { game, color: playerColor } = own;
      if (game.status !== 'active') return socket.emit('error', { message: 'Game not active' });

      const state = parseFEN(game.current_fen);
      if (state.turn !== playerColor) return socket.emit('error', { message: 'Not your turn' });

      const result = makeMove(state, from, to, promotion || null);
      if (!result) return socket.emit('error', { message: 'Invalid move' });

      // Update clocks: check for a flag BEFORE adding the increment
      const now = Date.now();
      const elapsed = game.lastMoveTime ? now - game.lastMoveTime : 0;
      const inc = (game.increment || 0) * 1000;
      if (playerColor === 'w') {
        const left = (game.timeWhite || 0) - elapsed;
        if (left <= 0) { await finishGame(gameId, 'timeout', 'b'); return; }
        game.timeWhite = left + inc;
      } else {
        const left = (game.timeBlack || 0) - elapsed;
        if (left <= 0) { await finishGame(gameId, 'timeout', 'w'); return; }
        game.timeBlack = left + inc;
      }
      game.lastMoveTime = now;

      const notation = getMoveNotation(state, result.move);
      game.moves = [...(game.moves||[]), { from, to, promotion: promotion||null, notation }];
      game.current_fen = result.fen;
      game.drawOfferBy = null; // making a move declines any pending draw offer

      await saveGameState(gameId, game);
      try {
        await pool.query('UPDATE games SET current_fen=$1, updated_at=NOW() WHERE id=$2', [result.fen, gameId]);
        await pool.query(`INSERT INTO game_moves (game_id,move_number,color,from_sq,to_sq,promotion,notation,fen_after,time_remaining_white,time_remaining_black) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [gameId, game.moves.length, playerColor, from, to, promotion||null, notation, result.fen, game.timeWhite, game.timeBlack]);
      } catch(e) { console.error('Move DB error:', e.message); }

      const { status, winner } = result.gameStatus;

      io.to(gameId).emit('game:move', {
        from, to, promotion: promotion||null,
        fen: result.fen,
        timeWhite: game.timeWhite, timeBlack: game.timeBlack,
        check: status === 'check', checkmate: status === 'checkmate',
        notation, moveNumber: game.moves.length
      });

      if (status === 'checkmate') {
        await finishGame(gameId, 'checkmate', winner);
      } else if (status === 'stalemate' || status === 'draw') {
        await finishGame(gameId, status, null);
      } else {
        // Set server-side timeout for opponent
        const oppColor = playerColor === 'w' ? 'b' : 'w';
        const oppTime = oppColor === 'w' ? game.timeWhite : game.timeBlack;
        scheduleTimeout(gameId, oppColor, oppTime);

        // Bot response (runs after this lock is released)
        if (game.isBot && game.botColor === oppColor) {
          executeBotMove(gameId, game.botLevel, game.botColor);
        }
      }
    }));

    // ---- Resign ----
    on('game:resign', ({ gameId }) => withGameLock(gameId, async () => {
      const own = await loadOwnGame(gameId);
      if (!own || own.game.status !== 'active') return;
      io.to(gameId).emit('game:resign', { player: socket.username });
      await finishGame(gameId, 'resignation', own.color === 'w' ? 'b' : 'w');
    }));

    // ---- Draws: only a player may offer; only the *other* player may accept ----
    on('game:drawOffer', ({ gameId }) => withGameLock(gameId, async () => {
      const own = await loadOwnGame(gameId);
      if (!own || own.game.status !== 'active') return;
      if (own.game.drawOfferBy) return; // one offer at a time
      if (own.game.isBot) return socket.emit('error', { message: 'The bot does not accept draws' });
      own.game.drawOfferBy = own.color;
      await saveGameState(gameId, own.game);
      socket.to(gameId).emit('game:drawOffer', { from: socket.username });
    }));

    on('game:drawAccept', ({ gameId }) => withGameLock(gameId, async () => {
      const own = await loadOwnGame(gameId);
      if (!own || own.game.status !== 'active') return;
      if (!own.game.drawOfferBy || own.game.drawOfferBy === own.color) {
        return socket.emit('error', { message: 'No draw offer to accept' });
      }
      await finishGame(gameId, 'agreement', null);
    }));

    on('game:drawDecline', ({ gameId }) => withGameLock(gameId, async () => {
      const own = await loadOwnGame(gameId);
      if (!own || own.game.status !== 'active') return;
      if (!own.game.drawOfferBy || own.game.drawOfferBy === own.color) return;
      own.game.drawOfferBy = null;
      await saveGameState(gameId, own.game);
      socket.to(gameId).emit('game:drawDeclined');
    }));

    // ---- Chat: only players of this game, in the game's room ----
    on('game:chat', async ({ gameId, message }) => {
      if (typeof message !== 'string' || !message.trim()) return;
      if (!isUuid(gameId) || !socket.rooms.has(gameId)) return;
      const game = await getGameState(gameId);
      if (!getPlayerColor(game, socket.userId)) return;
      io.to(gameId).emit('game:chat', { from: socket.username, message: message.trim().slice(0, 200), timestamp: Date.now() });
    });

    on('game:spectate', async ({ gameId }) => {
      if (!isUuid(gameId)) return socket.emit('error', { message: 'Game not found' });
      const game = await getGameState(gameId);
      if (!game) return socket.emit('error', { message: 'Game not found' });
      socket.join(gameId);
      socket.emit('game:state', { gameState: publicGame(game), color: null });
    });

    socket.on('disconnect', () => {
      removeOnline(socket.userId, socket.id);
      io.emit('lobby:online', { count: getOnlineCount() });
      removeFromAllQueues(socket.id);
      if (socket.currentGameId) socket.to(socket.currentGameId).emit('game:opponentDisconnected');
      console.log(`🔌 ${socket.username} disconnected | online: ${getOnlineCount()}`);
    });
  });
};
