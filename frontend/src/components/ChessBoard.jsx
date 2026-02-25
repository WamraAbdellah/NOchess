import { useState, useCallback, useEffect } from 'react';
import { parseFEN, getLegalMoves, idxToSquare, squareToIdx, isInCheck, findKing, COLOR } from '../chess/engine';

const PIECE_SYMBOLS = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
};

const PIECE_SVG = {
  'wk': `<g fill="none" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22.5 11.63V6M20 8h5" stroke-linejoin="miter"/>
    <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" fill="#fff" stroke-linecap="butt" stroke-linejoin="miter"/>
    <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V17s-5.5-3.5-10-1c-5 2.5-3 8.5 3 10.5 0 0-4 2-4 8.5z" fill="#fff"/>
    <path d="M11.5 30c5.5-3 15.5-3 21 0M11.5 33.5c5.5-3 15.5-3 21 0M11.5 37c5.5-3 15.5-3 21 0"/>
  </g>`,
  'bk': `<g fill="none" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22.5 11.63V6" stroke-linejoin="miter"/>
    <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" fill="#000" stroke-linecap="butt" stroke-linejoin="miter"/>
    <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V17s-5.5-3.5-10-1c-5 2.5-3 8.5 3 10.5 0 0-4 2-4 8.5z" fill="#000"/>
    <path d="M20 8h5" stroke-linejoin="miter"/>
    <path d="M11.5 30c5.5-3 15.5-3 21 0M11.5 33.5c5.5-3 15.5-3 21 0M11.5 37c5.5-3 15.5-3 21 0" stroke="#c0c0c0"/>
  </g>`,
};

// Unicode chess pieces styled
function ChessPiece({ piece, isDragging }) {
  const symbols = {
    wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙',
    bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟'
  };
  const key = `${piece.color}${piece.type}`;
  const isWhite = piece.color === 'w';
  
  return (
    <div style={{
      fontSize: 'clamp(20px, 5vw, 44px)',
      lineHeight: 1,
      color: isWhite ? '#f0f0e8' : '#1a1a1a',
      textShadow: isWhite 
        ? '0 1px 3px rgba(0,0,0,0.8), 0 0 6px rgba(0,0,0,0.4)' 
        : '0 1px 2px rgba(255,255,255,0.3)',
      userSelect: 'none',
      cursor: isDragging ? 'grabbing' : 'grab',
      transition: isDragging ? 'none' : 'transform 0.1s',
      transform: isDragging ? 'scale(1.3)' : 'scale(1)',
      filter: isWhite ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))' : 'none',
      pointerEvents: 'none'
    }}>
      {symbols[key]}
    </div>
  );
}

