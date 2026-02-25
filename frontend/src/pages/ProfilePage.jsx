import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function ProfilePage() {
  const { username } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/users/${username}`).then(r => r.json()),
    ]).then(([user]) => {
      setProfile(user);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [username]);

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#07070d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#c9a14a', fontSize: '18px' }}>Loading...</div>
    </div>
  );

  if (!profile || profile.error) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#07070d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#e74c3c', fontSize: '18px' }}>Player not found</div>
    </div>
  );

  const winRate = profile.games_played > 0 
    ? Math.round((profile.games_won / profile.games_played) * 100) 
    : 0;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#07070d', color: '#e8e8e8', fontFamily: 'Georgia, serif' }}>
      <div style={{
        padding: '16px 32px',
        borderBottom: '1px solid rgba(201,161,74,0.15)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        cursor: 'pointer'
      }}
        onClick={() => navigate('/')}>
        <span style={{ fontSize: '20px' }}>♛</span>
        <span style={{
          fontSize: '20px', fontWeight: 700,
          background: 'linear-gradient(135deg, #c9a14a, #f0d080)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>NOchess</span>
      </div>

      <div style={{ maxWidth: '700px', margin: '40px auto', padding: '0 24px' }}>
        {/* Profile header */}
        <div style={{
          backgroundColor: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(201,161,74,0.2)',
          borderRadius: '16px',
          padding: '32px',
          marginBottom: '24px',
          display: 'flex',
          gap: '24px',
          alignItems: 'center'
        }}>
          <div style={{
            width: 72, height: 72,
            borderRadius: '50%',
            backgroundColor: 'rgba(201,161,74,0.1)',
            border: '2px solid #c9a14a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '32px'
          }}>
            ♟
          </div>
          <div>
            <h1 style={{ fontSize: '28px', margin: 0, marginBottom: 6, color: '#f0f0f0' }}>{profile.username}</h1>
            <div style={{ color: '#c9a14a', fontSize: '22px', fontWeight: 700 }}>
              {profile.rating} <span style={{ color: '#888', fontSize: '14px', fontWeight: 400 }}>ELO</span>
            </div>
            <div style={{ color: '#666', fontSize: '13px', marginTop: 4 }}>
              Member since {new Date(profile.created_at).toLocaleDateString()}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '12px',
          marginBottom: '24px'
        }}>
          {[
            { label: 'Games', value: profile.games_played || 0, color: '#e8e8e8' },
            { label: 'Won', value: profile.games_won || 0, color: '#4caf50' },
            { label: 'Lost', value: profile.games_lost || 0, color: '#e74c3c' },
            { label: 'Win Rate', value: `${winRate}%`, color: '#c9a14a' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              backgroundColor: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '12px',
              padding: '20px 16px',
              textAlign: 'center'
            }}>
              <div style={{ color, fontSize: '26px', fontWeight: 700 }}>{value}</div>
              <div style={{ color: '#888', fontSize: '12px', marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center' }}>
          <button onClick={() => navigate('/')} style={{
            padding: '12px 32px',
            background: 'linear-gradient(135deg, #c9a14a, #8b6914)',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            fontFamily: 'Georgia, serif',
            fontSize: '15px',
            cursor: 'pointer'
          }}>
            Challenge to a game
          </button>
        </div>
      </div>
    </div>
  );
}
