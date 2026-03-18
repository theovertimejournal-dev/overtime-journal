import { useState } from 'react';
import { supabase } from '../../lib/supabase';

const AVATAR_COLORS = [
  "#ef4444", "#f59e0b", "#22c55e", "#3b82f6",
  "#a855f7", "#ec4899", "#14b8a6", "#f97316",
];

const PROFILE_ICONS = [
  // Sports
  "🏀", "⚾", "🏈", "🏒", "⚽", "🎾", "🏆", "🥊",
  // Animals
  "🐺", "🦅", "🦁", "🐻", "🦈", "🐍", "🦬", "🐐",
  // Vibes
  "🔥", "💎", "🎯", "⚡", "👑", "🎰", "💰", "🧊",
];

const COOLDOWN_DAYS = 30;

export function UsernameModal({ user, profile, onComplete }) {
  const isEdit = !!profile?.username;
  const [username, setUsername] = useState(isEdit ? profile.username : '');
  const [color, setColor]      = useState(profile?.avatar_color || AVATAR_COLORS[0]);
  const [icon, setIcon]        = useState(profile?.profile_icon || '🏀');
  const [loading, setLoading]  = useState(false);
  const [error, setError]      = useState('');

  const handle = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  const valid  = handle.length >= 3 && handle.length <= 20;

  // 30-day cooldown check (only for edits, not first-time setup)
  const canChangeName = (() => {
    if (!isEdit) return true;
    if (!profile?.username_changed_at) return true;
    const lastChange = new Date(profile.username_changed_at);
    const daysSince = (Date.now() - lastChange.getTime()) / (1000 * 60 * 60 * 24);
    return daysSince >= COOLDOWN_DAYS;
  })();

  const daysUntilChange = (() => {
    if (!isEdit || !profile?.username_changed_at) return 0;
    const lastChange = new Date(profile.username_changed_at);
    const daysSince = (Date.now() - lastChange.getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.ceil(COOLDOWN_DAYS - daysSince));
  })();

  async function submit() {
    if (!valid || loading) return;
    setLoading(true);
    setError('');

    if (isEdit) {
      // Update existing profile
      const updates = {
        avatar_color: color,
        profile_icon: icon,
      };

      // Only update username if it changed AND cooldown allows
      if (handle !== profile.username && canChangeName) {
        updates.username = handle;
        updates.username_changed_at = new Date().toISOString();
      } else if (handle !== profile.username && !canChangeName) {
        setError(`Username can only be changed every ${COOLDOWN_DAYS} days. ${daysUntilChange} days left.`);
        setLoading(false);
        return;
      }

      const { error: err } = await supabase
        .from('profiles')
        .update(updates)
        .eq('user_id', user.id);

      if (err) {
        setError(err.message.includes('unique') ? 'That username is taken — try another.' : err.message);
        setLoading(false);
        return;
      }

      onComplete({
        ...profile,
        ...updates,
        username: updates.username || profile.username,
      });
    } else {
      // First-time setup — try upsert in case trigger already created the row
      const { error: err } = await supabase
        .from('profiles')
        .upsert({
          user_id:      user.id,
          username:     handle,
          avatar_color: color,
          profile_icon: icon,
        }, { onConflict: 'user_id' });

      if (err) {
        setError(err.message.includes('unique') ? 'That username is taken — try another.' : err.message);
        setLoading(false);
        return;
      }

      onComplete({ user_id: user.id, username: handle, avatar_color: color, profile_icon: icon });
    }
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
        borderRadius: 16, padding: 32, width: "100%", maxWidth: 420,
        maxHeight: "90vh", overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>{icon}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>
            {isEdit ? "Edit your profile" : "Set your username"}
          </div>
          <div style={{ fontSize: 11, color: "#4a5568", lineHeight: 1.6 }}>
            {isEdit
              ? "Update your icon, color, or username."
              : "This is how you'll appear on leaderboards and picks."}
          </div>
        </div>

        {/* Avatar preview */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%",
            background: color, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 30,
            color: "#fff", border: "3px solid rgba(255,255,255,0.15)",
            boxShadow: `0 0 24px ${color}40`,
            transition: "all 0.2s ease",
          }}>
            {icon}
          </div>
        </div>

        {/* Icon picker */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Choose your icon
          </div>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 4,
            background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: 8,
            border: "1px solid rgba(255,255,255,0.05)",
          }}>
            {PROFILE_ICONS.map(i => (
              <div
                key={i}
                onClick={() => setIcon(i)}
                style={{
                  fontSize: 20, textAlign: "center", padding: "6px 0",
                  borderRadius: 6, cursor: "pointer",
                  background: i === icon ? "rgba(255,255,255,0.1)" : "transparent",
                  border: i === icon ? "1px solid rgba(255,255,255,0.2)" : "1px solid transparent",
                  transform: i === icon ? "scale(1.15)" : "scale(1)",
                  transition: "all 0.12s ease",
                }}
              >
                {i}
              </div>
            ))}
          </div>
        </div>

        {/* Color picker */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Avatar color
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
            {AVATAR_COLORS.map(c => (
              <div
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: 28, height: 28, borderRadius: "50%", background: c,
                  cursor: "pointer", border: c === color ? "2px solid #fff" : "2px solid transparent",
                  transform: c === color ? "scale(1.2)" : "scale(1)",
                  transition: "all 0.15s ease",
                }}
              />
            ))}
          </div>
        </div>

        {/* Username input */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Username
          </div>
          <input
            value={username}
            onChange={e => { setUsername(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="choose a username"
            maxLength={20}
            disabled={isEdit && !canChangeName}
            style={{
              width: "100%", padding: "12px 14px", borderRadius: 8,
              background: (isEdit && !canChangeName) ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${error ? '#ef4444' : 'rgba(255,255,255,0.1)'}`,
              color: (isEdit && !canChangeName) ? "#4a5568" : "#f1f5f9",
              fontSize: 13, fontFamily: "inherit",
              outline: "none", boxSizing: "border-box",
              cursor: (isEdit && !canChangeName) ? "not-allowed" : "text",
            }}
          />
        </div>

        {/* Hints / cooldown warning */}
        <div style={{ fontSize: 10, color: error ? "#ef4444" : "#4a5568", marginBottom: 20, minHeight: 16 }}>
          {error
            ? error
            : isEdit && !canChangeName
            ? `🔒 Username locked for ${daysUntilChange} more day${daysUntilChange !== 1 ? 's' : ''} — icon & color can still change`
            : handle && !valid
            ? "Must be 3–20 characters, letters/numbers/underscores only"
            : handle
            ? `→ @${handle}`
            : "3–20 chars · letters, numbers, underscores"}
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
          {loading ? "Saving..." : isEdit ? "SAVE CHANGES →" : "LET'S GO →"}
        </button>

        {/* Cancel for edits */}
        {isEdit && (
          <button
            onClick={() => onComplete(profile)}
            style={{
              width: "100%", padding: "10px", borderRadius: 8, marginTop: 8,
              background: "transparent", border: "1px solid rgba(255,255,255,0.06)",
              color: "#4a5568", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
