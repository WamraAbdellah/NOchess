import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';

const TIME_CONTROLS = [
  { label: 'Bullet', time: 60,   inc: 0, icon: '⚡' },
  { label: 'Bullet', time: 120,  inc: 1, icon: '⚡' },
  { label: 'Blitz',  time: 180,  inc: 0, icon: '🔥' },
  { label: 'Blitz',  time: 300,  inc: 0, icon: '🔥' },
  { label: 'Blitz',  time: 300,  inc: 3, icon: '🔥' },
  { label: 'Rapid',  time: 600,  inc: 0, icon: '⏱' },
  { label: 'Rapid',  time: 600,  inc: 5, icon: '⏱' },
  { label: 'Classic',time: 1800, inc: 0, icon: '♟' },
];

const BOT_LEVELS = [
  { key: 'beginner',     name: 'Beginner',     rating: 400,  color: '#8bc34a', icon: '🌱' },
  { key: 'easy',         name: 'Easy',         rating: 800,  color: '#4caf50', icon: '🙂' },
  { key: 'intermediate', name: 'Intermediate', rating: 1200, color: '#ff9800', icon: '🤔' },
  { key: 'advanced',     name: 'Advanced',     rating: 1600, color: '#f44336', icon: '😤' },
  { key: 'expert',       name: 'Expert',       rating: 2000, color: '#9c27b0', icon: '🧠' },
];

function fmt(time, inc) {
  const min = time / 60;
  return inc > 0 ? `${min}+${inc}` : `${min}`;
}

