import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { useState, useEffect } from 'react';
import NBADashboard from './components/nba/NBADashboard';
import NBAJamArcade from './components/nba/NBAJamArcade';
import { AuthButton } from './components/common/AuthButton';
import { WelcomeModal } from './components/common/WelcomeModal';
import { UsernameModal } from './components/common/UsernameModal';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import Record from './pages/Record';
import { supabase } from './lib/supabase';
import OTJPropsPage from './components/nba/OTJPropsPage';
import ArcadePage from './pages/ArcadePage';
import LandingPage from './pages/LandingPage';
import FAQ from './pages/FAQ';
import ProfilePage from './pages/ProfilePage';

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
  .otj-nav-tabs { overflow-x: auto; scrollbar-width: none; -ms-overflow-style: none; flex: 1; display: flex; align-items: center; gap: 4; min-width: 0; }
  .otj-nav-tabs::-webkit-scrollbar { display: none; }
  .nav-tab-label { display: inline; }
  .nav-username-badge { display: flex; }
  @media (max-width: 860px) {
    .nav-tab-label { display: none; }
  }
  @media (max-width: 500px) {
    .nav-username-badge { display: none !important; }
  }
`;

function SportTabs({ user, profile, onSignIn }) {
  const tabStyle = (isActive) => ({
    fontSize: 12, padding: "6px 10px", borderRadius: 6, textDecoration: "none", fontWeight: 600,
    color: isActive ? "#f1f5f9" : "#4a5568",
    background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
    border: isActive ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent",
    transition: "all 0.15s ease",
    whiteSpace: "nowrap", flexShrink: 0,
  });

  return (
    <>
      <style>{NAV_STYLES}</style>
      <nav style={{
        position: "sticky", top: 0, zIndex: 10,
        background: "rgba(8,8,15,0.95)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: "10px 12px", display: "flex", alignItems: "center", gap: 8,
        fontFamily: "'JetBrains Mono','SF Mono',monospace",
      }}>
        {/* Logo — always visible */}
        <span style={{ fontSize: 14, fontWeight: 800, color: "#ef4444", letterSpacing: "-0.02em", flexShrink: 0 }}>OTJ</span>

        {/* Scrollable tabs — takes remaining space */}
        <div className="otj-nav-tabs">
          <NavLink to="/" end style={({ isActive }) => tabStyle(isActive)}>🏠<span className="nav-tab-label"> Home</span></NavLink>
          <NavLink to="/nba" style={({ isActive }) => tabStyle(isActive)}>🏀<span className="nav-tab-label"> NBA</span></NavLink>
          <NavLink to="/props" style={({ isActive }) => tabStyle(isActive)}>🎯<span className="nav-tab-label"> Props</span></NavLink>
          <NavLink to="/nhl" style={({ isActive }) => tabStyle(isActive)}>🏒<span className="nav-tab-label"> NHL</span></NavLink>
          <NavLink to="/mlb" style={({ isActive }) => tabStyle(isActive)}>⚾<span className="nav-tab-label"> MLB</span></NavLink>
          <NavLink to="/nfl" style={({ isActive }) => tabStyle(isActive)}>🏈<span className="nav-tab-label"> NFL</span></NavLink>
          <NavLink to="/record" style={({ isActive }) => tabStyle(isActive)}>📊<span className="nav-tab-label"> Record</span></NavLink>
          <NavLink to="/arcade" style={({ isActive }) => tabStyle(isActive)}>🕹<span className="nav-tab-label"> Arcade</span></NavLink>
        </div>

        {/* Auth section — always pinned right, never scrolls away */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {user && profile?.username && (
            <>
              {/* Avatar — always visible, even on mobile */}
              <NavLink
                to={`/profile/${profile.username}`}
                style={{ textDecoration: "none", flexShrink: 0 }}
              >
                <div style={{
                  width: 26, height: 26, borderRadius: "50%",
                  background: profile.avatar_color || "#ef4444",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: profile.profile_icon ? 14 : 11, fontWeight: 700, color: "#fff",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}>
                  {profile.profile_icon || profile.username[0].toUpperCase()}
                </div>
              </NavLink>
              {/* Username — hidden on mobile */}
              <NavLink
                to={`/profile/${profile.username}`}
                className="nav-username-badge"
                style={{ alignItems: "center", textDecoration: "none" }}
              >
                <span style={{ fontSize: 11, color: "#6b7280", whiteSpace: "nowrap" }}>@{profile.username}</span>
              </NavLink>
            </>
          )}
          <AuthButton onSignIn={onSignIn} />
        </div>
      </nav>
    </>
  );
}

export default function App() {
  const [user, setUser]                 = useState(null);
  const [profile, setProfile]           = useState(null);
  const [showWelcome, setShowWelcome]   = useState(false);
  const [showUsername, setShowUsername] = useState(false);
  const [authChecked,      setAuthChecked]      = useState(false);
  const [sessionValidated, setSessionValidated] = useState(false); // true only after server confirms token
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
        <SportTabs user={user} profile={profile} onSignIn={() => setShowWelcome(true)} />
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
          <Route path="/profile/:username" element={<ProfilePage currentUser={user} currentProfile={profile} />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/props" element={<OTJPropsPage user={user} profile={profile} onShowLogin={() => setShowWelcome(true)} />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
