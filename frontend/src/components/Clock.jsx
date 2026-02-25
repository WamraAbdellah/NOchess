import { useState, useEffect, useRef } from 'react';

function formatTime(ms) {
  if (ms <= 0) return '0:00';
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min >= 10) return `${min}:${sec.toString().padStart(2, '0')}`;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export default function Clock({ timeMs, isActive, color, username, rating }) {
  const [displayTime, setDisplayTime] = useState(timeMs);
  const startRef = useRef(null);
  const startTimeRef = useRef(timeMs);

  useEffect(() => {
    setDisplayTime(timeMs);
    startTimeRef.current = timeMs;
    startRef.current = Date.now();
  }, [timeMs]);

  useEffect(() => {
    if (!isActive) return;
    
    startRef.current = Date.now();
    startTimeRef.current = timeMs;
    
    const interval = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const remaining = Math.max(0, startTimeRef.current - elapsed);
      setDisplayTime(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 100);

    return () => clearInterval(interval);
  }, [isActive, timeMs]);

  const isLow = displayTime < 30000;
  const isCritical = displayTime < 10000;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 16px',
      backgroundColor: isActive ? (isCritical ? '#7a1515' : '#0d2137') : '#111',
      border: `1px solid ${isActive ? (isCritical ? '#e74c3c' : '#c9a14a') : '#333'}`,
      borderRadius: '8px',
      transition: 'all 0.3s',
      boxShadow: isActive ? `0 0 12px ${isCritical ? 'rgba(231,76,60,0.3)' : 'rgba(201,161,74,0.2)'}` : 'none'
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            backgroundColor: color === 'w' ? '#f0f0e8' : '#1a1a1a',
            border: color === 'w' ? '1px solid #999' : '1px solid #666'
          }} />
          <span style={{
            color: '#ddd',
            fontSize: '14px',
            fontFamily: 'Georgia, serif',
            fontWeight: 600
          }}>
            {username || (color === 'w' ? 'White' : 'Black')}
          </span>
          {rating && (
            <span style={{ color: '#888', fontSize: '12px' }}>{rating}</span>
          )}
        </div>
      </div>
      <div style={{
        fontFamily: '"Courier New", monospace',
        fontSize: displayTime < 60000 ? '28px' : '24px',
        fontWeight: 700,
        color: isCritical ? '#e74c3c' : isLow ? '#e67e22' : '#f0f0f0',
        letterSpacing: '1px',
        animation: isCritical && isActive ? 'pulse 1s infinite' : 'none'
      }}>
        {formatTime(displayTime)}
      </div>
    </div>
  );
}
