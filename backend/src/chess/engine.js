'use strict';

// =============================================
// NOchess Engine - Built from scratch
// =============================================

const PIECES = {
  KING: 'k', QUEEN: 'q', ROOK: 'r', BISHOP: 'b', KNIGHT: 'n', PAWN: 'p'
};

const COLOR = { WHITE: 'w', BLACK: 'b' };

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// ---- Board Helpers ----

function squareToIdx(sq) {
  const file = sq.charCodeAt(0) - 97; // a=0..h=7
  const rank = parseInt(sq[1]) - 1;    // 1=0..8=7
  return rank * 8 + file;
}

function idxToSquare(idx) {
  const file = String.fromCharCode(97 + (idx % 8));
  const rank = Math.floor(idx / 8) + 1;
  return `${file}${rank}`;
}

function rankOf(idx) { return Math.floor(idx / 8); }
function fileOf(idx) { return idx % 8; }

function isValidIdx(idx) { return idx >= 0 && idx < 64; }

// ---- FEN Parser ----

function parseFEN(fen) {
  const parts = fen.split(' ');
  const board = new Array(64).fill(null);
  
  const rows = parts[0].split('/');
  for (let r = 0; r < 8; r++) {
    let col = 0;
    const row = rows[7 - r]; // FEN is rank 8 first
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (!isNaN(ch)) {
        col += parseInt(ch);
      } else {
        const color = ch === ch.toUpperCase() ? COLOR.WHITE : COLOR.BLACK;
        const type = ch.toLowerCase();
        board[r * 8 + col] = { type, color };
        col++;
      }
    }
  }

  const turn = parts[1];
  const castling = parts[2];
  const enPassant = parts[3] !== '-' ? squareToIdx(parts[3]) : null;
  const halfMove = parseInt(parts[4]) || 0;
  const fullMove = parseInt(parts[5]) || 1;

  return { board, turn, castling, enPassant, halfMove, fullMove };
}

// ---- FEN Serializer ----

function toFEN(state) {
  const { board, turn, castling, enPassant, halfMove, fullMove } = state;
  let fen = '';
  
  for (let r = 7; r >= 0; r--) {
    let empty = 0;
    for (let c = 0; c < 8; c++) {
      const piece = board[r * 8 + c];
      if (!piece) {
        empty++;
      } else {
        if (empty > 0) { fen += empty; empty = 0; }
        const ch = piece.type;
        fen += piece.color === COLOR.WHITE ? ch.toUpperCase() : ch;
      }
    }
    if (empty > 0) fen += empty;
    if (r > 0) fen += '/';
  }

  fen += ` ${turn}`;
  fen += ` ${castling || '-'}`;
  fen += ` ${enPassant !== null ? idxToSquare(enPassant) : '-'}`;
  fen += ` ${halfMove} ${fullMove}`;
  return fen;
}

// ---- Attack Detection ----

function isAttackedBy(board, idx, attackerColor) {
  const r = rankOf(idx);
  const f = fileOf(idx);

  // Knight attacks
  const knightMoves = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  for (const [dr, df] of knightMoves) {
    const nr = r + dr, nf = f + df;
    if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
      const p = board[nr * 8 + nf];
      if (p && p.color === attackerColor && p.type === PIECES.KNIGHT) return true;
    }
  }

  // Sliding pieces: rook/queen (horizontal/vertical)
  const rookDirs = [[0,1],[0,-1],[1,0],[-1,0]];
  for (const [dr, df] of rookDirs) {
    let nr = r + dr, nf = f + df;
    while (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
      const p = board[nr * 8 + nf];
      if (p) {
        if (p.color === attackerColor && (p.type === PIECES.ROOK || p.type === PIECES.QUEEN)) return true;
        break;
      }
      nr += dr; nf += df;
    }
  }

  // Sliding pieces: bishop/queen (diagonal)
  const bishopDirs = [[1,1],[1,-1],[-1,1],[-1,-1]];
  for (const [dr, df] of bishopDirs) {
    let nr = r + dr, nf = f + df;
    while (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
      const p = board[nr * 8 + nf];
      if (p) {
        if (p.color === attackerColor && (p.type === PIECES.BISHOP || p.type === PIECES.QUEEN)) return true;
        break;
      }
      nr += dr; nf += df;
    }
  }

  // King attacks
  const kingDirs = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
  for (const [dr, df] of kingDirs) {
    const nr = r + dr, nf = f + df;
    if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
      const p = board[nr * 8 + nf];
      if (p && p.color === attackerColor && p.type === PIECES.KING) return true;
    }
  }

  // Pawn attacks
  const pawnDir = attackerColor === COLOR.WHITE ? -1 : 1; // attacker's pawns attack from their perspective
  const pawnRank = r + pawnDir;
  if (pawnRank >= 0 && pawnRank < 8) {
    for (const pf of [f - 1, f + 1]) {
      if (pf >= 0 && pf < 8) {
        const p = board[pawnRank * 8 + pf];
        if (p && p.color === attackerColor && p.type === PIECES.PAWN) return true;
      }
    }
  }

  return false;
}

