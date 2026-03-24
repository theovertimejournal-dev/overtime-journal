/**
 * pokerEval.js — OTJ Poker Hand Evaluator
 * 
 * Evaluates 7-card hands (2 hole + 5 community) and finds the best 5-card hand.
 * Returns a numeric rank that can be directly compared — higher = better.
 * 
 * Hand rankings (highest to lowest):
 * 9: Royal Flush
 * 8: Straight Flush
 * 7: Four of a Kind
 * 6: Full House
 * 5: Flush
 * 4: Straight
 * 3: Three of a Kind
 * 2: Two Pair
 * 1: One Pair
 * 0: High Card
 */

// Card representation: "Ah" = Ace of hearts, "Td" = 10 of diamonds
// Values: 2-9, T=10, J=11, Q=12, K=13, A=14
// Suits: h=hearts, d=diamonds, c=clubs, s=spades

const RANKS = '23456789TJQKA';
const SUITS = 'hdcs';

function cardValue(card) {
    return RANKS.indexOf(card[0]) + 2;
}

function cardSuit(card) {
    return card[1];
}

/**
 * Generate all 21 possible 5-card combinations from 7 cards
 */
function combinations(cards, k = 5) {
    const result = [];
    function combo(start, chosen) {
        if (chosen.length === k) {
            result.push([...chosen]);
            return;
        }
        for (let i = start; i < cards.length; i++) {
            chosen.push(cards[i]);
            combo(i + 1, chosen);
            chosen.pop();
        }
    }
    combo(0, []);
    return result;
}

/**
 * Evaluate a 5-card hand. Returns { rank, value, name, cards }
 * rank: 0-9 (hand category)
 * value: array for tiebreaking (compared lexicographically)
 */
function evaluate5(cards) {
    const values = cards.map(cardValue).sort((a, b) => b - a);
    const suits = cards.map(cardSuit);

    // Check flush
    const isFlush = suits.every(s => s === suits[0]);

    // Check straight
    let isStraight = false;
    let straightHigh = 0;

    // Normal straight check
    if (values[0] - values[4] === 4 && new Set(values).size === 5) {
        isStraight = true;
        straightHigh = values[0];
    }
    // Wheel (A-2-3-4-5) — Ace plays low
    if (values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
        isStraight = true;
        straightHigh = 5; // 5-high straight
    }

    // Count values for pairs/trips/quads
    const counts = {};
    values.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
    
    // Sort by count desc, then value desc
    const groups = Object.entries(counts)
        .map(([v, c]) => ({ value: parseInt(v), count: c }))
        .sort((a, b) => b.count - a.count || b.value - a.value);

    // Royal Flush
    if (isFlush && isStraight && straightHigh === 14) {
        return { rank: 9, value: [14], name: "Royal Flush", cards };
    }

    // Straight Flush
    if (isFlush && isStraight) {
        return { rank: 8, value: [straightHigh], name: "Straight Flush", cards };
    }

    // Four of a Kind
    if (groups[0].count === 4) {
        const kicker = groups[1].value;
        return { rank: 7, value: [groups[0].value, kicker], name: "Four of a Kind", cards };
    }

    // Full House
    if (groups[0].count === 3 && groups[1].count === 2) {
        return { rank: 6, value: [groups[0].value, groups[1].value], name: "Full House", cards };
    }

    // Flush
    if (isFlush) {
        return { rank: 5, value: values, name: "Flush", cards };
    }

    // Straight
    if (isStraight) {
        return { rank: 4, value: [straightHigh], name: "Straight", cards };
    }

    // Three of a Kind
    if (groups[0].count === 3) {
        const kickers = groups.filter(g => g.count === 1).map(g => g.value);
        return { rank: 3, value: [groups[0].value, ...kickers], name: "Three of a Kind", cards };
    }

    // Two Pair
    if (groups[0].count === 2 && groups[1].count === 2) {
        const highPair = Math.max(groups[0].value, groups[1].value);
        const lowPair = Math.min(groups[0].value, groups[1].value);
        const kicker = groups[2].value;
        return { rank: 2, value: [highPair, lowPair, kicker], name: "Two Pair", cards };
    }

    // One Pair
    if (groups[0].count === 2) {
        const kickers = groups.filter(g => g.count === 1).map(g => g.value);
        return { rank: 1, value: [groups[0].value, ...kickers], name: "One Pair", cards };
    }

    // High Card
    return { rank: 0, value: values, name: "High Card", cards };
}

/**
 * Evaluate the best 5-card hand from 7 cards (2 hole + 5 community)
 */
function evaluateBest(sevenCards) {
    const combos = combinations(sevenCards, 5);
    let best = null;

    for (const combo of combos) {
        const result = evaluate5(combo);
        if (!best || compareHands(result, best) > 0) {
            best = result;
        }
    }

    return best;
}

/**
 * Compare two evaluated hands. Returns:
 *  > 0 if hand1 wins
 *  < 0 if hand2 wins
 *  = 0 if tie (split pot)
 */
function compareHands(hand1, hand2) {
    if (hand1.rank !== hand2.rank) {
        return hand1.rank - hand2.rank;
    }
    // Same rank — compare tiebreaker values
    for (let i = 0; i < Math.min(hand1.value.length, hand2.value.length); i++) {
        if (hand1.value[i] !== hand2.value[i]) {
            return hand1.value[i] - hand2.value[i];
        }
    }
    return 0; // exact tie — split pot
}

/**
 * Determine winners from multiple players' hands
 * players: [{ seatIndex, holeCards: ["Ah", "Kd"] }]
 * communityCards: ["Tc", "Jd", "Qh", "2s", "7c"]
 * 
 * Returns: [{ seatIndex, hand, isWinner }]
 */
function determineWinners(players, communityCards) {
    const results = players.map(p => {
        const allCards = [...p.holeCards, ...communityCards];
        const best = evaluateBest(allCards);
        return {
            seatIndex: p.seatIndex,
            holeCards: p.holeCards,
            hand: best,
        };
    });

    // Find the best hand
    let bestHand = results[0].hand;
    for (let i = 1; i < results.length; i++) {
        if (compareHands(results[i].hand, bestHand) > 0) {
            bestHand = results[i].hand;
        }
    }

    // Mark winners (could be multiple in case of tie)
    return results.map(r => ({
        ...r,
        isWinner: compareHands(r.hand, bestHand) === 0,
    }));
}

// ── Deck ────────────────────────────────────────────────────────────────────

function createDeck() {
    const deck = [];
    for (const r of RANKS) {
        for (const s of SUITS) {
            deck.push(r + s);
        }
    }
    return deck;
}

/**
 * Fisher-Yates shuffle with crypto-quality randomness
 */
function shuffleDeck(deck) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        // Use crypto random if available, otherwise Math.random
        let j;
        try {
            const crypto = require('crypto');
            j = crypto.randomInt(0, i + 1);
        } catch {
            j = Math.floor(Math.random() * (i + 1));
        }
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Pretty print a card for display
 */
function cardToString(card) {
    const suitSymbols = { h: '♥', d: '♦', c: '♣', s: '♠' };
    const valueNames = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };
    const v = valueNames[card[0]] || card[0];
    const s = suitSymbols[card[1]] || card[1];
    return v + s;
}

function handToString(hand) {
    return `${hand.name} (${hand.cards.map(cardToString).join(' ')})`;
}

module.exports = {
    evaluate5,
    evaluateBest,
    compareHands,
    determineWinners,
    createDeck,
    shuffleDeck,
    cardValue,
    cardSuit,
    cardToString,
    handToString,
    RANKS,
    SUITS,
};
