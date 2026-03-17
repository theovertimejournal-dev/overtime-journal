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
  let count = 0;
  const sorted = [...picks].filter(p => p.result === 'win' || p.result === 'loss').sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (!sorted.length) return { type: null, count: 0, text: "—" };
  const streakType = sorted[0].result;
  for (const p of sorted) {
    if (p.result === streakType) count++;
    else break;
  }
  return {
    type: streakType,
    count,
    text: `${streakType === 'win' ? 'W' : 'L'}${count}`,
  };
}

function StatBox({ label, value, sub, color = "#f1f5f9", onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 10, padding: "14px 16px", textAlign: "center",
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.15s ease",
      }}
    >
      <div style={{ fontSize: 9, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: "#4a5568", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function BadgeCard({ badge, tier }) {
  const t = TIER_COLORS[tier] || TIER_COLORS.bronze;
  return (
    <div style={{
      background: t.bg, border: `1px solid ${t.border}30`,
      borderRadius: 10, padding: "12px 14px",
      display: "flex", alignItems: "center", gap: 10,
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

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 14px", borderRadius: 8,
      background: "rgba(255,255,255,0.015)",
      border: "1px solid rgba(255,255,255,0.04)",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 600 }}>
          {pick.picked_team}
        </div>
        <div style={{ fontSize: 10, color: "#4a5568" }}>
          {pick.matchup} · {new Date(pick.slate_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </div>
      </div>
      <div style={{
        fontSize: 13, fontWeight: 700, color: resultColor,
        background: isPending ? "transparent" : `${resultColor}15`,
        padding: "3px 10px", borderRadius: 6,
        border: isPending ? "none" : `1px solid ${resultColor}30`,
      }}>
        {resultText}
      </div>
    </div>
  );
}

// ─── Follow list modal ───────────────────────────────────────────────────────
function FollowListModal({ title, users, onClose }) {
  const navigate = useNavigate();
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: FONT,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#0f0f1a", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16, padding: "24px 20px", width: "100%", maxWidth: 360,
          maxHeight: "70vh", display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>{title}</div>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "#4a5568", fontSize: 16, cursor: "pointer",
          }}>✕</button>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {users.length === 0 && (
            <div style={{ textAlign: "center", padding: 20, fontSize: 11, color: "#4a5568" }}>
              Nobody here yet
            </div>
          )}
          {users.map(u => (
            <div
              key={u.user_id}
              onClick={() => { onClose(); navigate(`/profile/${u.username}`); }}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 8px", borderRadius: 8, cursor: "pointer",
                transition: "background 0.1s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: u.avatar_color || "#ef4444",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, flexShrink: 0,
              }}>
                {u.profile_icon || (u.username ? u.username[0].toUpperCase() : "?")}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#f1f5f9" }}>@{u.username}</div>
              </div>
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
  const [profile, setProfile]           = useState(null);
  const [picks, setPicks]               = useState([]);
  const [badges, setBadges]             = useState([]);
  const [loading, setLoading]           = useState(true);
  const [notFound, setNotFound]         = useState(false);
  const [showEdit, setShowEdit]         = useState(false);
  const [pickPage, setPickPage]         = useState(0);

  // Follow state
  const [isFollowing, setIsFollowing]   = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followLoading, setFollowLoading] = useState(false);
  const [showFollowers, setShowFollowers] = useState(false);
  const [showFollowing, setShowFollowing] = useState(false);
  const [followerList, setFollowerList]   = useState([]);
  const [followingList, setFollowingList] = useState([]);

  const PICKS_PER_PAGE = 15;
  const isOwnProfile = currentUser && currentProfile?.username === username;

  useEffect(() => {
    loadProfile();
  }, [username, currentUser]);

  async function loadProfile() {
    setLoading(true);
    setNotFound(false);
    setPickPage(0);

    // Fetch profile by username
    const { data: prof, error: profErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .single();

    if (profErr || !prof) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setProfile(prof);

    // Fetch all data in parallel
    const [picksRes, badgesRes, followersRes, followingRes, isFollowingRes] = await Promise.all([
      supabase
        .from('game_picks')
        .select('*')
        .eq('user_id', prof.user_id)
        .order('created_at', { ascending: false }),

      supabase
        .from('user_badges')
        .select('badge_id, awarded_at, badges(*)')
        .eq('user_id', prof.user_id)
        .order('awarded_at', { ascending: true }),

      supabase
        .from('follows')
        .select('id', { count: 'exact', head: true })
        .eq('following_id', prof.user_id),

      supabase
        .from('follows')
        .select('id', { count: 'exact', head: true })
        .eq('follower_id', prof.user_id),

      currentUser
        ? supabase
            .from('follows')
            .select('id')
            .eq('follower_id', currentUser.id)
            .eq('following_id', prof.user_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    setPicks(picksRes.data || []);
    setBadges((badgesRes.data || []).map(ub => ({ ...ub.badges, awarded_at: ub.awarded_at })));
    setFollowerCount(followersRes.count || 0);
    setFollowingCount(followingRes.count || 0);
    setIsFollowing(!!isFollowingRes.data);

    setLoading(false);
  }

  async function handleFollow() {
    if (!currentUser || !profile || followLoading) return;
    setFollowLoading(true);

    if (isFollowing) {
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', currentUser.id)
        .eq('following_id', profile.user_id);
      setIsFollowing(false);
      setFollowerCount(c => Math.max(0, c - 1));
    } else {
      await supabase
        .from('follows')
        .insert({ follower_id: currentUser.id, following_id: profile.user_id });
      setIsFollowing(true);
      setFollowerCount(c => c + 1);
    }

    setFollowLoading(false);
  }

  async function openFollowers() {
    const { data } = await supabase
      .from('follows')
      .select('follower_id, profiles!follows_follower_id_fkey(user_id, username, avatar_color, profile_icon)')
      .eq('following_id', profile.user_id);
    setFollowerList((data || []).map(d => d.profiles));
    setShowFollowers(true);
  }

  async function openFollowing() {
    const { data } = await supabase
      .from('follows')
      .select('following_id, profiles!follows_following_id_fkey(user_id, username, avatar_color, profile_icon)')
      .eq('follower_id', profile.user_id);
    setFollowingList((data || []).map(d => d.profiles));
    setShowFollowing(true);
  }

  function handleEditComplete(updatedProfile) {
    setShowEdit(false);
    if (updatedProfile) {
      setProfile(updatedProfile);
      if (updatedProfile.username !== username) {
        window.location.href = `/profile/${updatedProfile.username}`;
      }
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 11, color: "#1e293b", letterSpacing: "0.15em", fontFamily: FONT }}>LOADING...</div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, fontFamily: FONT }}>
        <div style={{ fontSize: 40 }}>👻</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>User not found</div>
        <div style={{ fontSize: 11, color: "#4a5568" }}>@{username} doesn't exist yet</div>
        <Link to="/nba" style={{ fontSize: 11, color: "#ef4444", textDecoration: "none", marginTop: 8 }}>← Back to dashboard</Link>
      </div>
    );
  }

  // Stats
  const wins = picks.filter(p => p.result === 'win').length;
  const losses = picks.filter(p => p.result === 'loss').length;
  const total = wins + losses;
  const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : "—";
  const streak = calculateStreak(picks);
  const memberSince = new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  // Paginated picks
  const displayPicks = picks.slice(pickPage * PICKS_PER_PAGE, (pickPage + 1) * PICKS_PER_PAGE);
  const totalPages = Math.ceil(picks.length / PICKS_PER_PAGE);

  return (
    <div style={{
      minHeight: "100vh", fontFamily: FONT,
      padding: "24px 16px 60px", maxWidth: 640, margin: "0 auto",
    }}>
      {/* Edit Modal */}
      {showEdit && currentUser && (
        <UsernameModal
          user={currentUser}
          profile={profile}
          onComplete={handleEditComplete}
        />
      )}

      {/* Follow list modals */}
      {showFollowers && (
        <FollowListModal title="Followers" users={followerList} onClose={() => setShowFollowers(false)} />
      )}
      {showFollowing && (
        <FollowListModal title="Following" users={followingList} onClose={() => setShowFollowing(false)} />
      )}

      {/* ─── Profile Header ─── */}
      <div style={{
        textAlign: "center", marginBottom: 28,
        background: "linear-gradient(180deg, rgba(255,255,255,0.02) 0%, transparent 100%)",
        borderRadius: 16, padding: "32px 20px 24px",
        border: "1px solid rgba(255,255,255,0.05)",
        position: "relative",
      }}>
        {/* Avatar */}
        <div style={{
          width: 80, height: 80, borderRadius: "50%",
          background: profile.avatar_color || "#ef4444",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 38, margin: "0 auto 12px",
          border: "3px solid rgba(255,255,255,0.12)",
          boxShadow: `0 0 30px ${profile.avatar_color || "#ef4444"}30`,
        }}>
          {profile.profile_icon || profile.username[0].toUpperCase()}
        </div>

        {/* Username */}
        <div style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", marginBottom: 2 }}>
          @{profile.username}
        </div>
        <div style={{ fontSize: 10, color: "#4a5568", letterSpacing: "0.08em", marginBottom: 12 }}>
          Member since {memberSince}
        </div>

        {/* Follower / Following counts */}
        <div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: 14 }}>
          <div onClick={openFollowers} style={{ cursor: "pointer", textAlign: "center" }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9" }}>{followerCount}</span>
            <span style={{ fontSize: 10, color: "#4a5568", marginLeft: 4 }}>followers</span>
          </div>
          <div style={{ width: 1, background: "rgba(255,255,255,0.06)" }} />
          <div onClick={openFollowing} style={{ cursor: "pointer", textAlign: "center" }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9" }}>{followingCount}</span>
            <span style={{ fontSize: 10, color: "#4a5568", marginLeft: 4 }}>following</span>
          </div>
        </div>

        {/* Follow / Edit button */}
        {isOwnProfile ? (
          <button
            onClick={() => setShowEdit(true)}
            style={{
              fontSize: 11, padding: "7px 20px", borderRadius: 8,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
              color: "#6b7280", cursor: "pointer", fontFamily: FONT,
              fontWeight: 600, letterSpacing: "0.06em",
            }}
          >
            ✏️ EDIT PROFILE
          </button>
        ) : currentUser ? (
          <button
            onClick={handleFollow}
            disabled={followLoading}
            style={{
              fontSize: 11, padding: "7px 20px", borderRadius: 8,
              background: isFollowing ? "rgba(255,255,255,0.04)" : "#ef4444",
              border: isFollowing ? "1px solid rgba(255,255,255,0.1)" : "1px solid #ef4444",
              color: isFollowing ? "#6b7280" : "#fff",
              cursor: followLoading ? "not-allowed" : "pointer",
              fontFamily: FONT, fontWeight: 700, letterSpacing: "0.06em",
              transition: "all 0.15s ease",
            }}
          >
            {followLoading ? "..." : isFollowing ? "FOLLOWING ✓" : "FOLLOW"}
          </button>
        ) : null}
      </div>

      {/* ─── Stats Grid ─── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8,
        marginBottom: 24,
      }}>
        <StatBox label="Record" value={`${wins}-${losses}`} sub={total > 0 ? `${total} picks` : "No picks yet"} />
        <StatBox
          label="Win %"
          value={winRate === "—" ? "—" : `${winRate}%`}
          color={parseFloat(winRate) >= 55 ? "#22c55e" : parseFloat(winRate) >= 50 ? "#f59e0b" : "#ef4444"}
        />
        <StatBox
          label="Streak"
          value={streak.text}
          color={streak.type === 'win' ? "#22c55e" : streak.type === 'loss' ? "#ef4444" : "#4a5568"}
        />
        <StatBox label="Since" value={memberSince} />
      </div>

      {/* ─── Badges ─── */}
      {badges.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 10,
            textTransform: "uppercase", letterSpacing: "0.12em",
          }}>
            🏅 Badges ({badges.length})
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {badges.map(b => (
              <BadgeCard key={b.id} badge={b} tier={b.tier} />
            ))}
          </div>
        </div>
      )}

      {badges.length === 0 && isOwnProfile && (
        <div style={{
          textAlign: "center", padding: "20px 16px", marginBottom: 28,
          background: "rgba(255,255,255,0.015)", borderRadius: 10,
          border: "1px dashed rgba(255,255,255,0.06)",
        }}>
          <div style={{ fontSize: 10, color: "#4a5568" }}>No badges yet — keep playing to earn them!</div>
        </div>
      )}

      {/* ─── Pick History ─── */}
      <div>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 10,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: "#6b7280",
            textTransform: "uppercase", letterSpacing: "0.12em",
          }}>
            📋 Pick History ({picks.length})
          </div>
          {totalPages > 1 && (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button
                onClick={() => setPickPage(Math.max(0, pickPage - 1))}
                disabled={pickPage === 0}
                style={{
                  fontSize: 10, padding: "3px 8px", borderRadius: 4,
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                  color: pickPage === 0 ? "#1e293b" : "#6b7280", cursor: pickPage === 0 ? "default" : "pointer",
                  fontFamily: FONT,
                }}
              >
                ←
              </button>
              <span style={{ fontSize: 10, color: "#4a5568" }}>{pickPage + 1}/{totalPages}</span>
              <button
                onClick={() => setPickPage(Math.min(totalPages - 1, pickPage + 1))}
                disabled={pickPage >= totalPages - 1}
                style={{
                  fontSize: 10, padding: "3px 8px", borderRadius: 4,
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                  color: pickPage >= totalPages - 1 ? "#1e293b" : "#6b7280",
                  cursor: pickPage >= totalPages - 1 ? "default" : "pointer",
                  fontFamily: FONT,
                }}
              >
                →
              </button>
            </div>
          )}
        </div>

        {picks.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "32px 16px",
            background: "rgba(255,255,255,0.015)", borderRadius: 10,
            border: "1px dashed rgba(255,255,255,0.06)",
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🏀</div>
            <div style={{ fontSize: 12, color: "#4a5568" }}>
              {isOwnProfile ? "No picks yet — head to the NBA page to make your first!" : "No picks yet."}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {displayPicks.map(p => <PickRow key={p.id} pick={p} />)}
          </div>
        )}
      </div>

      {/* ─── Footer ─── */}
      <div style={{ textAlign: "center", marginTop: 40, fontSize: 10, color: "#1e1040", letterSpacing: "0.12em" }}>
        ★ OVERTIME JOURNAL ★
      </div>
    </div>
  );
}
