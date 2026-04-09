/**
 * BlackjackRoom.js — OTJ Blackjack
 * Colyseus 0.16 | Up to 5 players vs dealer (house)
 * Vegas rules: dealer hits soft 17, BJ pays 3:2, double down, split
 * House bank: 2% rake on losses funds the economy
 */

const { Room } = require("colyseus");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Config ────────────────────────────────────────────────────────────────────

const TIERS = {
    low:  { minBet: 25,  maxBet: 250,  label: "Low Stakes"  },
    mid:  { minBet: 100, maxBet: 1000, label: "Mid Stakes"  },
    high: { minBet: 500, maxBet: 5000, label: "High Roller" },
};

const RAKE_PCT     = 0.02;
const BJ_PAYOUT    = 1.5;   // 3:2
const MAX_SEATS    = 5;
const TURN_TIME    = 30;
const NUM_DECKS     = 5;
const CUT_CARD_MIN  = 0.55;   // cut card no earlier than 55% through shoe
const CUT_CARD_MAX  = 0.75;   // cut card no later than 75% through shoe
const CUT_TIMER     = 15;     // seconds to cut before auto-cut

// ── Card utils ────────────────────────────────────────────────────────────────

const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const SUITS = ['h','d','c','s'];

function createShoe() {
    const shoe = [];
    for (let d = 0; d < NUM_DECKS; d++)
        for (const r of RANKS)
            for (const s of SUITS)
                shoe.push(r + s);
    return shoe;
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function cardVal(card) {
    const r = card[0];
    if (['T','J','Q','K'].includes(r)) return 10;
    if (r === 'A') return 11;
    return parseInt(r);
}

function handTotal(cards) {
    let total = 0, aces = 0;
    for (const c of cards) { total += cardVal(c); if (c[0] === 'A') aces++; }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
}

function isSoft17(cards) {
    let total = 0, aces = 0;
    for (const c of cards) { total += cardVal(c); if (c[0] === 'A') aces++; }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total === 17 && aces > 0;
}

function isBust(cards)      { return handTotal(cards) > 21; }
function isBlackjack(cards) { return cards.length === 2 && handTotal(cards) === 21; }
function canSplit(hand)     { return hand.cards.length === 2 && cardVal(hand.cards[0]) === cardVal(hand.cards[1]); }
function canDouble(hand)    { return hand.cards.length === 2; }

// ── Room ──────────────────────────────────────────────────────────────────────

class BlackjackRoom extends Room {

    onCreate(options) {
        this.maxClients  = MAX_SEATS;
        this.autoDispose = false;
        this.persistent  = options.persistent || false;

        this.tier      = options.tier || 'mid';
        this.config    = TIERS[this.tier] || TIERS.mid;
        this.tableName = `OTJ BJ — ${this.config.label}`;
        this.shoe         = shuffle(createShoe());
        this.cutCardPos   = this.getDefaultCutPos();
        this.roomCode     = this.persistent
            ? `OTJ-${this.tier.toUpperCase()}`  // persistent rooms have fixed codes
            : Math.random().toString(36).slice(2,6).toUpperCase();
        this.cutRequested = false;  // waiting for player to cut
        this.cutTimer     = null;
        this.cutRotation  = 0;      // which seat gets to cut next
        this.phase        = 'betting';
        this.seats        = new Array(MAX_SEATS).fill(null);
        this.dealerCards  = [];
        this.handNumber   = 0;
        this.betTimer     = null;
        this.turnTimer    = null;
        this.currentSeat  = -1;
        this.chatLog      = [];

        this.onMessage('sit_down',      (c, d) => this.handleSitDown(c, d));
        this.onMessage('stand_up',      (c)    => this.handleStandUp(c));
        this.onMessage('place_bet',     (c, d) => this.handlePlaceBet(c, d));
        this.onMessage('hit',           (c)    => this.handleHit(c));
        this.onMessage('stand',         (c)    => this.handleStand(c));
        this.onMessage('double_down',   (c, d) => this.handleDouble(c, d));
        this.onMessage('split',         (c)    => this.handleSplit(c));
        this.onMessage('chat',          (c, d) => this.handleChat(c, d));
        this.onMessage('emoji_reaction',(c, d) => this.handleEmoji(c, d));
        this.onMessage('cut_card',      (c, d) => this.handleCutCard(c, d));

        console.log(`[BJ] Room created — ${this.tableName}`);
    }

    onJoin(client, options) {
        client.userData = {
            userId:   options.userId   || client.sessionId,
            username: options.username || 'Player',
            avatar:   options.avatar   || {},
        };
        this.systemMsg(`${client.userData.username} joined the table`);
        this.broadcastState();
    }

    onLeave(client, consented) {
        const seat = this.findSeat(client.sessionId);
        if (seat !== -1) this.returnChips(seat, 'left table');
        this.systemMsg(`${client.userData.username} left the table`);
        this.broadcastState();
    }

    onDispose() {
        if (this.persistent) {
            console.log(`[BJ] Persistent room ${this.tier} tried to dispose — blocked`);
            return;
        }
        this.clearTimers();
        for (let i = 0; i < MAX_SEATS; i++) {
            if (this.seats[i]) this.returnChips(i, 'server shutdown');
        }
    }

    // ── Seats ─────────────────────────────────────────────────────────────────

    findSeat(sessionId) {
        return this.seats.findIndex(s => s?.sessionId === sessionId);
    }

    async handleSitDown(client, { seatIndex, buyIn }) {
        if (seatIndex < 0 || seatIndex >= MAX_SEATS) return;
        if (this.seats[seatIndex])                   { client.send('error', { message: 'Seat taken' }); return; }
        if (this.findSeat(client.sessionId) !== -1)  { client.send('error', { message: 'Already seated' }); return; }

        const minBuyIn = this.config.minBet * 5;
        if (buyIn < minBuyIn) {
            client.send('error', { message: `Min buy-in is ${minBuyIn.toLocaleString()} Bucks` });
            return;
        }

        // Load current bankroll — that becomes their chip stack at the table
        let startingChips = 0;
        try {
            const { data: profile } = await supabase
                .from('profiles').select('bankroll').eq('user_id', client.userData.userId).single();

            if (!profile || profile.bankroll < this.config.minBet * 5) {
                client.send('error', { message: 'Not enough OTJ Bucks to sit' });
                return;
            }
            // Their full bankroll IS their chip stack — no separate deduction
            startingChips = profile.bankroll;
        } catch (err) {
            client.send('error', { message: 'Failed to load balance. Try again.' });
            return;
        }

        this.seats[seatIndex] = {
            sessionId:        client.sessionId,
            userId:           client.userData.userId,
            username:         client.userData.username,
            avatar:           client.userData.avatar,
            chips:            startingChips,
            lastSettledChips: startingChips,  // watermark for net change tracking
            bet:              0,
            hands:            [],
            activeHand:       0,
            status:           'waiting',
        };

        this.systemMsg(`${client.userData.username} sat down with ${startingChips.toLocaleString()} OTJ`);
        this.broadcastState();
        if (this.phase === 'betting') this.startBetTimer();
    }

    async handleStandUp(client) {
        const seat = this.findSeat(client.sessionId);
        if (seat === -1) return;
        if (this.phase !== 'betting') {
            client.send('error', { message: 'Finish the hand before leaving' });
            return;
        }
        await this.returnChips(seat, 'stand up');
        this.broadcastState();
    }

    async returnChips(seatIndex, reason = '') {
        const seat = this.seats[seatIndex];
        if (!seat) return;
        const chips = seat.chips;
        this.seats[seatIndex] = null;
        if (!seat.userId || chips <= 0) return;
        // Final sync — write current chips directly as bankroll
        try {
            await supabase.from('profiles')
                .update({ bankroll: chips })
                .eq('user_id', seat.userId);
            await supabase.from('bucks_ledger').insert({
                user_id: seat.userId, type: 'bj_leave',
                amount: chips - (seat.lastSettledChips || chips),
                balance_after: chips,
                note: `BJ table exit — ${this.tier} — ${reason}`,
            });
        } catch (err) {
            console.error('[BJ] returnChips error:', err.message);
        }
    }

    // ── Betting ───────────────────────────────────────────────────────────────

    startBetTimer() {
        this.clearTimers();
        // Only start if someone is seated
        if (this.seats.every(s => s === null)) return;

        let timeLeft = 20;
        this.broadcast('bet_timer', { timeLeft });

        this.betTimer = setInterval(() => {
            timeLeft--;
            this.broadcast('bet_timer', { timeLeft });
            if (timeLeft <= 0) {
                clearInterval(this.betTimer);
                this.betTimer = null;
                this.startDeal();
            }
        }, 1000);
    }

    handlePlaceBet(client, { amount }) {
        if (this.phase !== 'betting') return;
        const seatIdx = this.findSeat(client.sessionId);
        if (seatIdx === -1) return;
        const seat = this.seats[seatIdx];

        if (amount < this.config.minBet || amount > this.config.maxBet) {
            client.send('error', { message: `Bet ${this.config.minBet}–${this.config.maxBet}` });
            return;
        }
        if (amount > seat.chips) {
            client.send('error', { message: 'Not enough chips' });
            return;
        }

        seat.bet    = amount;
        seat.status = 'betting';
        this.broadcastState();

        // Deal early if everyone has bet
        const seated = this.seats.filter(Boolean);
        if (seated.length > 0 && seated.every(s => s.bet > 0)) {
            clearInterval(this.betTimer);
            this.betTimer = null;
            setTimeout(() => this.startDeal(), 500);
        }
    }

    // ── Deal ──────────────────────────────────────────────────────────────────

    async startDeal() {
        const bettors = this.seats.map((s, i) => s?.bet > 0 ? i : -1).filter(i => i !== -1);
        if (bettors.length === 0) {
            this.phase = 'betting';
            this.broadcastState();
            this.startBetTimer();
            return;
        }

        // Check if we've hit the cut card
        if (this.shouldReshuffle()) {
            await this.reshuffleShoe();
        }

        this.phase       = 'dealing';
        this.dealerCards = [];
        this.handNumber++;

        for (const i of bettors) {
            const seat = this.seats[i];
            seat.chips     -= seat.bet;
            seat.hands      = [{ cards: [], bet: seat.bet, status: 'active', doubled: false }];
            seat.activeHand = 0;
            seat.status     = 'playing';
        }

        // Deal round 1 then round 2 (player, dealer, player, dealer)
        for (let round = 0; round < 2; round++) {
            for (const i of bettors) this.seats[i].hands[0].cards.push(this.dealCard());
            this.dealerCards.push(this.dealCard());
        }

        const dealerBJ = isBlackjack(this.dealerCards);

        // Check BJ outcomes
        let allDone = true;
        for (const i of bettors) {
            const seat = this.seats[i];
            if (isBlackjack(seat.hands[0].cards)) {
                seat.hands[0].status = dealerBJ ? 'push' : 'blackjack';
                seat.status = 'done';
            } else if (dealerBJ) {
                seat.hands[0].status = 'lose';
                seat.status = 'done';
            } else {
                allDone = false;
            }
        }

        this.phase = 'player_turn';
        this.broadcast('deal_complete', { handNumber: this.handNumber });
        this.broadcastState();

        if (dealerBJ) {
            this.broadcast('dealer_blackjack', { cards: this.dealerCards });
            setTimeout(() => this.resolvePayout(), 1500);
            return;
        }

        if (allDone) {
            setTimeout(() => this.dealerPlay(), 500);
            return;
        }

        this.currentSeat = bettors[0];
        this.broadcastState();
        this.startTurnTimer();
    }

    dealCard() {
        if (this.shoe.length === 0) {
            // Emergency reshuffle (shouldn't happen with cut card but safety net)
            this.shoe       = shuffle(createShoe());
            this.cutCardPos = this.getDefaultCutPos();
        }
        return this.shoe.pop();
    }

    // ── Player actions ────────────────────────────────────────────────────────

    handleHit(client) {
        const seatIdx = this.findSeat(client.sessionId);
        if (seatIdx !== this.currentSeat || this.phase !== 'player_turn') return;
        const seat = this.seats[seatIdx];
        const hand = seat.hands[seat.activeHand];

        hand.cards.push(this.dealCard());
        this.clearTimers();

        if (isBust(hand.cards)) {
            hand.status = 'bust';
            this.broadcast('player_bust', { seatIndex: seatIdx, total: handTotal(hand.cards) });
            this.advancePlayer();
        } else if (handTotal(hand.cards) === 21) {
            this.advancePlayer(); // auto-stand on 21
        } else {
            this.broadcastState();
            this.startTurnTimer();
        }
    }

    handleStand(client) {
        const seatIdx = this.findSeat(client.sessionId);
        if (seatIdx !== this.currentSeat || this.phase !== 'player_turn') return;
        this.clearTimers();
        this.advancePlayer();
    }

    handleDouble(client, { betAmount }) {
        const seatIdx = this.findSeat(client.sessionId);
        if (seatIdx !== this.currentSeat || this.phase !== 'player_turn') return;
        const seat = this.seats[seatIdx];
        const hand = seat.hands[seat.activeHand];

        if (!canDouble(hand)) { client.send('error', { message: 'Cannot double now' }); return; }
        const extra = Math.min(betAmount || hand.bet, seat.chips);
        if (extra <= 0) { client.send('error', { message: 'Not enough chips to double' }); return; }

        seat.chips -= extra;
        hand.bet   += extra;
        hand.doubled = true;
        hand.cards.push(this.dealCard());
        if (isBust(hand.cards)) hand.status = 'bust';

        this.clearTimers();
        this.broadcast('player_doubled', { seatIndex: seatIdx, newTotal: handTotal(hand.cards) });
        this.advancePlayer();
    }

    handleSplit(client) {
        const seatIdx = this.findSeat(client.sessionId);
        if (seatIdx !== this.currentSeat || this.phase !== 'player_turn') return;
        const seat = this.seats[seatIdx];
        const hand = seat.hands[seat.activeHand];

        if (!canSplit(hand))       { client.send('error', { message: 'Cannot split' }); return; }
        if (seat.chips < hand.bet) { client.send('error', { message: 'Not enough chips to split' }); return; }

        seat.chips -= hand.bet;
        const card2 = hand.cards.pop();
        hand.cards.push(this.dealCard());

        seat.hands.splice(seat.activeHand + 1, 0, {
            cards:   [card2, this.dealCard()],
            bet:     hand.bet,
            status:  'active',
            doubled: false,
        });

        this.clearTimers();
        this.broadcast('player_split', { seatIndex: seatIdx });
        this.broadcastState();
        this.startTurnTimer();
    }

    advancePlayer() {
        const seat = this.seats[this.currentSeat];

        // More hands from a split?
        if (seat && seat.activeHand < seat.hands.length - 1) {
            seat.activeHand++;
            this.broadcastState();
            this.startTurnTimer();
            return;
        }

        if (seat) seat.status = 'done';

        const nextActive = this.seats.findIndex((s, i) =>
            i > this.currentSeat && s && s.status === 'playing'
        );

        if (nextActive !== -1) {
            this.currentSeat = nextActive;
            this.broadcastState();
            this.startTurnTimer();
        } else {
            this.currentSeat = -1;
            this.broadcastState();
            setTimeout(() => this.dealerPlay(), 600);
        }
    }

    // ── Dealer ────────────────────────────────────────────────────────────────

    async dealerPlay() {
        this.phase = 'dealer_turn';
        this.broadcast('dealer_reveal', { cards: this.dealerCards });
        this.broadcastState();

        const hasContenders = this.seats.some(s =>
            s && s.hands.some(h => h.status === 'active' && !isBust(h.cards))
        );

        if (hasContenders) {
            await this.delay(800);
            while (handTotal(this.dealerCards) < 17 || isSoft17(this.dealerCards)) {
                this.dealerCards.push(this.dealCard());
                this.broadcast('dealer_hit', {
                    cards: this.dealerCards,
                    total: handTotal(this.dealerCards),
                });
                this.broadcastState();
                await this.delay(700);
            }
        }

        await this.delay(400);
        this.resolvePayout();
    }

    delay(ms) { return new Promise(r => setTimeout(r, ms)); }

    // ── Payout ────────────────────────────────────────────────────────────────

    async resolvePayout() {
        this.phase = 'payout';
        const dealerTotal = handTotal(this.dealerCards);
        const dealerBust  = isBust(this.dealerCards);
        const dealerBJ    = isBlackjack(this.dealerCards);
        const results     = [];
        let   totalRake   = 0;

        for (let i = 0; i < MAX_SEATS; i++) {
            const seat = this.seats[i];
            if (!seat) continue;

            let totalWon = 0;
            const handResults = [];

            for (const hand of seat.hands) {
                const pTotal   = handTotal(hand.cards);
                const pBJ      = isBlackjack(hand.cards);
                const pBust    = isBust(hand.cards) || hand.status === 'bust';
                let outcome, payout;

                if (pBust) {
                    outcome = 'bust';
                    payout  = 0;
                    totalRake += Math.floor(hand.bet * RAKE_PCT);
                } else if (pBJ && !dealerBJ) {
                    outcome = 'blackjack';
                    payout  = Math.floor(hand.bet * (1 + BJ_PAYOUT));
                } else if (dealerBJ && !pBJ) {
                    outcome = 'lose';
                    payout  = 0;
                    totalRake += Math.floor(hand.bet * RAKE_PCT);
                } else if (pBJ && dealerBJ) {
                    outcome = 'push';
                    payout  = hand.bet;
                } else if (dealerBust) {
                    outcome = 'win';
                    payout  = hand.bet * 2;
                } else if (pTotal > dealerTotal) {
                    outcome = 'win';
                    payout  = hand.bet * 2;
                } else if (pTotal === dealerTotal) {
                    outcome = 'push';
                    payout  = hand.bet;
                } else {
                    outcome = 'lose';
                    payout  = 0;
                    totalRake += Math.floor(hand.bet * RAKE_PCT);
                }

                hand.status = outcome;
                hand.payout = payout;
                totalWon   += payout;
                handResults.push({ outcome, payout, cards: hand.cards, total: pTotal, doubled: hand.doubled });
            }

            seat.chips += totalWon;
            const totalBet = seat.hands.reduce((s, h) => s + h.bet, 0);

            results.push({
                seatIndex:  i,
                username:   seat.username,
                hands:      handResults,
                chipChange: totalWon - totalBet,
                newChips:   seat.chips,
            });
        }

        this.broadcast('payout_results', { results, dealerCards: this.dealerCards, dealerTotal });
        this.broadcastState();

        if (totalRake > 0) await this.creditHouseBank(totalRake);

        // Award OTJ points per result
        for (const r of results) {
            const seat = this.seats[r.seatIndex];
            if (!seat) continue;
            const pts = r.hands.reduce((sum, h) => {
                if (h.outcome === 'blackjack') return sum + 25;
                if (h.outcome === 'win')       return sum + 10;
                if (h.outcome === 'push')      return sum + 3;
                return sum + 2;
            }, 0);
            await this.awardPoints(seat.userId, pts);
        }

        setTimeout(() => this.resetHand(), 3500);
    }

    async resetHand() {
        for (let i = 0; i < MAX_SEATS; i++) {
            const seat = this.seats[i];
            if (!seat) continue;
            if (seat.chips <= 0) {
                this.systemMsg(`${seat.username} ran out of chips`);
                this.seats[i] = null;
                continue;
            }

            // ── Return the hand's net change to Supabase ──
            // We already deducted the buy-in on sit_down.
            // Each hand: chips go down by bet, come back up by payout.
            // Net change since last settle = seat.chips - seat.lastSettledChips
            // On first hand, lastSettledChips was set to buyIn on sit_down.
            // Write chip stack directly to bankroll — chips ARE the bankroll
            const lastSettled = seat.lastSettledChips || seat.chips;
            const netChange   = seat.chips - lastSettled;

            try {
                await supabase.from('profiles')
                    .update({ bankroll: seat.chips })
                    .eq('user_id', seat.userId);

                if (netChange !== 0) {
                    await supabase.from('bucks_ledger').insert({
                        user_id:       seat.userId,
                        type:          netChange > 0 ? 'bj_win' : 'bj_loss',
                        amount:        netChange,
                        balance_after: seat.chips,
                        note:          `BJ hand #${this.handNumber} — ${this.tier} table`,
                    });
                }
                seat.lastSettledChips = seat.chips;
            } catch (err) {
                console.error('[BJ] resetHand settle error:', err.message);
            }

            seat.bet        = 0;
            seat.hands      = [];
            seat.activeHand = 0;
            seat.status     = 'waiting';
        }
        this.dealerCards = [];
        this.currentSeat = -1;
        this.phase       = 'betting';
        this.broadcast('new_round', { handNumber: this.handNumber + 1 });
        this.broadcastState();
        this.startBetTimer();
    }

    // ── Turn timer ────────────────────────────────────────────────────────────

    startTurnTimer() {
        this.clearTimers();
        let timeLeft  = TURN_TIME;
        const seatIdx = this.currentSeat;
        this.broadcast('turn_change', { seatIndex: seatIdx, timeLeft });

        this.turnTimer = setInterval(() => {
            timeLeft--;
            this.broadcast('turn_timer', { seatIndex: seatIdx, timeLeft });
            if (timeLeft <= 0) {
                clearInterval(this.turnTimer);
                this.turnTimer = null;
                this.systemMsg(`${this.seats[seatIdx]?.username} timed out — auto stand`);
                this.advancePlayer();
            }
        }, 1000);
    }

    clearTimers() {
        if (this.betTimer)  { clearInterval(this.betTimer);  this.betTimer  = null; }
        if (this.turnTimer) { clearInterval(this.turnTimer); this.turnTimer = null; }
    }

    // ── House bank ────────────────────────────────────────────────────────────

    async creditHouseBank(amount) {
        if (amount <= 0) return;
        try {
            const { data } = await supabase.from('house_bank').select('id,balance,total_raked').eq('id', 1).single();
            if (data) {
                await supabase.from('house_bank').update({
                    balance:     data.balance + amount,
                    total_raked: data.total_raked + amount,
                    updated_at:  new Date().toISOString(),
                }).eq('id', 1);
            } else {
                await supabase.from('house_bank').insert({ id: 1, balance: amount, total_raked: amount, total_paid_out: 0 });
            }
            await supabase.from('house_bank_ledger').insert({
                type: 'rake_bj', amount,
                note: `BJ rake — ${this.tier} — hand #${this.handNumber}`,
            });
        } catch (err) {
            console.error('[BJ] house bank error:', err.message);
        }
    }

    // ── OTJ Points ────────────────────────────────────────────────────────────

    async awardPoints(userId, points) {
        if (!userId || points <= 0) return;
        try {
            const { data } = await supabase.from('otj_points').select('points,lifetime_points').eq('user_id', userId).single();
            if (data) {
                await supabase.from('otj_points').update({
                    points:          data.points + points,
                    lifetime_points: data.lifetime_points + points,
                    updated_at:      new Date().toISOString(),
                }).eq('user_id', userId);
            } else {
                await supabase.from('otj_points').insert({ user_id: userId, points, lifetime_points: points });
            }
        } catch (err) {
            console.error('[BJ] awardPoints error:', err.message);
        }
    }

    // ── Chat / emoji ──────────────────────────────────────────────────────────

    handleChat(client, { message }) {
        if (!message?.trim()) return;
        const msg = { username: client.userData.username, message: message.trim().slice(0, 200), type: 'chat', timestamp: Date.now() };
        this.chatLog.push(msg);
        if (this.chatLog.length > 50) this.chatLog.shift();
        this.broadcast('chat_message', msg);
    }

    handleEmoji(client, { toSeat, emoji }) {
        const fromSeat = this.findSeat(client.sessionId);
        if (fromSeat === -1) return;
        if (toSeat === undefined || toSeat === fromSeat || !this.seats[toSeat]) return;
        const allowed = ['🥧','💸','😡','😂','👏','💀','🔥','🥶'];
        if (!allowed.includes(emoji)) return;
        this.broadcast('emoji_reaction', { fromSeat, toSeat, emoji, fromUsername: client.userData.username });
    }

    systemMsg(text) {
        const msg = { username: '🎰 OTJ', message: text, type: 'system', timestamp: Date.now() };
        this.chatLog.push(msg);
        this.broadcast('chat_message', msg);
    }

    // ── Cut card helpers ─────────────────────────────────────────────────────

    getDefaultCutPos() {
        const total = NUM_DECKS * 52;
        const pct = CUT_CARD_MIN + Math.random() * (CUT_CARD_MAX - CUT_CARD_MIN);
        return Math.floor(total * pct);
    }

    reshuffleShoe() {
        this.shoe       = shuffle(createShoe());
        this.cutCardPos = this.getDefaultCutPos();
        const total     = this.shoe.length;

        // Find the seat to ask for cut — rotate through seated players
        const seatedIndices = this.seats.map((s, i) => s ? i : -1).filter(i => i !== -1);
        if (seatedIndices.length === 0) {
            this.systemMsg('Shoe reshuffled 🃏');
            this.broadcastState();
            return Promise.resolve();
        }

        const cutSeatIdx = seatedIndices[this.cutRotation % seatedIndices.length];
        this.cutRotation++;
        const cutSeat    = this.seats[cutSeatIdx];

        this.cutRequested = true;
        this.systemMsg(`${cutSeat.username} is cutting the deck...`);

        // Send cut request to that specific client
        const cutClient = this.clients.find(c => c.sessionId === cutSeat.sessionId);
        if (cutClient) {
            cutClient.send('cut_card_request', {
                deckSize:    total,
                minCut:      Math.floor(total * CUT_CARD_MIN),
                maxCut:      Math.floor(total * CUT_CARD_MAX),
                timeLimit:   CUT_TIMER,
                cutterName:  cutSeat.username,
            });
        }

        this.broadcast('cut_card_pending', {
            cutterName: cutSeat.username,
            timeLimit:  CUT_TIMER,
        });

        // Auto-cut timer
        return new Promise(resolve => {
            let t = CUT_TIMER;
            this.cutTimer = setInterval(() => {
                t--;
                if (t <= 0) {
                    clearInterval(this.cutTimer);
                    this.cutTimer     = null;
                    this.cutRequested = false;
                    this.systemMsg('Deck auto-cut 🃏');
                    this.broadcastState();
                    resolve();
                }
            }, 1000);
        });
    }

    handleCutCard(client, { position }) {
        if (!this.cutRequested) return;
        const seat = this.seats[this.findSeat(client.sessionId)];
        if (!seat) return;

        clearInterval(this.cutTimer);
        this.cutTimer     = null;
        this.cutRequested = false;

        // Validate position is within allowed range
        const total  = this.shoe.length;
        const minCut = Math.floor(total * CUT_CARD_MIN);
        const maxCut = Math.floor(total * CUT_CARD_MAX);
        const pos    = Math.max(minCut, Math.min(maxCut, Math.floor(position)));

        // Cut the shoe: move cards after cut point to the front
        this.shoe = [...this.shoe.slice(total - pos), ...this.shoe.slice(0, total - pos)];
        this.cutCardPos = pos;

        this.systemMsg(`${seat.username} cut the deck at ${Math.round((pos/total)*100)}% 🃏`);
        this.broadcastState();
    }

    shouldReshuffle() {
        return this.shoe.length <= (NUM_DECKS * 52) - this.cutCardPos;
    }

        // ── State broadcast ───────────────────────────────────────────────────────

    broadcastState() {
        for (const client of this.clients) {
            const mySeat = this.findSeat(client.sessionId);
            client.send('game_state', {
                phase:       this.phase,
                handNumber:  this.handNumber,
                currentSeat: this.currentSeat,
                mySeat,
                dealerCards: this.phase === 'player_turn'
                    ? [this.dealerCards[0], '??']
                    : this.dealerCards,
                dealerTotal: this.phase === 'player_turn'
                    ? handTotal([this.dealerCards[0]])
                    : handTotal(this.dealerCards),
                seats: this.seats.map(s => s ? {
                    username:   s.username,
                    avatar:     s.avatar,
                    chips:      s.chips,
                    bet:        s.bet,
                    hands:      s.hands,
                    activeHand: s.activeHand,
                    status:     s.status,
                } : null),
                config: { minBet: this.config.minBet, maxBet: this.config.maxBet, tier: this.tier, label: this.config.label },
                roomCode: this.roomCode,
                shoe: {
                    remaining:    this.shoe.length,
                    total:        NUM_DECKS * 52,
                    cutCardPos:   this.cutCardPos,
                    pctRemaining: Math.round((this.shoe.length / (NUM_DECKS * 52)) * 100),
                },
                cutPending: this.cutRequested,
            });
        }
    }
}

module.exports = { BlackjackRoom };
