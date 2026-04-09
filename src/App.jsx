import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
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
import MLBDashboard from './components/nba/MLBDashboard';
import MLBPropsPage from './components/nba/MLBPropsPage';
import ArcadePage from './pages/ArcadePage';
import LandingPage from './pages/LandingPage';
import FAQ from './pages/FAQ';
import ProfilePage from './pages/ProfilePage';
import LeaderboardPage from './pages/LeaderboardPage';
import DailyNewspaper from './pages/DailyNewspaper';
import PokerLobby from './pages/PokerLobby';
import PokerTable from './pages/PokerTable';
import BlackjackLobby from './pages/BlackjackLobby';
import BlackjackTable from './pages/BlackjackTable';

// ─── Protected route — redirects to / if not logged in ───────────────────────
function ProtectedRoute({ user, authChecked, children }) {
  if (!authChecked) return null;
  if (!user) {
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

// ─── Styles ──────────────────────────────────────────────────────────────────
const NAV_STYLES = `
  /* ── Desktop nav ── */
  .otj-nav-tabs { overflow-x: visible; flex: 1; display: flex; align-items: center; gap: 2px; min-width: 0; flex-wrap: nowrap; }
  .nav-tab-label { display: inline; }
  .nav-weather-pill { display: flex; }
  .nav-username-badge { display: flex; }

  /* ── Desktop top bar: show. Mobile bottom bar: hide ── */
  .otj-desktop-nav { display: flex; }
  .otj-mobile-topbar { display: none; }
  .otj-mobile-bottom-bar { display: none; }
  .otj-mobile-sheet-overlay { display: none; }

  @media (max-width: 860px) {
    .nav-tab-label { display: none; }
    .nav-weather-pill { display: none; }
  }
  @media (max-width: 500px) {
    .nav-username-badge { display: none !important; }
  }

  /* ── Mobile breakpoint: swap nav systems ── */
  @media (max-width: 768px) {
    .otj-desktop-nav { display: none !important; }
    .otj-mobile-topbar { display: flex !important; }
    .otj-mobile-bottom-bar { display: flex !important; }
    .otj-mobile-sheet-overlay { display: block !important; }

    /* Add bottom padding so content doesn't hide behind bottom bar */
    .otj-app-content { padding-bottom: 72px; }

    /* ── On game table pages: hide ALL nav so game gets full screen ── */
    body:has([data-page="bj-table"]) .otj-mobile-topbar,
    body:has([data-page="bj-table"]) .otj-mobile-bottom-bar,
    body:has([data-page="poker-table"]) .otj-mobile-topbar,
    body:has([data-page="poker-table"]) .otj-mobile-bottom-bar { display: none !important; }
    body:has([data-page="bj-table"]) .otj-app-content,
    body:has([data-page="poker-table"]) .otj-app-content { padding-bottom: 0 !important; }
  }

  /* ── Bottom sheet animation ── */
  @keyframes otj-sheet-up {
    from { transform: translateY(100%); }
    to   { transform: translateY(0); }
  }
  @keyframes otj-sheet-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes otj-sheet-down {
    from { transform: translateY(0); }
    to   { transform: translateY(100%); }
  }
  @keyframes otj-sheet-fade-out {
    from { opacity: 1; }
    to   { opacity: 0; }
  }

  /* ── Bottom bar tab active pulse ── */
  .otj-btab-active-dot {
    width: 4px; height: 4px; border-radius: 50%;
    background: #ef4444; margin-top: 2px;
  }

  /* ── Sheet item hover ── */
  .otj-sheet-item:active {
    background: rgba(255,255,255,0.08) !important;
    transform: scale(0.97);
  }
`;

// ── Weather + Countdown pill ─────────────────────────────────────────────────
function WeatherCountdownPill({ slates }) {
  const [weather, setWeather] = useState(null);
  const [nextGame, setNextGame] = useState(null);
  const [countdown, setCountdown] = useState("");

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
      () => {}
    );
  }, []);

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
            soonest = { time: gt, sport: slate.sport || "nba", matchup: game.matchup || "" };
          }
        } catch {}
      }
    }
    setNextGame(soonest);
  }, [slates]);

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

