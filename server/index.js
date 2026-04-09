const http    = require("http");
const express = require("express");
const cors    = require("cors");
const { Server } = require("colyseus");
const { ArcadeRoom }    = require("./rooms/ArcadeRoom");
const { PokerRoom }     = require("./rooms/PokerRoom");
const { BlackjackRoom } = require("./rooms/BlackjackRoom");

const app  = express();
const port = process.env.PORT || 2567;

const ALLOWED_ORIGINS = [
  "https://overtimejournal.com",
  "https://www.overtimejournal.com",
];

// Apply CORS to ALL requests including Colyseus matchmake routes
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = ALLOWED_ORIGINS.includes(origin) ||
    (origin && origin.endsWith(".vercel.app")) ||
    origin === "http://localhost:5173" ||
    origin === "http://localhost:3000";

  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const ok = ALLOWED_ORIGINS.includes(origin) ||
      origin.endsWith(".vercel.app") ||
      origin === "http://localhost:5173" ||
      origin === "http://localhost:3000";
    cb(null, ok ? origin : false);
  },
  credentials: true,
}));

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", server: "OTJ Casino v4", colyseus: "0.16", ts: Date.now() });
});

const httpServer = http.createServer(app);
const gameServer = new Server({ server: httpServer });

gameServer.define("nba_jam",         ArcadeRoom).filterBy(["gameType"]);
gameServer.define("hr_derby",        ArcadeRoom).filterBy(["gameType"]);
gameServer.define("hockey_shootout", ArcadeRoom).filterBy(["gameType"]);
gameServer.define("football",        ArcadeRoom).filterBy(["gameType"]);
gameServer.define("poker",           PokerRoom).filterBy(["tier"]);
gameServer.define("blackjack",       BlackjackRoom).filterBy(["tier"]);

httpServer.listen(port, () => {
  console.log(`🎮 OTJ Casino (Colyseus 0.16) running on port ${port}`);
});
