import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { UsernameModal } from '../components/common/UsernameModal';

const FONT = "'JetBrains Mono','SF Mono',monospace";

const TIER_COLORS = {
  legendary: { bg: "rgba(251,191,36,0.10)", border: "#fbbf24", text: "#fbbf24", glow: "rgba(251,191,36,0.3)" },
  gold:      { bg: "rgba(234,179,8,0.08)",  border: "#eab308", text: "#eab308", glow: "rgba(234,179,8,0.2)" },
  silver:    { bg: "rgba(148,163,184,0.08)", border: "#94a3b8", text: "#94a3b8", glow: "rgba(148,163,184,0.15)" },
  bronze:    { bg: "rgba(217,119,6,0.08)",   border: "#d97706", text: "#d97706", glow: "rgba(217,119,6,0.15)" },
};

function calculateStreak(picks) {
  if (!picks.length) return { type: null, count: 0, text: "—" };
  const sorted = [...picks]
    .filter(p => p.result === 'win' || p.result === 'loss')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (!sorted.length) return { type: null, count: 0, text: "—" };
  const streakType = sorted[0].result;
  let count = 0;
  for (const p of sorted) {
    if (p.result === streakType) count++;
    else break;
  }
  return { type: streakType, count, text: `${streakType === 'win' ? 'W' : 'L'}${count}` };
}

function formatBucks(n) {
  if (n == null) return "$0";
  return (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString();
}

// ─── Reusable components ─────────────────────────────────────────────────────

function StatBox({ label, value, sub, color = "#f1f5f9", onClick }) {
  return (
    <div onClick={onClick} style={{
      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 10, padding: "14px 12px", textAlign: "center",
      cursor: onClick ? "pointer" : "default",
    }}>
      <div style={{ fontSize: 9, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#4a5568", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function BadgeCard({ badge, tier }) {
  const t = TIER_COLORS[tier] || TIER_COLORS.bronze;
  return (
    <div style={{
      background: t.bg, border: `1px solid ${t.border}30`, borderRadius: 10,
      padding: "12px 14px", display: "flex", alignItems: "center", gap: 10,
      boxShadow: `0 0 12px ${t.glow}`,
    }}>
      <div style={{ fontSize: 24, flexShrink: 0 }}>{badge.emoji}</div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.text }}>{badge.label}</div>
        <div style={{ fontSize: 10, color: "#6b7280", lineHeight: 1.4 }}>{badge.description}</div>
      </div>
    </div>
  );
}

function PickRow({ pick }) {
  const isWin = pick.result === 'win';
  const isLoss = pick.result === 'loss';
  const isPending = !pick.result || pick.result === 'pending';
  const resultColor = isWin ? "#22c55e" : isLoss ? "#ef4444" : "#4a5568";
  const resultText = isWin ? "W" : isLoss ? "L" : "—";

  // Build bet label
  const typeLabel = pick.pick_type === 'moneyline' ? 'ML'
    : pick.pick_type === 'spread' ? `${pick.locked_line > 0 ? '+' : ''}${pick.locked_line}`
    : pick.pick_type === 'over' ? `O ${pick.locked_line}`
    : pick.pick_type === 'under' ? `U ${pick.locked_line}`
    : 'ML';

  const oddsLabel = pick.locked_odds
    ? `(${pick.locked_odds > 0 ? '+' : ''}${pick.locked_odds})`
    : '';

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 14px", borderRadius: 8,
      background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 600 }}>
          {pick.picked_team} <span style={{ color: "#6b7280", fontWeight: 400 }}>{typeLabel} {oddsLabel}</span>
        </div>
        <div style={{ fontSize: 10, color: "#4a5568" }}>
          {pick.matchup} · {(() => { const [y,m,d] = (pick.slate_date || '').split('-'); return new Date(y, m-1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); })()}
          {pick.wager ? ` · ${formatBucks(pick.wager)}` : ''}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{
          fontSize: 13, fontWeight: 700, color: resultColor,
          background: isPending ? "transparent" : `${resultColor}15`,
          padding: "3px 10px", borderRadius: 6,
          border: isPending ? "none" : `1px solid ${resultColor}30`,
        }}>
          {resultText}
        </div>
        {pick.net != null && (
          <div style={{
            fontSize: 9, color: pick.net >= 0 ? "#22c55e" : "#ef4444",
            marginTop: 3, fontWeight: 600,
          }}>
            {pick.net >= 0 ? '+' : ''}{formatBucks(pick.net)}
          </div>
        )}
      </div>
    </div>
  );
}

