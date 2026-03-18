import React, { useEffect, useRef, useState, useCallback } from "react";
import Colyseus from "colyseus.js";

// ─── Multiplayer config ───────────────────────────────────────────────────────
const COLYSEUS_URL = "wss://overtime-journal-production.up.railway.app";

// ─── Skins — add new entries here, no game logic changes needed ───────────────
const SKINS = {
  default: { label: "Classic",   playerColor: "#ef4444", ballTrail: null,      popups: null },
  fire:    { label: "🔥 Fire",   playerColor: "#f97316", ballTrail: "#f97316", popups: { score2: ["INFERNO!!", "SCORCHED!! 🔥"], score3: ["FIRE FROM DEEP!! 🔥"] } },
  ice:     { label: "❄️ Ice",    playerColor: "#60a5fa", ballTrail: "#bfdbfe", popups: { score2: ["ICE COLD!!", "FROZEN!!"],       score3: ["ABSOLUTE ZERO!!"] } },
  gold:    { label: "👑 Gold",   playerColor: "#fbbf24", ballTrail: "#fde68a", popups: { score2: ["MONEY!!", "GOLDEN!!"],           score3: ["PURE GOLD!!"] } },
};

// Detect touch/mobile device
// Windows desktops report maxTouchPoints > 0 even without touchscreen — require coarse pointer + small screen
const isMobile = () => {
  if (typeof window === "undefined") return false;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const smallScreen   = window.innerWidth <= 768;
  const hasTouch      = "ontouchstart" in window;
  return coarsePointer && (smallScreen || hasTouch);
};

// ─── Constants ────────────────────────────────────────────────────────────────
const W = 800, H = 480;
const COURT_COLOR = "#c8773a";
const LINE_COLOR = "#e8955c";
const HOOP_COLOR = "#ff6b00";
const BALL_R = 10;
const PLAYER_W = 22, PLAYER_H = 32;
const SHOT_CLOCK_MAX = 24;
const QUARTER_TIME = 120;
const PIXEL_FONT = "'Courier New', monospace";
const PLAYER_SPEED = 2.5;
const CPU_SPEED = 2.0;

// Shot RNG: roll 1–100. Must EXCEED threshold to score.
const SHOT_THRESHOLDS = { field: 25, three: 50, halfcourt: 90 };
const FIRE_BONUS = 15;

const TEAMS = {
  player: { color: "#ef4444", accent: "#fca5a5" },
  cpu:    { color: "#3b82f6", accent: "#93c5fd" },
};

const LINES = {
  score2:    ["BOOMSHAKALAKA!", "IS IT THE SHOES?", "KABOOM!", "PURE SILK!", "NOTHING BUT NET!"],
  score3:    ["FROM WAAAAY DOWNTOWN!", "ARE YOU KIDDING ME?!", "HE'S COOKING!"],
  halfcourt: ["OH MY GOODNESS!", "UNBELIEVABLE!!", "CALL THE LOTTERY!", "THAT'S IMPOSSIBLE!"],
  fire:      ["HE'S ON FIRE!!! 🔥", "NOBODY CAN STOP HIM!", "THE ROOF IS ON FIRE!"],
  steal:     ["STOLEN!", "PICK POCKET!", "HANDS OF GOLD!"],
  pass:      ["NICE DISH!", "THE EXTRA PASS!"],
  cpu:       ["THE MACHINE STRIKES BACK", "ALGORITHM WINS", "CPU SAYS GOODNIGHT"],
};

const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rollDice = () => Math.floor(Math.random() * 100) + 1;
const dst = (a, b) => Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2);

function shotType(fromX, toX) {
  const d = Math.abs(fromX - toX);
  if (d > W * 0.55) return "halfcourt";
  if (d > 220) return "three";
  return "field";
}

function initState() {
  return {
    phase: "menu",
    quarter: 1, quarterTime: QUARTER_TIME,
    score: { player: 0, cpu: 0 },
    shotClock: SHOT_CLOCK_MAX,
    possession: "player",
    activePlayer: "p1",
    onFire: { player: 0, cpu: 0 },
    fireActive: { player: false, cpu: false },
    ball: {
      x: 200, y: H/2, held: true, holder: "p1",
      shooting: false, shootFrom: null, shootTarget: null, shootProgress: 0,
      passing: false, passFrom: null, passTo: null, passProgress: 0, passTarget: null,
    },
    players: {
      p1: { x: 200, y: H/2,      team: "player" },
      p2: { x: 260, y: H/2+50,   team: "player" },
      c1: { x: W-200, y: H/2,    team: "cpu" },
      c2: { x: W-260, y: H/2+50, team: "cpu" },
    },
    lastScore: null, lastScoreTimer: 0,
    announcer: "", announcerTimer: 0,
    keys: {},
    touch: { up:false, down:false, left:false, right:false, shoot:false, pass:false },
    cpuShootTimer: 160,
    cpuPassTimer: 100,
  };
}

