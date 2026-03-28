import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import NBADashboard from './components/nba/NBADashboard';
import NBAJamArcade from './components/nba/NBAJamArcade';
import { AuthButton } from './components/common/AuthButton';
import { WelcomeModal } from './components/common/WelcomeModal';
import { UsernameModal } from './components/common/UsernameModal';
import { NotificationBell } from './components/common/NotificationBell';
import { AvatarMini } from './components/common/AvatarSystem';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import Record from './pages/Record';
import { supabase } from './lib/supabase';
import OTJPropsPage from './components/nba/OTJPropsPage';
import ArcadePage from './pages/ArcadePage';
import LandingPage from './pages/LandingPage';
import FAQ from './pages/FAQ';
import ProfilePage from './pages/ProfilePage';
import LeaderboardPage from './pages/LeaderboardPage';
import DailyNewspaper from './pages/DailyNewspaper';
import PokerLobby from './pages/PokerLobby';
import PokerTable from './pages/PokerTable';
// ─── Protected route — redirects to / if not logged in ───────────────────────
function ProtectedRoute({ user, authChecked, children }) {
  if (!authChecked) return null;
  if (!user) {
    // Save where they were trying to go so we can redirect back after login
    if (typeof window !== "undefined") {
      sessionStorage.setItem("otj_redirect", window.location.pathname);
    }
    return <Navigate to="/nba" replace />;
  }
  return children;
}

function ComingSoon({ sport, emoji, phase }) {
  return (
    <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
      <div style={{ fontSize: 48 }}>{emoji}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9" }}>{sport} coming soon</div>
      <div style={{ fontSize: 12, color: "#4a5568" }}>{phase}</div>
    </div>
  );
}

const NAV_STYLES = `
  .otj-nav-tabs { overflow-x: visible; flex: 1; display: flex; align-items: center; gap: 2; min-width: 0; flex-wrap: nowrap; }
  .nav-tab-label { display: inline; }
  .nav-weather-pill { display: flex; }
  .nav-username-badge { display: flex; }
  @media (max-width: 860px) {
    .nav-tab-label { display: none; }
    .nav-weather-pill { display: none; }
  }
  @media (max-width: 500px) {
    .nav-username-badge { display: none !important; }
  }
`;