// ── Desktop dropdown nav item (unchanged) ────────────────────────────────────
function NavDropdown({ label, emoji, children, activePaths }) {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState(window.location.pathname);
  const closeTimer = useRef(null);
  useEffect(() => { setPath(window.location.pathname); });
  const isActive = activePaths?.some(p => path.startsWith(p));

  const enter = () => { if (closeTimer.current) clearTimeout(closeTimer.current); setOpen(true); };
  const leave = () => { closeTimer.current = setTimeout(() => setOpen(false), 150); };

  return (
    <div style={{ position: "relative", flexShrink: 0 }}
      onMouseEnter={enter}
      onMouseLeave={leave}
    >
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          fontSize: 12, padding: "6px 10px", borderRadius: 6, fontWeight: 600,
          color: isActive ? "#f1f5f9" : open ? "#e2e8f0" : "#4a5568",
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
        <div
          onMouseEnter={enter}
          onMouseLeave={leave}
          style={{
            position: "absolute", top: "100%", left: 0,
            paddingTop: 8, zIndex: 100,
          }}
        >
          <div style={{
            background: "rgba(8,8,15,0.98)", backdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
            padding: "6px", minWidth: 160,
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

function DropItem({ to, emoji, label, sub }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
        borderRadius: 6, textDecoration: "none", transition: "all 0.1s",
        background: isActive ? "rgba(239,68,68,0.1)" : "transparent",
        color: isActive ? "#ef4444" : "#94a3b8",
      })}
      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
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

// ─── Bottom Sheet (mobile) ───────────────────────────────────────────────────
function BottomSheet({ open, onClose, title, children }) {
  const [closing, setClosing] = useState(false);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      onClose();
    }, 200);
  }, [onClose]);

  if (!open && !closing) return null;

  return (
    <div
      className="otj-mobile-sheet-overlay"
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        animation: closing ? "otj-sheet-fade-out 0.2s ease forwards" : "otj-sheet-fade-in 0.2s ease forwards",
      }}
    >
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: "absolute", inset: 0,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
        }}
      />
      {/* Sheet */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        background: "rgba(12,12,20,0.98)",
        borderTop: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "16px 16px 0 0",
        padding: "12px 16px 24px",
        maxHeight: "70vh", overflowY: "auto",
        animation: closing ? "otj-sheet-down 0.2s ease forwards" : "otj-sheet-up 0.25s cubic-bezier(0.16,1,0.3,1) forwards",
        fontFamily: "'JetBrains Mono','SF Mono',monospace",
      }}>
        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
        </div>
        {/* Title */}
        {title && (
          <div style={{
            fontSize: 10, color: "#6b7280", letterSpacing: "0.12em",
            textTransform: "uppercase", marginBottom: 12, paddingLeft: 4,
          }}>
            {title}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function SheetItem({ to, emoji, label, sub, onNavigate }) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className="otj-sheet-item"
      style={({ isActive }) => ({
        display: "flex", alignItems: "center", gap: 12, padding: "12px 12px",
        borderRadius: 10, textDecoration: "none", transition: "all 0.1s",
        background: isActive ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.03)",
        border: isActive ? "1px solid rgba(239,68,68,0.2)" : "1px solid rgba(255,255,255,0.05)",
        color: isActive ? "#ef4444" : "#94a3b8",
      })}
    >
      <span style={{ fontSize: 20 }}>{emoji}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, fontFamily: "'JetBrains Mono',monospace", color: "#f1f5f9" }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: "#4a5568", marginTop: 2 }}>{sub}</div>}
      </div>
      <span style={{ fontSize: 12, color: "#374151" }}>›</span>
    </NavLink>
  );
}

