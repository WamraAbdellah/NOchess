import { useEffect, useRef } from 'react';

export default function MoveHistory({ moves }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [moves]);

  // Group into pairs: [{num, white, black}]
  const pairs = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({
      num: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1]
    });
  }

  function getLabel(move) {
    if (!move) return '';
    // Use notation if available, fallback to from+to
    if (move.notation) return move.notation;
    let s = (move.from || '') + (move.to || '');
    if (move.promotion) s += '=' + move.promotion.toUpperCase();
    return s;
  }

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      padding: '8px',
      fontFamily: '"Courier New", monospace',
      fontSize: '13px',
      minHeight: 0
    }}>
      {pairs.length === 0 && (
        <div style={{ color: '#555', textAlign: 'center', marginTop: 20, fontSize: '12px' }}>
          Game hasn't started yet...
        </div>
      )}
      {pairs.map(({ num, white, black }) => (
        <div key={num} style={{
          display: 'grid',
          gridTemplateColumns: '28px 1fr 1fr',
          gap: '2px',
          padding: '2px 4px',
          borderRadius: '3px',
          backgroundColor: num % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent'
        }}>
          <span style={{ color: '#444', textAlign: 'right', paddingRight: 4 }}>{num}.</span>
          <span style={{
            color: '#e8e8e8',
            padding: '2px 5px',
            borderRadius: '3px',
            fontWeight: !black ? 700 : 400,
            backgroundColor: !black ? 'rgba(201,161,74,0.12)' : 'transparent'
          }}>
            {getLabel(white)}
          </span>
          <span style={{ color: '#ccc', padding: '2px 5px' }}>
            {getLabel(black)}
          </span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