export default function ChessBoard({ fen, playerColor = 'w', onMove, lastMove, disabled = false }) {
  const [selected, setSelected] = useState(null);
  const [legalMoves, setLegalMoves] = useState([]);
  const [promotionModal, setPromotionModal] = useState(null);
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const state = parseFEN(fen);
  const isFlipped = playerColor === 'b';
  const inCheck = isInCheck(state.board, state.turn);
  const kingInCheck = inCheck ? findKing(state.board, state.turn) : -1;

  const handleSquareClick = useCallback((idx) => {
    if (disabled) return;
    const piece = state.board[idx];

    if (selected !== null) {
      if (idx === selected) {
        setSelected(null);
        setLegalMoves([]);
        return;
      }

      const move = legalMoves.find(m => m.to === idx);
      if (move) {
        if (move.promotion) {
          setPromotionModal({ from: idxToSquare(selected), to: idxToSquare(idx) });
        } else {
          onMove?.(idxToSquare(selected), idxToSquare(idx));
        }
        setSelected(null);
        setLegalMoves([]);
        return;
      }
    }

    if (piece && piece.color === state.turn && piece.color === playerColor) {
      setSelected(idx);
      setLegalMoves(getLegalMoves(state, idx));
    } else {
      setSelected(null);
      setLegalMoves([]);
    }
  }, [selected, legalMoves, state, playerColor, disabled, onMove]);

  const handleDragStart = (e, idx) => {
    if (disabled) { e.preventDefault(); return; }
    const piece = state.board[idx];
    if (!piece || piece.color !== state.turn || piece.color !== playerColor) { e.preventDefault(); return; }
    setDragFrom(idx);
    setSelected(idx);
    setLegalMoves(getLegalMoves(state, idx));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e, toIdx) => {
    e.preventDefault();
    if (dragFrom === null) return;
    
    const move = legalMoves.find(m => m.from === dragFrom && m.to === toIdx);
    if (move) {
      if (move.promotion) {
        setPromotionModal({ from: idxToSquare(dragFrom), to: idxToSquare(toIdx) });
      } else {
        onMove?.(idxToSquare(dragFrom), idxToSquare(toIdx));
      }
    }
    setDragFrom(null);
    setDragOver(null);
    setSelected(null);
    setLegalMoves([]);
  };

  const handlePromotion = (piece) => {
    if (promotionModal) {
      onMove?.(promotionModal.from, promotionModal.to, piece);
    }
    setPromotionModal(null);
  };

  const renderSquares = () => {
    const squares = [];
    for (let display = 0; display < 64; display++) {
      const row = Math.floor(display / 8);
      const col = display % 8;
      const rank = isFlipped ? row : 7 - row;
      const file = isFlipped ? 7 - col : col;
      const idx = rank * 8 + file;
      
      const piece = state.board[idx];
      const sq = idxToSquare(idx);
      const isLight = (rank + file) % 2 === 1;
      const isSelected = selected === idx;
      const isLegalTarget = legalMoves.some(m => m.to === idx);
      const isLastMoveFrom = lastMove && squareToIdx(lastMove.from) === idx;
      const isLastMoveTo = lastMove && squareToIdx(lastMove.to) === idx;
      const isKingInCheck = idx === kingInCheck;
      const isDragTarget = dragOver === idx;

      let bgColor;
      if (isKingInCheck) bgColor = '#e74c3c';
      else if (isSelected) bgColor = isLight ? '#f6f669' : '#baca2b';
      else if (isLastMoveFrom || isLastMoveTo) bgColor = isLight ? '#cdd26a' : '#aaa23a';
      else if (isDragTarget && isLegalTarget) bgColor = isLight ? '#f6f669' : '#baca2b';
      else bgColor = isLight ? '#f0d9b5' : '#b58863';

      squares.push(
        <div
          key={idx}
          style={{
            position: 'relative',
            backgroundColor: bgColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: (piece && piece.color === playerColor && piece.color === state.turn && !disabled) ? 'grab' : 'default',
            transition: 'background-color 0.15s',
          }}
          onClick={() => handleSquareClick(idx)}
          onDragOver={(e) => { e.preventDefault(); setDragOver(idx); }}
          onDragLeave={() => setDragOver(null)}
          onDrop={(e) => handleDrop(e, idx)}
        >
          {/* Coordinates */}
          {col === 0 && (
            <span style={{
              position: 'absolute', top: 2, left: 3,
              fontSize: '10px', fontWeight: 600,
              color: isLight ? '#b58863' : '#f0d9b5',
              lineHeight: 1, fontFamily: 'monospace'
            }}>
              {rank + 1}
            </span>
          )}
          {row === 7 && (
            <span style={{
              position: 'absolute', bottom: 2, right: 3,
              fontSize: '10px', fontWeight: 600,
              color: isLight ? '#b58863' : '#f0d9b5',
              lineHeight: 1, fontFamily: 'monospace'
            }}>
              {String.fromCharCode(97 + file)}
            </span>
          )}

          {/* Legal move indicator */}
          {isLegalTarget && !piece && (
            <div style={{
              width: '30%', height: '30%',
              borderRadius: '50%',
              backgroundColor: 'rgba(0,0,0,0.18)',
              pointerEvents: 'none'
            }} />
          )}
          {isLegalTarget && piece && (
            <div style={{
              position: 'absolute', inset: 0,
              border: '3px solid rgba(0,0,0,0.22)',
              borderRadius: '50%',
              pointerEvents: 'none'
            }} />
          )}

          {/* Piece */}
          {piece && (
            <div
              draggable={piece.color === playerColor && piece.color === state.turn && !disabled}
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}
            >
              <ChessPiece piece={piece} isDragging={dragFrom === idx} />
            </div>
          )}
        </div>
      );
    }
    return squares;
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gridTemplateRows: 'repeat(8, 1fr)',
        aspectRatio: '1/1',
        width: '100%',
        borderRadius: '4px',
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 0 2px #8b6914'
      }}>
        {renderSquares()}
      </div>

      {/* Promotion modal */}
      {promotionModal && (
        <div style={{
          position: 'absolute', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px',
          zIndex: 100
        }}>
          <div style={{
            backgroundColor: '#1a1a2e',
            border: '2px solid #c9a14a',
            borderRadius: '12px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{ color: '#c9a14a', fontFamily: 'Georgia, serif', fontSize: '16px' }}>
              Promote to:
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              {['q','r','b','n'].map(p => (
                <button
                  key={p}
                  onClick={() => handlePromotion(p)}
                  style={{
                    width: 60, height: 60,
                    backgroundColor: '#2a2a3e',
                    border: '2px solid #c9a14a',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '36px',
                    transition: 'all 0.2s',
                    color: playerColor === 'w' ? '#f0f0e8' : '#1a1a1a'
                  }}
                  onMouseEnter={e => e.target.style.backgroundColor = '#c9a14a'}
                  onMouseLeave={e => e.target.style.backgroundColor = '#2a2a3e'}
                >
                  <ChessPiece piece={{ type: p, color: playerColor }} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