// ─── Mobile Bottom Tab Bar ───────────────────────────────────────────────────
function MobileBottomBar({ user, profile, onSignIn }) {
  const [activeSheet, setActiveSheet] = useState(null);
  const location = useLocation();

  // Close sheet on route change
  useEffect(() => { setActiveSheet(null); }, [location.pathname]);

  const path = location.pathname;

  // Determine which tab is active
  const isSport = ["/nba", "/props", "/mlb", "/mlb-props", "/nhl", "/nfl"].some(p => path.startsWith(p));
  const isArcade = path.startsWith("/arcade") || path === "/poker" || path.startsWith("/poker/table") || path === "/blackjack" || path.startsWith("/blackjack/table");
  const isGameTable = path.startsWith("/blackjack/table") || path.startsWith("/poker/table"); // full screen game — hide all nav on mobile
  const isMore = ["/record", "/leaderboard", "/faq", "/daily"].some(p => path.startsWith(p)) || isArcade;
  const isHome = path === "/";
  const isJournal = path === "/daily";

  const tabStyle = (active) => ({
    display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
    padding: "4px 0", minWidth: 52, cursor: "pointer",
    background: "transparent", border: "none",
    transition: "all 0.15s",
    WebkitTapHighlightColor: "transparent",
  });

  const labelStyle = (active) => ({
    fontSize: 9, fontWeight: active ? 600 : 400,
    color: active ? "#f1f5f9" : "#4a5568",
    fontFamily: "'JetBrains Mono',monospace",
    letterSpacing: "0.02em",
    transition: "color 0.15s",
  });

  const iconStyle = (active) => ({
    fontSize: 20, lineHeight: 1,
    filter: active ? "none" : "grayscale(0.5)",
    transition: "filter 0.15s",
  });

  return (
    <>
      {/* Sports bottom sheet */}
      <BottomSheet
        open={activeSheet === "sports"}
        onClose={() => setActiveSheet(null)}
        title="Sports"
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <SheetItem to="/nba" emoji="🏀" label="NBA" sub="Edge Analyzer" onNavigate={() => setActiveSheet(null)} />
          <SheetItem to="/props" emoji="🎯" label="NBA Props" sub="Pts · Reb · Ast" onNavigate={() => setActiveSheet(null)} />
          <SheetItem to="/mlb" emoji="⚾" label="MLB" sub="Game Analysis" onNavigate={() => setActiveSheet(null)} />
          <SheetItem to="/mlb-props" emoji="💣" label="HR Props" sub="Park · Wind" onNavigate={() => setActiveSheet(null)} />
          <SheetItem to="/nhl" emoji="🏒" label="NHL" sub="Coming soon" onNavigate={() => setActiveSheet(null)} />
          <SheetItem to="/nfl" emoji="🏈" label="NFL" sub="Coming soon" onNavigate={() => setActiveSheet(null)} />
        </div>
      </BottomSheet>

      {/* More bottom sheet */}
      <BottomSheet
        open={activeSheet === "more"}
        onClose={() => setActiveSheet(null)}
        title="More"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <SheetItem to="/record" emoji="📊" label="Record" sub="Full pick history" onNavigate={() => setActiveSheet(null)} />
          <SheetItem to="/leaderboard" emoji="🏆" label="Leaderboard" sub="Top 10 bettors" onNavigate={() => setActiveSheet(null)} />
          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />
          <SheetItem to="/arcade"    emoji="🕹️" label="Arcade"    sub="OTJ Jam · PvP"   onNavigate={() => setActiveSheet(null)} />
          <SheetItem to="/poker"     emoji="♠️"  label="Poker"     sub="Texas Hold'em"   onNavigate={() => setActiveSheet(null)} />
          <SheetItem to="/blackjack" emoji="🎰"  label="Blackjack" sub="Beat the dealer" onNavigate={() => setActiveSheet(null)} />
          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />
          <SheetItem to="/faq" emoji="❓" label="FAQ" sub="How OTJ works" onNavigate={() => setActiveSheet(null)} />
          {!user && (
            <button
              onClick={() => { setActiveSheet(null); onSignIn(); }}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 12px",
                borderRadius: 10, border: "1px solid rgba(239,68,68,0.3)",
                background: "rgba(239,68,68,0.08)", color: "#ef4444",
                cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
                fontSize: 13, fontWeight: 600, transition: "all 0.1s",
              }}
            >
              <span style={{ fontSize: 20 }}>🔑</span>
              <span>Sign In / Sign Up</span>
            </button>
          )}
        </div>
      </BottomSheet>

      {/* The bar itself — hidden on game table pages */}
      {!isGameTable && <div
        className="otj-mobile-bottom-bar"
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
          background: "rgba(8,8,15,0.97)", backdropFilter: "blur(16px)",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          padding: "6px 0 env(safe-area-inset-bottom, 8px)",
          justifyContent: "space-around", alignItems: "center",
          fontFamily: "'JetBrains Mono','SF Mono',monospace",
        }}
      >
        {/* Home */}
        <NavLink to="/" end style={{ textDecoration: "none" }}>
          <div style={tabStyle(isHome)}>
            <span style={iconStyle(isHome)}>🏠</span>
            <span style={labelStyle(isHome)}>Home</span>
            {isHome && <div className="otj-btab-active-dot" />}
          </div>
        </NavLink>

        {/* Journal */}
        <NavLink to="/daily" style={{ textDecoration: "none" }}>
          <div style={tabStyle(isJournal)}>
            <span style={iconStyle(isJournal)}>📰</span>
            <span style={labelStyle(isJournal)}>Journal</span>
            {isJournal && <div className="otj-btab-active-dot" />}
          </div>
        </NavLink>

        {/* Sports (opens sheet) */}
        <button
          onClick={() => setActiveSheet(a => a === "sports" ? null : "sports")}
          style={tabStyle(isSport)}
        >
          <span style={iconStyle(isSport)}>🏀</span>
          <span style={labelStyle(isSport)}>Sports</span>
          {isSport && <div className="otj-btab-active-dot" />}
        </button>

        {/* Profile / Avatar */}
        {user && profile?.username ? (
          <NavLink to={`/profile/${profile.username}`} style={{ textDecoration: "none" }}>
            <div style={tabStyle(path.startsWith("/profile"))}>
              <AvatarMini config={profile.avatar_config} size={22}
                style={{ border: "1px solid rgba(255,255,255,0.1)" }} />
              <span style={labelStyle(path.startsWith("/profile"))}>Profile</span>
              {path.startsWith("/profile") && <div className="otj-btab-active-dot" />}
            </div>
          </NavLink>
        ) : (
          <button onClick={onSignIn} style={tabStyle(false)}>
            <span style={iconStyle(false)}>👤</span>
            <span style={labelStyle(false)}>Sign In</span>
          </button>
        )}

        {/* More (opens sheet) */}
        <button
          onClick={() => setActiveSheet(a => a === "more" ? null : "more")}
          style={tabStyle(isMore && !isSport)}
        >
          <span style={{ ...iconStyle(isMore && !isSport), fontSize: 18, fontWeight: 700 }}>•••</span>
          <span style={labelStyle(isMore && !isSport)}>More</span>
          {(isMore && !isSport) && <div className="otj-btab-active-dot" />}
        </button>
      </div>}
    </>
  );
}

