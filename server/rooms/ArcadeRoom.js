const { Room } = require("colyseus");

class ArcadeRoom extends Room {

  onCreate(options) {
    this.gameType    = options.gameType || "nba_jam";
    this.maxClients  = 2;
    this.autoDispose = false; // Keep room alive for reconnection
    this.setSeatReservationTime(30); // 30s reconnection window

    this.setState({
      gameType:  this.gameType,
      status:    "waiting",
      players:   {},
      scores:    { p1: 0, p2: 0 },
      round:     1,
      maxRounds: this.getMaxRounds(this.gameType),
      winner:    null,
      startedAt: null,
    });

    console.log(`[${this.gameType}] Room created: ${this.roomId}`);

    // ── Message handlers ──────────────────────────────────────

    this.onMessage("ready", (client, data) => {
      const player = this.state.players[client.sessionId];
      if (!player) return;
      player.ready = true;
      console.log(`[${this.gameType}] ${player.username} is ready`);

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

    // ── P1-authoritative: P1 sends full game state → relay to P2 ──
    this.onMessage("game_state", (client, data) => {
      const player = this.state.players[client.sessionId];
      if (!player || player.slot !== "p1") return; // Only P1 can send state
      // Relay to P2 only
      this.clients.forEach(c => {
        if (c.sessionId !== client.sessionId) {
          c.send("game_state", data);
        }
      });
    });

    // ── P2 sends inputs → relay to P1 ──
    this.onMessage("p2_input", (client, data) => {
      const player = this.state.players[client.sessionId];
      if (!player || player.slot !== "p2") return; // Only P2 can send inputs
      // Relay to P1 only
      this.clients.forEach(c => {
        if (c.sessionId !== client.sessionId) {
          c.send("p2_input", data);
        }
      });
    });

    // ── P1 sends score events for server-side tracking ──
    this.onMessage("score", (client, data) => {
      if (this.state.status !== "playing") return;
      const player = this.state.players[client.sessionId];
      if (!player || player.slot !== "p1") return; // Only P1 reports scores
      this.state.scores.p1 = data.scores?.p1 ?? this.state.scores.p1;
      this.state.scores.p2 = data.scores?.p2 ?? this.state.scores.p2;
    });

    this.onMessage("round_over", (client, data) => {
      if (this.state.status !== "playing") return;
      const player = this.state.players[client.sessionId];
      if (!player || player.slot !== "p1") return; // Only P1 controls rounds
      this.state.round += 1;
      if (this.state.round > this.state.maxRounds) {
        this.endGame();
      } else {
        this.broadcast("next_round", { round: this.state.round, scores: this.state.scores });
      }
    });

    // Keep legacy action relay for non-game-state messages (taunts, skins, etc.)
    this.onMessage("action", (client, data) => {
      if (this.state.status !== "playing") return;
      this.clients.forEach(c => {
        if (c.sessionId !== client.sessionId) {
          c.send("opponent_action", {
            ...data,
            from: this.state.players[client.sessionId]?.slot,
          });
        }
      });
    });

    this.onMessage("set_skin", (client, data) => {
      const player = this.state.players[client.sessionId];
      if (player) {
        player.skin = data.skin || "default";
        this.broadcast("skin_update", { slot: player.slot, skin: player.skin });
      }
    });

    this.onMessage("rematch", (client, data) => {
      const player = this.state.players[client.sessionId];
      if (!player) return;
      player.rematch = true;

      const players = Object.values(this.state.players);
      if (players.length === 2 && players.every(p => p.rematch)) {
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
        this.clients.forEach(c => {
          if (c.sessionId !== client.sessionId) {
            c.send("rematch_requested", { from: player.slot });
          }
        });
      }
    });

    this.onMessage("taunt", (client, data) => {
      const player = this.state.players[client.sessionId];
      if (!player) return;
      this.broadcast("taunt", { from: player.slot, message: data.message || "🔥" });
    });
  }

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

    console.log(`[${this.gameType}] ${this.state.players[client.sessionId].username} joined as ${slot} (room: ${this.roomId})`);

    client.send("joined", {
      slot,
      roomId:   this.roomId,
      gameType: this.gameType,
      players:  this.state.players,
      status:   this.state.status,
    });

    this.clients.forEach(c => {
      if (c.sessionId !== client.sessionId) {
        c.send("opponent_joined", {
          slot,
          username: this.state.players[client.sessionId].username,
        });
      }
    });

    if (Object.keys(this.state.players).length === 2) {
      this.broadcast("both_connected", { players: this.state.players });
    }
  }

  async onLeave(client, consented) {
    const player = this.state.players[client.sessionId];
    if (!player) return;

    console.log(`[${this.gameType}] ${player.username} left (consented: ${consented})`);

    if (consented) {
      // Intentional leave — end game immediately
      if (this.state.status === "playing") {
        const winnerSlot = player.slot === "p1" ? "p2" : "p1";
        this.state.status = "finished";
        this.state.winner = winnerSlot;
        this.broadcast("game_over", {
          winner: winnerSlot,
          scores: this.state.scores,
          reason: "opponent_disconnected",
        });
      }
      this.broadcast("opponent_left", { slot: player.slot, username: player.username });
      delete this.state.players[client.sessionId];
    } else {
      // Accidental disconnect — pause game and allow 30s reconnection
      this.broadcast("opponent_disconnected", {
        slot: player.slot,
        username: player.username,
        reconnectWindow: 30,
      });

      try {
        await this.allowReconnection(client, 30);
        // Reconnected successfully
        console.log(`[${this.gameType}] ${player.username} reconnected`);
        this.broadcast("opponent_reconnected", { slot: player.slot, username: player.username });
      } catch (e) {
        // Reconnection window expired
        console.log(`[${this.gameType}] ${player.username} failed to reconnect`);
        if (this.state.status === "playing") {
          const winnerSlot = player.slot === "p1" ? "p2" : "p1";
          this.state.status = "finished";
          this.state.winner = winnerSlot;
          this.broadcast("game_over", {
            winner: winnerSlot,
            scores: this.state.scores,
            reason: "opponent_disconnected",
          });
        }
        this.broadcast("opponent_left", { slot: player.slot, username: player.username });
        delete this.state.players[client.sessionId];
      }
    }
  }

  onDispose() {
    console.log(`[${this.gameType}] Room disposed: ${this.roomId}`);
  }

  endGame() {
    this.state.status = "finished";
    const p1 = this.state.scores.p1;
    const p2 = this.state.scores.p2;
    if (p1 > p2)      this.state.winner = "p1";
    else if (p2 > p1) this.state.winner = "p2";
    else               this.state.winner = "tie";

    this.broadcast("game_over", {
      winner: this.state.winner,
      scores: this.state.scores,
      reason: "completed",
    });
    console.log(`[${this.gameType}] Game over — Winner: ${this.state.winner} | P1 ${p1} P2 ${p2}`);
  }

  getMaxRounds(gameType) {
    return { nba_jam: 4, hr_derby: 3, hockey_shootout: 5, football: 2 }[gameType] || 3;
  }
}

module.exports = { ArcadeRoom };
