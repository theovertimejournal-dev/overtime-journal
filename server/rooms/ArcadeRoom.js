const { Room } = require("colyseus");

// ─── ArcadeRoom ───────────────────────────────────────────────────────────────
// Handles multiplayer sessions for all OTJ arcade games:
//   nba_jam | hr_derby | hockey_shootout | football
//
// Room lifecycle:
//   onCreate  → room created, game state initialized
//   onJoin    → player connects, assigned slot (p1 / p2)
//   onMessage → game events (input, score, ready, rematch)
//   onLeave   → player disconnects, notify opponent
//   onDispose → room cleaned up after all players leave
// ─────────────────────────────────────────────────────────────────────────────

class ArcadeRoom extends Room {

  onCreate(options) {
    this.gameType   = options.gameType || "nba_jam";
    this.maxClients = 2;
    this.autoDispose = true; // auto-cleanup when empty

    // Game state — shared across all game types
    this.state = {
      gameType:  this.gameType,
      status:    "waiting",   // waiting | ready | playing | finished
      players:   {},          // { sessionId: { slot, username, score, ready, skin } }
      scores:    { p1: 0, p2: 0 },
      round:     1,
      maxRounds: this.getMaxRounds(this.gameType),
      winner:    null,
      startedAt: null,
    };

    console.log(`[${this.gameType}] Room created: ${this.roomId}`);

    // ── Message handlers ──────────────────────────────────────

    // Player signals they're ready to start
    this.onMessage("ready", (client, data) => {
      const player = this.state.players[client.sessionId];
      if (!player) return;

      player.ready = true;
      console.log(`[${this.gameType}] ${player.username} is ready`);

      // Both players ready → start the game
      const players = Object.values(this.state.players);
      if (players.length === 2 && players.every(p => p.ready)) {
        this.state.status    = "playing";
        this.state.startedAt = Date.now();
        this.broadcast("game_start", {
          gameType:  this.gameType,
          maxRounds: this.state.maxRounds,
          players:   this.state.players,
        });
        console.log(`[${this.gameType}] Game started in room ${this.roomId}`);
      }
    });

    // Score update — sent by the client who scored
    this.onMessage("score", (client, data) => {
      if (this.state.status !== "playing") return;

      const player = this.state.players[client.sessionId];
      if (!player) return;

      const slot = player.slot; // "p1" or "p2"
      this.state.scores[slot] = (this.state.scores[slot] || 0) + (data.points || 1);

      // Broadcast score update to both players
      this.broadcast("score_update", {
        scores:    this.state.scores,
        scoredBy:  slot,
        points:    data.points || 1,
        popup:     data.popup || null,   // e.g. "BOOM SHAKALAKA 🔥"
        round:     this.state.round,
      });

      console.log(`[${this.gameType}] ${player.username} scored — P1:${this.state.scores.p1} P2:${this.state.scores.p2}`);
    });

    // Round over — advance to next round or end game
    this.onMessage("round_over", (client, data) => {
      if (this.state.status !== "playing") return;

      this.state.round += 1;

      if (this.state.round > this.state.maxRounds) {
        this.endGame();
      } else {
        this.broadcast("next_round", {
          round:  this.state.round,
          scores: this.state.scores,
        });
      }
    });

    // Game action — raw input relay (position, animation, etc.)
    // Keeps both clients in sync for visual state
    this.onMessage("action", (client, data) => {
      if (this.state.status !== "playing") return;

      // Relay to the OTHER player only (sender already has their own state)
      this.clients.forEach(c => {
        if (c.sessionId !== client.sessionId) {
          c.send("opponent_action", {
            ...data,
            from: this.state.players[client.sessionId]?.slot,
          });
        }
      });
    });

    // Skin selection
    this.onMessage("set_skin", (client, data) => {
      const player = this.state.players[client.sessionId];
      if (player) {
        player.skin = data.skin || "default";
        this.broadcast("skin_update", {
          slot: player.slot,
          skin: player.skin,
        });
      }
    });

    // Rematch request
    this.onMessage("rematch", (client, data) => {
      const player = this.state.players[client.sessionId];
      if (!player) return;

      player.rematch = true;

      const players = Object.values(this.state.players);
      if (players.length === 2 && players.every(p => p.rematch)) {
        // Reset state for rematch
        this.state.scores    = { p1: 0, p2: 0 };
        this.state.round     = 1;
        this.state.status    = "playing";
        this.state.winner    = null;
        this.state.startedAt = Date.now();
        players.forEach(p => { p.rematch = false; p.ready = true; });

        this.broadcast("rematch_start", {
          gameType:  this.gameType,
          maxRounds: this.state.maxRounds,
          players:   this.state.players,
        });
        console.log(`[${this.gameType}] Rematch started in room ${this.roomId}`);
      } else {
        // Notify opponent that this player wants a rematch
        this.clients.forEach(c => {
          if (c.sessionId !== client.sessionId) {
            c.send("rematch_requested", { from: player.slot });
          }
        });
      }
    });

    // Chat / taunts
    this.onMessage("taunt", (client, data) => {
      const player = this.state.players[client.sessionId];
      if (!player) return;
      this.broadcast("taunt", {
        from:    player.slot,
        message: data.message || "🔥",
      });
    });
  }