// ─── Mobile Top Bar (clean, minimal) ─────────────────────────────────────────
function MobileTopBar({ user, profile, onSignIn, slates }) {
  return (
    <div
      className="otj-mobile-topbar"
      style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(8,8,15,0.95)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: "10px 14px",
        alignItems: "center", justifyContent: "space-between",
        fontFamily: "'JetBrains Mono','SF Mono',monospace",
      }}
    >
      {/* Left: Logo */}
      <NavLink to="/" end style={{ textDecoration: "none", flexShrink: 0 }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: "#ef4444", letterSpacing: "-0.02em" }}>OTJ</span>
      </NavLink>

      {/* Right: weather + notifications + avatar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <WeatherCountdownPill slates={slates || []} />
        {user && profile?.bankroll != null && profile?.username && (
          <NavLink to={`/profile/${profile.username}`} style={{ textDecoration: "none", flexShrink: 0 }}>
            <div style={{
              padding: "2px 7px", borderRadius: 20,
              background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.3)",
              fontSize: 9, fontWeight: 700, color: "#c9a84c",
              fontFamily: "'JetBrains Mono',monospace",
            }}>
              🪙 {profile.bankroll.toLocaleString()} OTJ
            </div>
          </NavLink>
        )}
        {user && <NotificationBell user={user} />}
        {user && profile?.username && (
          <NavLink to={`/profile/${profile.username}`} style={{ textDecoration: "none", flexShrink: 0 }}>
            <AvatarMini config={profile.avatar_config} size={26}
              style={{ border: "1px solid rgba(255,255,255,0.1)" }} />
          </NavLink>
        )}
        {!user && <AuthButton onSignIn={onSignIn} />}
      </div>
    </div>
  );
}

// ── Desktop Nav (unchanged from your original) ──────────────────────────────
function DesktopNav({ user, profile, onSignIn, slates }) {
  const simpleTab = (isActive) => ({
    fontSize: 12, padding: "6px 10px", borderRadius: 6, textDecoration: "none", fontWeight: 600,
    color: isActive ? "#f1f5f9" : "#4a5568",
    background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
    border: isActive ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent",
    transition: "all 0.15s ease", whiteSpace: "nowrap", flexShrink: 0,
  });

  return (
    <nav
      className="otj-desktop-nav"
      style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(8,8,15,0.95)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: "8px 12px", alignItems: "center", gap: 6,
        fontFamily: "'JetBrains Mono','SF Mono',monospace",
      }}
    >
      {/* Logo */}
      <NavLink to="/" end style={{ textDecoration: "none", flexShrink: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: "#ef4444", letterSpacing: "-0.02em" }}>OTJ</span>
      </NavLink>

      {/* Nav items */}
      <div className="otj-nav-tabs">
        <NavLink to="/" end style={({ isActive }) => simpleTab(isActive)}>
          🏠<span className="nav-tab-label"> Home</span>
        </NavLink>

        <NavLink to="/daily" style={({ isActive }) => simpleTab(isActive)}>
          📰<span className="nav-tab-label"> Journal</span>
        </NavLink>

        <NavDropdown emoji="🏀" label="NBA" activePaths={["/nba", "/props"]}>
          <DropItem to="/nba"   emoji="📊" label="Edge Analyzer"  sub="ML · Spread · Totals" />
          <DropItem to="/props" emoji="🎯" label="Player Props"   sub="Points · Reb · Ast" />
        </NavDropdown>

        <NavDropdown emoji="⚾" label="MLB" activePaths={["/mlb", "/mlb-props"]}>
          <DropItem to="/mlb"       emoji="📊" label="Game Analysis" sub="Bullpen · Pythagorean" />
          <DropItem to="/mlb-props" emoji="💣" label="HR Props"      sub="Park · Wind · Pitcher" />
        </NavDropdown>

        <NavDropdown emoji="🏒" label="NHL" activePaths={["/nhl"]}>
          <DropItem to="/nhl" emoji="📊" label="Game Analysis" sub="Coming soon" />
        </NavDropdown>

        <NavDropdown emoji="🏈" label="NFL" activePaths={["/nfl"]}>
          <DropItem to="/nfl" emoji="📊" label="Game Analysis" sub="Coming soon" />
        </NavDropdown>

        <NavDropdown emoji="☰" label="More" activePaths={["/arcade", "/poker", "/blackjack", "/record", "/leaderboard"]}>
          <DropItem to="/record"      emoji="📊" label="Record"        sub="Full pick history" />
          <DropDivider />
          <DropItem to="/arcade"      emoji="🕹" label="Arcade"        sub="OTJ Jam · PvP" />
          <DropItem to="/poker"       emoji="♠️" label="Poker"         sub="Texas Hold'em" />
          <DropItem to="/blackjack"   emoji="🎰" label="Blackjack"     sub="Beat the dealer" />
          <DropDivider />
          <DropItem to="/leaderboard" emoji="🏆" label="Top 10"        sub="Leaderboard" />
        </NavDropdown>
      </div>

      {/* Right side: weather pill + auth */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
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
            {profile.bankroll != null && (
              <NavLink to={`/profile/${profile.username}`} style={{ textDecoration: "none", flexShrink: 0 }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "3px 8px", borderRadius: 20,
                  background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.3)",
                  fontSize: 10, fontWeight: 700, color: "#c9a84c",
                  fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap",
                }}>
                  🪙 {profile.bankroll.toLocaleString()} OTJ
                </div>
              </NavLink>
            )}
          </>
        )}
        {user && <NotificationBell user={user} />}
        <AuthButton onSignIn={onSignIn} />
      </div>
    </nav>
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
        `/poker/table/${room.id || room.roomId}`,
        { state: tableState }
      )}
    />
  );
}