function findKing(board, color) {
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p && p.type === PIECES.KING && p.color === color) return i;
  }
  return -1;
}

function isInCheck(board, color) {
  const kingIdx = findKing(board, color);
  if (kingIdx === -1) return false;
  const opponent = color === COLOR.WHITE ? COLOR.BLACK : COLOR.WHITE;
  return isAttackedBy(board, kingIdx, opponent);
}

// ---- Move Generation ----

function generatePseudoMoves(state, fromIdx) {
  const { board, turn, castling, enPassant } = state;
  const piece = board[fromIdx];
  if (!piece || piece.color !== turn) return [];

  const moves = [];
  const r = rankOf(fromIdx);
  const f = fileOf(fromIdx);
  const opponent = turn === COLOR.WHITE ? COLOR.BLACK : COLOR.WHITE;

  const addMove = (toIdx, flags = {}) => {
    moves.push({ from: fromIdx, to: toIdx, ...flags });
  };

  switch (piece.type) {
    case PIECES.PAWN: {
      const dir = turn === COLOR.WHITE ? 1 : -1;
      const startRank = turn === COLOR.WHITE ? 1 : 6;
      const promoRank = turn === COLOR.WHITE ? 7 : 0;

      // Forward
      const fwd = fromIdx + dir * 8;
      if (isValidIdx(fwd) && !board[fwd]) {
        if (rankOf(fwd) === promoRank) {
          for (const p of [PIECES.QUEEN, PIECES.ROOK, PIECES.BISHOP, PIECES.KNIGHT]) {
            addMove(fwd, { promotion: p });
          }
        } else {
          addMove(fwd);
          // Double push
          if (r === startRank) {
            const dbl = fromIdx + dir * 16;
            if (!board[dbl]) addMove(dbl, { enPassantTarget: fwd + dir * 0 });
          }
        }
      }

      // Captures
      for (const cf of [-1, 1]) {
        const nf = f + cf;
        if (nf < 0 || nf > 7) continue;
        const capIdx = (r + dir) * 8 + nf;
        if (board[capIdx] && board[capIdx].color === opponent) {
          if (rankOf(capIdx) === promoRank) {
            for (const p of [PIECES.QUEEN, PIECES.ROOK, PIECES.BISHOP, PIECES.KNIGHT]) {
              addMove(capIdx, { promotion: p });
            }
          } else {
            addMove(capIdx);
          }
        }
        // En passant
        if (enPassant !== null && capIdx === enPassant) {
          addMove(capIdx, { enPassant: true });
        }
      }
      break;
    }

    case PIECES.KNIGHT: {
      for (const [dr, df] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
        const nr = r + dr, nf = f + df;
        if (nr < 0 || nr > 7 || nf < 0 || nf > 7) continue;
        const toIdx = nr * 8 + nf;
        if (!board[toIdx] || board[toIdx].color !== turn) addMove(toIdx);
      }
      break;
    }

    case PIECES.BISHOP: {
      for (const [dr, df] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
        let nr = r + dr, nf = f + df;
        while (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
          const toIdx = nr * 8 + nf;
          if (board[toIdx]) {
            if (board[toIdx].color !== turn) addMove(toIdx);
            break;
          }
          addMove(toIdx);
          nr += dr; nf += df;
        }
      }
      break;
    }

    case PIECES.ROOK: {
      for (const [dr, df] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        let nr = r + dr, nf = f + df;
        while (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
          const toIdx = nr * 8 + nf;
          if (board[toIdx]) {
            if (board[toIdx].color !== turn) addMove(toIdx);
            break;
          }
          addMove(toIdx);
          nr += dr; nf += df;
        }
      }
      break;
    }

    case PIECES.QUEEN: {
      for (const [dr, df] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]) {
        let nr = r + dr, nf = f + df;
        while (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
          const toIdx = nr * 8 + nf;
          if (board[toIdx]) {
            if (board[toIdx].color !== turn) addMove(toIdx);
            break;
          }
          addMove(toIdx);
          nr += dr; nf += df;
        }
      }
      break;
    }

    case PIECES.KING: {
      for (const [dr, df] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]) {
        const nr = r + dr, nf = f + df;
        if (nr < 0 || nr > 7 || nf < 0 || nf > 7) continue;
        const toIdx = nr * 8 + nf;
        if (!board[toIdx] || board[toIdx].color !== turn) addMove(toIdx);
      }

      // Castling
      if (turn === COLOR.WHITE) {
        if (castling.includes('K') && !board[5] && !board[6] &&
            !isAttackedBy(board, 4, opponent) &&
            !isAttackedBy(board, 5, opponent) &&
            !isAttackedBy(board, 6, opponent)) {
          addMove(6, { castling: 'K' });
        }
        if (castling.includes('Q') && !board[3] && !board[2] && !board[1] &&
            !isAttackedBy(board, 4, opponent) &&
            !isAttackedBy(board, 3, opponent) &&
            !isAttackedBy(board, 2, opponent)) {
          addMove(2, { castling: 'Q' });
        }
      } else {
        if (castling.includes('k') && !board[61] && !board[62] &&
            !isAttackedBy(board, 60, opponent) &&
            !isAttackedBy(board, 61, opponent) &&
            !isAttackedBy(board, 62, opponent)) {
          addMove(62, { castling: 'k' });
        }
        if (castling.includes('q') && !board[59] && !board[58] && !board[57] &&
            !isAttackedBy(board, 60, opponent) &&
            !isAttackedBy(board, 59, opponent) &&
            !isAttackedBy(board, 58, opponent)) {
          addMove(58, { castling: 'q' });
        }
      }
      break;
    }
  }

  return moves;
}