export default function HomePage() {
  const navigate = useNavigate();
  const { socket } = useSocket();
  const { user, logout } = useAuth();

  const [tab, setTab] = useState('online'); // 'online' | 'bot'
  const [matchmaking, setMatchmaking] = useState(false);
  const [selectedTC, setSelectedTC] = useState(TIME_CONTROLS[5]);
  const [waitTime, setWaitTime] = useState(0);
  const [onlineCount, setOnlineCount] = useState(0);
  const [showAuth, setShowAuth] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [botLevel, setBotLevel] = useState(BOT_LEVELS[2]);
  const [botColor, setBotColor] = useState('w');
  const [botTC, setBotTC] = useState(TIME_CONTROLS[5]);

  // Online count
  useEffect(() => {
    if (!socket) return;
    socket.emit('lobby:getOnline');
    const handler = ({ count }) => setOnlineCount(count);
    socket.on('lobby:online', handler);
    return () => socket.off('lobby:online', handler);
  }, [socket]);

  // Game start / matchmaking
  useEffect(() => {
    if (!socket) return;
    const onStart = ({ gameId }) => {
      setMatchmaking(false);
      navigate(`/game/${gameId}`);
    };
    const onWaiting = () => setMatchmaking(true);
    const onCancelled = () => setMatchmaking(false);

    socket.on('game:start', onStart);
    socket.on('matchmaking:waiting', onWaiting);
    socket.on('matchmaking:cancelled', onCancelled);
    return () => {
      socket.off('game:start', onStart);
      socket.off('matchmaking:waiting', onWaiting);
      socket.off('matchmaking:cancelled', onCancelled);
    };
  }, [socket, navigate]);

  // Matchmaking timer
  useEffect(() => {
    let iv;
    if (matchmaking) iv = setInterval(() => setWaitTime(p => p + 1), 1000);
    else setWaitTime(0);
    return () => clearInterval(iv);
  }, [matchmaking]);

  // Leaderboard
  useEffect(() => {
    fetch('/api/games/leaderboard/top')
      .then(r => r.json())
      .then(d => setLeaderboard(Array.isArray(d) ? d.slice(0, 10) : []))
      .catch(() => {});
  }, []);

  const startMatchmaking = () => {
    socket?.emit('matchmaking:join', { timeControl: selectedTC.time, increment: selectedTC.inc });
  };

  const cancelMatchmaking = () => {
    socket?.emit('matchmaking:cancel');
    setMatchmaking(false);
  };

  const startBotGame = () => {
    socket?.emit('bot:start', {
      level: botLevel.key,
      playerColor: botColor,
      timeControl: botTC.time
    });
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#07070d',
      color: '#e8e8e8',
      fontFamily: 'Georgia, serif',
    }}>
      {/* Background glow */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 20% 30%, rgba(201,161,74,0.04) 0%, transparent 55%), radial-gradient(ellipse at 80% 70%, rgba(30,60,120,0.06) 0%, transparent 55%)'
      }} />

      {/* Nav */}
      <nav style={{
        position: 'relative', zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 32px',
        borderBottom: '1px solid rgba(201,161,74,0.12)',
        backgroundColor: 'rgba(7,7,13,0.95)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '26px' }}>♛</span>
          <span style={{
            fontSize: '22px', fontWeight: 900,
            background: 'linear-gradient(135deg, #c9a14a 0%, #f0d080 50%, #c9a14a 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
          }}>NOchess</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '13px', color: '#666' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#4caf50' }} />
            {onlineCount} online
          </div>
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                style={{ fontSize: '14px', color: '#c9a14a', fontWeight: 600, cursor: 'pointer' }}
                onClick={() => navigate(`/profile/${user.username}`)}
              >
                {user.username} <span style={{ color: '#888', fontWeight: 400 }}>({user.rating ?? 1200})</span>
              </span>
              <button onClick={logout} style={ghostBtn}>Logout</button>
            </div>
          ) : (
            <button onClick={() => setShowAuth(true)} style={goldBtn}>Sign In</button>
          )}
        </div>
      </nav>

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 960, margin: '0 auto', padding: '48px 24px' }}>

        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h1 style={{
            fontSize: 'clamp(36px, 7vw, 72px)', fontWeight: 900, lineHeight: 1.1, marginBottom: 12,
            background: 'linear-gradient(180deg, #fff 0%, #c9a14a 55%, #8b6914 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
          }}>
            Play Chess.<br/>Your Way.
          </h1>
          <p style={{ fontSize: 16, color: '#777', lineHeight: 1.7 }}>
            Chess platform built from scratch — no libraries, real engine, real Elo.
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28, gap: 8 }}>
          {[['online', '🌐 Play Online'], ['bot', '🤖 Play vs Bot']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{
              padding: '10px 28px',
              backgroundColor: tab === key ? 'rgba(201,161,74,0.12)' : 'transparent',
              border: tab === key ? '1px solid #c9a14a' : '1px solid #333',
              borderRadius: 8, cursor: 'pointer',
              color: tab === key ? '#c9a14a' : '#888',
              fontFamily: 'Georgia, serif', fontSize: 14, fontWeight: 600,
              transition: 'all 0.2s'
            }}>
              {label}
            </button>
          ))}
        </div>

        {/* Online matchmaking */}
        {tab === 'online' && (
          <div style={{ maxWidth: 580, margin: '0 auto', textAlign: 'center' }}>
            {!matchmaking ? (
              <>
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 8, marginBottom: 24
                }}>
                  {TIME_CONTROLS.map((tc, i) => (
                    <button key={i} onClick={() => setSelectedTC(tc)} style={{
                      padding: '12px 6px',
                      backgroundColor: selectedTC === tc ? 'rgba(201,161,74,0.12)' : 'rgba(255,255,255,0.03)',
                      border: selectedTC === tc ? '1px solid #c9a14a' : '1px solid rgba(255,255,255,0.07)',
                      borderRadius: 10, cursor: 'pointer',
                      color: selectedTC === tc ? '#c9a14a' : '#777',
                      fontFamily: 'Georgia, serif', transition: 'all 0.2s',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3
                    }}>
                      <span style={{ fontSize: 18 }}>{tc.icon}</span>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{fmt(tc.time, tc.inc)}</span>
                      <span style={{ fontSize: 11, opacity: 0.7 }}>{tc.label}</span>
                    </button>
                  ))}
                </div>
                <button onClick={startMatchmaking} style={{
                  padding: '15px 0', width: '100%', maxWidth: 280,
                  background: 'linear-gradient(135deg, #c9a14a, #8b6914)',
                  border: 'none', borderRadius: 12, color: '#fff',
                  fontFamily: 'Georgia, serif', fontSize: 17, fontWeight: 700,
                  cursor: 'pointer', letterSpacing: 0.5,
                  boxShadow: '0 4px 20px rgba(201,161,74,0.25)',
                  transition: 'transform 0.2s'
                }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  ♟ Play Now
                </button>
              </>
            ) : (
              <div style={{
                padding: 40, border: '1px solid rgba(201,161,74,0.2)',
                borderRadius: 16, backgroundColor: 'rgba(201,161,74,0.04)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16
              }}>
                <div style={{
                  width: 44, height: 44, border: '3px solid #c9a14a',
                  borderTopColor: 'transparent', borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                <div style={{ color: '#c9a14a', fontSize: 18, fontWeight: 600 }}>Finding opponent...</div>
                <div style={{ color: '#888', fontSize: 13 }}>
                  {selectedTC.icon} {fmt(selectedTC.time, selectedTC.inc)} • {waitTime}s
                </div>
                <button onClick={cancelMatchmaking} style={{
                  backgroundColor: 'transparent', border: '1px solid #e74c3c',
                  color: '#e74c3c', padding: '8px 24px', borderRadius: 8,
                  cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: 13
                }}>Cancel</button>
              </div>
            )}
          </div>
        )}

        {/* Bot game */}
        {tab === 'bot' && (
          <div style={{ maxWidth: 560, margin: '0 auto' }}>
            <div style={{ marginBottom: 24 }}>
              <div style={{ color: '#888', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                Select Difficulty
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {BOT_LEVELS.map(lvl => (
                  <button key={lvl.key} onClick={() => setBotLevel(lvl)} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px',
                    backgroundColor: botLevel.key === lvl.key ? 'rgba(201,161,74,0.08)' : 'rgba(255,255,255,0.02)',
                    border: botLevel.key === lvl.key ? `1px solid ${lvl.color}` : '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 22 }}>{lvl.icon}</span>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ color: botLevel.key === lvl.key ? lvl.color : '#ddd', fontWeight: 600, fontSize: 15, fontFamily: 'Georgia, serif' }}>
                          {lvl.name}
                        </div>
                        <div style={{ color: '#666', fontSize: 12 }}>No ELO impact</div>
                      </div>
                    </div>
                    <div style={{ color: lvl.color, fontWeight: 700, fontSize: 16 }}>{lvl.rating}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              {/* Color */}
              <div>
                <div style={{ color: '#888', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  Play as
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[['w', '♔ White'], ['b', '♚ Black'], ['r', '🎲 Random']].map(([c, label]) => (
                    <button key={c} onClick={() => setBotColor(c)} style={{
                      flex: 1, padding: '9px 4px', fontSize: 12,
                      backgroundColor: botColor === c ? 'rgba(201,161,74,0.12)' : 'rgba(255,255,255,0.02)',
                      border: botColor === c ? '1px solid #c9a14a' : '1px solid rgba(255,255,255,0.07)',
                      borderRadius: 8, cursor: 'pointer',
                      color: botColor === c ? '#c9a14a' : '#888',
                      fontFamily: 'Georgia, serif', transition: 'all 0.2s'
                    }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time control */}
              <div>
                <div style={{ color: '#888', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  Time Control
                </div>
                <select
                  value={TIME_CONTROLS.indexOf(botTC)}
                  onChange={e => setBotTC(TIME_CONTROLS[parseInt(e.target.value)])}
                  style={{
                    width: '100%', padding: '9px 10px',
                    backgroundColor: '#0d0d18', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8, color: '#ddd', fontSize: 13,
                    fontFamily: 'Georgia, serif', cursor: 'pointer', outline: 'none'
                  }}
                >
                  {TIME_CONTROLS.map((tc, i) => (
                    <option key={i} value={i}>{tc.icon} {fmt(tc.time, tc.inc)} {tc.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <button onClick={startBotGame} style={{
              width: '100%', padding: '14px',
              background: 'linear-gradient(135deg, #c9a14a, #8b6914)',
              border: 'none', borderRadius: 12, color: '#fff',
              fontFamily: 'Georgia, serif', fontSize: 16, fontWeight: 700,
              cursor: 'pointer', boxShadow: '0 4px 20px rgba(201,161,74,0.2)',
              transition: 'transform 0.2s'
            }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
            >
              🤖 Play vs {botLevel.name} ({botLevel.rating})
            </button>
            <p style={{ textAlign: 'center', color: '#555', fontSize: 12, marginTop: 10 }}>
              Bot games don't affect your Elo rating
            </p>
          </div>
        )}

        {/* Features + Leaderboard */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 20, marginTop: 60
        }}>
          <div style={card}>
            <h3 style={{ color: '#c9a14a', marginBottom: 16, fontSize: 15 }}>⚙️ Engine Features</h3>
            {['Complete move validation','Castling & en passant','Pawn promotion','Check/checkmate detection','Elo rating system','Server-side clock (no cheating)'].map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, color: '#aaa', fontSize: 13, lineHeight: 1.5 }}>
                <span style={{ color: '#c9a14a', flexShrink: 0 }}>✓</span>{f}
              </div>
            ))}
          </div>

          <div style={card}>
            <h3 style={{ color: '#c9a14a', marginBottom: 16, fontSize: 15 }}>🏆 Leaderboard</h3>
            {leaderboard.length === 0 ? (
              <div style={{ color: '#444', fontSize: 13 }}>Play a game to appear here!</div>
            ) : leaderboard.map((p, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 13
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: i===0?'#ffd700':i===1?'#c0c0c0':i===2?'#cd7f32':'#444', fontSize: 11, width: 18 }}>{i+1}</span>
                  <span
                    style={{ color: '#ddd', cursor: 'pointer' }}
                    onClick={() => navigate(`/profile/${p.username}`)}
                  >
                    {p.username}
                  </span>
                  <span style={{ color: '#555', fontSize: 11 }}>{p.games_played}g</span>
                </div>
                <span style={{ color: '#c9a14a', fontWeight: 700 }}>{p.rating}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: #111; }
        ::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 3px; }
      `}</style>
    </div>
  );
}

const card = {
  backgroundColor: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 14, padding: 20
};
const goldBtn = {
  backgroundColor: 'transparent', border: '1px solid #c9a14a',
  borderRadius: 6, color: '#c9a14a', padding: '7px 16px',
  cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: 14, transition: 'all 0.2s'
};
const ghostBtn = {
  backgroundColor: 'transparent', border: '1px solid #333',
  borderRadius: 6, color: '#888', padding: '7px 14px',
  cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: 13
};

// ─── Auth Modal ──────────────────────────────────────
function AuthModal({ onClose }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      if (mode === 'login') await login(form.email, form.password);
      else await register(form.username, form.email, form.password);
      onClose();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.82)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        backgroundColor: '#0d0d18', border: '1px solid rgba(201,161,74,0.25)',
        borderRadius: 16, padding: 40, width: '100%', maxWidth: 380
      }}>
        <h2 style={{
          textAlign: 'center', marginBottom: 8,
          background: 'linear-gradient(135deg, #c9a14a, #f0d080)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          fontFamily: 'Georgia, serif', fontSize: 22
        }}>
          {mode === 'login' ? 'Welcome Back' : 'Join NOchess'}
        </h2>

        <div style={{ display: 'flex', marginBottom: 24, borderBottom: '1px solid #1a1a2e' }}>
          {['login', 'register'].map(m => (
            <button key={m} onClick={() => { setMode(m); setError(''); }} style={{
              flex: 1, padding: '10px', backgroundColor: 'transparent', border: 'none',
              borderBottom: mode === m ? '2px solid #c9a14a' : '2px solid transparent',
              color: mode === m ? '#c9a14a' : '#666',
              cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: 13,
              marginBottom: -1, transition: 'all 0.2s'
            }}>
              {m === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'register' && (
            <input placeholder="Username" value={form.username}
              onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
              required style={inp} />
          )}
          <input type="email" placeholder="Email" value={form.email}
            onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            required style={inp} />
          <input type="password" placeholder="Password" value={form.password}
            onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
            required style={inp} />
          {error && <div style={{ color: '#e74c3c', fontSize: 12, textAlign: 'center' }}>{error}</div>}
          <button type="submit" disabled={loading} style={{
            padding: 13, marginTop: 4,
            background: loading ? '#333' : 'linear-gradient(135deg, #c9a14a, #8b6914)',
            border: 'none', borderRadius: 8, color: '#fff',
            fontFamily: 'Georgia, serif', fontSize: 15, fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer'
          }}>
            {loading ? '...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}

const inp = {
  padding: '11px 14px',
  backgroundColor: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 8, color: '#e8e8e8', fontSize: 14,
  outline: 'none', fontFamily: 'Georgia, serif'
};
