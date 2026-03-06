'use strict';

const { parseFEN, makeMove, applyMove, getGameStatus, getAllLegalMoves, getMoveNotation, INITIAL_FEN, COLOR, idxToSquare } = require('../chess/engine');
const { getBotMove, BOT_LEVELS } = require('../chess/bot');
const { getCategory, ratingColumns } = require('../chess/timeControl');
const { v4: uuidv4 } = require('uuid');

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
      finishGame(gameId, 'timeout', color === 'w' ? 'b' : 'w');
      return;
    }

    const handle = setTimeout(async () => {
      const game = await getGameState(gameId);
      if (!game || game.status !== 'active') return;
      const winnerColor = color === 'w' ? 'b' : 'w';
      console.log(`⏰ Timeout: ${color} ran out in game ${gameId}`);
      await finishGame(gameId, 'timeout', winnerColor);
    }, ms + 300);

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

    const updated = { ...game, status: 'finished', result, winner_color: winnerColor };
    await saveGameState(gameId, updated);

    try {
      await pool.query(
        'UPDATE games SET status=$1, result=$2, winner_color=$3, updated_at=NOW() WHERE id=$4',
        ['finished', result, winnerColor || null, gameId]
      );
    } catch (e) { console.error('finishGame DB error:', e.message); }

    const wId = game.white_player_id;
    const bId = game.black_player_id;
    const isBotGame = (wId && wId.startsWith('bot')) || (bId && bId.startsWith('bot'));
    const wReal = wId && !wId.startsWith('guest') && !wId.startsWith('bot');
    const bReal = bId && !bId.startsWith('guest') && !bId.startsWith('bot');

    if (!isBotGame && wReal && bReal) {
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

    socket.on('lobby:getOnline', () => {
      socket.emit('lobby:online', { count: getOnlineCount() });
    });

    // ---- Matchmaking ----
    socket.on('matchmaking:join', async ({ timeControl = 600, increment = 0 }) => {
      const key = `${timeControl}+${increment}`;
      if (!waitingQueues[key]) waitingQueues[key] = [];
      waitingQueues[key] = waitingQueues[key].filter(p => p.userId !== socket.userId);

      const opp = waitingQueues[key].find(p => p.userId !== socket.userId);
      if (opp) {
        waitingQueues[key] = waitingQueues[key].filter(p => p.socketId !== opp.socketId);
        const oppSocket = io.sockets.sockets.get(opp.socketId);
        if (!oppSocket) {
          waitingQueues[key].push({ socketId: socket.id, userId: socket.userId, username: socket.username });
          socket.emit('matchmaking:waiting', { key });
          return;
        }

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
          timeWhite: timeControl*1000, timeBlack: timeControl*1000, lastMoveTime: null
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

        ws.emit('game:start', { gameId, color: 'w', opponent: bs.username, gameState: gs });
        bs.emit('game:start', { gameId, color: 'b', opponent: ws.username, gameState: gs });
        console.log(`♟ ${gameId} | ${ws.username} vs ${bs.username} [${timeControl}+${increment}]`);
      } else {
        waitingQueues[key].push({ socketId: socket.id, userId: socket.userId, username: socket.username });
        socket.emit('matchmaking:waiting', { key });
        socket.matchmakingKey = key;
      }
    });

    socket.on('matchmaking:cancel', () => {
      if (socket.matchmakingKey && waitingQueues[socket.matchmakingKey]) {
        waitingQueues[socket.matchmakingKey] = waitingQueues[socket.matchmakingKey].filter(p => p.socketId !== socket.id);
      }
      socket.emit('matchmaking:cancelled');
    });

    // ---- Bot game ----
    socket.on('bot:start', async ({ level = 'intermediate', playerColor = 'w', timeControl = 600 }) => {
      const cfg = BOT_LEVELS[level] || BOT_LEVELS.intermediate;
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
        isBot: true, botLevel: level, botColor: playerColor === 'w' ? 'b' : 'w'
      };

      try {
        await pool.query(`INSERT INTO games (id,white_player_id,black_player_id,white_username,black_username,white_rating,black_rating,time_control,increment,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active')`,
          [gameId, gs.white_player_id, gs.black_player_id, gs.white_username, gs.black_username, gs.white_rating, gs.black_rating, timeControl, 0]);
      } catch(e) { console.error('bot game insert:', e.message); }

      await saveGameState(gameId, gs);
      socket.join(gameId);
      socket.currentGameId = gameId;
      socket.emit('game:start', { gameId, color: playerColor, opponent: botName, gameState: gs, isBot: true });

      if (playerColor === 'b') {
        // Bot (white) goes first
        setTimeout(() => executeBotMove(gameId, level, 'w'), 600);
      } else {
        // Human (white) starts — schedule their clock
        scheduleTimeout(gameId, 'w', timeControl * 1000);
      }
    });

    // ---- Reconnect ----
    socket.on('game:reconnect', async ({ gameId }) => {
      const game = await getGameState(gameId);
      if (!game) return socket.emit('error', { message: 'Game not found' });
      let color = null;
      if (game.white_player_id === socket.userId) color = 'w';
      else if (game.black_player_id === socket.userId) color = 'b';
      socket.join(gameId);
      socket.currentGameId = gameId;
      socket.emit('game:state', { gameState: game, color });
    });

    // ---- Move ----
    socket.on('game:move', async ({ gameId, from, to, promotion }) => {
      try {
        const game = await getGameState(gameId);
        if (!game || game.status !== 'active') return socket.emit('error', { message: 'Game not active' });

        const state = parseFEN(game.current_fen);
        const playerColor = game.white_player_id === socket.userId ? 'w' : 'b';
        if (state.turn !== playerColor) return socket.emit('error', { message: 'Not your turn' });

        const result = makeMove(state, from, to, promotion || null);
        if (!result) return socket.emit('error', { message: 'Invalid move' });

        // Update clocks
        const now = Date.now();
        const elapsed = game.lastMoveTime ? now - game.lastMoveTime : 0;
        if (playerColor === 'w') game.timeWhite = Math.max(0, (game.timeWhite||0) - elapsed) + (game.increment||0)*1000;
        else game.timeBlack = Math.max(0, (game.timeBlack||0) - elapsed) + (game.increment||0)*1000;
        game.lastMoveTime = now;

        // Immediate timeout check
        if (playerColor === 'w' && game.timeWhite <= 0) { await finishGame(gameId, 'timeout', 'b'); return; }
        if (playerColor === 'b' && game.timeBlack <= 0) { await finishGame(gameId, 'timeout', 'w'); return; }

        const notation = getMoveNotation(state, result.move);
        game.moves = [...(game.moves||[]), { from, to, promotion: promotion||null, notation }];
        game.current_fen = result.fen;

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

          // Bot response
          if (game.isBot && game.botColor === (playerColor === 'w' ? 'b' : 'w')) {
            executeBotMove(gameId, game.botLevel, game.botColor);
          }
        }
      } catch(err) {
        console.error('Move error:', err);
        socket.emit('error', { message: 'Move error' });
      }
    });

    // ---- Resign ----
    socket.on('game:resign', async ({ gameId }) => {
      const game = await getGameState(gameId);
      if (!game || game.status !== 'active') return;
      const pc = game.white_player_id === socket.userId ? 'w' : 'b';
      io.to(gameId).emit('game:resign', { player: socket.username });
      await finishGame(gameId, 'resignation', pc === 'w' ? 'b' : 'w');
    });

    socket.on('game:drawOffer', ({ gameId }) => socket.to(gameId).emit('game:drawOffer', { from: socket.username }));
    socket.on('game:drawAccept', async ({ gameId }) => finishGame(gameId, 'agreement', null));
    socket.on('game:drawDecline', ({ gameId }) => socket.to(gameId).emit('game:drawDeclined'));

    socket.on('game:chat', ({ gameId, message }) => {
      if (!message?.trim()) return;
      io.to(gameId).emit('game:chat', { from: socket.username, message: message.trim().slice(0,200), timestamp: Date.now() });
    });

    socket.on('game:spectate', async ({ gameId }) => {
      const game = await getGameState(gameId);
      if (!game) return socket.emit('error', { message: 'Game not found' });
      socket.join(gameId);
      socket.emit('game:state', { gameState: game, color: null });
    });

    socket.on('disconnect', () => {
      removeOnline(socket.userId, socket.id);
      io.emit('lobby:online', { count: getOnlineCount() });
      if (socket.matchmakingKey && waitingQueues[socket.matchmakingKey]) {
        waitingQueues[socket.matchmakingKey] = waitingQueues[socket.matchmakingKey].filter(p => p.socketId !== socket.id);
      }
      if (socket.currentGameId) socket.to(socket.currentGameId).emit('game:opponentDisconnected');
      console.log(`🔌 ${socket.username} disconnected | online: ${getOnlineCount()}`);
    });
  });
};
