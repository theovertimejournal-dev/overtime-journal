const http    = require("http");
const express = require("express");
const cors    = require("cors");
const { Server } = require("colyseus");
const { ArcadeRoom }    = require("./rooms/ArcadeRoom");
const { PokerRoom }     = require("./rooms/PokerRoom");
const { BlackjackRoom } = require("./rooms/BlackjackRoom");

const app  = express();
const port = process.env.PORT || 2567;

app.use(cors({
  origin: [
    "https://overtimejournal.com",
    "https://www.overtimejournal.com",
    /\.vercel\.app$/,
    "http://localhost:5173",
    "http://localhost:3000",
  ],
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

httpServer.listen(port, async () => {
  console.log(`🎮 OTJ Casino (Colyseus 0.16) running on port ${port}`);

  // ── Seed persistent rooms so there's always a live table ──
  // One BJ room per tier + one poker room per tier — always open, never close
  try {
    await gameServer.createRoom("blackjack", { tier: "low",  persistent: true });
    await gameServer.createRoom("blackjack", { tier: "mid",  persistent: true });
    await gameServer.createRoom("blackjack", { tier: "high", persistent: true });
    await gameServer.createRoom("poker",     { tier: "rookie",      persistent: true });
    await gameServer.createRoom("poker",     { tier: "regular",     persistent: true });
    await gameServer.createRoom("poker",     { tier: "high_roller", persistent: true });
    console.log("✅ Persistent rooms seeded");
  } catch (err) {
    console.error("⚠️  Room seeding error:", err.message);
  }
});
