import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import NBADashboard from './components/nba/NBADashboard';
import { AuthButton } from './components/common/AuthButton';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import Record from './pages/Record';


// ── Sport tab nav ──────────────────────────────────────────────────────────────
function SportTabs() {
  const tabStyle = (isActive) => ({
    fontSize: 12,
    fontWeight: 600,
    padding: "6px 14px",
    borderRadius: 6,
    textDecoration: "none",
    color: isActive ? "#f1f5f9" : "#4a5568",
    background: isActive ? "rgba(255,255,255,0.06)" : "transparent",
    border: isActive ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent",
    transition: "all 0.15s ease",
  });

  return (
    <nav style={{
      display: "flex",
      gap: 4,
      padding: "12px 16px",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      background: "rgba(0,0,0,0.3)",
      position: "sticky",
      top: 0,
      zIndex: 50,
      backdropFilter: "blur(10px)",
      flexWrap: "wrap",
    }}>
      {/* Brand */}
      <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9", marginRight: 12, alignSelf: "center" }}>
        OTJ
      </div>

      {/* Sport tabs */}
      <NavLink to="/nba" style={({ isActive }) => tabStyle(isActive)}>🏀 NBA</NavLink>
      <NavLink to="/nhl" style={({ isActive }) => tabStyle(isActive)}>🏒 NHL</NavLink>
      <NavLink to="/mlb" style={({ isActive }) => tabStyle(isActive)}>⚾ MLB</NavLink>
      <NavLink to="/nfl" style={({ isActive }) => tabStyle(isActive)}>🏈 NFL</NavLink>

      {/* Divider */}
      <div style={{ flex: 1 }} />

      {/* Right links */}
      <NavLink to="/board" style={({ isActive }) => tabStyle(isActive)}>🏆 Leaderboard</NavLink>
      <NavLink to="/board" style={({ isActive }) => tabStyle(isActive)}>🏆 Leaderboard</NavLink>
<AuthButton />
    </nav>
  );
}

// ── Placeholder for sports not yet built ──────────────────────────────────────
function ComingSoon({ sport, emoji, phase }) {
  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 48 }}>{emoji}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>{sport} Dashboard</div>
      <div style={{ fontSize: 13, color: "#4a5568" }}>Coming in {phase}</div>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <div style={{
        minHeight: "100vh",
        background: "#08080f",
        color: "#e2e8f0",
        fontFamily: "'JetBrains Mono','SF Mono',monospace"
      }}>
        {/* Google font */}
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />

        <SportTabs />

        <Routes>
          <Route path="/" element={<Navigate to="/nba" replace />} />
          <Route path="/nba" element={<NBADashboard />} />
          <Route path="/nhl" element={<ComingSoon sport="NHL" emoji="🏒" phase="Phase 2 — March" />} />
          <Route path="/mlb" element={<ComingSoon sport="MLB" emoji="⚾" phase="Phase 3 — Opening Day" />} />
          <Route path="/nfl" element={<ComingSoon sport="NFL" emoji="🏈" phase="Phase 4 — September" />} />
          <Route path="/board" element={<ComingSoon sport="Leaderboard" emoji="🏆" phase="Phase 1 Step 6" />} />
          <Route path="/privacy" element={<Privacy />} />
<Route path="/terms" element={<Terms />} />
<Route path="/record" element={<Record />} />
```


        </Routes>
      </div>
    </BrowserRouter>
  );
}