// ── Challenge a Follower ──────────────────────────────────────────────────────
function ChallengeFollower({ userId, profile, onChallenge }) {
  const [showList, setShowList] = useState(false);
  const [following, setFollowing] = useState([]);
  const [loadingList, setLoadingList] = useState(false);

  async function loadFollowing() {
    if (following.length > 0) { setShowList(true); return; }
    setLoadingList(true);
    try {
      const { data } = await import('../../lib/supabase').then(m => m.supabase)
        .from('follows')
        .select('following_id, profiles!follows_following_id_fkey(user_id, username, avatar_color, profile_icon)')
        .eq('follower_id', userId);
      setFollowing((data || []).map(d => d.profiles).filter(Boolean));
    } catch {}
    setLoadingList(false);
    setShowList(true);
  }

  if (!userId) return null;

  return (
    <div style={{marginTop:10}}>
      <button onClick={loadFollowing} style={{
        width:"100%", padding:"8px 0", borderRadius:6, cursor:"pointer",
        background:"rgba(239,68,68,0.06)", border:"1px solid rgba(239,68,68,0.15)",
        color:"#ef4444", fontSize:10, fontFamily:"'Courier New', monospace", fontWeight:700,
        letterSpacing:"0.08em",
      }}>
        ⚔️ CHALLENGE A FOLLOW
      </button>
      {showList && (
        <div style={{
          marginTop:6, background:"#0d0d1a", border:"1px solid #2d1b69",
          borderRadius:8, padding:"8px", maxHeight:180, overflowY:"auto",
        }}>
          {loadingList && <div style={{fontSize:10,color:"#4a5568",textAlign:"center",padding:8}}>Loading...</div>}
          {!loadingList && following.length === 0 && (
            <div style={{fontSize:10,color:"#4a5568",textAlign:"center",padding:8}}>
              You're not following anyone yet — follow people from the leaderboard!
            </div>
          )}
          {following.map(u => (
            <div key={u.user_id} onClick={() => { onChallenge(u.username); setShowList(false); }}
              style={{
                display:"flex", alignItems:"center", gap:8, padding:"6px 8px",
                borderRadius:6, cursor:"pointer",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <div style={{
                width:24, height:24, borderRadius:"50%",
                background: u.avatar_color || "#ef4444",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:12, flexShrink:0,
              }}>
                {u.profile_icon || (u.username ? u.username[0].toUpperCase() : "?")}
              </div>
              <span style={{fontSize:11, fontWeight:600, color:"#f1f5f9"}}>@{u.username}</span>
              <span style={{marginLeft:"auto", fontSize:9, color:"#ef4444", fontWeight:700}}>⚔️</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function NBAJamArcade({ user, profile }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(initState());
  const animRef  = useRef(null);
  const [uiPhase,    setUiPhase]    = useState("menu");
  const [mpStatus,   setMpStatus]   = useState(null);   // null | "connecting" | "waiting" | "ready" | "playing"
  const [mpSlot,     setMpSlot]     = useState(null);   // "p1" | "p2"
  const [mpRoomId,   setMpRoomId]   = useState(null);
  const [playerSkin, setPlayerSkin] = useState("default");
  const [linkCopied, setLinkCopied] = useState(false);
  const [opponentName, setOpponentName] = useState(null);
  const roomRef = useRef(null);

  // Use real username or fallback
  const myUsername = profile?.username || "Player";

  // ── Shared room handler setup ─────────────────────────────────────────────
  const setupRoomHandlers = useCallback((room) => {
    roomRef.current = room;
    setMpRoomId(room.id);
    // Only update URL once we have a real room ID
    const url = new URL(window.location.href);
    url.searchParams.set("room", room.id);
    window.history.replaceState({}, "", url.toString());

    room.onMessage("joined",         (d) => { setMpSlot(d.slot); setMpStatus("waiting"); });
    room.onMessage("both_connected", (d) => {
      setMpStatus("ready");
      // Find opponent's username from players object
      if (d.players) {
        const opponent = Object.values(d.players).find(p => p.slot !== (mpSlot || 'p1'));
        if (opponent) setOpponentName(opponent.username);
      }
    });
    room.onMessage("opponent_joined", (d) => {
      if (d.username) setOpponentName(d.username);
    });
    room.onMessage("game_start",     (d)  => {
      setMpStatus("playing");
      const s = initState(); s.phase = "playing";
      // Store player names for HUD
      s.p1Name = myUsername;
      s.p2Name = opponentName || "Opponent";
      stateRef.current = s; setUiPhase("playing");
    });
    room.onMessage("opponent_action", (d) => {
      if (d.keys) Object.assign(stateRef.current.keys, d.keys);
    });
    room.onMessage("score_update", () => {});
    room.onMessage("opponent_left", () => {
      setMpStatus(null); setUiPhase("menu");
      const u = new URL(window.location.href);
      u.searchParams.delete("room");
      window.history.replaceState({}, "", u.toString());
      if (roomRef.current) { roomRef.current.leave(); roomRef.current = null; }
    });
    room.onMessage("game_over", () => setMpStatus(null));
  }, []);

  // ── Join by room ID (friend clicked invite link) ──────────────────────────
  const joinRoomById = useCallback(async (roomId, pin) => {
    setMpStatus("connecting");
    try {
      const client = new Colyseus.Client(COLYSEUS_URL);
      const room = await client.joinById(roomId, {
        gameType: "nba_jam",
        username: myUsername,
        pin,
      });
      setupRoomHandlers(room);
    } catch (err) {
      console.error("Failed to join room:", err);
      setMpStatus(null);
      // Clear bad room param
      const u = new URL(window.location.href);
      u.searchParams.delete("room");
      window.history.replaceState({}, "", u.toString());
    }
  }, [setupRoomHandlers]);

  // ── Check URL for ?room= on mount — auto-join if valid ───────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get("room");
    // Only auto-join if it looks like a real room ID (not "undefined" / empty)
    if (roomParam && roomParam !== "undefined" && roomParam.length > 4) {
      joinRoomById(roomParam);
    } else if (roomParam) {
      // Clean bad param from URL silently
      const u = new URL(window.location.href);
      u.searchParams.delete("room");
      window.history.replaceState({}, "", u.toString());
    }
  }, []);

  // ── Create new room ───────────────────────────────────────────────────────
  const startMultiplayer = useCallback(async () => {
    setMpStatus("connecting");
    try {
      const client = new Colyseus.Client(COLYSEUS_URL);
      const room = await client.joinOrCreate("nba_jam", {
        gameType: "nba_jam",
        username: myUsername,
        skin: playerSkin,
      });
      setupRoomHandlers(room);
    } catch (err) {
      console.error("Multiplayer connection failed:", err);
      setMpStatus(null);
    }
  }, [playerSkin, setupRoomHandlers]);

  // Send local key state to opponent every frame (throttled to every 3 frames)
  const mpFrameCount = useRef(0);
  const syncToOpponent = useCallback((keys) => {
    if (!roomRef.current || mpStatus !== "playing") return;
    mpFrameCount.current++;
    if (mpFrameCount.current % 3 !== 0) return;
    roomRef.current.send("action", { keys });
  }, [mpStatus]);

  const startGame = useCallback(() => {
    const s = initState(); s.phase = "playing";
    stateRef.current = s; setUiPhase("playing");
  }, []);

  // ── Shoot ──────────────────────────────────────────────────────────────────
  function handleShoot(s) {
    if (s.ball.shooting || s.ball.passing) return;
    if (s.possession === "player" && s.ball.held &&
        (s.ball.holder === "p1" || s.ball.holder === "p2")) {
      const ap = s.players[s.activePlayer];
      const hoopX = W - 62, hoopY = H/2;
      const type = shotType(ap.x, hoopX);
      const threshold = SHOT_THRESHOLDS[type];
      const rolled = rollDice();
      const bonus = s.fireActive.player ? FIRE_BONUS : 0;
      const willScore = (rolled + bonus) > threshold;
      s.ball.held = false;
      s.ball.shooting = true;
      s.ball.shootFrom = { x: ap.x, y: ap.y };
      s.ball.shootTarget = { x: hoopX, y: hoopY, willScore, type, shooter: "player", rolled, threshold };
      s.ball.shootProgress = 0;
      if (!willScore) {
        s.announcer = `ROLL: ${rolled}+${bonus} — NEED >${threshold}`;
        s.announcerTimer = 80;
      }
    } else if (s.possession === "cpu") {
      // Steal attempt
      const ap = s.players[s.activePlayer];
      if (dst(ap, s.players.c1) < 65 && rollDice() > 62) {
        s.possession = "player";
        s.ball.held = true; s.ball.holder = s.activePlayer;
        s.ball.x = ap.x; s.ball.y = ap.y;
        s.shotClock = SHOT_CLOCK_MAX;
        s.announcer = rnd(LINES.steal); s.announcerTimer = 110;
        resetPositions(s);
      }
    }
  }

  // ── Pass ───────────────────────────────────────────────────────────────────
  function handlePass(s) {
    if (s.ball.shooting || s.ball.passing) return;
    if (s.possession !== "player") return;
    if (!s.ball.held || (s.ball.holder !== "p1" && s.ball.holder !== "p2")) return;
    const from = s.activePlayer;
    const to = from === "p1" ? "p2" : "p1";
    s.ball.held = false;
    s.ball.passing = true;
    s.ball.passFrom = { x: s.players[from].x, y: s.players[from].y };
    s.ball.passTo   = { x: s.players[to].x,   y: s.players[to].y };
    s.ball.passProgress = 0;
    s.ball.passTarget = to;
    s.announcer = rnd(LINES.pass); s.announcerTimer = 55;
  }

  function resetPositions(s) {
    s.players.p1.x = 200; s.players.p1.y = H/2;
    s.players.p2.x = 260; s.players.p2.y = H/2+50;
    s.players.c1.x = W-200; s.players.c1.y = H/2;
    s.players.c2.x = W-260; s.players.c2.y = H/2+50;
    const h = s.ball.holder;
    if (h && s.players[h]) { s.ball.x = s.players[h].x; s.ball.y = s.players[h].y - 10; }
  }

  // ── Keyboard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const dn = (e) => {
      stateRef.current.keys[e.key] = true;
      if ([" ","x","X","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) e.preventDefault();
      const s = stateRef.current;
      if (s.phase === "halftime" && e.key === " ") { s.phase = "playing"; return; }
      if (s.phase === "gameover" && e.key === " ") { startGame(); return; }
      if (s.phase !== "playing") return;
      if (e.key === " ") handleShoot(s);
      if (e.key === "x" || e.key === "X") handlePass(s);
    };
    const up = (e) => { stateRef.current.keys[e.key] = false; };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, [startGame]);

  // ── Touch buttons ──────────────────────────────────────────────────────────
  const touchBtn = useCallback((btn, active) => {
    const s = stateRef.current;
    s.touch[btn] = active;
    if (!active) return;
    if (s.phase === "halftime") { s.phase = "playing"; return; }
    if (s.phase === "gameover") { startGame(); return; }
    if (s.phase !== "playing") return;
    if (btn === "shoot") handleShoot(s);
    if (btn === "pass")  handlePass(s);
  }, [startGame]);

  // ── Game loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let lastTime = 0, clockAcc = 0;

    function update(dt) {
      const s = stateRef.current;
      if (s.phase !== "playing") return;

      // Clocks
      clockAcc += dt;
      if (clockAcc >= 1000) {
        clockAcc -= 1000;
        s.quarterTime = Math.max(0, s.quarterTime - 1);
        s.shotClock   = Math.max(0, s.shotClock - 1);
        if (s.shotClock === 0) {
          s.possession = s.possession === "player" ? "cpu" : "player";
          s.shotClock = SHOT_CLOCK_MAX;
          s.ball.held = true;
          s.ball.holder = s.possession === "player" ? "p1" : "c1";
          if (s.possession === "player") s.activePlayer = "p1";
          resetPositions(s);
        }
        if (s.quarterTime === 0) {
          if (s.quarter < 4) {
            s.quarter++; s.quarterTime = QUARTER_TIME; s.shotClock = SHOT_CLOCK_MAX;
            if (s.quarter === 3) { s.phase = "halftime"; setUiPhase("halftime"); return; }
          } else { s.phase = "gameover"; setUiPhase("gameover"); return; }
        }
      }

      if (s.lastScoreTimer > 0) s.lastScoreTimer--;
      if (s.announcerTimer > 0) s.announcerTimer--; else s.announcer = "";

      // Player movement
      const k = s.keys, t = s.touch;
      const ap = s.players[s.activePlayer];
      if (k["ArrowLeft"]  || t.left)  ap.x = Math.max(22, ap.x - PLAYER_SPEED);
      if (k["ArrowRight"] || t.right) ap.x = Math.min(W-22, ap.x + PLAYER_SPEED);
      if (k["ArrowUp"]    || t.up)    ap.y = Math.max(42, ap.y - PLAYER_SPEED);
      if (k["ArrowDown"]  || t.down)  ap.y = Math.min(H-42, ap.y + PLAYER_SPEED);

      // Inactive player trails
      const inactive = s.activePlayer === "p1" ? "p2" : "p1";
      const off = s.activePlayer === "p1" ? {x:-55,y:45} : {x:55,y:-45};
      const ip = s.players[inactive];
      ip.x += (ap.x + off.x - ip.x) * 0.06;
      ip.y += (ap.y + off.y - ip.y) * 0.06;

      // Ball follows holder
      if (s.ball.held && s.players[s.ball.holder]) {
        s.ball.x = s.players[s.ball.holder].x;
        s.ball.y = s.players[s.ball.holder].y - 10;
      }

      // Pass animation
      if (s.ball.passing) {
        s.ball.passProgress += 0.07;
        const tp = Math.min(s.ball.passProgress, 1);
        const pf = s.ball.passFrom, pt = s.ball.passTo;
        s.ball.x = pf.x + (pt.x - pf.x) * tp;
        s.ball.y = pf.y + (pt.y - pf.y) * tp - Math.sin(tp * Math.PI) * 28;
        if (tp >= 1) {
          s.ball.passing = false; s.ball.held = true;
          s.ball.holder = s.ball.passTarget;
          s.activePlayer = s.ball.passTarget;
          s.ball.x = s.players[s.ball.passTarget].x;
          s.ball.y = s.players[s.ball.passTarget].y - 10;
        }
      }

      // Shot animation
      if (s.ball.shooting) {
        s.ball.shootProgress += 0.033;
        const ts2 = Math.min(s.ball.shootProgress, 1);
        const sf = s.ball.shootFrom, st = s.ball.shootTarget;
        s.ball.x = sf.x + (st.x - sf.x) * ts2;
        s.ball.y = sf.y + (st.y - sf.y) * ts2 - Math.sin(ts2 * Math.PI) * 140;
        if (ts2 >= 1) {
          s.ball.shooting = false;
          const { willScore, type, shooter, rolled, threshold } = st;
          if (willScore) {
            const pts = type === "halfcourt" ? 4 : type === "three" ? 3 : 2;
            s.score[shooter] += pts;
            s.onFire[shooter]++;
            if (s.onFire[shooter] >= 3) {
              s.fireActive[shooter] = true;
              s.announcer = rnd(LINES.fire);
            } else {
              s.announcer = type === "halfcourt" ? rnd(LINES.halfcourt)
                          : type === "three" ? rnd(LINES.score3) : rnd(LINES.score2);
            }
            s.announcerTimer = 160;
            s.lastScore = { team: shooter, pts, text: type === "halfcourt" ? "HALF COURT! 🤯" : type === "three" ? "3 PTR!" : "BUCKET!" };
            s.lastScoreTimer = 100;
            s.possession = shooter === "player" ? "cpu" : "player";
          } else {
            s.onFire[shooter] = 0; s.fireActive[shooter] = false;
            s.announcer = `BRICK! (${rolled}+${s.fireActive[shooter]?FIRE_BONUS:0} vs >${threshold})`;
            s.announcerTimer = 75;
            s.possession = rollDice() > 50 ? "player" : "cpu";
          }
          s.ball.held = true;
          s.ball.holder = s.possession === "player" ? "p1" : "c1";
          s.shotClock = SHOT_CLOCK_MAX;
          if (s.possession === "player") s.activePlayer = "p1";
          resetPositions(s);
        }
      }

      // CPU AI
      if (s.possession === "cpu" && !s.ball.shooting) {
        const c1 = s.players.c1;
        const hoopX = 62, hoopY = H/2;
        const dx = hoopX - c1.x, dy = hoopY - c1.y;
        const d = Math.sqrt(dx*dx + dy*dy);
        if (d > 8) { c1.x += (dx/d)*CPU_SPEED; c1.y += (dy/d)*CPU_SPEED; }
        s.players.c2.x += ((c1.x+55) - s.players.c2.x) * 0.06;
        s.players.c2.y += ((c1.y+35) - s.players.c2.y) * 0.06;

        s.cpuShootTimer--;
        if (s.cpuShootTimer <= 0 || d < 130) {
          const type = shotType(c1.x, hoopX);
          const thr = SHOT_THRESHOLDS[type];
          const r = rollDice();
          const bonus = s.fireActive.cpu ? FIRE_BONUS : 0;
          const willScore = (r + bonus) > thr;
          s.ball.held = false; s.ball.shooting = true;
          s.ball.shootFrom = { x: c1.x, y: c1.y };
          s.ball.shootTarget = { x: hoopX, y: hoopY, willScore, type, shooter: "cpu", rolled: r, threshold: thr };
          s.ball.shootProgress = 0;
          s.cpuShootTimer = 110 + Math.floor(Math.random() * 80);
          if (willScore) { s.announcer = rnd(LINES.cpu); s.announcerTimer = 110; }
        }

        s.cpuPassTimer--;
        if (s.cpuPassTimer <= 0) {
          const t1 = { ...s.players.c1 }, t2 = { ...s.players.c2 };
          s.players.c1.x = t2.x; s.players.c1.y = t2.y;
          s.players.c2.x = t1.x; s.players.c2.y = t1.y;
          s.cpuPassTimer = 80 + Math.floor(Math.random() * 60);
        }
      } else if (s.possession === "player") {
        const c1 = s.players.c1;
        const tgt = s.players[s.activePlayer];
        const dx = tgt.x - c1.x, dy = tgt.y - c1.y;
        const d = Math.sqrt(dx*dx + dy*dy);
        if (d > 8) { c1.x += (dx/d)*CPU_SPEED*0.9; c1.y += (dy/d)*CPU_SPEED*0.9; }
        s.players.c2.x += ((c1.x+50) - s.players.c2.x) * 0.05;
        s.players.c2.y += ((c1.y+30) - s.players.c2.y) * 0.05;
      }

      for (const key of ["p1","p2","c1","c2"]) {
        s.players[key].x = Math.max(22, Math.min(W-22, s.players[key].x));
        s.players[key].y = Math.max(42, Math.min(H-42, s.players[key].y));
      }
    }

    // ── Draw ────────────────────────────────────────────────────────────────
    function drawCourt() {
      ctx.fillStyle = COURT_COLOR; ctx.fillRect(0,0,W,H);
      ctx.strokeStyle = LINE_COLOR; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(W/2,36); ctx.lineTo(W/2,H-36); ctx.stroke();
      ctx.beginPath(); ctx.arc(W/2,H/2,60,0,Math.PI*2); ctx.stroke();
      ctx.strokeRect(18, H/2-72, 122, 144);
      ctx.strokeRect(W-140, H/2-72, 122, 144);
      ctx.beginPath(); ctx.arc(90,H/2,42,-Math.PI/2,Math.PI/2); ctx.stroke();
      ctx.beginPath(); ctx.arc(W-90,H/2,42,Math.PI/2,-Math.PI/2); ctx.stroke();
      ctx.beginPath(); ctx.arc(90,H/2,185,-Math.PI*0.58,Math.PI*0.58); ctx.stroke();
      ctx.beginPath(); ctx.arc(W-90,H/2,185,Math.PI*0.42,Math.PI*1.58); ctx.stroke();
      ctx.strokeRect(8,28,W-16,H-56);
      drawHoop(ctx, 62, H/2, false);
      drawHoop(ctx, W-62, H/2, true);
    }

    function drawHoop(ctx, x, y, right) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(right?x+8:x-14, y-22, 6, 44);
      ctx.strokeStyle = HOOP_COLOR; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(right?x-8:x+8, y, 15, 0, Math.PI*2); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 1;
      for (let i=-3; i<=3; i++) {
        const bx=(right?x-8:x+8)+i*4;
        ctx.beginPath(); ctx.moveTo(bx,y+15); ctx.lineTo(bx+i,y+30); ctx.stroke();
      }
    }

    function drawPlayer(p, label, isOnFire, isActive) {
      const col = p.team === "player" ? TEAMS.player.color : TEAMS.cpu.color;
      const acc = p.team === "player" ? TEAMS.player.accent : TEAMS.cpu.accent;
      if (isActive && p.team === "player") {
        ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y+PLAYER_H/2+5, 5, 0, Math.PI*2); ctx.stroke();
      }
      if (isOnFire) { ctx.shadowColor="#ff6b00"; ctx.shadowBlur=18; }
      ctx.fillStyle = col; ctx.fillRect(p.x-PLAYER_W/2, p.y-PLAYER_H/2, PLAYER_W, PLAYER_H);
      ctx.fillStyle = acc; ctx.fillRect(p.x-PLAYER_W/2+3, p.y-PLAYER_H/2+8, PLAYER_W-6, 10);
      ctx.fillStyle = "#f5d0a9";
      ctx.beginPath(); ctx.arc(p.x, p.y-PLAYER_H/2-6, 9, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff"; ctx.font = `bold 9px ${PIXEL_FONT}`; ctx.textAlign = "center";
      ctx.fillText(label, p.x, p.y+PLAYER_H/2+11);
      if (isOnFire) { ctx.font="13px serif"; ctx.fillText("🔥", p.x+13, p.y-PLAYER_H/2-13); }
    }

    function drawBall(ball) {
      ctx.fillStyle="rgba(0,0,0,0.18)";
      ctx.beginPath(); ctx.ellipse(ball.x,H/2+22,BALL_R*1.3,BALL_R*0.45,0,0,Math.PI*2); ctx.fill();
      const g=ctx.createRadialGradient(ball.x-3,ball.y-3,2,ball.x,ball.y,BALL_R);
      g.addColorStop(0,"#ffa94d"); g.addColorStop(1,"#e06800");
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(ball.x,ball.y,BALL_R,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle="#7c3000"; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(ball.x,ball.y,BALL_R,0,Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ball.x-BALL_R,ball.y); ctx.lineTo(ball.x+BALL_R,ball.y); ctx.stroke();
    }

    function drawHUD(s) {
      ctx.fillStyle="rgba(0,0,0,0.78)"; ctx.fillRect(0,0,W,38);
      ctx.font=`bold 20px ${PIXEL_FONT}`; ctx.textAlign="center";
      const p1Name = s.p1Name || "OTJ";
      const p2Name = s.p2Name || "CPU";
      ctx.fillStyle=TEAMS.player.color; ctx.fillText(`${p1Name} ${s.score.player}`,W/2-130,25);
      ctx.fillStyle="#444"; ctx.fillText("VS",W/2,25);
      ctx.fillStyle=TEAMS.cpu.color; ctx.fillText(`${s.score.cpu} ${p2Name}`,W/2+130,25);
      const mins=Math.floor(s.quarterTime/60), secs=String(s.quarterTime%60).padStart(2,"0");
      ctx.font=`bold 12px ${PIXEL_FONT}`; ctx.fillStyle="#666";
      ctx.fillText(`Q${s.quarter}  ${mins}:${secs}`,W/2,13);
      ctx.fillStyle=s.shotClock<=5?"#ef4444":"#f59e0b";
      ctx.font=`bold 17px ${PIXEL_FONT}`; ctx.textAlign="right";
      ctx.fillText(`⏱${s.shotClock}`,W-14,25);
      ctx.fillStyle="#555"; ctx.font=`10px ${PIXEL_FONT}`; ctx.textAlign="left";
      ctx.fillText(s.possession==="player"?`▶ ${s.activePlayer==="p1"?"P1★":"P2★"} ball`:"◀ CPU ball",14,25);

      if (s.announcerTimer>0 && s.announcer) {
        const alpha=Math.min(1,s.announcerTimer/25);
        ctx.save(); ctx.globalAlpha=alpha;
        ctx.font=`bold 20px ${PIXEL_FONT}`; ctx.textAlign="center";
        ctx.fillStyle="#fbbf24"; ctx.strokeStyle="#000"; ctx.lineWidth=4;
        ctx.strokeText(s.announcer,W/2,H/2-52); ctx.fillText(s.announcer,W/2,H/2-52);
        ctx.restore();
      }
      if (s.lastScoreTimer>0 && s.lastScore) {
        const alpha=Math.min(1,s.lastScoreTimer/18);
        ctx.save(); ctx.globalAlpha=alpha;
        ctx.font=`bold 32px ${PIXEL_FONT}`; ctx.textAlign="center";
        const col=s.lastScore.team==="player"?TEAMS.player.color:TEAMS.cpu.color;
        ctx.fillStyle=col; ctx.strokeStyle="#000"; ctx.lineWidth=5;
        ctx.strokeText(`+${s.lastScore.pts} ${s.lastScore.text}`,W/2,H/2+90);
        ctx.fillText(`+${s.lastScore.pts} ${s.lastScore.text}`,W/2,H/2+90);
        ctx.restore();
      }
    }

    function drawOverlay(s) {
      const p1Name = s.p1Name || "OTJ";
      const p2Name = s.p2Name || "CPU";
      if (s.phase==="halftime") {
        ctx.fillStyle="rgba(0,0,0,0.72)"; ctx.fillRect(0,0,W,H);
        ctx.font=`bold 40px ${PIXEL_FONT}`; ctx.textAlign="center";
        ctx.fillStyle="#fbbf24"; ctx.fillText("HALFTIME",W/2,H/2-24);
        ctx.font=`17px ${PIXEL_FONT}`; ctx.fillStyle="#aaa";
        ctx.fillText(`${p1Name} ${s.score.player}  —  ${s.score.cpu} ${p2Name}`,W/2,H/2+20);
        ctx.font=`12px ${PIXEL_FONT}`; ctx.fillStyle="#555";
        ctx.fillText("SPACE / tap to continue",W/2,H/2+56);
      }
      if (s.phase==="gameover") {
        ctx.fillStyle="rgba(0,0,0,0.82)"; ctx.fillRect(0,0,W,H);
        const win=s.score.player>s.score.cpu?`${p1Name} WINS! 🏆`:s.score.cpu>s.score.player?`${p2Name} WINS 💀`:"TIE GAME!";
        ctx.font=`bold 42px ${PIXEL_FONT}`; ctx.textAlign="center";
        ctx.fillStyle=s.score.player>s.score.cpu?"#22c55e":s.score.cpu>s.score.player?"#ef4444":"#f59e0b";
        ctx.fillText(win,W/2,H/2-28);
        ctx.font=`18px ${PIXEL_FONT}`; ctx.fillStyle="#fff";
        ctx.fillText(`FINAL:  ${p1Name} ${s.score.player}  —  ${s.score.cpu} ${p2Name}`,W/2,H/2+20);
        ctx.font=`12px ${PIXEL_FONT}`; ctx.fillStyle="#555";
        ctx.fillText("SPACE / tap to play again",W/2,H/2+58);
      }
    }

    function draw() {
      const s=stateRef.current;
      ctx.clearRect(0,0,W,H);
      if (s.phase==="menu") return;
      drawCourt();
      drawPlayer(s.players.p2,"OTJ 2",s.fireActive.player,s.activePlayer==="p2");
      drawPlayer(s.players.c2,"CPU 2",s.fireActive.cpu,false);
      drawPlayer(s.players.p1,"OTJ 1",s.fireActive.player,s.activePlayer==="p1");
      drawPlayer(s.players.c1,"CPU 1",s.fireActive.cpu,false);
      drawBall(s.ball);
      drawHUD(s);
      drawOverlay(s);
    }

    function loop(ts) {
      const dt=ts-lastTime; lastTime=ts;
      const s=stateRef.current;
      if (s.phase==="halftime"&&s.keys[" "]) { s.phase="playing"; s.keys[" "]=false; }
      update(dt); draw();
      animRef.current=requestAnimationFrame(loop);
    }
    animRef.current=requestAnimationFrame(loop);
    return ()=>cancelAnimationFrame(animRef.current);
  }, []);

  // ── Action Button ──────────────────────────────────────────────────────────
  function ActionBtn({ label, color, onActive, style={} }) {
    return (
      <div
        onPointerDown={()=>onActive(true)}
        onPointerUp={()=>onActive(false)}
        onPointerLeave={()=>onActive(false)}
        style={{
          width:54,height:54,borderRadius:12,
          background:`${color}18`,
          border:`2px solid ${color}40`,
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:20,color,userSelect:"none",cursor:"pointer",
          WebkitTapHighlightColor:"transparent",touchAction:"none",
          fontFamily:PIXEL_FONT,letterSpacing:"0.04em",
          boxShadow:`0 0 10px ${color}20`,
          ...style,
        }}
      >{label}</div>
    );
  }

  // ── Analog Joystick ────────────────────────────────────────────────────────
  const joystickRef = React.useRef(null);
  const joystickActive = React.useRef(false);
  const joystickOrigin = React.useRef({x:0,y:0});
  const JOYSTICK_RADIUS = 44;
  const DEAD_ZONE = 0.18;

  const handleJoystick = React.useCallback(() => {}, []); // placeholder — logic inline below

  function Joystick() {
    const baseRef = React.useRef(null);
    const [knobPos, setKnobPos] = React.useState({x:0,y:0});

    function getCenter(el) {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width/2, y: r.top + r.height/2 };
    }

    function onStart(e) {
      e.preventDefault();
      joystickActive.current = true;
      const center = getCenter(baseRef.current);
      joystickOrigin.current = center;
    }

    function onMove(e) {
      if (!joystickActive.current) return;
      e.preventDefault();
      const touch = e.touches ? e.touches[0] : e;
      const dx = touch.clientX - joystickOrigin.current.x;
      const dy = touch.clientY - joystickOrigin.current.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const clampedDist = Math.min(dist, JOYSTICK_RADIUS);
      const angle = Math.atan2(dy, dx);
      const kx = Math.cos(angle) * clampedDist;
      const ky = Math.sin(angle) * clampedDist;
      setKnobPos({x:kx, y:ky});

      // Normalize -1 to 1
      const nx = kx / JOYSTICK_RADIUS;
      const ny = ky / JOYSTICK_RADIUS;
      const s = stateRef.current;
      s.touch.left  = nx < -DEAD_ZONE;
      s.touch.right = nx >  DEAD_ZONE;
      s.touch.up    = ny < -DEAD_ZONE;
      s.touch.down  = ny >  DEAD_ZONE;
    }

    function onEnd(e) {
      e.preventDefault();
      joystickActive.current = false;
      setKnobPos({x:0,y:0});
      const s = stateRef.current;
      s.touch.left = s.touch.right = s.touch.up = s.touch.down = false;
    }

    const SIZE = JOYSTICK_RADIUS * 2 + 20;
    const CENTER = SIZE / 2;

    return (
      <div
        ref={baseRef}
        onPointerDown={onStart}
        onPointerMove={onMove}
        onPointerUp={onEnd}
        onPointerLeave={onEnd}
        onTouchStart={onStart}
        onTouchMove={onMove}
        onTouchEnd={onEnd}
        style={{
          width:SIZE, height:SIZE, borderRadius:"50%",
          background:"rgba(255,255,255,0.04)",
          border:"2px solid rgba(255,255,255,0.10)",
          position:"relative", flexShrink:0,
          userSelect:"none", touchAction:"none",
          WebkitTapHighlightColor:"transparent",
          boxShadow:"inset 0 2px 8px rgba(0,0,0,0.4)",
        }}
      >
        {/* Guide ring */}
        <div style={{
          position:"absolute",
          top:"50%", left:"50%",
          width: JOYSTICK_RADIUS*2, height: JOYSTICK_RADIUS*2,
          borderRadius:"50%",
          border:"1px dashed rgba(255,255,255,0.07)",
          transform:"translate(-50%,-50%)",
          pointerEvents:"none",
        }}/>
        {/* Knob */}
        <div style={{
          position:"absolute",
          width:36, height:36, borderRadius:"50%",
          background:"linear-gradient(135deg, rgba(251,191,36,0.9), rgba(239,68,68,0.7))",
          border:"2px solid rgba(255,255,255,0.25)",
          boxShadow:"0 2px 8px rgba(0,0,0,0.5), 0 0 12px rgba(251,191,36,0.3)",
          top: CENTER - 18 + knobPos.y,
          left: CENTER - 18 + knobPos.x,
          transition: joystickActive.current ? "none" : "top 0.12s ease, left 0.12s ease",
          pointerEvents:"none",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:16,
        }}>🕹</div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight:"100vh",
      background:"#0a0a0f",
      backgroundImage:`
        radial-gradient(ellipse at 50% 0%, rgba(139,92,246,0.15) 0%, transparent 60%),
        radial-gradient(ellipse at 0% 100%, rgba(59,130,246,0.08) 0%, transparent 50%),
        radial-gradient(ellipse at 100% 100%, rgba(239,68,68,0.08) 0%, transparent 50%),
        repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(255,255,255,0.015) 40px, rgba(255,255,255,0.015) 41px),
        repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(255,255,255,0.015) 40px, rgba(255,255,255,0.015) 41px)
      `,
      display:"flex", flexDirection:"column", alignItems:"center",
      padding:"14px 8px 16px", fontFamily:PIXEL_FONT, overflowX:"hidden",
    }}>

    {/* Arcade cabinet wrapper */}
    <div style={{
      width:"100%", maxWidth:920,
      background:"linear-gradient(180deg, #1a0a2e 0%, #0d0d1a 40%, #0a0a0f 100%)",
      borderRadius:24,
      border:"3px solid #2d1b69",
      boxShadow:`
        0 0 0 1px #4c1d95,
        0 0 30px rgba(139,92,246,0.3),
        0 0 60px rgba(139,92,246,0.15),
        inset 0 0 40px rgba(0,0,0,0.5)
      `,
      padding:"20px 20px 24px",
      position:"relative",
    }}>

    {/* Cabinet top glow strip */}
    <div style={{
      position:"absolute", top:0, left:"10%", right:"10%", height:3,
      background:"linear-gradient(90deg, transparent, #a855f7, #ec4899, #a855f7, transparent)",
      borderRadius:"0 0 4px 4px",
      boxShadow:"0 0 12px rgba(168,85,247,0.8)",
    }}/>

    {/* Side accent lights */}
    <div style={{position:"absolute",top:"15%",left:8,width:4,height:"70%",background:"linear-gradient(180deg,transparent,#7c3aed,#4f46e5,transparent)",borderRadius:4,boxShadow:"0 0 8px rgba(124,58,237,0.6)"}}/>
    <div style={{position:"absolute",top:"15%",right:8,width:4,height:"70%",background:"linear-gradient(180deg,transparent,#7c3aed,#4f46e5,transparent)",borderRadius:4,boxShadow:"0 0 8px rgba(124,58,237,0.6)"}}/>

      <div style={{marginBottom:8,textAlign:"center",width:"100%"}}>
        <div style={{marginBottom:3}}>
          <a href="/arcade" style={{fontSize:11,color:"#4c1d95",textDecoration:"none"}}>← Arcade</a>
        </div>
        <h1 style={{
          fontSize:28, fontWeight:700, margin:0, letterSpacing:"0.12em", textTransform:"uppercase",
          background:"linear-gradient(135deg, #fbbf24, #f59e0b, #fbbf24)",
          WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
          filter:"drop-shadow(0 0 8px rgba(251,191,36,0.5))",
        }}>
          🕹 OTJ JAM
        </h1>
        <p style={{ fontSize: 11, color: "#4a5568", margin: "2px 0 0" }}>
          {profile?.username ? `Playing as @${profile.username}` : "Field >25 · 3PT >50 · Half Court >90 · 🔥ON FIRE +15 · Half court = 4pts"}
        </p>
      </div>

      <div style={{position:"relative",width:"100%",maxWidth:W}}>
        {uiPhase==="menu"&&(
          <div style={{
            position:"absolute",inset:0,zIndex:10,background:"rgba(0,0,0,0.92)",
            display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
            borderRadius:8,padding:24,
          }}>
            <div style={{fontSize:50,marginBottom:6}}>🏀</div>
            <h2 style={{fontSize:26,color:"#fbbf24",margin:"0 0 8px",textTransform:"uppercase",letterSpacing:"0.06em"}}>OTJ JAM</h2>
            <div style={{fontSize:12,color:"#4a5568",marginBottom:6,textAlign:"center",lineHeight:2}}>
              <span style={{color:"#6b7280"}}>{isMobile() ? "🕹 Joystick" : "⬆⬇⬅➡ Arrow Keys"}</span> Move &nbsp;|&nbsp;
              <span style={{color:"#f59e0b"}}>SPACE</span> Shoot &nbsp;|&nbsp;
              <span style={{color:"#60a5fa"}}>X</span> Pass to teammate
            </div>
            <table style={{fontSize:11,color:"#4a5568",marginBottom:6,borderSpacing:"8px 2px"}}>
              <tbody>
                <tr><td style={{color:"#6b7280"}}>Field goal</td><td>roll &gt;25 to score</td></tr>
                <tr><td style={{color:"#6b7280"}}>3-pointer</td><td>roll &gt;50 to score</td></tr>
                <tr><td style={{color:"#6b7280"}}>Half court</td><td>roll &gt;90 to score (4 pts!)</td></tr>
                <tr><td style={{color:"#f59e0b"}}>🔥 On fire</td><td>+15 bonus after 3 straight</td></tr>
              </tbody>
            </table>
            {/* Skin selector */}
            <div style={{display:"flex",gap:6,marginBottom:12,marginTop:4}}>
              {Object.entries(SKINS).map(([key, skin]) => (
                <button key={key} onClick={() => setPlayerSkin(key)} style={{
                  fontSize:10, padding:"4px 8px", borderRadius:4, cursor:"pointer",
                  background: playerSkin === key ? skin.playerColor : "#1a1a1a",
                  border: `1px solid ${playerSkin === key ? skin.playerColor : "#374151"}`,
                  color: playerSkin === key ? "#000" : "#6b7280",
                  fontFamily:PIXEL_FONT, fontWeight:700,
                }}>
                  {skin.label}
                </button>
              ))}
            </div>

            {/* Solo */}
            <button onClick={startGame} style={{
              fontSize:14,padding:"11px 32px",borderRadius:6,cursor:"pointer",
              background:"#fbbf24",border:"none",color:"#000",
              fontFamily:PIXEL_FONT,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",
              marginTop:4,width:"100%",maxWidth:220,
            }}>
              INSERT COIN →
            </button>

            {/* Multiplayer */}
            {mpStatus === null && (
              <div style={{width:"100%",maxWidth:280,marginTop:8}}>
                {/* Create room */}
                <button onClick={() => startMultiplayer()} style={{
                  fontSize:13,padding:"10px 32px",borderRadius:6,cursor:"pointer",
                  background:"transparent",border:"2px solid #3b82f6",color:"#3b82f6",
                  fontFamily:PIXEL_FONT,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",
                  width:"100%",
                }}>
                  🌐 CREATE ROOM
                </button>

                {/* Join by room code */}
                <div style={{marginTop:10}}>
                  <div style={{fontSize:9,color:"#4a5568",letterSpacing:"0.1em",marginBottom:4,textAlign:"center"}}>
                    OR JOIN WITH CODE
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <input
                      id="room-code-input"
                      placeholder="ROOM CODE"
                      maxLength={12}
                      style={{
                        flex:1, padding:"8px 10px", borderRadius:6, textAlign:"center",
                        background:"#0d0d1a", border:"1px solid #2d1b69",
                        color:"#a855f7", fontSize:14, fontWeight:700, letterSpacing:"0.2em",
                        fontFamily:"monospace", outline:"none", textTransform:"uppercase",
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          const code = e.target.value.trim();
                          if (code.length >= 4) joinRoomById(code);
                        }
                      }}
                    />
                    <button onClick={() => {
                      const code = document.getElementById('room-code-input')?.value?.trim();
                      if (code && code.length >= 4) joinRoomById(code);
                    }} style={{
                      padding:"8px 14px", borderRadius:6, cursor:"pointer",
                      background:"#a855f7", border:"none", color:"#fff",
                      fontSize:11, fontFamily:PIXEL_FONT, fontWeight:700,
                    }}>
                      JOIN
                    </button>
                  </div>
                </div>

                {/* Challenge a follower */}
                {profile?.username && (
                  <ChallengeFollower userId={user?.id} profile={profile} onChallenge={(username) => {
                    // Create room and the challenged user will need to join via notification
                    startMultiplayer();
                  }} />
                )}
              </div>
            )}
            {mpStatus === "connecting" && (
              <div style={{color:"#6b7280",fontSize:11,marginTop:8}}>Connecting to server...</div>
            )}
            {mpStatus === "waiting" && (
              <div style={{textAlign:"center",marginTop:10,width:"100%",maxWidth:280}}>
                <div style={{color:"#fbbf24",fontSize:12,marginBottom:8}}>⏳ Waiting for opponent...</div>

                {/* Room code display */}
                <div style={{
                  background:"#0d0d1a", border:"1px solid #2d1b69",
                  borderRadius:8, padding:"8px 12px", marginBottom:8,
                }}>
                  <div style={{color:"#4a5568",fontSize:9,letterSpacing:"0.15em",marginBottom:4}}>ROOM CODE</div>
                  <div style={{
                    color:"#a855f7", fontSize:22, fontWeight:700, letterSpacing:"0.25em",
                    textShadow:"0 0 10px rgba(168,85,247,0.6)",
                    fontFamily:"monospace",
                  }}>
                    {mpRoomId ? mpRoomId.slice(-6).toUpperCase() : "------"}
                  </div>
                </div>

                {/* Copy invite link */}
                <button onClick={() => {
                  const url = `${window.location.origin}/arcade/nba?room=${mpRoomId}`;
                  navigator.clipboard.writeText(url).then(() => {
                    setLinkCopied(true);
                    setTimeout(() => setLinkCopied(false), 2500);
                  });
                }} style={{
                  width:"100%", padding:"9px 0", borderRadius:6, cursor:"pointer",
                  background: linkCopied ? "#22c55e20" : "#1a0a2e",
                  border:`1px solid ${linkCopied ? "#22c55e" : "#4c1d95"}`,
                  color: linkCopied ? "#22c55e" : "#a855f7",
                  fontSize:11, fontFamily:PIXEL_FONT, fontWeight:700,
                  letterSpacing:"0.08em", transition:"all 0.2s",
                  marginBottom:6,
                }}>
                  {linkCopied ? "✅ LINK COPIED!" : "🔗 COPY INVITE LINK"}
                </button>
                <div style={{color:"#1e1040",fontSize:9,letterSpacing:"0.05em"}}>
                  friend joins → paste link or enter last 6 chars
                </div>
              </div>
            )}
            {mpStatus === "ready" && (
              <div style={{textAlign:"center",marginTop:8}}>
                <div style={{color:"#22c55e",fontSize:12,marginBottom:6}}>
                  ✅ {opponentName ? `@${opponentName} connected!` : "Opponent connected!"}
                </div>
                <button onClick={() => roomRef.current?.send("ready")} style={{
                  fontSize:13,padding:"10px 28px",borderRadius:6,cursor:"pointer",
                  background:"#22c55e",border:"none",color:"#000",
                  fontFamily:PIXEL_FONT,fontWeight:700,textTransform:"uppercase",
                }}>
                  READY UP →
                </button>
              </div>
            )}
          </div>
        )}
        <canvas
          ref={canvasRef} width={W} height={H}
          style={{display:"block",borderRadius:8,border:"2px solid #1a1a1a",width:"100%",height:"auto"}}
        />
      </div>

      {/* Controls — joystick on mobile, keyboard hint on desktop */}
      {isMobile() ? (
        <div style={{
          display:"flex",justifyContent:"space-between",alignItems:"center",
          width:"100%",maxWidth:W,marginTop:12,padding:"0 8px",gap:8,
        }}>
          {/* Analog Joystick */}
          <Joystick onMove={handleJoystick}/>

          {/* Center legend */}
          <div style={{fontSize:10,color:"#1f2937",textAlign:"center",lineHeight:2.2,flex:1}}>
            <div>Field &gt;25</div>
            <div>3PT &gt;50</div>
            <div>Half &gt;90</div>
            <div style={{color:"#374151"}}>🔥 +15</div>
          </div>

          {/* Action buttons */}
          <div style={{display:"flex",flexDirection:"column",gap:8,alignItems:"center"}}>
            <ActionBtn label="🏀" color="#ef4444" onActive={(v)=>touchBtn("shoot",v)}
              style={{width:68,height:68,fontSize:28,borderRadius:16}}/>
            <ActionBtn label="↔ PASS" color="#60a5fa" onActive={(v)=>touchBtn("pass",v)}
              style={{width:68,height:38,fontSize:11}}/>
          </div>
        </div>
      ) : (
        <div style={{
          display:"flex",justifyContent:"center",alignItems:"center",
          width:"100%",maxWidth:W,marginTop:12,gap:24,
        }}>
          <div style={{fontSize:11,color:"#374151",textAlign:"center",lineHeight:2.2}}>
            <div><span style={{color:"#6b7280"}}>⬆⬇⬅➡ Arrow Keys</span> — Move</div>
            <div><span style={{color:"#f59e0b"}}>SPACE</span> — Shoot &nbsp;|&nbsp; <span style={{color:"#60a5fa"}}>X</span> — Pass</div>
          </div>
          <div style={{fontSize:10,color:"#1f2937",textAlign:"center",lineHeight:2.2}}>
            <div>Field &gt;25</div>
            <div>3PT &gt;50</div>
            <div>Half &gt;90</div>
            <div style={{color:"#374151"}}>🔥 +15</div>
          </div>
        </div>
      )}

      <div style={{marginTop:8,fontSize:10,color:"#4c1d95",textAlign:"center",lineHeight:2}}>
        ★ = active player &nbsp;·&nbsp; Pass to switch control &nbsp;·&nbsp; 3 buckets in a row = 🔥
      </div>

      {/* Cabinet bottom coin slot */}
      <div style={{
        display:"flex", justifyContent:"center", alignItems:"center",
        gap:16, marginTop:16, paddingTop:16,
        borderTop:"1px solid #1e1040",
      }}>
        <div style={{
          background:"#0d0d1a", border:"2px solid #2d1b69",
          borderRadius:8, padding:"4px 20px",
          fontSize:10, color:"#4c1d95", letterSpacing:"0.1em",
          boxShadow:"inset 0 2px 4px rgba(0,0,0,0.5)",
        }}>
          ▌▌ INSERT COIN ▌▌
        </div>
        <div style={{
          width:40, height:8, background:"#0d0d1a",
          border:"2px solid #2d1b69", borderRadius:4,
          boxShadow:"inset 0 1px 3px rgba(0,0,0,0.8)",
        }}/>
      </div>

    </div> {/* end cabinet */}
    </div>
  );
}
