import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { parseFEN, INITIAL_FEN } from '../chess/engine';
import ChessBoard from '../components/ChessBoard';
import Clock from '../components/Clock';
import MoveHistory from '../components/MoveHistory';
import GameChat from '../components/GameChat';

export default function GamePage() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const { socket } = useSocket();
  const { user } = useAuth();

  const [fen, setFen] = useState(INITIAL_FEN);
  const [myColor, setMyColor] = useState(null);
  const [moves, setMoves] = useState([]);
  const [lastMove, setLastMove] = useState(null);
  const [status, setStatus] = useState('waiting');
  const [chatMessages, setChatMessages] = useState([]);
  const [drawOffer, setDrawOffer] = useState(false);
  const [opponentName, setOpponentName] = useState('');
  const [timeWhite, setTimeWhite] = useState(600000);
  const [timeBlack, setTimeBlack] = useState(600000);
  const [gameOver, setGameOver] = useState(null);
  const [ratingChange, setRatingChange] = useState(null);
  const [isBot, setIsBot] = useState(false);
  const myColorRef = useRef(null);

  useEffect(() => {
    if (!socket) return;
    socket.emit('game:reconnect', { gameId });
  }, [socket, gameId]);

  useEffect(() => {
    if (!socket) return;

    const handlers = {
      'game:state': ({ gameState: gs, color }) => {
        setFen(gs.current_fen || INITIAL_FEN);
        setMoves(gs.moves || []);
        setStatus(gs.status);
        setMyColor(color);
        myColorRef.current = color;
        setTimeWhite(gs.timeWhite || gs.time_control * 1000);
        setTimeBlack(gs.timeBlack || gs.time_control * 1000);
        setIsBot(!!gs.isBot);
        if (color === 'w') setOpponentName(gs.black_username || 'Opponent');
        else if (color === 'b') setOpponentName(gs.white_username || 'Opponent');
      },

      'game:start': ({ color, gameState: gs, opponent, isBot: bot }) => {
        setMyColor(color);
        myColorRef.current = color;
        setOpponentName(opponent || 'Opponent');
        setFen(gs.current_fen || INITIAL_FEN);
        setStatus('active');
        setTimeWhite(gs.timeWhite || gs.time_control * 1000);
        setTimeBlack(gs.timeBlack || gs.time_control * 1000);
        setIsBot(!!bot);
        setMoves([]);
      },

      'game:opponentJoined': ({ username }) => {
        setOpponentName(username);
        setStatus('active');
      },

      'game:move': ({ from, to, promotion, fen: newFen, timeWhite: tw, timeBlack: tb, notation, moveNumber }) => {
        setFen(newFen);
        setLastMove({ from, to });
        if (tw !== undefined) setTimeWhite(tw);
        if (tb !== undefined) setTimeBlack(tb);
        setMoves(prev => {
          // Use server notation if available
          const moveObj = { from, to, promotion, notation };
          return [...prev, moveObj];
        });
      },

      'game:over': ({ result: r, winnerColor }) => {
        setGameOver({ result: r, winnerColor });
        setStatus('finished');
      },

      'game:ratingChange': (changes) => setRatingChange(changes),

      'game:chat': (msg) => setChatMessages(prev => [...prev, msg]),

      'game:drawOffer': ({ from }) => setDrawOffer(from),
      'game:drawDeclined': () => setDrawOffer(false),

      'game:opponentDisconnected': () =>
        setChatMessages(prev => [...prev, { from: 'System', message: '⚠️ Opponent disconnected', timestamp: Date.now() }]),

      'game:resign': ({ player }) =>
        setChatMessages(prev => [...prev, { from: 'System', message: `${player} resigned`, timestamp: Date.now() }]),

      'error': ({ message }) => console.error('Game error:', message)
    };

    Object.entries(handlers).forEach(([event, handler]) => socket.on(event, handler));
    return () => Object.keys(handlers).forEach(event => socket.off(event));
  }, [socket]);

  const handleMove = useCallback((from, to, promotion) => {
    socket?.emit('game:move', { gameId, from, to, promotion });
  }, [socket, gameId]);

  const handleResign = () => {
    if (window.confirm('Resign this game?')) socket?.emit('game:resign', { gameId });
  };

  const chessState = parseFEN(fen);
  const isMyTurn = myColor && chessState.turn === myColor;
  const isActive = status === 'active';

  const getResultText = () => {
    if (!gameOver) return '';
    const { result: r, winnerColor } = gameOver;
    if (r === 'checkmate') return winnerColor === myColor ? '🏆 You won by checkmate!' : '💀 Checkmate — you lost';
    if (r === 'resignation') return winnerColor === myColor ? '🏆 Opponent resigned!' : '💀 You resigned';
    if (r === 'timeout') return winnerColor === myColor ? '🏆 Won on time!' : '💀 Lost on time';
    if (r === 'stalemate') return '🤝 Stalemate';
    if (r === 'agreement') return '🤝 Draw by agreement';
    if (r === 'draw') return '🤝 Draw';
    return 'Game over';
  };

  const myRatingDelta = ratingChange && myColor
    ? (myColor === 'w' ? ratingChange.white.change : ratingChange.black.change)
    : null;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0f', color: '#e8e8e8', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 20px', borderBottom: '1px solid #111', backgroundColor: '#050508'
      }}>
        <div onClick={() => navigate('/')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>♛</span>
          <span style={{
            fontFamily: 'Georgia, serif', fontSize: 18, fontWeight: 700,
            background: 'linear-gradient(135deg, #c9a14a, #f0d080)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
          }}>NOchess</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isBot && <span style={{ color: '#888', fontSize: 12, border: '1px solid #333', borderRadius: 4, padding: '2px 8px' }}>🤖 vs Bot</span>}
          <div style={{ color: '#444', fontSize: 11, fontFamily: 'monospace' }}>{gameId?.substring(0, 8)}</div>
        </div>
      </div>

      {/* Main */}
      <div style={{
        flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
        padding: '20px 16px', gap: 20, flexWrap: 'wrap'
      }}>
        {/* Board column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 'min(540px, calc(100vw - 32px))' }}>
          {/* Opponent clock */}
          <Clock
            timeMs={myColor === 'w' ? timeBlack : timeWhite}
            isActive={isActive && chessState.turn !== myColor}
            color={myColor === 'w' ? 'b' : 'w'}
            username={opponentName || '...'}
          />

          <ChessBoard
            fen={fen}
            playerColor={myColor || 'w'}
            onMove={handleMove}
            lastMove={lastMove}
            disabled={!isMyTurn || !isActive}
          />

          {/* My clock */}
          <Clock
            timeMs={myColor === 'w' ? timeWhite : timeBlack}
            isActive={isActive && chessState.turn === myColor}
            color={myColor || 'w'}
            username={user?.username || 'You'}
          />
        </div>

        {/* Sidebar */}
        <div style={{
          width: 250, minWidth: 220, maxWidth: 280,
          display: 'flex', flexDirection: 'column',
          backgroundColor: '#0d0d18', border: '1px solid #1a1a2e',
          borderRadius: 12, overflow: 'hidden',
          maxHeight: 'calc(100vh - 80px)', minHeight: 400
        }}>
          {/* Status */}
          <div style={{
            padding: '10px 14px', borderBottom: '1px solid #1a1a2e',
            backgroundColor: isMyTurn && isActive ? 'rgba(201,161,74,0.07)' : 'transparent'
          }}>
            {status === 'waiting' ? (
              <div style={{ color: '#666', fontSize: 13 }}>⏳ Waiting for opponent...</div>
            ) : gameOver ? (
              <div>
                <div style={{ color: '#c9a14a', fontSize: 13, fontWeight: 600 }}>{getResultText()}</div>
                {myRatingDelta !== null && (
                  <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                    {ratingChange.category ? `${ratingChange.category} ` : ''}Elo:{' '}
                    <span style={{ color: myRatingDelta >= 0 ? '#4caf50' : '#e74c3c', fontWeight: 700 }}>
                      {myRatingDelta >= 0 ? '+' : ''}{myRatingDelta}
                    </span>
                  </div>
                )}
                {isBot && (
                  <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>Bot game — no Elo change</div>
                )}
              </div>
            ) : (
              <div style={{ color: isMyTurn ? '#c9a14a' : '#777', fontSize: 13 }}>
                {isMyTurn ? '♟ Your turn' : `⏱ ${opponentName}'s turn`}
              </div>
            )}
          </div>

          {/* Move history */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            <MoveHistory moves={moves} />
          </div>

          {/* Controls */}
          {isActive && myColor && (
            <div style={{ padding: 10, borderTop: '1px solid #1a1a2e', display: 'flex', gap: 8 }}>
              {!isBot && (
                <button onClick={() => socket?.emit('game:drawOffer', { gameId })} style={sideBtn('#1a2a1a', '#4caf50')}>
                  ½ Draw
                </button>
              )}
              <button onClick={handleResign} style={sideBtn('#2a1a1a', '#e74c3c')}>
                ⚑ Resign
              </button>
            </div>
          )}

          {gameOver && (
            <div style={{ padding: 10, borderTop: '1px solid #1a1a2e', display: 'flex', gap: 8 }}>
              <button onClick={() => navigate('/')} style={sideBtn('#1a1a2e', '#c9a14a')}>
                ← New game
              </button>
            </div>
          )}

          {/* Draw offer */}
          {drawOffer && (
            <div style={{ padding: 12, borderTop: '1px solid #2a2a1a', backgroundColor: '#151e15' }}>
              <div style={{ fontSize: 12, color: '#ccc', marginBottom: 8 }}>{drawOffer} offers a draw</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { socket?.emit('game:drawAccept', { gameId }); setDrawOffer(false); }} style={sideBtn('#1a2a1a', '#4caf50')}>Accept</button>
                <button onClick={() => { socket?.emit('game:drawDecline', { gameId }); setDrawOffer(false); }} style={sideBtn('#2a1a1a', '#e74c3c')}>Decline</button>
              </div>
            </div>
          )}

          {/* Chat (not in bot games) */}
          {!isBot && (
            <GameChat
              messages={chatMessages}
              onSend={(msg) => socket?.emit('game:chat', { gameId, message: msg })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function sideBtn(bg, color) {
  return {
    flex: 1, padding: '7px 4px',
    backgroundColor: bg,
    border: `1px solid ${color}`,
    borderRadius: 6, color,
    cursor: 'pointer', fontSize: 11, fontWeight: 600,
    transition: 'opacity 0.2s', fontFamily: 'Georgia, serif'
  };
}