function BlackjackLobbyWithNav({ user, profile }) {
  const navigate = useNavigate();
  return (
    <BlackjackLobby
      user={user}
      profile={profile}
      onEnterTable={(room, state) => navigate(
        `/blackjack/table/${room.id || room.roomId}`,
        { state }
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
  }, []);
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
          setShowUsername(!p || !p.username);
        }
      } catch (e) {
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
      <style>{NAV_STYLES}</style>

      {showWelcome && !user && (
        <WelcomeModal onClose={() => setShowWelcome(false)} />
      )}

      {showUsername && user && !profileLoading && (
        <UsernameModal user={user} profile={profile} onComplete={handleUsernameComplete} />
      )}

      <div style={{ minHeight: "100vh", background: "#08080f", color: "#e2e8f0", fontFamily: "'JetBrains Mono','SF Mono',monospace" }}>
        {/* Desktop: full horizontal nav (hidden on mobile via CSS) */}
        <DesktopNav user={user} profile={profile} onSignIn={() => setShowWelcome(true)} slates={navSlates} />

        {/* Mobile: clean minimal top bar — hidden on game table pages */}
        {!isGameTable && <MobileTopBar user={user} profile={profile} onSignIn={() => setShowWelcome(true)} slates={navSlates} />}

        <div className="otj-app-content" style={isGameTable ? { paddingBottom: 0 } : {}}>
          <Routes>
            <Route path="/" element={<LandingPage user={user} profile={profile} sessionValidated={sessionValidated} />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/nba" element={<NBADashboard user={user} profile={profile} sessionValidated={sessionValidated} />} />
            <Route path="/nhl" element={<ComingSoon sport="NHL" emoji="🏒" phase="Phase 2 — March" />} />
            <Route path="/mlb" element={<MLBDashboard user={user} profile={profile} />} />
            <Route path="/mlb-props" element={<MLBPropsPage user={user} profile={profile} onShowLogin={() => setShowWelcome(true)} />} />
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
            <Route path="/blackjack" element={
              <ProtectedRoute user={user} authChecked={authChecked}>
                <BlackjackLobbyWithNav user={user} profile={profile} />
              </ProtectedRoute>
            } />
            <Route path="/blackjack/table/:roomId" element={
              <ProtectedRoute user={user} authChecked={authChecked}>
                <BlackjackTable />
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

        {/* Mobile: bottom tab bar (hidden on desktop via CSS) */}
        <MobileBottomBar user={user} profile={profile} onSignIn={() => setShowWelcome(true)} />
      </div>
    </BrowserRouter>
  );
}
