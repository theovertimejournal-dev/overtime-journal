import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { AvatarMini } from '../components/common/AvatarSystem';

const FONT = "'JetBrains Mono','SF Mono',monospace";

const RANK_STYLES = {
  0: { emoji: "👑", color: "#fbbf24", bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.2)" },
  1: { emoji: "🥈", color: "#94a3b8", bg: "rgba(148,163,184,0.06)", border: "rgba(148,163,184,0.15)" },
  2: { emoji: "🥉", color: "#d97706", bg: "rgba(217,119,6,0.06)", border: "rgba(217,119,6,0.15)" },
};

function formatBucks(n) {
  if (n == null) return "$0";
  return (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString();
}

function LeaderRow({ rank, user, stat, statLabel, statColor, currentUserId }) {
  const navigate = useNavigate();
  const rs = RANK_STYLES[rank] || { emoji: null, color: "#6b7280", bg: "transparent", border: "rgba(255,255,255,0.04)" };
  const isYou = currentUserId && user.user_id === currentUserId;

  return (
    <div
      onClick={() => navigate(`/profile/${user.username}`)}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 14px", borderRadius: 10, cursor: "pointer",
        background: isYou ? "rgba(239,68,68,0.06)" : rs.bg,
        border: `1px solid ${isYou ? "rgba(239,68,68,0.2)" : rs.border}`,
        transition: "all 0.12s ease",
      }}
      onMouseEnter={e => e.currentTarget.style.background = isYou ? "rgba(239,68,68,0.10)" : "rgba(255,255,255,0.04)"}
      onMouseLeave={e => e.currentTarget.style.background = isYou ? "rgba(239,68,68,0.06)" : rs.bg}
    >
      {/* Rank */}
      <div style={{ width: 28, textAlign: "center", flexShrink: 0 }}>
        {rs.emoji ? (
          <span style={{ fontSize: 18 }}>{rs.emoji}</span>
        ) : (
          <span style={{ fontSize: 14, fontWeight: 700, color: "#374151" }}>#{rank + 1}</span>
        )}
      </div>

      {/* Avatar */}
      <AvatarMini config={user.avatar_config} size={36} style={{
        flexShrink: 0,
        border: "2px solid rgba(255,255,255,0.08)",
      }} />

      {/* Name */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: isYou ? "#ef4444" : "#f1f5f9" }}>
          @{user.username} {isYou && <span style={{ fontSize: 9, color: "#ef4444", fontWeight: 400 }}>(you)</span>}
        </div>
      </div>

      {/* Stat */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: statColor || rs.color }}>
          {stat}
        </div>
        <div style={{ fontSize: 9, color: "#4a5568" }}>{statLabel}</div>
      </div>
    </div>
  );
}

