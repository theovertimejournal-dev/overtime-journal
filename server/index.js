const http    = require("http");
const express = require("express");
const cors    = require("cors");
const { Server } = require("colyseus");
const { ArcadeRoom } = require("./rooms/ArcadeRoom");
const { PokerRoom }  = require("./rooms/PokerRoom");
const { BlackjackRoom } = require('./rooms/BlackjackRoom');
gameServer.define('blackjack', BlackjackRoom).filterBy(['tier']);
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
  res.json({ status: "ok", server: "OTJ Arcade + Poker v3", colyseus: "0.16", ts: Date.now() });
});

const httpServer = http.createServer(app);
const gameServer = new Server({ server: httpServer });

gameServer.define("nba_jam",         ArcadeRoom).filterBy(["gameType"]);
gameServer.define("hr_derby",        ArcadeRoom).filterBy(["gameType"]);
gameServer.define("hockey_shootout", ArcadeRoom).filterBy(["gameType"]);
gameServer.define("football",        ArcadeRoom).filterBy(["gameType"]);
gameServer.define("poker", PokerRoom).filterBy(["tier"]);

httpServer.listen(port, () => {
  console.log(`🎮 OTJ Arcade server v2 (Colyseus 0.16) running on port ${port}`);
});
