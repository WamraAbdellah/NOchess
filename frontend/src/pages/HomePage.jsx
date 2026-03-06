import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';

const TIME_CONTROLS = [
  { label: 'Bullet', time: 60,   inc: 0, icon: '⚡', cat: 'bullet' },
  { label: 'Bullet', time: 120,  inc: 1, icon: '⚡', cat: 'bullet' },
  { label: 'Blitz',  time: 180,  inc: 0, icon: '🔥', cat: 'blitz'  },
  { label: 'Blitz',  time: 300,  inc: 0, icon: '🔥', cat: 'blitz'  },
  { label: 'Blitz',  time: 300,  inc: 3, icon: '🔥', cat: 'blitz'  },
  { label: 'Rapid',  time: 600,  inc: 0, icon: '⏱', cat: 'rapid'  },
  { label: 'Rapid',  time: 600,  inc: 5, icon: '⏱', cat: 'rapid'  },
  { label: 'Classic',time: 1800, inc: 0, icon: '♟', cat: 'rapid'  },
];

const BOT_LEVELS = [
  { key: 'beginner',     name: 'Beginner',     rating: 400,  color: '#8bc34a', icon: '🌱' },
  { key: 'easy',         name: 'Easy',         rating: 800,  color: '#4caf50', icon: '🙂' },
  { key: 'intermediate', name: 'Intermediate', rating: 1200, color: '#ff9800', icon: '🤔' },
  { key: 'advanced',     name: 'Advanced',     rating: 1600, color: '#f44336', icon: '😤' },
  { key: 'expert',       name: 'Expert',       rating: 2000, color: '#9c27b0', icon: '🧠' },
];

const CAT_INFO = {
  bullet: { label: 'Bullet', icon: '⚡', color: '#e74c3c' },
  blitz:  { label: 'Blitz',  icon: '🔥', color: '#ff9800' },
  rapid:  { label: 'Rapid',  icon: '⏱', color: '#4caf50' },
};

function fmt(time, inc) {
  return inc > 0 ? `${time/60}+${inc}` : `${time/60}`;
}

function getRatingForCategory(user, cat) {
  if (!user) return null;
  if (cat === 'bullet') return user.rating_bullet ?? 1200;
  if (cat === 'blitz')  return user.rating_blitz  ?? 1200;
  return user.rating_rapid ?? 1200;
}

