import { useState, useRef, useEffect } from 'react';

export default function GameChat({ messages, onSend }) {
  const [input, setInput] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = () => {
    const msg = input.trim();
    if (!msg) return;
    onSend?.(msg);
    setInput('');
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '180px',
      borderTop: '1px solid #222'
    }}>
      <div style={{
        padding: '4px 8px',
        fontSize: '11px',
        color: '#555',
        textTransform: 'uppercase',
        letterSpacing: '1px',
        borderBottom: '1px solid #222'
      }}>
        Chat
      </div>
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '6px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px'
      }}>
        {messages.map((m, i) => (
          <div key={i} style={{ fontSize: '12px' }}>
            <span style={{ color: '#c9a14a', fontWeight: 600 }}>{m.from}: </span>
            <span style={{ color: '#ccc' }}>{m.message}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div style={{ display: 'flex', borderTop: '1px solid #222' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Say something..."
          style={{
            flex: 1,
            backgroundColor: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#ddd',
            padding: '8px',
            fontSize: '12px',
          }}
        />
        <button
          onClick={send}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: '#c9a14a',
            padding: '8px 12px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          →
        </button>
      </div>
    </div>
  );
}