  // ── Player joins ────────────────────────────────────────────
  onJoin(client, options) {
    const existingSlots = Object.values(this.state.players).map(p => p.slot);
    const slot = existingSlots.includes("p1") ? "p2" : "p1";

    this.state.players[client.sessionId] = {
      slot,
      username: options.username || `Player ${slot === "p1" ? 1 : 2}`,
      score:    0,
      ready:    false,
      rematch:  false,
      skin:     options.skin || "default",
    };

    console.log(`[${this.gameType}] ${this.state.players[client.sessionId].username} joined as ${slot}`);

    // Tell the joining player their slot + current state
    client.send("joined", {
      slot,
      roomId:   this.roomId,
      gameType: this.gameType,
      players:  this.state.players,
      status:   this.state.status,
    });

    // Notify existing player that opponent joined
    this.clients.forEach(c => {
      if (c.sessionId !== client.sessionId) {
        c.send("opponent_joined", {
          slot,
          username: this.state.players[client.sessionId].username,
        });
      }
    });

    // If 2 players now in room, prompt both to ready up
    if (Object.keys(this.state.players).length === 2) {
      this.broadcast("both_connected", { players: this.state.players });
    }
  }

  // ── Player leaves ───────────────────────────────────────────
  onLeave(client, consented) {
    const player = this.state.players[client.sessionId];
    if (!player) return;

    console.log(`[${this.gameType}] ${player.username} left (consented: ${consented})`);

    // Notify opponent
    this.broadcast("opponent_left", {
      slot:     player.slot,
      username: player.username,
    });

    // If game was in progress, end it — opponent wins by default
    if (this.state.status === "playing") {
      const winnerSlot = player.slot === "p1" ? "p2" : "p1";
      this.state.status = "finished";
      this.state.winner = winnerSlot;
      this.broadcast("game_over", {
        winner:    winnerSlot,
        scores:    this.state.scores,
        reason:    "opponent_disconnected",
      });
    }

    delete this.state.players[client.sessionId];
  }

  // ── Cleanup ─────────────────────────────────────────────────
  onDispose() {
    console.log(`[${this.gameType}] Room disposed: ${this.roomId}`);
  }

  // ── Helpers ──────────────────────────────────────────────────
  endGame() {
    this.state.status = "finished";

    const p1 = this.state.scores.p1;
    const p2 = this.state.scores.p2;

    if (p1 > p2)       this.state.winner = "p1";
    else if (p2 > p1)  this.state.winner = "p2";
    else               this.state.winner = "tie";

    this.broadcast("game_over", {
      winner: this.state.winner,
      scores: this.state.scores,
      reason: "completed",
    });

    console.log(`[${this.gameType}] Game over — Winner: ${this.state.winner} | Scores: P1 ${p1} P2 ${p2}`);
  }

  getMaxRounds(gameType) {
    const rounds = {
      nba_jam:         4,   // 4 quarters
      hr_derby:        3,   // 3 rounds of swings
      hockey_shootout: 5,   // best of 5 shots
      football:        2,   // 2 drives each
    };
    return rounds[gameType] || 3;
  }
}

module.exports = { ArcadeRoom };
