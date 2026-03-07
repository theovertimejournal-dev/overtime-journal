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

function ComingSoon({ sport, emoji, phase }) {
  return (
    <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
      <div style={{ fontSize: 48 }}>{emoji}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9" }}>{sport} coming soon</div>
      <div style={{ fontSize: 12, color: "#4a5568" }}>{phase}</div>
    </div>
  );
}

function SportTabs({ user, profile }) {
  const tabStyle = (isActive) => ({
    fontSize: 12, padding: "6px 14px", borderRadius: 6, textDecoration: "none", fontWeight: 600,
    color: isActive ? "#f1f5f9" : "#4a5568",
    background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
    border: isActive ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent",
    transition: "all 0.15s ease",
  });

  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 10,
      background: "rgba(8,8,15,0.95)", backdropFilter: "blur(12px)",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      padding: "10px 20px", display: "flex", gap: 6, alignItems: "center",
      fontFamily: "'JetBrains Mono','SF Mono',monospace",
    }}>
      <span style={{ fontSize: 14, fontWeight: 800, color: "#ef4444", marginRight: 10, letterSpacing: "-0.02em" }}>OTJ</span>
      <NavLink to="/nba" style={({ isActive }) => tabStyle(isActive)}>🏀 NBA</NavLink>
      <NavLink to="/nhl" style={({ isActive }) => tabStyle(isActive)}>🏒 NHL</NavLink>
      <NavLink to="/mlb" style={({ isActive }) => tabStyle(isActive)}>⚾ MLB</NavLink>
      <NavLink to="/nfl" style={({ isActive }) => tabStyle(isActive)}>🏈 NFL</NavLink>
      <NavLink to="/record" style={({ isActive }) => tabStyle(isActive)}>📊 Record</NavLink>
      <div style={{ flex: 1 }} />
      {/* Show username badge if logged in with profile */}
      {user && profile && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6, marginRight: 8,
        }}>
          <div style={{
            width: 24, height: 24, borderRadius: "50%",
            background: profile.avatar_color || "#ef4444",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, color: "#fff",
          }}>
            {profile.username[0].toUpperCase()}
          </div>
          <span style={{ fontSize: 11, color: "#6b7280" }}>@{profile.username}</span>
        </div>
      )}
      <AuthButton />
    </nav>
  );
}

export default function App() {
  const [user, setUser]               = useState(null);
  const [profile, setProfile]         = useState(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showUsername, setShowUsername] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // Fetch profile for a given user
  async function fetchProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    return data || null;
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      if (!u) {
        setShowWelcome(true);
      } else {
        const p = await fetchProfile(u.id);
        setProfile(p);
        // First login — no profile yet → show username setup
        if (!p) setShowUsername(true);
      }
      setAuthChecked(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        setShowWelcome(false);
        const p = await fetchProfile(u.id);
        setProfile(p);
        if (!p) setShowUsername(true);
      } else {
        setProfile(null);
        setShowUsername(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  function handleUsernameComplete(newProfile) {
    setProfile(newProfile);
    setShowUsername(false);
  }

  if (!authChecked) return null;

  return (
    <BrowserRouter>
      {/* Welcome modal — logged out users */}
      {showWelcome && !user && (
        <WelcomeModal onClose={() => setShowWelcome(false)} />
      )}

      {/* Username setup — first login, no profile yet */}
      {showUsername && user && !profile && (
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
        </Routes>
      </div>
    </BrowserRouter>
  );
}
