import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

const FONT = "'JetBrains Mono','SF Mono',monospace";

const TYPE_CONFIG = {
  arcade_challenge: { emoji: "⚔️", color: "#a855f7", action: "arcade" },
  new_follower:     { emoji: "👤", color: "#3b82f6", action: "profile" },
  badge_earned:     { emoji: "🏅", color: "#fbbf24", action: "profile" },
  pick_result:      { emoji: "🎯", color: "#22c55e", action: "profile" },
  system:           { emoji: "📢", color: "#6b7280", action: null },
};

function timeAgo(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function NotificationBell({ user }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  // Load initial notifications
  useEffect(() => {
    if (!user) return;
    loadNotifications();
  }, [user]);

  // Realtime subscription — listen for new notifications
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        setNotifications(prev => [payload.new, ...prev]);
        setUnreadCount(c => c + 1);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function loadNotifications() {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setNotifications(data || []);
    setUnreadCount((data || []).filter(n => !n.read).length);
  }

  async function markAllRead() {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  async function clearAll() {
    await supabase
      .from('notifications')
      .delete()
      .eq('user_id', user.id);
    setNotifications([]);
    setUnreadCount(0);
    setOpen(false);
  }

  async function handleNotificationClick(notif) {
    // Mark as read
    if (!notif.read) {
      await supabase.from('notifications').update({ read: true }).eq('id', notif.id);
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
      setUnreadCount(c => Math.max(0, c - 1));
    }

    setOpen(false);

    // Navigate based on type
    const config = TYPE_CONFIG[notif.type] || {};
    const data = notif.data || {};

    if (notif.type === 'arcade_challenge' && data.room_id) {
      navigate(`/arcade/nba?room=${data.room_id}`);
    } else if (notif.type === 'new_follower' && data.username) {
      navigate(`/profile/${data.username}`);
    } else if (config.action === 'profile') {
      navigate(`/profile/${user.email?.split('@')[0] || ''}`);
    }
  }

  if (!user) return null;

  return (
    <div ref={dropdownRef} style={{ position: "relative", flexShrink: 0 }}>
      {/* Bell button */}
      <div
        onClick={() => setOpen(!open)}
        style={{
          width: 28, height: 28, borderRadius: 6, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: open ? "rgba(255,255,255,0.08)" : "transparent",
          position: "relative", fontSize: 14,
          transition: "background 0.12s",
        }}
      >
        🔔
        {unreadCount > 0 && (
          <div style={{
            position: "absolute", top: -2, right: -2,
            width: 16, height: 16, borderRadius: "50%",
            background: "#ef4444", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 9, fontWeight: 700, color: "#fff",
            border: "2px solid #08080f",
            animation: "bellPulse 2s ease-in-out infinite",
          }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </div>
        )}
      </div>

      <style>{`
        @keyframes bellPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
      `}</style>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute", top: "100%", right: -8,
          width: 300, maxWidth: "calc(100vw - 24px)", maxHeight: 400, overflowY: "auto",
          background: "#0f0f1a", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 12, marginTop: 8, zIndex: 100,
          boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
          fontFamily: FONT,
        }}>
          {/* Header */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#f1f5f9" }}>Notifications</span>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {unreadCount > 0 && (
                <span
                  onClick={markAllRead}
                  style={{ fontSize: 9, color: "#6b7280", cursor: "pointer", fontWeight: 600 }}
                >
                  Mark all read
                </span>
              )}
              {notifications.length > 0 && (
                <span
                  onClick={clearAll}
                  style={{ fontSize: 9, color: "#ef4444", cursor: "pointer", fontWeight: 600 }}
                >
                  Clear all
                </span>
              )}
            </div>
          </div>

          {/* List — show 5 most recent */}
          {notifications.length === 0 ? (
            <div style={{ padding: "24px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>🔕</div>
              <div style={{ fontSize: 10, color: "#4a5568" }}>No notifications yet</div>
            </div>
          ) : (
            notifications.slice(0, 5).map(n => {
              const config = TYPE_CONFIG[n.type] || TYPE_CONFIG.system;
              return (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  style={{
                    display: "flex", gap: 10, padding: "10px 14px",
                    cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.03)",
                    background: n.read ? "transparent" : "rgba(239,68,68,0.03)",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                  onMouseLeave={e => e.currentTarget.style.background = n.read ? "transparent" : "rgba(239,68,68,0.03)"}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: `${config.color}15`, border: `1px solid ${config.color}30`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16,
                  }}>
                    {config.emoji}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: "#f1f5f9", fontWeight: n.read ? 400 : 700 }}>
                      {n.title}
                    </div>
                    {n.body && (
                      <div style={{ fontSize: 10, color: "#4a5568", marginTop: 2 }}>{n.body}</div>
                    )}
                    <div style={{ fontSize: 9, color: "#374151", marginTop: 3 }}>{timeAgo(n.created_at)}</div>
                  </div>
                  {!n.read && (
                    <div style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: "#ef4444", flexShrink: 0, marginTop: 4,
                    }} />
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