// ── Weather + Countdown pill ─────────────────────────────────────────────────
function WeatherCountdownPill({ slates }) {
  const [weather, setWeather] = useState(null);
  const [nextGame, setNextGame] = useState(null);
  const [countdown, setCountdown] = useState("");

  // Get user location + weather on mount
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude: lat, longitude: lng } = pos.coords;
          const r = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=auto`
          );
          const d = await r.json();
          const temp = Math.round(d.current?.temperature_2m || 0);
          const code = d.current?.weather_code || 0;
          const icon = code === 0 ? "☀️" : code <= 3 ? "⛅" : code <= 67 ? "🌧️" : code <= 77 ? "❄️" : "🌩️";
          setWeather({ temp, icon });
        } catch {}
      },
      () => {} // silently ignore if denied
    );
  }, []);

  // Find next game across all slates
  useEffect(() => {
    if (!slates?.length) return;
    const now = new Date();
    let soonest = null;

    for (const slate of slates) {
      for (const game of slate.games || []) {
        if (!game.game_time) continue;
        try {
          const gt = new Date(game.game_time);
          if (gt > now && (!soonest || gt < soonest.time)) {
            soonest = {
              time: gt,
              sport: slate.sport || "nba",
              matchup: game.matchup || "",
            };
          }
        } catch {}
      }
    }
    setNextGame(soonest);
  }, [slates]);

  // Live countdown ticker
  useEffect(() => {
    if (!nextGame) return;
    const tick = () => {
      const diff = nextGame.time - new Date();
      if (diff <= 0) { setCountdown("LIVE"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setCountdown(h > 0 ? `${h}h ${m}m` : `${m}m`);
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [nextGame]);

  const sportEmoji = { nba: "🏀", mlb: "⚾", nhl: "🏒", nfl: "🏈" };
  const emoji = sportEmoji[nextGame?.sport] || "⚡";

  if (!weather && !nextGame) return null;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
      fontSize: 10, color: "#6b7280", fontFamily: "'JetBrains Mono',monospace",
      padding: "3px 8px", borderRadius: 6,
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.06)",
      whiteSpace: "nowrap",
    }}>
      {weather && <span>{weather.icon} {weather.temp}°</span>}
      {weather && nextGame && <span style={{ color: "#374151" }}>·</span>}
      {nextGame && countdown && (
        <span>{emoji} {countdown === "LIVE" ? "🔴 LIVE" : `in ${countdown}`}</span>
      )}
    </div>
  );
}

// ── Dropdown nav item ─────────────────────────────────────────────────────────
function NavDropdown({ label, emoji, children, activePaths }) {
  const [open, setOpen] = useState(false);
  const ref = useState(null);
  const location = typeof window !== "undefined" ? window.location.pathname : "";
  const isActive = activePaths?.some(p => location.startsWith(p));

  return (
    <div style={{ position: "relative", flexShrink: 0 }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          fontSize: 12, padding: "6px 10px", borderRadius: 6, fontWeight: 600,
          color: isActive ? "#f1f5f9" : "#4a5568",
          background: isActive ? "rgba(255,255,255,0.08)" : open ? "rgba(255,255,255,0.05)" : "transparent",
          border: isActive ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent",
          cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
          display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
          transition: "all 0.15s",
        }}
      >
        {emoji} <span className="nav-tab-label">{label}</span>
        <span style={{ fontSize: 8, opacity: 0.5, marginLeft: 1 }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, marginTop: 4,
          background: "rgba(8,8,15,0.98)", backdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
          padding: "6px", minWidth: 160, zIndex: 100,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

function DropItem({ to, emoji, label, sub, onClick }) {
  const navigate = typeof window !== "undefined" ? (path) => window.location.href = path : () => {};
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
        borderRadius: 6, textDecoration: "none", transition: "all 0.1s",
        background: isActive ? "rgba(239,68,68,0.1)" : "transparent",
        color: isActive ? "#ef4444" : "#94a3b8",
      })}
      onMouseEnter={e => { if (!e.currentTarget.style.background.includes("ef4444")) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
      onMouseLeave={e => { if (!e.currentTarget.style.background.includes("ef4444")) e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ fontSize: 14 }}>{emoji}</span>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono',monospace" }}>{label}</div>
        {sub && <div style={{ fontSize: 9, color: "#4a5568", marginTop: 1 }}>{sub}</div>}
      </div>
    </NavLink>
  );
}

function DropDivider() {
  return <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />;
}

// ── Main Nav ─────────────────────────────────────────────────────────────────
function SportTabs({ user, profile, onSignIn, slates }) {
  const simpleTab = (isActive) => ({
    fontSize: 12, padding: "6px 10px", borderRadius: 6, textDecoration: "none", fontWeight: 600,
    color: isActive ? "#f1f5f9" : "#4a5568",
    background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
    border: isActive ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent",
    transition: "all 0.15s ease", whiteSpace: "nowrap", flexShrink: 0,
  });

  return (
    <>
      <style>{NAV_STYLES}</style>
      <nav style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(8,8,15,0.95)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: "8px 12px", display: "flex", alignItems: "center", gap: 6,
        fontFamily: "'JetBrains Mono','SF Mono',monospace",
      }}>
        {/* Logo */}
        <NavLink to="/" end style={{ textDecoration: "none", flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#ef4444", letterSpacing: "-0.02em" }}>OTJ</span>
        </NavLink>

        {/* Nav items */}
        <div className="otj-nav-tabs">

          {/* Home */}
          <NavLink to="/" end style={({ isActive }) => simpleTab(isActive)}>
            🏠<span className="nav-tab-label"> Home</span>
          </NavLink>

          {/* NBA dropdown */}
          <NavDropdown emoji="🏀" label="NBA" activePaths={["/nba", "/props"]}>
            <DropItem to="/nba"   emoji="📊" label="Edge Analyzer"  sub="ML · Spread · Totals" />
            <DropItem to="/props" emoji="🎯" label="Player Props"   sub="Points · Reb · Ast" />
          </NavDropdown>

          {/* MLB dropdown */}
          <NavDropdown emoji="⚾" label="MLB" activePaths={["/mlb", "/mlb-props"]}>
            <DropItem to="/mlb"       emoji="📊" label="Game Analysis" sub="Bullpen · Pythagorean" />
            <DropItem to="/mlb-props" emoji="💣" label="HR Props"      sub="Park · Wind · Pitcher" />
          </NavDropdown>

          {/* NHL dropdown */}
          <NavDropdown emoji="🏒" label="NHL" activePaths={["/nhl"]}>
            <DropItem to="/nhl" emoji="📊" label="Game Analysis" sub="Coming soon" />
          </NavDropdown>

          {/* NFL dropdown */}
          <NavDropdown emoji="🏈" label="NFL" activePaths={["/nfl"]}>
            <DropItem to="/nfl" emoji="📊" label="Game Analysis" sub="Coming soon" />
          </NavDropdown>

          {/* More dropdown */}
          <NavDropdown emoji="☰" label="More" activePaths={["/arcade", "/poker", "/record", "/leaderboard", "/daily"]}>
            <DropItem to="/daily"       emoji="📰" label="Daily Journal" sub="Picks · Analysis" />
            <DropItem to="/record"      emoji="📊" label="Record"        sub="Full pick history" />
            <DropDivider />
            <DropItem to="/arcade"      emoji="🕹" label="Arcade"        sub="OTJ Jam · PvP" />
            <DropItem to="/poker"       emoji="♠️" label="Poker"         sub="Texas Hold'em" />
            <DropDivider />
            <DropItem to="/leaderboard" emoji="🏆" label="Top 10"        sub="Leaderboard" />
          </NavDropdown>

        </div>

        {/* Right side: weather pill + auth */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {/* Weather + countdown — hidden on small mobile */}
          <div className="nav-weather-pill">
            <WeatherCountdownPill slates={slates || []} />
          </div>

          {user && profile?.username && (
            <>
              <NavLink to={`/profile/${profile.username}`} style={{ textDecoration: "none", flexShrink: 0 }}>
                <AvatarMini config={profile.avatar_config} size={26}
                  style={{ border: "1px solid rgba(255,255,255,0.1)" }} />
              </NavLink>
              <NavLink to={`/profile/${profile.username}`} className="nav-username-badge"
                style={{ alignItems: "center", textDecoration: "none" }}>
                <span style={{ fontSize: 11, color: "#6b7280", whiteSpace: "nowrap" }}>@{profile.username}</span>
              </NavLink>
            </>
          )}
          {user && <NotificationBell user={user} />}
          <AuthButton onSignIn={onSignIn} />
        </div>
      </nav>
    </>
  );
}

function PokerLobbyWithNav({ user, profile }) {
  const navigate = useNavigate();
  return (
    <PokerLobby
      user={user}
      profile={profile}
      userBucks={profile?.bankroll ?? 10000}
      onEnterTable={(room, tableState) => navigate(
       `/poker/table/${room.roomId}`,
        { state: tableState }
      )}
    />
  );
}

export default function App() {
  const [user, setUser]                 = useState(null);
  const [profile, setProfile]           = useState(null);
  const [showWelcome, setShowWelcome]   = useState(false);
  const [showUsername, setShowUsername] = useState(false);
  const [authChecked,      setAuthChecked]      = useState(false);
  const [sessionValidated, setSessionValidated] = useState(false);
  const [navSlates, setNavSlates] = useState([]);

  // Fetch today's slates for countdown — lightweight, just game times
  useEffect(() => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    supabase
      .from("slates")
      .select("sport, date, games")
      .eq("date", dateStr)
      .then(({ data }) => { if (data) setNavSlates(data); });
  }, []); // true only after server confirms token
  const [profileLoading,   setProfileLoading]   = useState(true);

  useEffect(() => {
    let fetchingProfile = false;
    let resolveTimeout = null;

    async function resolveUser(u) {
      if (!u) {
        setUser(null);
        setProfile(null);
        setProfileLoading(false);
        setAuthChecked(true);
        setSessionValidated(true);
        return;
      }

      // If already fetching, don't start another — just unblock UI
      if (fetchingProfile) {
        setAuthChecked(true);
        setSessionValidated(true);
        return;
      }

      fetchingProfile = true;
      setUser(u);
      setProfileLoading(true);

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', u.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.warn('[Auth] Profile fetch error:', error.code);
        } else {
          const p = data || null;
          setProfile(p);
          // ─── FIX: Show username modal if profile is missing OR username is NULL ───
          setShowUsername(!p || !p.username);
        }
      } catch (e) {
        // Swallow lock errors — they're from duplicate auth events, not real failures
        if (!e.message?.includes('Lock') && !e.message?.includes('AbortError')) {
          console.warn('[Auth] Profile fetch exception:', e.message);
        }
      } finally {
        setProfileLoading(false);
        setAuthChecked(true);
        setSessionValidated(true);
        fetchingProfile = false;
      }
    }

    // Debounced resolve — prevents duplicate SIGNED_IN events from racing
    function resolveUserDebounced(u) {
      if (resolveTimeout) clearTimeout(resolveTimeout);
      resolveTimeout = setTimeout(() => resolveUser(u), 100);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setAuthChecked(true);
        setSessionValidated(true);
        setProfileLoading(false);
        setShowWelcome(true);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const u = session?.user ?? null;
      console.log('[Auth]', event, u?.email ?? 'no user');

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setProfileLoading(false);
        setShowUsername(false);
        setShowWelcome(true);
        setAuthChecked(true);
        setSessionValidated(true);
        return;
      }

      if (event === 'SIGNED_IN') {
        setShowWelcome(false);
        const redirect = sessionStorage.getItem("otj_redirect");
        if (redirect && redirect !== "/") {
          sessionStorage.removeItem("otj_redirect");
          resolveUserDebounced(u);
          window.location.href = redirect;
          return;
        }
        resolveUserDebounced(u);
        return;
      }

      if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
        if (!u) {
          setShowWelcome(true);
          await resolveUser(null);
        } else {
          setShowWelcome(false);
          await resolveUser(u);
        }
        return;
      }

      await resolveUser(u);
    });

    return () => {
      subscription.unsubscribe();
      if (resolveTimeout) clearTimeout(resolveTimeout);
    };
  }, []);

  function handleUsernameComplete(newProfile) {
    setProfile(newProfile);
    setShowUsername(false);
  }

  // Don't render anything until session is confirmed — prevents ghost user render
  if (!sessionValidated) return (
    <div style={{
      minHeight: "100vh", background: "#08080f",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        fontFamily: "'JetBrains Mono','SF Mono',monospace",
        fontSize: 11, color: "#1e293b", letterSpacing: "0.15em",
      }}>
        LOADING...
      </div>
    </div>
  );

  return (
    <BrowserRouter>
      {showWelcome && !user && (
        <WelcomeModal onClose={() => setShowWelcome(false)} />
      )}

      {showUsername && user && !profileLoading && (
        <UsernameModal user={user} profile={profile} onComplete={handleUsernameComplete} />
      )}

      <div style={{ minHeight: "100vh", background: "#08080f", color: "#e2e8f0", fontFamily: "'JetBrains Mono','SF Mono',monospace" }}>
        <SportTabs user={user} profile={profile} onSignIn={() => setShowWelcome(true)} slates={navSlates} />
        <Routes>
          <Route path="/" element={<LandingPage user={user} profile={profile} sessionValidated={sessionValidated} />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/nba" element={<NBADashboard user={user} profile={profile} sessionValidated={sessionValidated} />} />
          <Route path="/nhl" element={<ComingSoon sport="NHL" emoji="🏒" phase="Phase 2 — March" />} />
          <Route path="/mlb" element={<ComingSoon sport="MLB" emoji="⚾" phase="Phase 3 — Opening Day" />} />
          <Route path="/nfl" element={<ComingSoon sport="NFL" emoji="🏈" phase="Phase 4 — September" />} />
          <Route path="/record" element={<Record />} />
          <Route path="/arcade" element={
            <ProtectedRoute user={user} authChecked={authChecked}>
              <ArcadePage user={user} profile={profile} />
            </ProtectedRoute>
          } />
          <Route path="/arcade/nba" element={
            <ProtectedRoute user={user} authChecked={authChecked}>
              <NBAJamArcade user={user} profile={profile} />
            </ProtectedRoute>
          } />
          <Route path="/poker" element={
            <ProtectedRoute user={user} authChecked={authChecked}>
              <PokerLobbyWithNav user={user} profile={profile} />
            </ProtectedRoute>
          } />
          <Route path="/poker/table/:roomId" element={
            <ProtectedRoute user={user} authChecked={authChecked}>
              <PokerTable />
            </ProtectedRoute>
          } />
          <Route path="/profile/:username" element={<ProfilePage currentUser={user} currentProfile={profile} />} />
          <Route path="/leaderboard" element={<LeaderboardPage currentUser={user} />} />
          <Route path="/daily" element={<DailyNewspaper />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/props" element={<OTJPropsPage user={user} profile={profile} onShowLogin={() => setShowWelcome(true)} />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