// Apply move and return new state
function applyMove(state, move) {
  const board = state.board.map(p => p ? { ...p } : null);
  const { from, to, promotion, enPassant: isEP, castling: castlingSide } = move;
  const piece = { ...board[from] };
  const turn = state.turn;
  const opponent = turn === COLOR.WHITE ? COLOR.BLACK : COLOR.WHITE;

  // Track castling rights
  let castling = state.castling;

  board[to] = promotion ? { type: promotion, color: piece.color } : piece;
  board[from] = null;

  // En passant capture
  if (isEP) {
    const dir = turn === COLOR.WHITE ? 1 : -1;
    const captureIdx = to - dir * 8;
    board[captureIdx] = null;
  }

  // Castling rook move
  if (castlingSide) {
    if (castlingSide === 'K') { board[5] = board[7]; board[7] = null; }
    else if (castlingSide === 'Q') { board[3] = board[0]; board[0] = null; }
    else if (castlingSide === 'k') { board[61] = board[63]; board[63] = null; }
    else if (castlingSide === 'q') { board[59] = board[56]; board[56] = null; }
  }

  // Update castling rights
  if (piece.type === PIECES.KING) {
    if (turn === COLOR.WHITE) castling = castling.replace('K', '').replace('Q', '');
    else castling = castling.replace('k', '').replace('q', '');
  }
  if (from === 0 || to === 0) castling = castling.replace('Q', '');
  if (from === 7 || to === 7) castling = castling.replace('K', '');
  if (from === 56 || to === 56) castling = castling.replace('q', '');
  if (from === 63 || to === 63) castling = castling.replace('k', '');
  if (!castling) castling = '-';

  // En passant target
  let enPassantTarget = null;
  if (piece.type === PIECES.PAWN && Math.abs(to - from) === 16) {
    enPassantTarget = (from + to) >> 1;
  }

  // Half move clock
  const halfMove = (piece.type === PIECES.PAWN || board[to]) ? 0 : state.halfMove + 1;
  const fullMove = turn === COLOR.BLACK ? state.fullMove + 1 : state.fullMove;

  return {
    board,
    turn: opponent,
    castling,
    enPassant: enPassantTarget,
    halfMove,
    fullMove
  };
}

