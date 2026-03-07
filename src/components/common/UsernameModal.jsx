import { useState } from 'react';
import { supabase } from '../../lib/supabase';

const AVATAR_COLORS = [
  "#ef4444", "#f59e0b", "#22c55e", "#3b82f6",
  "#a855f7", "#ec4899", "#14b8a6", "#f97316"
];

export function UsernameModal({ user, onComplete }) {
  const [username, setUsername]     = useState('');
  const [color, setColor]           = useState(AVATAR_COLORS[0]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  const handle = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  const valid  = handle.length >= 3 && handle.length <= 20;

  async function submit() {
    if (!valid || loading) return;
    setLoading(true);
    setError('');

    const { error: err } = await supabase.from('profiles').insert({
      user_id:      user.id,
      username:     handle,
      avatar_color: color,
    });

    if (err) {
      setError(err.message.includes('unique') ? 'That username is taken — try another.' : err.message);
      setLoading(false);
      return;
    }

    onComplete({ user_id: user.id, username: handle, avatar_color: color });
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, fontFamily: "'JetBrains Mono','SF Mono',monospace",
    }}>
      <div style={{
        background: "#0f0f1a", border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16, padding: 32, width: "100%", maxWidth: 400,
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🏀</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>
            Set your username
          </div>
          <div style={{ fontSize: 11, color: "#4a5568", lineHeight: 1.6 }}>
            This is how you'll appear on leaderboards and picks.
          </div>
        </div>

        {/* Avatar preview */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            background: color, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 22, fontWeight: 700,
            color: "#fff", border: "3px solid rgba(255,255,255,0.15)",
            boxShadow: `0 0 20px ${color}40`,
            transition: "all 0.2s ease",
          }}>
            {handle ? handle[0].toUpperCase() : "?"}
          </div>
        </div>

        {/* Color picker */}
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 20 }}>
          {AVATAR_COLORS.map(c => (
            <div
              key={c}
              onClick={() => setColor(c)}
              style={{
                width: 24, height: 24, borderRadius: "50%", background: c,
                cursor: "pointer", border: c === color ? "2px solid #fff" : "2px solid transparent",
                transform: c === color ? "scale(1.2)" : "scale(1)",
                transition: "all 0.15s ease",
              }}
            />
          ))}
        </div>

        {/* Username input */}
        <div style={{ marginBottom: 8 }}>
          <input
            value={username}
            onChange={e => { setUsername(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="choose a username"
            maxLength={20}
            style={{
              width: "100%", padding: "12px 14px", borderRadius: 8,
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${error ? '#ef4444' : 'rgba(255,255,255,0.1)'}`,
              color: "#f1f5f9", fontSize: 13, fontFamily: "inherit",
              outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Hints */}
        <div style={{ fontSize: 10, color: error ? "#ef4444" : "#4a5568", marginBottom: 20, minHeight: 16 }}>
          {error || (handle && !valid
            ? "Must be 3–20 characters, letters/numbers/underscores only"
            : handle
            ? `→ @${handle}`
            : "3–20 chars · letters, numbers, underscores")}
        </div>

        {/* Submit */}
        <button
          onClick={submit}
          disabled={!valid || loading}
          style={{
            width: "100%", padding: "12px", borderRadius: 8,
            background: valid ? "#ef4444" : "rgba(255,255,255,0.05)",
            border: "none", color: valid ? "#fff" : "#4a5568",
            fontSize: 13, fontWeight: 700, cursor: valid ? "pointer" : "not-allowed",
            fontFamily: "inherit", letterSpacing: "0.04em",
            transition: "all 0.15s ease",
          }}
        >
          {loading ? "Saving..." : "LET'S GO →"}
        </button>
      </div>
    </div>
  );
}
