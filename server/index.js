const express    = require("express");
const cors       = require("cors");
const { Server } = require("colyseus");
const { WebSocketTransport } = require("colyseus");
const { createServer } = require("http");

const { ArcadeRoom } = require("./rooms/ArcadeRoom");

// ─── App setup ───────────────────────────────────────────────
const app  = express();
const port = process.env.PORT || 2567;

app.use(cors({
  origin: [
    "https://overtimejournal.com",
    "https://www.overtimejournal.com",
    /\.vercel\.app$/,          // preview deploys
    "http://localhost:5173",   // local dev
    "http://localhost:3000",
  ],
  credentials: true,
}));

app.use(express.json());

// Health check — Railway uses this to confirm the service is alive
app.get("/health", (req, res) => {
  res.json({ status: "ok", server: "OTJ Arcade", ts: Date.now() });
});

// ─── Colyseus ────────────────────────────────────────────────
const httpServer = createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// Register game rooms
// Each game type gets its own room name — easy to add more later
gameServer.define("nba_jam",        ArcadeRoom).filterBy(["gameType"]);
gameServer.define("hr_derby",       ArcadeRoom).filterBy(["gameType"]);
gameServer.define("hockey_shootout",ArcadeRoom).filterBy(["gameType"]);
gameServer.define("football",       ArcadeRoom).filterBy(["gameType"]);

// ─── Start ───────────────────────────────────────────────────
gameServer.listen(port).then(() => {
  console.log(`🎮 OTJ Arcade server running on port ${port}`);
});
