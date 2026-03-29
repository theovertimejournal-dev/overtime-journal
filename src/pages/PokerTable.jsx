/**
 * PokerRoom.js — Colyseus Texas Hold'em Room
 * 
 * Server-authoritative. Client never sees other players' hole cards.
 * Full game loop: blinds → deal → preflop → flop → turn → river → showdown
 */

const { Room } = require("colyseus");
const { evaluateBest, determineWinners, createDeck, shuffleDeck, handToString } = require("./pokerEval");
const { createClient } = require("@supabase/supabase-js");

// Supabase server-side client (use service role key for server operations)
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Tier configs
const TIERS = {
    rookie:      { blinds: [5, 10],    minBuy: 200,   maxBuy: 1000  },
    regular:     { blinds: [25, 50],   minBuy: 1000,  maxBuy: 5000  },
    high_roller: { blinds: [100, 200], minBuy: 5000,  maxBuy: 10000 },
};

const MAX_SEATS = 6;
const TURN_TIME = 30; // seconds
const RAKE_PCT = 0.05;
const RAKE_CAP = 250;
const DISCONNECT_RESERVE = 60000; // 60 seconds

// ── Poker Badges ─────────────────────────────────────────────────────────────
const POT_BADGES = [
    { id: "first_blood",  emoji: "🃏", name: "First Blood",  minPot: 1,      desc: "Win your first pot" },
    { id: "high_roller",  emoji: "💰", name: "High Roller",  minPot: 1000,   desc: "Win a pot ≥ $1,000" },
    { id: "big_stack",    emoji: "💎", name: "Big Stack",    minPot: 5000,   desc: "Win a pot ≥ $5,000" },
    { id: "table_boss",   emoji: "👑", name: "Table Boss",   minPot: 10000,  desc: "Win a pot ≥ $10,000" },
    { id: "whale",        emoji: "🔥", name: "Whale",        minPot: 50000,  desc: "Win a pot ≥ $50,000" },
    { id: "otj_legend",   emoji: "🐳", name: "OTJ Legend",   minPot: 100000, desc: "Win a pot ≥ $100,000" },
];

class PokerRoom extends Room {

    onCreate(options) {
        this.tier = options.tier || "regular";
        this.config = TIERS[this.tier] || TIERS.regular;
        this.tableName = options.tableName || "OTJ Table";
        this.isPrivate = options.isPrivate || false;
        this.roomCode = options.roomCode || this.generateRoomCode();

        // Make room discoverable and joinable
        this.maxClients = MAX_SEATS + 10; // seats + spectators
        this.setMetadata({
            tier: this.tier,
            roomCode: this.roomCode,
            tableName: this.tableName,
        });

        // Game state
        this.seats = new Array(MAX_SEATS).fill(null);
        this.spectators = new Map(); // sessionId -> { userId, username }
        this.deck = [];
        this.communityCards = [];
        this.pot = 0;
        this.sidePots = [];
        this.phase = "waiting"; // waiting/preflop/flop/turn/river/showdown
        this.dealerSeat = -1;
        this.currentTurn = -1;
        this.handNumber = 0;
        this.minRaise = this.config.blinds[1]; // big blind
        this.lastRaise = 0;
        this.turnTimer = null;
        this.chatLog = [];
        this.rakeCollected = 0;

        // Disconnect tracking
        this.disconnectTimers = new Map(); // sessionId -> timer

        // Message handlers
        this.onMessage("sit_down", (client, data) => this.handleSitDown(client, data));
        this.onMessage("stand_up", (client) => this.handleStandUp(client));
        this.onMessage("fold", (client) => this.handleAction(client, "fold"));
        this.onMessage("check", (client) => this.handleAction(client, "check"));
        this.onMessage("call", (client) => this.handleAction(client, "call"));
        this.onMessage("raise", (client, data) => this.handleAction(client, "raise", data.amount));
        this.onMessage("all_in", (client) => this.handleAction(client, "all_in"));
        this.onMessage("chat", (client, data) => this.handleChat(client, data));
        this.onMessage("add_chips", (client, data) => this.handleAddChips(client, data));

        console.log(`🃏 PokerRoom created: ${this.tableName} (${this.tier}) — code: ${this.roomCode}`);
    }

    generateRoomCode() {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let code = "";
        for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
        return code;
    }

