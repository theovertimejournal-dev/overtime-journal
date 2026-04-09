const http    = require("http");
const express = require("express");
const { Server } = require("colyseus");
const { ArcadeRoom }    = require("./rooms/ArcadeRoom");
const { PokerRoom }     = require("./rooms/PokerRoom");
const { BlackjackRoom } = require("./rooms/BlackjackRoom");

const app  = express();
const port = process.env.PORT || 2567;

const ALLOWED_ORIGINS = [
  "https://overtimejournal.com",
  "https://www.overtimejournal.com",
  "http://localhost:5173",
  "http://localhost:3000",
];

function isAllowed(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (origin.endsWith(".vercel.app")) return true;
  return false;
}

// Raw Node HTTP server with CORS injected before Colyseus sees the request
const httpServer = http.createServer((req, res) => {
  const origin = req.headers.origin;
  if (isAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");
  }

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Pass to Express
  app(req, res);
});

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", server: "OTJ Casino v4", colyseus: "0.16", ts: Date.now() });
});

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
