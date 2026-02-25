'use strict';

const { getAllLegalMoves, applyMove, getGameStatus, isInCheck, COLOR, PIECES } = require('./engine');

// Piece values for evaluation
const PIECE_VALUES = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000
};

// Piece-square tables for positional bonuses (white's perspective, flip for black)
const PST = {
  p: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0
  ],
  n: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50
  ],
  b: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20
  ],
  r: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0
  ],
  q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20
  ],
  k: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20
  ]
};

function getPSTValue(piece, idx) {
  const table = PST[piece.type];
  if (!table) return 0;
  // White reads from bottom (idx as-is), black reads from top (flip rank)
  const tableIdx = piece.color === COLOR.WHITE
    ? (7 - Math.floor(idx / 8)) * 8 + (idx % 8)
    : Math.floor(idx / 8) * 8 + (idx % 8);
  return table[tableIdx] || 0;
}

function evaluate(state) {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const p = state.board[i];
    if (!p) continue;
    const val = PIECE_VALUES[p.type] + getPSTValue(p, i);
    score += p.color === COLOR.WHITE ? val : -val;
  }
  return score;
}

function orderMoves(state, moves) {
  // Sort: captures first (higher value captures low value = best), then positional
  return moves.sort((a, b) => {
    const capA = state.board[a.to] ? PIECE_VALUES[state.board[a.to].type] : 0;
    const capB = state.board[b.to] ? PIECE_VALUES[state.board[b.to].type] : 0;
    return capB - capA;
  });
}

function minimax(state, depth, alpha, beta, maximizing) {
  const { status, winner } = getGameStatus(state);
  
  if (status === 'checkmate') {
    return maximizing ? -100000 - depth : 100000 + depth;
  }
  if (status === 'stalemate' || status === 'draw') return 0;
  if (depth === 0) return evaluate(state);

  const moves = getAllLegalMoves(state);
  const orderedMoves = orderMoves(state, moves);

  if (maximizing) {
    let maxEval = -Infinity;
    for (const move of orderedMoves) {
      const newState = applyMove(state, move);
      const eval_ = minimax(newState, depth - 1, alpha, beta, false);
      maxEval = Math.max(maxEval, eval_);
      alpha = Math.max(alpha, eval_);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of orderedMoves) {
      const newState = applyMove(state, move);
      const eval_ = minimax(newState, depth - 1, alpha, beta, true);
      minEval = Math.min(minEval, eval_);
      beta = Math.min(beta, eval_);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

// Bot difficulty levels
const BOT_LEVELS = {
  beginner:     { name: 'Beginner',     rating: 400,  depth: 1, randomFactor: 0.8 },
  easy:         { name: 'Easy',         rating: 800,  depth: 1, randomFactor: 0.4 },
  intermediate: { name: 'Intermediate', rating: 1200, depth: 2, randomFactor: 0.15 },
  advanced:     { name: 'Advanced',     rating: 1600, depth: 3, randomFactor: 0.05 },
  expert:       { name: 'Expert',       rating: 2000, depth: 4, randomFactor: 0 },
};

function getBotMove(state, level = 'intermediate') {
  const config = BOT_LEVELS[level] || BOT_LEVELS.intermediate;
  const moves = getAllLegalMoves(state);
  if (moves.length === 0) return null;

  // Random factor: sometimes pick a random move (simulates blunders)
  if (Math.random() < config.randomFactor) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  const isMaximizing = state.turn === COLOR.WHITE;
  let bestMove = null;
  let bestEval = isMaximizing ? -Infinity : Infinity;

  const orderedMoves = orderMoves(state, moves);

  for (const move of orderedMoves) {
    const newState = applyMove(state, move);
    const eval_ = minimax(newState, config.depth - 1, -Infinity, Infinity, !isMaximizing);
    
    if (isMaximizing ? eval_ > bestEval : eval_ < bestEval) {
      bestEval = eval_;
      bestMove = move;
    }
  }

  return bestMove || moves[0];
}

module.exports = { getBotMove, BOT_LEVELS };
