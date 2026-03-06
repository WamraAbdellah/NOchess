import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const CAT = [
  { key: 'bullet', label: 'Bullet',  icon: '⚡', color: '#e74c3c', ratingField: 'rating_bullet', playedField: 'bullet_played' },
  { key: 'blitz',  label: 'Blitz',   icon: '🔥', color: '#ff9800', ratingField: 'rating_blitz',  playedField: 'blitz_played'  },
  { key: 'rapid',  label: 'Rapid',   icon: '⏱', color: '#4caf50', ratingField: 'rating_rapid',  playedField: 'rapid_played'  },
];

export default function ProfilePage() {
  const { username } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/users/${username}`)
      .then(r => r.json())
      .then(u => { setProfile(u); setLoading(false); })
      .catch(() => setLoading(false));
  }, [username]);

  if (loading) return (
    <PageShell navigate={navigate}>
      <div style={{ color: '#c9a14a', fontSize: 16, textAlign: 'center', marginTop: 80 }}>Loading...</div>
    </PageShell>
  );
  if (!profile || profile.error) return (
    <PageShell navigate={navigate}>
      <div style={{ color: '#e74c3c', fontSize: 16, textAlign: 'center', marginTop: 80 }}>Player not found</div>
    </PageShell>
  );

  const winRate = profile.games_played > 0
    ? Math.round((profile.games_won / profile.games_played) * 100)
    : 0;

  return (
    <PageShell navigate={navigate}>
      <div style={{ maxWidth: 680, margin: '40px auto', padding: '0 20px' }}>

        {/* Header card */}
        <div style={card}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{
              width: 68, height: 68, borderRadius: '50%',
              backgroundColor: 'rgba(201,161,74,0.08)',
              border: '2px solid rgba(201,161,74,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 30, flexShrink: 0
            }}>
              ♟
            </div>
            <div>
              <h1 style={{ fontSize: 26, color: '#f0f0f0', marginBottom: 4 }}>{profile.username}</h1>
              <div style={{ color: '#666', fontSize: 12 }}>
                Member since {new Date(profile.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
              </div>
            </div>
          </div>
        </div>

        {/* Per-category ratings */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 14 }}>
          {CAT.map(cat => {
            const rating = profile[cat.ratingField] ?? 1200;
            const played = profile[cat.playedField] ?? 0;
            return (
              <div key={cat.key} style={{
                ...card,
                borderColor: `${cat.color}22`,
                textAlign: 'center', padding: '20px 12px'
              }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{cat.icon}</div>
                <div style={{ color: cat.color, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                  {cat.label}
                </div>
                <div style={{ color: '#f0f0f0', fontSize: 28, fontWeight: 700, lineHeight: 1 }}>
                  {rating}
                </div>
                <div style={{ color: '#555', fontSize: 11, marginTop: 6 }}>
                  {played} {played === 1 ? 'game' : 'games'}
                </div>
              </div>
            );
          })}
        </div>

        {/* Overall stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 12 }}>
          {[
            { label: 'Total',  value: profile.games_played || 0, color: '#e8e8e8' },
            { label: 'Won',    value: profile.games_won    || 0, color: '#4caf50' },
            { label: 'Lost',   value: profile.games_lost   || 0, color: '#e74c3c' },
            { label: 'Win %',  value: `${winRate}%`,             color: '#c9a14a' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ ...card, textAlign: 'center', padding: '16px 8px' }}>
              <div style={{ color, fontSize: 22, fontWeight: 700 }}>{value}</div>
              <div style={{ color: '#666', fontSize: 11, marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center', marginTop: 28 }}>
          <button onClick={() => navigate('/')} style={{
            padding: '11px 30px',
            background: 'linear-gradient(135deg, #c9a14a, #8b6914)',
            border: 'none', borderRadius: 10, color: '#fff',
            fontFamily: 'Georgia, serif', fontSize: 14, cursor: 'pointer'
          }}>
            ♟ Play a game
          </button>
        </div>
      </div>
    </PageShell>
  );
}

function PageShell({ navigate, children }) {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#07070d', color: '#e8e8e8', fontFamily: 'Georgia, serif' }}>
      <div style={{
        padding: '14px 28px', borderBottom: '1px solid rgba(201,161,74,0.12)',
        display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer'
      }} onClick={() => navigate('/')}>
        <span style={{ fontSize: 20 }}>♛</span>
        <span style={{
          fontSize: 18, fontWeight: 700,
          background: 'linear-gradient(135deg, #c9a14a, #f0d080)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
        }}>NOchess</span>
      </div>
      {children}
    </div>
  );
}

const card = {
  backgroundColor: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 12, padding: 20
};