export default function LeaderboardPage({ currentUser }) {
  const [tab, setTab] = useState('winrate');
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { loadLeaderboard(); }, [tab]);

  async function loadLeaderboard() {
    setLoading(true);

    // Fetch all profiles with picks
    const { data: profiles, error: profilesErr } = await supabase
      .from('profiles')
      .select('*')
      .not('username', 'is', null)
      .order('created_at', { ascending: true });

    if (profilesErr) {
      console.error('[Leaderboard] profiles query error:', profilesErr.message);
    }
    if (!profiles) { setLoading(false); return; }

    // Fetch pick stats for each user (aggregate)
    const { data: allPicks } = await supabase
      .from('game_picks')
      .select('user_id, result, net, wager')
      .not('result', 'is', null);

    // Build stats per user
    const statsMap = {};
    for (const p of (allPicks || [])) {
      if (!statsMap[p.user_id]) statsMap[p.user_id] = { wins: 0, losses: 0, totalNet: 0, totalWagered: 0, picks: 0 };
      const s = statsMap[p.user_id];
      s.picks++;
      if (p.result === 'win' || p.result === 'W') s.wins++;
      if (p.result === 'loss' || p.result === 'L') s.losses++;
      s.totalNet += parseFloat(p.net || 0);
      s.totalWagered += parseFloat(p.wager || 0);
    }

    // Merge profiles with stats
    let merged = profiles.map(p => ({
      ...p,
      stats: statsMap[p.user_id] || { wins: 0, losses: 0, totalNet: 0, totalWagered: 0, picks: 0 },
    }));

    // Sort based on tab
    if (tab === 'winrate') {
      // Min 3 picks to qualify
      merged = merged
        .filter(u => (u.stats.wins + u.stats.losses) >= 3)
        .sort((a, b) => {
          const aRate = a.stats.wins / (a.stats.wins + a.stats.losses);
          const bRate = b.stats.wins / (b.stats.wins + b.stats.losses);
          return bRate - aRate || b.stats.wins - a.stats.wins;
        });
    } else if (tab === 'profit') {
      merged = merged
        .filter(u => u.stats.picks >= 1)
        .sort((a, b) => b.stats.totalNet - a.stats.totalNet);
    } else if (tab === 'bankroll') {
      merged.sort((a, b) => (b.bankroll || 0) - (a.bankroll || 0));
    }

    setLeaders(merged.slice(0, 10));
    setLoading(false);
  }

  async function handleSearch(q) {
    setSearch(q);
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .ilike('username', `%${q}%`)
      .not('username', 'is', null)
      .limit(8);
    setSearchResults(data || []);
    setSearching(false);
  }

  function getStatDisplay(user) {
    const s = user.stats;
    if (tab === 'winrate') {
      const total = s.wins + s.losses;
      const rate = total > 0 ? ((s.wins / total) * 100).toFixed(1) : "0";
      return {
        stat: `${rate}%`,
        label: `${s.wins}-${s.losses}`,
        color: parseFloat(rate) >= 55 ? "#22c55e" : parseFloat(rate) >= 50 ? "#f59e0b" : "#ef4444",
      };
    }
    if (tab === 'profit') {
      return {
        stat: formatBucks(s.totalNet),
        label: `${s.picks} picks`,
        color: s.totalNet >= 0 ? "#22c55e" : "#ef4444",
      };
    }
    // bankroll
    return {
      stat: formatBucks(user.bankroll),
      label: "bankroll",
      color: "#fbbf24",
    };
  }

  return (
    <div style={{ minHeight: "100vh", fontFamily: FONT, padding: "24px 16px 60px", maxWidth: 640, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🏆</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: "0 0 4px" }}>LEADERBOARD</h1>
        <div style={{ fontSize: 11, color: "#4a5568" }}>Top 10 OTJ bettors</div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 20, position: "relative" }}>
        <input
          value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder="🔍 Search users..."
          style={{
            width: "100%", padding: "10px 14px", borderRadius: 8,
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
            color: "#f1f5f9", fontSize: 12, fontFamily: FONT, outline: "none", boxSizing: "border-box",
          }}
        />
        {searchResults.length > 0 && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20,
            background: "#0f0f1a", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8, marginTop: 4, overflow: "hidden",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}>
            {searchResults.map(u => (
              <div
                key={u.user_id}
                onClick={() => { setSearch(''); setSearchResults([]); navigate(`/profile/${u.username}`); }}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px", cursor: "pointer",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <AvatarMini config={u.avatar_config} size={28} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#f1f5f9" }}>@{u.username}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {[
          { id: 'winrate', label: '🎯 WIN RATE', sub: 'min 3 picks' },
          { id: 'profit', label: '💰 PROFIT' },
          { id: 'bankroll', label: '🏦 BANKROLL' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: "8px 6px", borderRadius: 8, cursor: "pointer",
              background: tab === t.id ? "rgba(239,68,68,0.10)" : "rgba(255,255,255,0.02)",
              border: `1px solid ${tab === t.id ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.06)"}`,
              color: tab === t.id ? "#ef4444" : "#6b7280",
              fontSize: 10, fontWeight: 700, fontFamily: FONT,
              letterSpacing: "0.06em", textAlign: "center",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Leaderboard list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 11, color: "#1e293b", letterSpacing: "0.15em" }}>LOADING...</div>
        </div>
      ) : leaders.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 16px" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
          <div style={{ fontSize: 12, color: "#4a5568" }}>
            {tab === 'winrate' ? "No users with 3+ graded picks yet" : "No data yet — start betting!"}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {leaders.map((u, i) => {
            const { stat, label, color } = getStatDisplay(u);
            return (
              <LeaderRow
                key={u.user_id}
                rank={i}
                user={u}
                stat={stat}
                statLabel={label}
                statColor={color}
                currentUserId={currentUser?.id}
              />
            );
          })}
        </div>
      )}

      {/* Footer note */}
      <div style={{ textAlign: "center", marginTop: 24, fontSize: 10, color: "#374151", lineHeight: 1.8 }}>
        {tab === 'winrate' && "Minimum 3 graded picks to qualify · Ties broken by total wins"}
        {tab === 'profit' && "Total P/L from all graded bets · Updated after each night's resolve"}
        {tab === 'bankroll' && "Current OTJ Bucks balance · $10K start + $1K monthly reload"}
      </div>

      <div style={{ textAlign: "center", marginTop: 32, fontSize: 10, color: "#1e1040", letterSpacing: "0.12em" }}>
        ★ OVERTIME JOURNAL ★
      </div>
    </div>
  );
}