// Get legal moves for a piece
function getLegalMoves(state, fromIdx) {
  const pseudoMoves = generatePseudoMoves(state, fromIdx);
  return pseudoMoves.filter(move => {
    const newState = applyMove(state, move);
    return !isInCheck(newState.board, state.turn);
  });
}

// Get all legal moves for current player
function getAllLegalMoves(state) {
  const moves = [];
  for (let i = 0; i < 64; i++) {
    const p = state.board[i];
    if (p && p.color === state.turn) {
      moves.push(...getLegalMoves(state, i));
    }
  }
  return moves;
}

// Game status
function getGameStatus(state) {
  const legalMoves = getAllLegalMoves(state);
  const inCheck = isInCheck(state.board, state.turn);
  
  if (legalMoves.length === 0) {
    if (inCheck) return { status: 'checkmate', winner: state.turn === COLOR.WHITE ? COLOR.BLACK : COLOR.WHITE };
    return { status: 'stalemate', winner: null };
  }

  if (state.halfMove >= 100) return { status: 'draw', winner: null, reason: '50-move rule' };

  // Insufficient material check
  const pieces = state.board.filter(Boolean);
  if (pieces.length === 2) return { status: 'draw', winner: null, reason: 'insufficient material' };
  if (pieces.length === 3) {
    const nonKing = pieces.find(p => p.type !== PIECES.KING);
    if (nonKing && (nonKing.type === PIECES.BISHOP || nonKing.type === PIECES.KNIGHT)) {
      return { status: 'draw', winner: null, reason: 'insufficient material' };
    }
  }

  return { status: inCheck ? 'check' : 'active', winner: null };
}

// Make a move from algebraic notation (e.g., "e2e4" or "e7e8q")
function makeMove(state, fromSq, toSq, promotion = null) {
  const fromIdx = squareToIdx(fromSq);
  const toIdx = squareToIdx(toSq);
  
  const legalMoves = getLegalMoves(state, fromIdx);
  const move = legalMoves.find(m => {
    if (m.from !== fromIdx || m.to !== toIdx) return false;
    if (promotion) return m.promotion === promotion;
    return true;
  });

  if (!move) return null;
  
  const newState = applyMove(state, move);
  const gameStatus = getGameStatus(newState);
  
  return {
    state: newState,
    move,
    fen: toFEN(newState),
    gameStatus
  };
}

// Get piece symbol for move notation
function getMoveNotation(state, move) {
  const piece = state.board[move.from];
  if (!piece) return '';
  
  const fromSq = idxToSquare(move.from);
  const toSq = idxToSquare(move.to);
  
  if (move.castling === 'K' || move.castling === 'k') return 'O-O';
  if (move.castling === 'Q' || move.castling === 'q') return 'O-O-O';
  
  let notation = '';
  if (piece.type !== PIECES.PAWN) notation += piece.type.toUpperCase();
  
  const isCapture = state.board[move.to] !== null || move.enPassant;
  if (piece.type === PIECES.PAWN && isCapture) notation += fromSq[0];
  if (isCapture) notation += 'x';
  notation += toSq;
  if (move.promotion) notation += '=' + move.promotion.toUpperCase();
  
  return notation;
}

module.exports = {
  PIECES, COLOR, INITIAL_FEN,
  parseFEN, toFEN,
  getLegalMoves, getAllLegalMoves,
  makeMove, applyMove,
  isInCheck, getGameStatus,
  squareToIdx, idxToSquare,
  getMoveNotation
};