    resetIdleTimer() {
        if (this.idleTimer) clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => {
            const hasPlayers = this.seats.some(s => s !== null);
            const hasClients = this.clients.length > 0;
            if (!hasPlayers && !hasClients) {
                console.log(`🃏 PokerRoom idle timeout: ${this.tableName}`);
                this.disconnect();
            }
        }, 5 * 60 * 1000); // 5 minutes
    }

    // ── Player Join/Leave ───────────────────────────────────────────────────

    onJoin(client, options) {
        console.log(`  → ${options.username || client.sessionId} joined ${this.tableName}`);
        // Cancel idle timer — someone is here
        // Notify chat
        setTimeout(() => this.systemMessage(`${options.username || "Player"} joined the table`), 100);
        if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null; }
        
        // Store user info on the client
        client.userData = {
            userId: options.userId || client.sessionId,
            username: options.username || "Player",
            avatar: options.avatar || { base: "rookie" },
        };

        // Add as spectator initially
        this.spectators.set(client.sessionId, {
            userId: client.userData.userId,
            username: client.userData.username,
        });

        // Send full game state
        client.send("game_state", this.getGameState(client));

        // Broadcast updated spectator count
        this.broadcastTableInfo();
    }

    onLeave(client, consented) {
        const seat = this.findSeatBySession(client.sessionId);

        if (seat !== null) {
            if (consented) {
                // Clean leave — return chips
                this.playerStandUp(seat, client);
            } else {
                // Disconnect — start reserve timer
                this.seats[seat].status = "disconnected";
                this.broadcastState();

                // Auto-fold if it's their turn
                if (this.currentTurn === seat && this.phase !== "waiting" && this.phase !== "showdown") {
                    this.executeAction(seat, "fold");
                }

                // Reserve seat for 60 seconds
                const timer = setTimeout(() => {
                    if (this.seats[seat] && this.seats[seat].sessionId === client.sessionId) {
                        this.playerStandUp(seat);
                        this.disconnectTimers.delete(client.sessionId);
                    }
                }, DISCONNECT_RESERVE);

                this.disconnectTimers.set(client.sessionId, timer);
            }
        }

        this.spectators.delete(client.sessionId);
        this.broadcastTableInfo();

        // If only 1 or 0 seated players remain mid-hand, reset to waiting
        const seatedCount = this.seats.filter(s => s !== null).length;
        if (seatedCount < 2 && this.phase !== 'waiting') {
            this.clearTurnTimer();
            this.phase = 'waiting';
            this.communityCards = [];
            this.pot = 0;
            this.sidePots = [];
            // Return pot chips to remaining player if any
            const lastSeat = this.seats.findIndex(s => s !== null);
            if (lastSeat !== -1 && this.pot > 0) {
                this.seats[lastSeat].chips += this.pot;
                this.pot = 0;
            }
            this.broadcastState();
            this.systemMessage('Waiting for more players...');
        }

        // Restart idle timer if room is now empty
        const hasClients = this.clients.length > 1;
        if (!hasClients) this.resetIdleTimer();
    }

    // ── Sit Down / Stand Up ─────────────────────────────────────────────────

    async handleSitDown(client, { seatIndex, buyIn }) {
        if (seatIndex < 0 || seatIndex >= MAX_SEATS) return;
        if (this.seats[seatIndex] !== null) {
            client.send("error", { message: "Seat is taken" });
            return;
        }

        // Validate buy-in range
        if (buyIn < this.config.minBuy || buyIn > this.config.maxBuy) {
            client.send("error", { message: `Buy-in must be ${this.config.minBuy}-${this.config.maxBuy}` });
            return;
        }

        // Check if already seated
        if (this.findSeatBySession(client.sessionId) !== null) {
            client.send("error", { message: "Already seated" });
            return;
        }

        // Deduct buy-in from Supabase bankroll before seating
        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('bankroll')
                .eq('user_id', client.userData.userId)
                .single();

            if (!profile || profile.bankroll < buyIn) {
                client.send("error", { message: `Not enough OTJ Bucks (need ${buyIn}, have ${profile?.bankroll ?? 0})` });
                return;
            }

            const { error } = await supabase
                .from('profiles')
                .update({ bankroll: profile.bankroll - buyIn })
                .eq('user_id', client.userData.userId);

            if (error) throw error;

            try {
                await supabase.from('bucks_ledger').insert({
                    user_id: client.userData.userId,
                    type: 'poker_buyin',
                    amount: -buyIn,
                    balance_after: profile.bankroll - buyIn,
                    note: `Poker buy-in (${this.tier} table — ${this.tableName})`,
                });
            } catch (_) {}

        } catch (err) {
            console.error('Sit down Supabase error:', err);
            client.send("error", { message: "Failed to deduct bucks. Try again." });
            return;
        }

        this.seats[seatIndex] = {
            sessionId: client.sessionId,
            userId: client.userData.userId,
            username: client.userData.username,
            avatar: client.userData.avatar,
            chips: buyIn,
            holeCards: [],
            currentBet: 0,
            totalBetThisHand: 0,
            status: "sitting_out",
            lastAction: null,
            isDealer: false,
        };

        // Remove from spectators
        this.spectators.delete(client.sessionId);

        console.log(`  🪑 ${client.userData.username} sat at seat ${seatIndex} (${buyIn} chips deducted from bankroll)`);

        this.broadcast("player_joined", {
            seat: seatIndex,
            username: client.userData.username,
            avatar: client.userData.avatar,
            chips: buyIn,
        });

        this.broadcastState();
        this.tryStartNewHand();
    }

    handleStandUp(client) {
        const seat = this.findSeatBySession(client.sessionId);
        if (seat === null) return;
        this.playerStandUp(seat, client);
    }

    playerStandUp(seat, client = null) {
        const player = this.seats[seat];
        if (!player) return;

        const chips = player.chips;
        const username = player.username;

        // If in a hand and not folded, fold first
        if (this.phase !== "waiting" && player.status === "active") {
            this.executeAction(seat, "fold");
        }

        // Return chips to bankroll via Supabase
        this.returnChipsToBank(player.userId, chips, player.username);

        this.seats[seat] = null;

        console.log(`  🚶 ${username} left seat ${seat} (${chips} chips returned)`);
        this.systemMessage(`${username} left the table`);

        this.broadcast("player_left", { seat, username, chipsReturned: chips });

        // Add back as spectator if client still connected
        if (client) {
            this.spectators.set(client.sessionId, {
                userId: player.userId,
                username,
            });
        }

        this.broadcastTableInfo();
    }

    // ── Hand Flow ───────────────────────────────────────────────────────────

    tryStartNewHand() {
        if (this.phase !== "waiting") return;

        // Count players with chips who can play
        const activePlayers = this.seats.filter(s => s && s.chips > 0);
        if (activePlayers.length < 2) return;

        this.startNewHand();
    }

    startNewHand() {
        this.handNumber++;
        this.communityCards = [];
        this.pot = 0;
        this.sidePots = [];
        this.minRaise = this.config.blinds[1];
        this.lastRaise = this.config.blinds[1];

        // Reset all seated players
        for (let i = 0; i < MAX_SEATS; i++) {
            if (this.seats[i]) {
                if (this.seats[i].chips > 0) {
                    this.seats[i].status = "active";
                } else {
                    this.seats[i].status = "sitting_out";
                }
                this.seats[i].holeCards = [];
                this.seats[i].currentBet = 0;
                this.seats[i].totalBetThisHand = 0;
                this.seats[i].lastAction = null;
                this.seats[i].isDealer = false;
            }
        }

        // Move dealer button
        this.dealerSeat = this.nextActiveSeat(this.dealerSeat);
        this.seats[this.dealerSeat].isDealer = true;

        // Shuffle deck
        this.deck = shuffleDeck(createDeck());

        // Post blinds
        const sbSeat = this.nextActiveSeat(this.dealerSeat);
        const bbSeat = this.nextActiveSeat(sbSeat);
        const [sb, bb] = this.config.blinds;

        this.postBlind(sbSeat, sb);
        this.postBlind(bbSeat, bb);

        // Deal hole cards
        const activePlayers = this.getActivePlayers();
        for (const seat of activePlayers) {
            this.seats[seat].holeCards = [this.deck.pop(), this.deck.pop()];
        }

        // Send hole cards privately to each player
        for (const seat of activePlayers) {
            const client = this.findClientBySeat(seat);
            if (client) {
                client.send("hole_cards", { cards: this.seats[seat].holeCards });
            }
        }

        this.phase = "preflop";

        // Action starts left of big blind (or SB in heads-up)
        if (activePlayers.length === 2) {
            this.currentTurn = sbSeat; // heads-up: SB acts first preflop
        } else {
            this.currentTurn = this.nextActiveSeat(bbSeat);
        }

        this.broadcast("new_hand", {
            handNumber: this.handNumber,
            dealerSeat: this.dealerSeat,
            sbSeat,
            bbSeat,
            blinds: this.config.blinds,
        });

        this.broadcastState();
        this.startTurnTimer();
    }

    postBlind(seat, amount) {
        const player = this.seats[seat];
        const actual = Math.min(amount, player.chips);
        player.chips -= actual;
        player.currentBet = actual;
        player.totalBetThisHand = actual;
        this.pot += actual;
    }

    // ── Actions ─────────────────────────────────────────────────────────────

    handleAction(client, action, amount = 0) {
        const seat = this.findSeatBySession(client.sessionId);
        if (seat === null || seat !== this.currentTurn) {
            client.send("error", { message: "Not your turn" });
            return;
        }
        if (this.phase === "waiting" || this.phase === "showdown") return;

        this.executeAction(seat, action, amount);
    }

    executeAction(seat, action, amount = 0) {
        const player = this.seats[seat];
        if (!player || player.status !== "active") return;

        this.clearTurnTimer();

        const highestBet = this.getHighestBet();
        const toCall = highestBet - player.currentBet;

        switch (action) {
            case "fold":
                player.status = "folded";
                player.lastAction = "fold";
                break;

            case "check":
                if (toCall > 0) return; // can't check if there's a bet
                player.lastAction = "check";
                break;

            case "call":
                const callAmount = Math.min(toCall, player.chips);
                player.chips -= callAmount;
                player.currentBet += callAmount;
                player.totalBetThisHand += callAmount;
                this.pot += callAmount;
                player.lastAction = "call";
                if (player.chips === 0) player.status = "allin";
                break;

            case "raise":
                if (amount < this.minRaise + highestBet && amount < player.chips + player.currentBet) {
                    return; // raise too small
                }
                const raiseTotal = Math.min(amount, player.chips + player.currentBet);
                const raiseCost = raiseTotal - player.currentBet;
                player.chips -= raiseCost;
                this.pot += raiseCost;
                this.lastRaise = raiseTotal - highestBet;
                this.minRaise = this.lastRaise;
                player.currentBet = raiseTotal;
                player.totalBetThisHand += raiseCost;
                player.lastAction = "raise";
                if (player.chips === 0) player.status = "allin";
                break;

            case "all_in":
                const allInAmount = player.chips;
                player.chips = 0;
                player.currentBet += allInAmount;
                player.totalBetThisHand += allInAmount;
                this.pot += allInAmount;
                player.status = "allin";
                player.lastAction = "all_in";
                if (player.currentBet > highestBet) {
                    this.lastRaise = player.currentBet - highestBet;
                    this.minRaise = Math.max(this.minRaise, this.lastRaise);
                }
                break;
        }

        this.broadcast("player_action", {
            seat,
            action: player.lastAction,
            amount: player.currentBet,
            chips: player.chips,
            pot: this.pot,
        });

        // Check if hand is over (everyone folded except one)
        const remaining = this.getActivePlayers().filter(s => 
            this.seats[s].status === "active" || this.seats[s].status === "allin"
        );
        
        if (remaining.length === 1) {
            this.awardPot(remaining[0]);
            return;
        }

        // Check if betting round is complete
        if (this.isBettingRoundComplete()) {
            this.advancePhase();
        } else {
            const next = this.nextActiveSeatForBetting(seat);
            if (next === -1) {
                this.advancePhase();
            } else {
                this.currentTurn = next;
                this.broadcastState();
                this.startTurnTimer();
            }
        }
    }

    isBettingRoundComplete() {
        const highestBet = this.getHighestBet();
        const activePlayers = this.getActivePlayers().filter(s => this.seats[s].status === "active");

        // All active (non-allin) players must have matched the highest bet and acted
        for (const seat of activePlayers) {
            const p = this.seats[seat];
            if (p.currentBet < highestBet && p.chips > 0) return false;
            if (p.lastAction === null) return false;
        }
        return true;
    }

    advancePhase() {
        // Reset bets for new round
        for (let i = 0; i < MAX_SEATS; i++) {
            if (this.seats[i]) {
                this.seats[i].currentBet = 0;
                this.seats[i].lastAction = null;
            }
        }
        this.minRaise = this.config.blinds[1];

        // Check if only one non-allin player left (rest are allin)
        const canAct = this.getActivePlayers().filter(s => this.seats[s].status === "active");
        const allIn = this.getActivePlayers().filter(s => this.seats[s].status === "allin");

        if (canAct.length <= 1) {
            // Run out remaining community cards
            while (this.communityCards.length < 5) {
                this.deck.pop(); // burn
                this.communityCards.push(this.deck.pop());
            }
            this.broadcast("community_cards", { cards: this.communityCards, phase: "runout" });
            this.showdown();
            return;
        }

        switch (this.phase) {
            case "preflop":
                this.phase = "flop";
                this.deck.pop(); // burn
                this.communityCards.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
                this.broadcast("flop", { cards: this.communityCards.slice(0, 3) });
                break;
            case "flop":
                this.phase = "turn";
                this.deck.pop(); // burn
                this.communityCards.push(this.deck.pop());
                this.broadcast("turn", { card: this.communityCards[3] });
                break;
            case "turn":
                this.phase = "river";
                this.deck.pop(); // burn
                this.communityCards.push(this.deck.pop());
                this.broadcast("river", { card: this.communityCards[4] });
                break;
            case "river":
                this.showdown();
                return;
        }

        // First to act after flop = first active player left of dealer
        const nextSeat = this.nextActiveSeatForBetting(this.dealerSeat);
        if (nextSeat === -1) {
            // No one can act — run to showdown
            while (this.communityCards.length < 5) {
                this.deck.pop();
                const c = this.deck.pop();
                if (c) this.communityCards.push(c);
            }
            this.broadcast("community_cards", { cards: this.communityCards, phase: "runout" });
            this.showdown();
            return;
        }
        this.currentTurn = nextSeat;
        this.broadcastState();
        this.startTurnTimer();
    }

    // ── Showdown ────────────────────────────────────────────────────────────

    showdown() {
        this.phase = "showdown";
        this.clearTurnTimer();

        const inHand = this.getActivePlayers().filter(s =>
            this.seats[s].status === "active" || this.seats[s].status === "allin"
        );

        // Calculate side pots
        const pots = this.calculateSidePots(inHand);

        const results = [];

        for (const pot of pots) {
            const eligible = pot.eligible.map(seat => ({
                seatIndex: seat,
                holeCards: this.seats[seat].holeCards,
            }));

            const winners = determineWinners(eligible, this.communityCards);
            const winnerSeats = winners.filter(w => w.isWinner);
            const share = Math.floor(pot.amount / winnerSeats.length);

            for (const w of winnerSeats) {
                this.seats[w.seatIndex].chips += share;
                results.push({
                    seat: w.seatIndex,
                    username: this.seats[w.seatIndex].username,
                    holeCards: this.seats[w.seatIndex].holeCards,
                    handName: w.hand.name,
                    handCards: w.hand.cards,
                    chipsWon: share,
                });
            }
        }

        // Apply rake
        const totalPot = pots.reduce((sum, p) => sum + p.amount, 0);
        const rake = Math.min(Math.floor(totalPot * RAKE_PCT), RAKE_CAP);
        this.rakeCollected += rake;

        // Deduct rake from winner(s)
        if (results.length > 0 && rake > 0) {
            const rakePerWinner = Math.floor(rake / results.length);
            for (const r of results) {
                this.seats[r.seat].chips -= rakePerWinner;
                r.chipsWon -= rakePerWinner;
            }
        }

        // Broadcast showdown results (reveal hole cards)
        this.broadcast("showdown", {
            results,
            communityCards: this.communityCards,
            pot: totalPot,
            rake,
        });

        // Log hand + update stats/badges for all players
        console.log(`  🃏 Hand #${this.handNumber} — pot: ${totalPot}, rake: ${rake}, winner(s): ${results.map(r => r.username).join(', ')}`);

        // Winners — update stats and check badges
        for (const r of results) {
            const player = this.seats[r.seat];
            if (player) {
                this.updatePokerStats(player.userId, player.username, r.chipsWon, totalPot, false);
            }
        }
        // Losers — just increment hands_played
        const winnerSeatsSet = new Set(results.map(r => r.seat));
        for (let i = 0; i < MAX_SEATS; i++) {
            if (this.seats[i] && !winnerSeatsSet.has(i) &&
                (this.seats[i].status === "active" || this.seats[i].status === "allin" || this.seats[i].status === "folded")) {
                this.updateHandsPlayed(this.seats[i].userId);
            }
        }

        // Start next hand after delay
        setTimeout(() => {
            this.phase = "waiting";

            // Remove players with 0 chips
            for (let i = 0; i < MAX_SEATS; i++) {
                if (this.seats[i] && this.seats[i].chips <= 0) {
                    this.broadcast("player_busted", {
                        seat: i,
                        username: this.seats[i].username,
                    });
                    // Keep them seated but sitting_out — they can add chips
                    this.seats[i].status = "sitting_out";
                }
            }

            this.tryStartNewHand();
        }, 4000); // 4 second pause between hands
    }

    calculateSidePots(inHand) {
        // Get all-in amounts sorted
        const bets = inHand.map(seat => ({
            seat,
            totalBet: this.seats[seat].totalBetThisHand,
        })).sort((a, b) => a.totalBet - b.totalBet);

        const pots = [];
        let previousBet = 0;

        for (let i = 0; i < bets.length; i++) {
            const currentBet = bets[i].totalBet;
            if (currentBet <= previousBet) continue;

            const increment = currentBet - previousBet;
            // Everyone who bet at least this much contributes
            const eligible = bets.filter(b => b.totalBet >= currentBet).map(b => b.seat);
            // Count all players who contributed to this level (including folded)
            let potAmount = 0;
            for (let s = 0; s < MAX_SEATS; s++) {
                if (this.seats[s]) {
                    const contributed = Math.min(this.seats[s].totalBetThisHand - previousBet, increment);
                    if (contributed > 0) potAmount += contributed;
                }
            }

            if (potAmount > 0) {
                pots.push({ amount: potAmount, eligible });
            }
            previousBet = currentBet;
        }

        // If no side pots, just use main pot
        if (pots.length === 0) {
            pots.push({ amount: this.pot, eligible: inHand });
        }

        return pots;
    }

    awardPot(winningSeat) {
        const player = this.seats[winningSeat];
        const rake = Math.min(Math.floor(this.pot * RAKE_PCT), RAKE_CAP);
        const winnings = this.pot - rake;
        player.chips += winnings;
        this.rakeCollected += rake;

        this.broadcast("pot_awarded", {
            seat: winningSeat,
            username: player.username,
            amount: winnings,
            rake,
            reason: "everyone_folded",
        });

        console.log(`  🃏 Hand #${this.handNumber} — ${player.username} wins ${winnings} (all folded), rake: ${rake}`);
        this.systemMessage(`${player.username} wins $${winnings.toLocaleString()} — everyone folded`);

        // Update poker stats + badges (folded = true = bluff win)
        this.updatePokerStats(player.userId, player.username, winnings, this.pot, true);

        // Update hands_played for all other seated players
        for (let i = 0; i < MAX_SEATS; i++) {
            if (this.seats[i] && this.seats[i].userId !== player.userId) {
                this.updateHandsPlayed(this.seats[i].userId);
            }
        }

        setTimeout(() => {
            this.phase = "waiting";
            this.tryStartNewHand();
        }, 2000);
    }

    // ── Turn Timer ──────────────────────────────────────────────────────────

    startTurnTimer() {
        this.clearTurnTimer();

        // Safety — if no valid turn, advance phase
        if (this.currentTurn === -1 || !this.seats[this.currentTurn]) {
            console.warn('startTurnTimer called with invalid seat, advancing phase');
            this.advancePhase();
            return;
        }

        let timeLeft = TURN_TIME;

        this.broadcast("turn_change", {
            seat: this.currentTurn,
            timeLimit: TURN_TIME,
        });

        this.turnTimer = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 5) {
                this.broadcast("timer_warning", { seat: this.currentTurn, secondsLeft: timeLeft });
            }
            if (timeLeft <= 0) {
                this.clearTurnTimer();
                // Auto-fold on timeout
                this.executeAction(this.currentTurn, "fold");
            }
        }, 1000);
    }

    clearTurnTimer() {
        if (this.turnTimer) {
            clearInterval(this.turnTimer);
            this.turnTimer = null;
        }
    }

    // ── Chat ────────────────────────────────────────────────────────────────

    handleChat(client, { message, type = "text" }) {
        if (!message || message.length > 200) return;
        
        const username = client.userData?.username || "Player";
        const chatMsg = {
            username,
            message: type === "emote" ? message : message.substring(0, 200),
            type,
            timestamp: Date.now(),
        };

        this.chatLog.push(chatMsg);
        if (this.chatLog.length > 50) this.chatLog.shift();

        this.broadcast("chat_message", chatMsg);
    }

    // ── Add Chips (between hands) ───────────────────────────────────────────

    async handleAddChips(client, { amount }) {
        const seat = this.findSeatBySession(client.sessionId);
        if (seat === null) return;
        
        const player = this.seats[seat];
        if (this.phase !== "waiting" && player.status !== "sitting_out") {
            client.send("error", { message: "Can only add chips between hands" });
            return;
        }

        if (player.chips + amount > this.config.maxBuy) {
            client.send("error", { message: `Max buy-in is ${this.config.maxBuy}` });
            return;
        }

        // Deduct from Supabase bankroll
        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('bankroll')
                .eq('user_id', player.userId)
                .single();

            if (!profile || profile.bankroll < amount) {
                client.send("error", { message: "Not enough OTJ Bucks" });
                return;
            }

            await supabase
                .from('profiles')
                .update({ bankroll: profile.bankroll - amount })
                .eq('user_id', player.userId);

            try {
                await supabase.from('bucks_ledger').insert({
                    user_id: player.userId,
                    type: 'poker_addon',
                    amount: -amount,
                    balance_after: profile.bankroll - amount,
                    note: `Poker add-on (${this.tier} table)`,
                });
            } catch (_) {}
        } catch (err) {
            console.error('Add chips Supabase error:', err);
            client.send("error", { message: "Failed to deduct bucks" });
            return;
        }

        player.chips += amount;
        
        this.broadcast("chips_added", { seat, amount, total: player.chips });
        
        // If they were sitting out with 0 chips, try starting
        if (player.status === "sitting_out" && player.chips > 0) {
            this.tryStartNewHand();
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    findSeatBySession(sessionId) {
        for (let i = 0; i < MAX_SEATS; i++) {
            if (this.seats[i] && this.seats[i].sessionId === sessionId) return i;
        }
        return null;
    }

    findClientBySeat(seat) {
        const player = this.seats[seat];
        if (!player) return null;
        for (const client of this.clients) {
            if (client.sessionId === player.sessionId) return client;
        }
        return null;
    }

    getActivePlayers() {
        // Returns seat indices of players who are in the current hand
        const seats = [];
        for (let i = 0; i < MAX_SEATS; i++) {
            if (this.seats[i] && (this.seats[i].status === "active" || this.seats[i].status === "allin")) {
                seats.push(i);
            }
        }
        return seats;
    }

    nextActiveSeat(fromSeat) {
        // Find next occupied seat with chips (clockwise)
        for (let i = 1; i <= MAX_SEATS; i++) {
            const seat = (fromSeat + i) % MAX_SEATS;
            if (this.seats[seat] && this.seats[seat].chips > 0 && this.seats[seat].status !== "sitting_out") {
                return seat;
            }
        }
        return fromSeat;
    }

    nextActiveSeatForBetting(fromSeat) {
        // Find next seat that can still act (not folded, not allin)
        for (let i = 1; i <= MAX_SEATS; i++) {
            const seat = (fromSeat + i) % MAX_SEATS;
            if (this.seats[seat] && this.seats[seat].status === "active") {
                return seat;
            }
        }
        return -1;
    }

    getHighestBet() {
        let max = 0;
        for (const s of this.seats) {
            if (s && s.currentBet > max) max = s.currentBet;
        }
        return max;
    }

    systemMessage(text) {
        const msg = { username: "🃏 OTJ", message: text, type: "system", timestamp: Date.now() };
        this.chatLog.push(msg);
        if (this.chatLog.length > 50) this.chatLog.shift();
        this.broadcast("chat_message", msg);
    }

        // ── State Broadcasting ──────────────────────────────────────────────────

    getGameState(forClient) {
        const mySeat = this.findSeatBySession(forClient.sessionId);

        return {
            tableName: this.tableName,
            tier: this.tier,
            blinds: this.config.blinds,
            roomCode: this.roomCode,
            phase: this.phase,
            pot: this.pot,
            communityCards: this.communityCards,
            dealerSeat: this.dealerSeat,
            currentTurn: this.currentTurn,
            handNumber: this.handNumber,
            minRaise: this.minRaise,
            seats: this.seats.map((s, i) => {
                if (!s) return null;
                return {
                    username: s.username,
                    avatar: s.avatar,
                    chips: s.chips,
                    currentBet: s.currentBet,
                    status: s.status,
                    lastAction: s.lastAction,
                    isDealer: s.isDealer,
                    // Only show hole cards to the player themselves
                    holeCards: i === mySeat ? s.holeCards : (this.phase === "showdown" && (s.status === "active" || s.status === "allin") ? s.holeCards : []),
                };
            }),
            spectatorCount: this.spectators.size,
            mySeat,
        };
    }

    broadcastState() {
        for (const client of this.clients) {
            client.send("game_state", this.getGameState(client));
        }
    }

    broadcastTableInfo() {
        this.broadcast("table_info", {
            tableName: this.tableName,
            tier: this.tier,
            playerCount: this.seats.filter(s => s !== null).length,
            spectatorCount: this.spectators.size,
            roomCode: this.roomCode,
        });
    }

    // ── Bankroll Integration ────────────────────────────────────────────────

    async returnChipsToBank(userId, chips, username) {
        if (!userId || chips <= 0) return;
        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('bankroll')
                .eq('user_id', userId)
                .single();

            if (profile) {
                const newBankroll = (profile.bankroll || 0) + chips;
                await supabase
                    .from('profiles')
                    .update({ bankroll: newBankroll })
                    .eq('user_id', userId);

                try {
                    await supabase.from('bucks_ledger').insert({
                        user_id: userId,
                        type: 'poker_cashout',
                        amount: chips,
                        balance_after: newBankroll,
                        note: `Poker cashout from ${this.tier} table`,
                    });
                } catch (_) {}

                console.log(`  💰 Returned ${chips} to ${username}'s bankroll (new: ${newBankroll})`);
            }
        } catch (err) {
            console.error(`  ❌ Failed to return ${chips} to ${username}:`, err.message);
        }
    }

    async updatePokerStats(userId, username, chipsWon, potSize, folded = false) {
        if (!userId || chipsWon <= 0) return;
        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('poker_stats, poker_badges')
                .eq('user_id', userId)
                .single();

            if (!profile) return;

            // Update poker stats
            const stats = profile.poker_stats || {};
            stats.hands_won      = (stats.hands_won      || 0) + 1;
            stats.hands_played   = (stats.hands_played   || 0) + 1;
            stats.total_won      = (stats.total_won      || 0) + chipsWon;
            stats.biggest_pot    = Math.max(stats.biggest_pot || 0, potSize);
            stats.bluffs_won     = folded ? (stats.bluffs_won || 0) + 1 : (stats.bluffs_won || 0);

            // Check for new badges
            const currentBadges = profile.poker_badges || [];
            const badgeIds = currentBadges.map(b => b.id);
            const newBadges = [];

            for (const badge of POT_BADGES) {
                if (!badgeIds.includes(badge.id) && potSize >= badge.minPot) {
                    newBadges.push({ ...badge, earned_at: new Date().toISOString() });
                    console.log(`  🏅 ${username} earned badge: ${badge.emoji} ${badge.name}`);
                }
            }

            // Bluff master badge — win 3 hands where everyone folded
            if (!badgeIds.includes("bluff_master") && (stats.bluffs_won || 0) >= 3) {
                newBadges.push({ id: "bluff_master", emoji: "🎯", name: "Bluff Master", desc: "Win 3 hands where everyone folded", earned_at: new Date().toISOString() });
            }

            const updatedBadges = [...currentBadges, ...newBadges];

            await supabase
                .from('profiles')
                .update({ poker_stats: stats, poker_badges: updatedBadges })
                .eq('user_id', userId);

            // Broadcast new badges to the table
            if (newBadges.length > 0) {
                this.broadcast("badge_earned", {
                    username,
                    badges: newBadges,
                });
            }

        } catch (err) {
            console.error('updatePokerStats error:', err.message);
        }
    }

    async updateHandsPlayed(userId) {
        // Called for losers — just increment hands_played
        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('poker_stats')
                .eq('user_id', userId)
                .single();
            if (!profile) return;
            const stats = profile.poker_stats || {};
            stats.hands_played = (stats.hands_played || 0) + 1;
            await supabase.from('profiles').update({ poker_stats: stats }).eq('user_id', userId);
        } catch (_) {}
    }

    onDispose() {
        this.clearTurnTimer();
        for (const timer of this.disconnectTimers.values()) {
            clearTimeout(timer);
        }
        // Return chips to all remaining seated players
        for (let i = 0; i < MAX_SEATS; i++) {
            if (this.seats[i] && this.seats[i].chips > 0) {
                this.returnChipsToBank(this.seats[i].userId, this.seats[i].chips, this.seats[i].username);
            }
        }
        console.log(`🃏 PokerRoom disposed: ${this.tableName}`);
    }
}

module.exports = { PokerRoom };