// ─── Leaderboard sub-component ───────────────────────────────────────────────
function Leaderboard({ navigate }) {
  const [cat, setCat] = useState('rapid');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/games/leaderboard/top?category=${cat}`)
      .then(r => r.json())
      .then(d => setRows(Array.isArray(d) ? d.slice(0, 10) : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [cat]);

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 style={{ color: '#c9a14a', fontSize: 15, margin: 0 }}>🏆 Leaderboard</h3>
        <div style={{ display: 'flex', gap: 4 }}>
          {Object.entries(CAT_INFO).map(([key, info]) => (
            <button key={key} onClick={() => setCat(key)} style={{
              padding: '3px 10px', fontSize: 11,
              backgroundColor: cat === key ? 'rgba(201,161,74,0.15)' : 'transparent',
              border: cat === key ? `1px solid ${info.color}` : '1px solid #2a2a2a',
              borderRadius: 6, cursor: 'pointer',
              color: cat === key ? info.color : '#666',
              transition: 'all 0.15s'
            }}>
              {info.icon} {info.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ color: '#444', fontSize: 13, textAlign: 'center', padding: '12px 0' }}>Loading...</div>
      ) : rows.length === 0 ? (
        <div style={{ color: '#444', fontSize: 13 }}>
          No {CAT_INFO[cat].label} games played yet — be the first!
        </div>
      ) : rows.map((p, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 13
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              color: i===0?'#ffd700':i===1?'#c0c0c0':i===2?'#cd7f32':'#444',
              fontSize: 11, width: 18, fontWeight: 700
            }}>{i+1}</span>
            <span style={{ color: '#ddd', cursor: 'pointer' }}
              onClick={() => navigate(`/profile/${p.username}`)}>
              {p.username}
            </span>
            <span style={{ color: '#555', fontSize: 11 }}>{p.games_played}g</span>
          </div>
          <span style={{ color: CAT_INFO[cat].color, fontWeight: 700 }}>{p.rating}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function HomePage() {
  const navigate = useNavigate();
  const { socket } = useSocket();
  const { user, logout } = useAuth();

  const [tab, setTab] = useState('online');
  const [matchmaking, setMatchmaking] = useState(false);
  const [selectedTC, setSelectedTC] = useState(TIME_CONTROLS[5]);
  const [waitTime, setWaitTime] = useState(0);
  const [onlineCount, setOnlineCount] = useState(0);
  const [showAuth, setShowAuth] = useState(false);
  const [botLevel, setBotLevel] = useState(BOT_LEVELS[2]);
  const [botColor, setBotColor] = useState('w');
  const [botTC, setBotTC] = useState(TIME_CONTROLS[5]);

  // Online count
  useEffect(() => {
    if (!socket) return;
    socket.emit('lobby:getOnline');
    const h = ({ count }) => setOnlineCount(count);
    socket.on('lobby:online', h);
    return () => socket.off('lobby:online', h);
  }, [socket]);

  // Game events
  useEffect(() => {
    if (!socket) return;
    const onStart = ({ gameId }) => { setMatchmaking(false); navigate(`/game/${gameId}`); };
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

  const startMatchmaking = () =>
    socket?.emit('matchmaking:join', { timeControl: selectedTC.time, increment: selectedTC.inc });

  const cancelMatchmaking = () => {
    socket?.emit('matchmaking:cancel');
    setMatchmaking(false);
  };

  const startBotGame = () => {
    const color = botColor === 'r' ? (Math.random() > 0.5 ? 'w' : 'b') : botColor;
    socket?.emit('bot:start', { level: botLevel.key, playerColor: color, timeControl: botTC.time });
  };

  // Rating to show in nav = category of selected time control
  const navRating = user ? getRatingForCategory(user, selectedTC.cat) : null;
  const navCatInfo = CAT_INFO[selectedTC.cat];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#07070d', color: '#e8e8e8', fontFamily: 'Georgia, serif' }}>
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 20% 30%, rgba(201,161,74,0.04) 0%, transparent 55%)'
      }} />

      {/* Nav */}
      <nav style={{
        position: 'relative', zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 28px', borderBottom: '1px solid rgba(201,161,74,0.12)',
        backgroundColor: 'rgba(7,7,13,0.95)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>♛</span>
          <span style={{
            fontSize: 20, fontWeight: 900,
            background: 'linear-gradient(135deg, #c9a14a 0%, #f0d080 50%, #c9a14a 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
          }}>NOchess</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#4caf50' }} />
            {onlineCount} online
          </div>

          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Show all 3 ratings compactly */}
              <div style={{ display: 'flex', gap: 8 }}>
                {Object.entries(CAT_INFO).map(([key, info]) => (
                  <div key={key} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: info.color, letterSpacing: 0.5 }}>{info.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#ddd' }}>
                      {getRatingForCategory(user, key)}
                    </div>
                  </div>
                ))}
              </div>
              <span
                style={{ fontSize: 13, color: '#c9a14a', fontWeight: 700, cursor: 'pointer', marginLeft: 4 }}
                onClick={() => navigate(`/profile/${user.username}`)}
              >
                {user.username}
              </span>
              <button onClick={logout} style={ghostBtn}>Logout</button>
            </div>
          ) : (
            <button onClick={() => setShowAuth(true)} style={goldBtn}>Sign In</button>
          )}
        </div>
      </nav>

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 960, margin: '0 auto', padding: '44px 20px' }}>

        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <h1 style={{
            fontSize: 'clamp(32px, 7vw, 68px)', fontWeight: 900, lineHeight: 1.1, marginBottom: 10,
            background: 'linear-gradient(180deg, #fff 0%, #c9a14a 55%, #8b6914 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
          }}>
            Play Chess.<br/>Your Way.
          </h1>
          <p style={{ fontSize: 15, color: '#666', lineHeight: 1.7 }}>
            Separate Elo for Bullet, Blitz & Rapid. Built from scratch.
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28, gap: 8 }}>
          {[['online', '🌐 Play Online'], ['bot', '🤖 Play vs Bot']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{
              padding: '9px 26px',
              backgroundColor: tab === key ? 'rgba(201,161,74,0.1)' : 'transparent',
              border: tab === key ? '1px solid #c9a14a' : '1px solid #2a2a2a',
              borderRadius: 8, cursor: 'pointer',
              color: tab === key ? '#c9a14a' : '#777',
              fontFamily: 'Georgia, serif', fontSize: 14, fontWeight: 600,
              transition: 'all 0.2s'
            }}>
              {label}
            </button>
          ))}
        </div>

        {/* Online matchmaking */}
        {tab === 'online' && (
          <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
            {!matchmaking ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 24 }}>
                  {TIME_CONTROLS.map((tc, i) => {
                    const info = CAT_INFO[tc.cat];
                    const isSelected = selectedTC === tc;
                    return (
                      <button key={i} onClick={() => setSelectedTC(tc)} style={{
                        padding: '12px 6px',
                        backgroundColor: isSelected ? 'rgba(201,161,74,0.1)' : 'rgba(255,255,255,0.02)',
                        border: isSelected ? `1px solid ${info.color}` : '1px solid rgba(255,255,255,0.07)',
                        borderRadius: 10, cursor: 'pointer',
                        color: isSelected ? info.color : '#666',
                        fontFamily: 'Georgia, serif', transition: 'all 0.2s',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3
                      }}>
                        <span style={{ fontSize: 17 }}>{tc.icon}</span>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{fmt(tc.time, tc.inc)}</span>
                        <span style={{ fontSize: 10, opacity: 0.7 }}>{tc.label}</span>
                        {user && (
                          <span style={{ fontSize: 10, color: info.color, fontWeight: 600 }}>
                            {getRatingForCategory(user, tc.cat)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Selected category label */}
                {user && (
                  <div style={{ marginBottom: 16, color: '#888', fontSize: 13 }}>
                    Your {navCatInfo.icon} <span style={{ color: navCatInfo.color }}>{navCatInfo.label}</span> rating:{' '}
                    <span style={{ color: '#ddd', fontWeight: 700 }}>{navRating}</span>
                  </div>
                )}

                <button onClick={startMatchmaking} style={{
                  padding: '14px 0', width: '100%', maxWidth: 260,
                  background: 'linear-gradient(135deg, #c9a14a, #8b6914)',
                  border: 'none', borderRadius: 12, color: '#fff',
                  fontFamily: 'Georgia, serif', fontSize: 16, fontWeight: 700,
                  cursor: 'pointer', boxShadow: '0 4px 20px rgba(201,161,74,0.2)',
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
                borderRadius: 16, backgroundColor: 'rgba(201,161,74,0.03)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14
              }}>
                <div style={{
                  width: 40, height: 40, border: '3px solid #c9a14a',
                  borderTopColor: 'transparent', borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                <div style={{ color: '#c9a14a', fontSize: 17, fontWeight: 600 }}>Finding opponent...</div>
                <div style={{ color: '#888', fontSize: 13 }}>
                  {selectedTC.icon} {fmt(selectedTC.time, selectedTC.inc)} • {waitTime}s
                </div>
                <button onClick={cancelMatchmaking} style={{
                  backgroundColor: 'transparent', border: '1px solid #e74c3c',
                  color: '#e74c3c', padding: '7px 22px', borderRadius: 8,
                  cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: 13
                }}>Cancel</button>
              </div>
            )}
          </div>
        )}

        {/* Bot game */}
        {tab === 'bot' && (
          <div style={{ maxWidth: 520, margin: '0 auto' }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ color: '#666', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Select Difficulty</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {BOT_LEVELS.map(lvl => (
                  <button key={lvl.key} onClick={() => setBotLevel(lvl)} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '11px 14px',
                    backgroundColor: botLevel.key === lvl.key ? 'rgba(201,161,74,0.06)' : 'rgba(255,255,255,0.02)',
                    border: botLevel.key === lvl.key ? `1px solid ${lvl.color}` : '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 20 }}>{lvl.icon}</span>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ color: botLevel.key === lvl.key ? lvl.color : '#ddd', fontWeight: 600, fontSize: 14, fontFamily: 'Georgia, serif' }}>{lvl.name}</div>
                        <div style={{ color: '#555', fontSize: 11 }}>No Elo impact</div>
                      </div>
                    </div>
                    <div style={{ color: lvl.color, fontWeight: 700, fontSize: 15 }}>{lvl.rating}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div>
                <div style={{ color: '#666', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Play as</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[['w','♔ White'],['b','♚ Black'],['r','🎲 Random']].map(([c, label]) => (
                    <button key={c} onClick={() => setBotColor(c)} style={{
                      flex: 1, padding: '8px 2px', fontSize: 11,
                      backgroundColor: botColor === c ? 'rgba(201,161,74,0.1)' : 'rgba(255,255,255,0.02)',
                      border: botColor === c ? '1px solid #c9a14a' : '1px solid rgba(255,255,255,0.07)',
                      borderRadius: 7, cursor: 'pointer', color: botColor === c ? '#c9a14a' : '#777',
                      fontFamily: 'Georgia, serif', transition: 'all 0.2s'
                    }}>{label}</button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ color: '#666', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Time Control</div>
                <select value={TIME_CONTROLS.indexOf(botTC)} onChange={e => setBotTC(TIME_CONTROLS[parseInt(e.target.value)])} style={{
                  width: '100%', padding: '8px 10px',
                  backgroundColor: '#0d0d18', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 7, color: '#ddd', fontSize: 12, fontFamily: 'Georgia, serif',
                  cursor: 'pointer', outline: 'none'
                }}>
                  {TIME_CONTROLS.map((tc, i) => (
                    <option key={i} value={i}>{tc.icon} {fmt(tc.time, tc.inc)} {tc.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <button onClick={startBotGame} style={{
              width: '100%', padding: '13px',
              background: 'linear-gradient(135deg, #c9a14a, #8b6914)',
              border: 'none', borderRadius: 12, color: '#fff',
              fontFamily: 'Georgia, serif', fontSize: 15, fontWeight: 700,
              cursor: 'pointer', transition: 'transform 0.2s'
            }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
            >
              🤖 Play vs {botLevel.name} ({botLevel.rating})
            </button>
            <p style={{ textAlign: 'center', color: '#555', fontSize: 11, marginTop: 8 }}>
              Bot games don't affect your Elo ratings
            </p>
          </div>
        )}

        {/* Bottom grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18, marginTop: 56 }}>
          <div style={card}>
            <h3 style={{ color: '#c9a14a', marginBottom: 14, fontSize: 14 }}>⚙️ Features</h3>
            {[
              'Separate Elo: ⚡ Bullet / 🔥 Blitz / ⏱ Rapid',
              'Complete chess engine from scratch',
              'Castling, en passant, promotion',
              'Check / checkmate detection',
              'Server-side clocks (no cheating)',
              'Bot opponents (400–2000 Elo)'
            ].map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 7, color: '#999', fontSize: 12, lineHeight: 1.5 }}>
                <span style={{ color: '#c9a14a', flexShrink: 0 }}>✓</span>{f}
              </div>
            ))}
          </div>

          <Leaderboard navigate={navigate} />
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

// ─── Styles ───────────────────────────────────────────────────────────────────
const card = {
  backgroundColor: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 14, padding: 20
};
const goldBtn = {
  backgroundColor: 'transparent', border: '1px solid #c9a14a',
  borderRadius: 6, color: '#c9a14a', padding: '7px 15px',
  cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: 13
};
const ghostBtn = {
  backgroundColor: 'transparent', border: '1px solid #2a2a2a',
  borderRadius: 6, color: '#777', padding: '6px 12px',
  cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: 12
};

// ─── Auth Modal ───────────────────────────────────────────────────────────────
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
        backgroundColor: '#0d0d18', border: '1px solid rgba(201,161,74,0.2)',
        borderRadius: 16, padding: 36, width: '100%', maxWidth: 360
      }}>
        <h2 style={{
          textAlign: 'center', marginBottom: 8,
          background: 'linear-gradient(135deg, #c9a14a, #f0d080)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          fontFamily: 'Georgia, serif', fontSize: 20
        }}>
          {mode === 'login' ? 'Welcome Back' : 'Join NOchess'}
        </h2>

        <div style={{ display: 'flex', marginBottom: 22, borderBottom: '1px solid #1a1a2e' }}>
          {['login', 'register'].map(m => (
            <button key={m} onClick={() => { setMode(m); setError(''); }} style={{
              flex: 1, padding: '9px', backgroundColor: 'transparent', border: 'none',
              borderBottom: mode === m ? '2px solid #c9a14a' : '2px solid transparent',
              color: mode === m ? '#c9a14a' : '#555',
              cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: 13, marginBottom: -1
            }}>
              {m === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
            padding: 12, marginTop: 4,
            background: loading ? '#333' : 'linear-gradient(135deg, #c9a14a, #8b6914)',
            border: 'none', borderRadius: 8, color: '#fff',
            fontFamily: 'Georgia, serif', fontSize: 14, fontWeight: 700,
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
  padding: '10px 13px',
  backgroundColor: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8, color: '#e8e8e8', fontSize: 13,
  outline: 'none', fontFamily: 'Georgia, serif'
};
