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
  .otj-nav { overflow-x: auto; scrollbar-width: none; -ms-overflow-style: none; }
  .otj-nav::-webkit-scrollbar { display: none; }
  .nav-tab-label { display: inline; }
  .nav-username-badge { display: flex; }
  @media (max-width: 500px) {
    .nav-tab-label { display: none; }
    .nav-username-badge { display: none !important; }
  }
`;

function SportTabs({ user, profile }) {
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
      <nav className="otj-nav" style={{
        position: "sticky", top: 0, zIndex: 10,
        background: "rgba(8,8,15,0.95)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: "10px 12px", display: "flex", gap: 4, alignItems: "center",
        fontFamily: "'JetBrains Mono','SF Mono',monospace",
      }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: "#ef4444", marginRight: 8, letterSpacing: "-0.02em", flexShrink: 0 }}>OTJ</span>
        <NavLink to="/nba" style={({ isActive }) => tabStyle(isActive)}>🏀<span className="nav-tab-label"> NBA</span></NavLink>
        <NavLink to="/props" style={({ isActive }) => tabStyle(isActive)}>🎯<span className="nav-tab-label"> Props</span></NavLink>
        <NavLink to="/nhl" style={({ isActive }) => tabStyle(isActive)}>🏒<span className="nav-tab-label"> NHL</span></NavLink>
        <NavLink to="/mlb" style={({ isActive }) => tabStyle(isActive)}>⚾<span className="nav-tab-label"> MLB</span></NavLink>
        <NavLink to="/nfl" style={({ isActive }) => tabStyle(isActive)}>🏈<span className="nav-tab-label"> NFL</span></NavLink>
        <NavLink to="/record" style={({ isActive }) => tabStyle(isActive)}>📊<span className="nav-tab-label"> Record</span></NavLink>

        <div style={{ flex: 1, minWidth: 4 }} />
        {user && profile && (
          <div className="nav-username-badge" style={{
            alignItems: "center", gap: 6, marginRight: 8, flexShrink: 0,
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: "50%",
              background: profile.avatar_color || "#ef4444",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 700, color: "#fff",
            }}>
              {profile.username[0].toUpperCase()}
            </div>
            <span style={{ fontSize: 11, color: "#6b7280", whiteSpace: "nowrap" }}>@{profile.username}</span>
          </div>
        )}
        <div style={{ flexShrink: 0 }}>
          <AuthButton />
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
  const [authChecked, setAuthChecked]   = useState(false);
  const [authTimeout, setAuthTimeout]   = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => setAuthTimeout(true), 5000);
    let fetchingProfile = false;

    // FIX 1: Validate + refresh the session on every app load.
    // Chrome caches the JWT to disk and serves it before Supabase can check
    // if it's still valid. refreshSession() forces a server-side validation.
    // If the refresh token is expired, Supabase clears the session automatically
    // and fires SIGNED_OUT — no manual cleanup needed.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        await supabase.auth.refreshSession();
        // onAuthStateChange will fire with the refreshed session or SIGNED_OUT,
        // so no need to setUser here — let the listener handle it.
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      clearTimeout(timeout);
      const u = session?.user ?? null;

      // FIX 2: TOKEN_REFRESHED with no session means the refresh silently failed
      // (expired refresh token). Without this check the app stays in a zombie
      // logged-in state — user sees old data forever until they clear cache.
      if (event === 'TOKEN_REFRESHED' && !session) {
        setUser(null);
        setProfile(null);
        setProfileLoading(false);
        setShowWelcome(true);
        setAuthChecked(true);
        window.location.href = '/';
        return;
      }

      // TOKEN_REFRESHED with a valid session — session is already synced,
      // no need to re-fetch the profile.
      if (event === 'TOKEN_REFRESHED' && session) {
        setAuthChecked(true);
        return;
      }

      setUser(u);
      setAuthChecked(true);

      // Logged out
      if (!u) {
        setProfile(null);
        setProfileLoading(false);
        setShowUsername(false);
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_OUT') {
          setShowWelcome(true);
        }
        return;
      }

      // Logged in
      setShowWelcome(false);

      // Prevent duplicate fetches from rapid auth events
      if (fetchingProfile) return;
      fetchingProfile = true;
      setProfileLoading(true);

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', u.id)
          .single();

        // PGRST116 = no rows found = genuinely new user
        // Any other error = network/auth issue = do NOT show username modal
        if (error && error.code !== 'PGRST116') {
          console.warn('[Auth] Profile fetch error, skipping modal:', error.code);
          setProfileLoading(false);
          fetchingProfile = false;
          return;
        }

        const p = data || null;
        setProfile(p);
        setShowUsername(!p);
      } catch (e) {
        console.warn('[Auth] Profile fetch exception, skipping modal:', e.message);
      } finally {
        setProfileLoading(false);
        fetchingProfile = false;
      }
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  function handleUsernameComplete(newProfile) {
    setProfile(newProfile);
    setShowUsername(false);
  }

  if (!authChecked && !authTimeout) return null;

  return (
    <BrowserRouter>
      {showWelcome && !user && (
        <WelcomeModal onClose={() => setShowWelcome(false)} />
      )}

      {showUsername && user && !profile && !profileLoading && (
        <UsernameModal user={user} onComplete={handleUsernameComplete} />
      )}

      <div style={{ minHeight: "100vh", background: "#08080f", color: "#e2e8f0", fontFamily: "'JetBrains Mono','SF Mono',monospace" }}>
        <SportTabs user={user} profile={profile} />
        <Routes>
          <Route path="/" element={<Navigate to="/nba" replace />} />
          <Route path="/nba" element={<NBADashboard user={user} profile={profile} />} />
          <Route path="/nhl" element={<ComingSoon sport="NHL" emoji="🏒" phase="Phase 2 — March" />} />
          <Route path="/mlb" element={<ComingSoon sport="MLB" emoji="⚾" phase="Phase 3 — Opening Day" />} />
          <Route path="/nfl" element={<ComingSoon sport="NFL" emoji="🏈" phase="Phase 4 — September" />} />
          <Route path="/record" element={<Record />} />
          <Route path="/arcade" element={<NBAJamArcade user={user} profile={profile} />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/props" element={<OTJPropsPage user={user} profile={profile} onShowLogin={() => setShowModal(true)} />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