function FollowListModal({ title, users, onClose }) {
  const navigate = useNavigate();
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, fontFamily: FONT,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#0f0f1a", border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16, padding: "24px 20px", width: "100%", maxWidth: 360,
        maxHeight: "70vh", display: "flex", flexDirection: "column",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#4a5568", fontSize: 16, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {users.length === 0 && (
            <div style={{ textAlign: "center", padding: 20, fontSize: 11, color: "#4a5568" }}>Nobody here yet</div>
          )}
          {users.map(u => (
            <div key={u.user_id} onClick={() => { onClose(); navigate(`/profile/${u.username}`); }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 8px", borderRadius: 8, cursor: "pointer" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <div style={{
                width: 32, height: 32, borderRadius: "50%", background: u.avatar_color || "#ef4444",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0,
              }}>
                {u.profile_icon || (u.username ? u.username[0].toUpperCase() : "?")}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#f1f5f9" }}>@{u.username}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Profile Page ───────────────────────────────────────────────────────

export default function ProfilePage({ currentUser, currentProfile }) {
  const { username } = useParams();
  const [profile, setProfile]     = useState(null);
  const [picks, setPicks]         = useState([]);
  const [badges, setBadges]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [notFound, setNotFound]   = useState(false);
  const [showEdit, setShowEdit]   = useState(false);
  const [pickPage, setPickPage]   = useState(0);
  const [activeTab, setActiveTab] = useState('picks');  // 'picks' | 'bucks'
  const [ledger, setLedger]       = useState([]);

  // Follow state
  const [isFollowing, setIsFollowing]     = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followLoading, setFollowLoading] = useState(false);
  const [showFollowers, setShowFollowers] = useState(false);
  const [showFollowing, setShowFollowing] = useState(false);
  const [followerList, setFollowerList]   = useState([]);
  const [followingList, setFollowingList] = useState([]);

  const PICKS_PER_PAGE = 15;
  const isOwnProfile = currentUser && currentProfile?.username === username;

  useEffect(() => { loadProfile(); }, [username, currentUser]);

  async function loadProfile() {
    setLoading(true);
    setNotFound(false);
    setPickPage(0);

    const { data: prof, error: profErr } = await supabase
      .from('profiles').select('*').eq('username', username).single();

    if (profErr || !prof) { setNotFound(true); setLoading(false); return; }
    setProfile(prof);

    // Check monthly reload for own profile
    if (currentUser && currentUser.id === prof.user_id) {
      try { await supabase.rpc('check_monthly_reload', { p_user_id: prof.user_id }); } catch {}
    }

    const [picksRes, badgesRes, followersRes, followingRes, isFollowingRes] = await Promise.all([
      supabase.from('game_picks').select('*').eq('user_id', prof.user_id).order('created_at', { ascending: false }),
      supabase.from('user_badges').select('badge_id, awarded_at, badges(*)').eq('user_id', prof.user_id).order('awarded_at', { ascending: true }),
      supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', prof.user_id),
      supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', prof.user_id),
      currentUser
        ? supabase.from('follows').select('id').eq('follower_id', currentUser.id).eq('following_id', prof.user_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    setPicks(picksRes.data || []);
    setBadges((badgesRes.data || []).map(ub => ({ ...ub.badges, awarded_at: ub.awarded_at })));
    setFollowerCount(followersRes.count || 0);
    setFollowingCount(followingRes.count || 0);
    setIsFollowing(!!isFollowingRes.data);

    // Refetch profile after reload check to get updated bankroll
    if (currentUser && currentUser.id === prof.user_id) {
      const { data: freshProf } = await supabase.from('profiles').select('*').eq('user_id', prof.user_id).single();
      if (freshProf) setProfile(freshProf);
    }

    setLoading(false);
  }

  async function loadLedger() {
    if (!isOwnProfile || !profile) return;
    const { data } = await supabase
      .from('bucks_ledger').select('*').eq('user_id', profile.user_id)
      .order('created_at', { ascending: false }).limit(50);
    setLedger(data || []);
  }

  useEffect(() => { if (activeTab === 'bucks') loadLedger(); }, [activeTab]);

  async function handleFollow() {
    if (!currentUser || !profile || followLoading) return;
    setFollowLoading(true);
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', currentUser.id).eq('following_id', profile.user_id);
      setIsFollowing(false);
      setFollowerCount(c => Math.max(0, c - 1));
    } else {
      await supabase.from('follows').insert({ follower_id: currentUser.id, following_id: profile.user_id });
      setIsFollowing(true);
      setFollowerCount(c => c + 1);

      // Send notification to the person being followed
      try {
        await supabase.from('notifications').insert({
          user_id: profile.user_id,
          type: 'new_follower',
          title: `👤 @${currentProfile?.username || 'Someone'} started following you`,
          body: null,
          data: { username: currentProfile?.username, follower_id: currentUser.id },
        });
      } catch {}
    }
    setFollowLoading(false);
  }

  async function openFollowers() {
    const { data } = await supabase.from('follows')
      .select('follower_id, profiles!follows_follower_id_fkey(user_id, username, avatar_color, profile_icon)')
      .eq('following_id', profile.user_id);
    setFollowerList((data || []).map(d => d.profiles));
    setShowFollowers(true);
  }

  async function openFollowing() {
    const { data } = await supabase.from('follows')
      .select('following_id, profiles!follows_following_id_fkey(user_id, username, avatar_color, profile_icon)')
      .eq('follower_id', profile.user_id);
    setFollowingList((data || []).map(d => d.profiles));
    setShowFollowing(true);
  }

  function handleEditComplete(updatedProfile) {
    setShowEdit(false);
    if (updatedProfile) {
      setProfile(updatedProfile);
      if (updatedProfile.username !== username) window.location.href = `/profile/${updatedProfile.username}`;
    }
  }

  // ─── Loading / Not Found ─────────────────────────────────────────────────

  if (loading) return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontSize: 11, color: "#1e293b", letterSpacing: "0.15em", fontFamily: FONT }}>LOADING...</div>
    </div>
  );

  if (notFound) return (
    <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, fontFamily: FONT }}>
      <div style={{ fontSize: 40 }}>👻</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>User not found</div>
      <div style={{ fontSize: 11, color: "#4a5568" }}>@{username} doesn't exist yet</div>
      <Link to="/nba" style={{ fontSize: 11, color: "#ef4444", textDecoration: "none", marginTop: 8 }}>← Back to dashboard</Link>
    </div>
  );

  // ─── Stats ─────────────────────────────────────────────────────────────────

  const wins = picks.filter(p => p.result === 'win').length;
  const losses = picks.filter(p => p.result === 'loss').length;
  const total = wins + losses;
  const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : "—";
  const streak = calculateStreak(picks);
  const memberSince = new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const totalNet = picks.reduce((sum, p) => sum + (p.net || 0), 0);

  const displayPicks = picks.slice(pickPage * PICKS_PER_PAGE, (pickPage + 1) * PICKS_PER_PAGE);
  const totalPages = Math.ceil(picks.length / PICKS_PER_PAGE);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", fontFamily: FONT, padding: "24px 16px 60px", maxWidth: 640, margin: "0 auto" }}>

      {showEdit && currentUser && <UsernameModal user={currentUser} profile={profile} onComplete={handleEditComplete} />}
      {showFollowers && <FollowListModal title="Followers" users={followerList} onClose={() => setShowFollowers(false)} />}
      {showFollowing && <FollowListModal title="Following" users={followingList} onClose={() => setShowFollowing(false)} />}

      {/* ─── Profile Header ─── */}
      <div style={{
        textAlign: "center", marginBottom: 24,
        background: "linear-gradient(180deg, rgba(255,255,255,0.02) 0%, transparent 100%)",
        borderRadius: 16, padding: "32px 20px 24px", border: "1px solid rgba(255,255,255,0.05)",
      }}>
        {/* Avatar */}
        <div style={{
          width: 80, height: 80, borderRadius: "50%", background: profile.avatar_color || "#ef4444",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 38, margin: "0 auto 12px",
          border: "3px solid rgba(255,255,255,0.12)", boxShadow: `0 0 30px ${profile.avatar_color || "#ef4444"}30`,
        }}>
          {profile.profile_icon || profile.username[0].toUpperCase()}
        </div>

        <div style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", marginBottom: 2 }}>@{profile.username}</div>
        <div style={{ fontSize: 10, color: "#4a5568", letterSpacing: "0.08em", marginBottom: 12 }}>
          Member since {memberSince}
        </div>

        {/* Followers / Following */}
        <div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: 14 }}>
          <div onClick={openFollowers} style={{ cursor: "pointer" }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9" }}>{followerCount}</span>
            <span style={{ fontSize: 10, color: "#4a5568", marginLeft: 4 }}>followers</span>
          </div>
          <div style={{ width: 1, background: "rgba(255,255,255,0.06)" }} />
          <div onClick={openFollowing} style={{ cursor: "pointer" }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9" }}>{followingCount}</span>
            <span style={{ fontSize: 10, color: "#4a5568", marginLeft: 4 }}>following</span>
          </div>
        </div>

        {/* Follow / Edit */}
        {isOwnProfile ? (
          <button onClick={() => setShowEdit(true)} style={{
            fontSize: 11, padding: "7px 20px", borderRadius: 8,
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
            color: "#6b7280", cursor: "pointer", fontFamily: FONT, fontWeight: 600,
          }}>
            ✏️ EDIT PROFILE
          </button>
        ) : currentUser ? (
          <button onClick={handleFollow} disabled={followLoading} style={{
            fontSize: 11, padding: "7px 20px", borderRadius: 8,
            background: isFollowing ? "rgba(255,255,255,0.04)" : "#ef4444",
            border: isFollowing ? "1px solid rgba(255,255,255,0.1)" : "1px solid #ef4444",
            color: isFollowing ? "#6b7280" : "#fff",
            cursor: followLoading ? "not-allowed" : "pointer",
            fontFamily: FONT, fontWeight: 700, transition: "all 0.15s ease",
          }}>
            {followLoading ? "..." : isFollowing ? "FOLLOWING ✓" : "FOLLOW"}
          </button>
        ) : null}
      </div>

      {/* ─── Bankroll Banner (own profile) ─── */}
      {isOwnProfile && (
        <div style={{
          background: "linear-gradient(135deg, rgba(34,197,94,0.08) 0%, rgba(251,191,36,0.06) 100%)",
          border: "1px solid rgba(34,197,94,0.15)", borderRadius: 12,
          padding: "16px 20px", marginBottom: 20,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 9, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
              💰 OTJ BUCKS
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#22c55e" }}>
              {formatBucks(profile.bankroll)}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 9, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
              ALL-TIME P/L
            </div>
            <div style={{
              fontSize: 18, fontWeight: 700,
              color: totalNet >= 0 ? "#22c55e" : "#ef4444",
            }}>
              {totalNet >= 0 ? '+' : ''}{formatBucks(totalNet)}
            </div>
          </div>
        </div>
      )}

      {/* ─── Stats Grid ─── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20 }}>
        <StatBox label="Record" value={`${wins}-${losses}`} sub={total > 0 ? `${total} picks` : "No picks yet"} />
        <StatBox label="Win %" value={winRate === "—" ? "—" : `${winRate}%`}
          color={parseFloat(winRate) >= 55 ? "#22c55e" : parseFloat(winRate) >= 50 ? "#f59e0b" : "#ef4444"} />
        <StatBox label="Streak" value={streak.text}
          color={streak.type === 'win' ? "#22c55e" : streak.type === 'loss' ? "#ef4444" : "#4a5568"} />
        <StatBox label="P/L" value={formatBucks(totalNet)}
          color={totalNet >= 0 ? "#22c55e" : "#ef4444"} />
      </div>

      {/* ─── Badges ─── */}
      {badges.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.12em" }}>
            🏅 Badges ({badges.length})
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {badges.map(b => <BadgeCard key={b.id} badge={b} tier={b.tier} />)}
          </div>
        </div>
      )}

      {/* ─── Tabs: Pick History | OTJ Bucks Ledger ─── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
        {['picks', ...(isOwnProfile ? ['bucks'] : [])].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            fontSize: 10, padding: "6px 14px", borderRadius: 6,
            background: activeTab === tab ? "rgba(255,255,255,0.08)" : "transparent",
            border: `1px solid ${activeTab === tab ? "rgba(255,255,255,0.1)" : "transparent"}`,
            color: activeTab === tab ? "#f1f5f9" : "#4a5568",
            cursor: "pointer", fontFamily: FONT, fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "0.1em",
          }}>
            {tab === 'picks' ? `📋 Picks (${picks.length})` : '💰 Bucks Log'}
          </button>
        ))}
      </div>

      {/* ─── Pick History Tab ─── */}
      {activeTab === 'picks' && (
        <div>
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, alignItems: "center", marginBottom: 8 }}>
              <button onClick={() => setPickPage(Math.max(0, pickPage - 1))} disabled={pickPage === 0}
                style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: pickPage === 0 ? "#1e293b" : "#6b7280", cursor: pickPage === 0 ? "default" : "pointer", fontFamily: FONT }}>←</button>
              <span style={{ fontSize: 10, color: "#4a5568" }}>{pickPage + 1}/{totalPages}</span>
              <button onClick={() => setPickPage(Math.min(totalPages - 1, pickPage + 1))} disabled={pickPage >= totalPages - 1}
                style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: pickPage >= totalPages - 1 ? "#1e293b" : "#6b7280", cursor: pickPage >= totalPages - 1 ? "default" : "pointer", fontFamily: FONT }}>→</button>
            </div>
          )}

          {picks.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 16px", background: "rgba(255,255,255,0.015)", borderRadius: 10, border: "1px dashed rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🏀</div>
              <div style={{ fontSize: 12, color: "#4a5568" }}>
                {isOwnProfile ? "No picks yet — head to the NBA page to lock one in!" : "No picks yet."}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {displayPicks.map(p => <PickRow key={p.id} pick={p} />)}
            </div>
          )}
        </div>
      )}

      {/* ─── Bucks Ledger Tab (own profile only) ─── */}
      {activeTab === 'bucks' && isOwnProfile && (
        <div>
          {ledger.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 16px", background: "rgba(255,255,255,0.015)", borderRadius: 10, border: "1px dashed rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 10, color: "#4a5568" }}>No transactions yet</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {ledger.map(tx => (
                <div key={tx.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 12px", borderRadius: 6,
                  background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)",
                }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#e2e8f0" }}>{tx.note || tx.type}</div>
                    <div style={{ fontSize: 9, color: "#374151" }}>
                      {new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{
                      fontSize: 12, fontWeight: 700,
                      color: tx.amount >= 0 ? "#22c55e" : "#ef4444",
                    }}>
                      {tx.amount >= 0 ? '+' : ''}{formatBucks(tx.amount)}
                    </div>
                    <div style={{ fontSize: 9, color: "#374151" }}>
                      bal: {formatBucks(tx.balance_after)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Footer ─── */}
      <div style={{ textAlign: "center", marginTop: 40, fontSize: 10, color: "#1e1040", letterSpacing: "0.12em" }}>
        ★ OVERTIME JOURNAL ★
      </div>
    </div>
  );
}
