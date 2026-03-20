import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const MONO = "'JetBrains Mono','SF Mono','Fira Code',monospace";

// ── Blog posts with full content ─────────────────────────────────────────────
const BLOG_POSTS = [
  {
    category: 'PRODUCT UPDATE',
    date: 'Mar 17',
    title: 'Live Multiplayer Is Here — OTJ Arcade Goes PvP 🕹',
    excerpt: 'Challenge your friends to OTJ Jam in real-time. Create a room, share the code, and play head-to-head on the same court. No bots. No lag. Real competition.',
    content: `The arcade just went multiplayer. Real-time, head-to-head, synced gameplay — not two people playing against AI on separate screens.

HOW IT WORKS

Hit CREATE ROOM from the OTJ Jam menu. You get a 6-character room code and a shareable invite link. Send it to your opponent. They paste the link or punch in the code. Both players ready up. Game starts.

Player 1 controls the red team. Player 2 controls the blue team. Same court, same ball, same shot clock. Every movement, every shot, every steal happens in real time across both screens.

THE ARCHITECTURE

This isn't peer-to-peer guesswork. Player 1's client runs the authoritative game loop — physics, scoring, shot resolution, all of it. The game state broadcasts to Player 2 through the Colyseus server at 20Hz. Player 2 sends their inputs back through the server to Player 1, who processes them. Player 2's screen is a real-time mirror of the actual game state.

That means no desync. No duplicate AI. No "we're both playing different games." What P1 sees is what P2 sees.

Solo mode is completely untouched — hit INSERT COIN and you're playing against the CPU exactly like before.

CHALLENGE A FOLLOW

If you've followed someone on OTJ, you can challenge them directly from the arcade menu. They get a notification with a link to join your room. No room codes needed.

WHAT'S NEXT

Arcade usernames on the leaderboard, a community activity feed, and referral codes are all in the pipeline. For now — go challenge someone and see who's actually got game. 🔥`,
  },
  {
    category: 'PRODUCT UPDATE',
    date: 'Mar 17',
    title: 'OTJ Bucks, Betting Panel & Leaderboard Are Live 💰',
    excerpt: 'Every account now starts with $10,000 in OTJ Bucks. Place moneyline, spread, and over/under bets with locked odds. Track your record. Climb the leaderboard. Search any user.',
    content: `The betting system just shipped. Every OTJ account now has a full simulated bankroll, a real betting panel, and a public leaderboard.

YOUR BANKROLL

Every new account starts with $10,000 in OTJ Bucks plus a $1,000 monthly reload. This isn't play money with no consequences — your balance, your bets, and your record are all public on the leaderboard. Blow your bankroll making bad bets and everyone sees it. Stack it up with smart plays and you climb the board.

THE BETTING PANEL

Open any game card and you'll see three bet types: Moneyline, Spread, and Over/Under. Tap one, set your wager amount, and confirm. The odds lock at the moment you place the bet — not at tip-off, not at grading time. What you see is what you get.

You can stack multiple bets on the same game or across different games. Every bet shows your locked odds, potential payout, and current status. Cancel any ungraded bet before the game starts.

HOW BETS RESOLVE

The resolve_picks pipeline runs automatically after games finish. It pulls final scores, compares against your locked odds and bet type, and grades every bet as a W or L. Your OTJ Bucks balance updates instantly. Payouts follow standard American odds math — a $100 bet at +150 pays $250 total ($150 profit + $100 stake).

THE LEADERBOARD

Global rankings sorted by total profit, win rate, or current balance. Every user's profile shows their bet history, W/L record, and ROI. You can search any username directly from the leaderboard page. 🔥`,
  },
  {
    category: 'PRODUCT UPDATE',
    date: 'Mar 17',
    title: 'Profiles, Badges & Follows Are Live 🏆',
    excerpt: 'Claim your @username, earn badges, follow other bettors, and build your OTJ reputation. Your profile tracks every bet, every win, every streak.',
    content: `OTJ profiles just shipped. Every account now has a public profile page with your username, bet history, badges, and follower count.

YOUR PROFILE

Claim your @username during signup or from settings. Your profile page shows your full betting record — every pick, every result, every ROI number. No hiding bad streaks. No cherry-picking winners. The record is the record.

Your avatar color and profile icon are customizable. Your profile is public by default — anyone on OTJ can look you up and see your track record.

BADGES

Badges are earned automatically based on your activity:

Early adopter badge for accounts created during the beta period. Win streak badges at 3, 5, and 10 consecutive wins. Profit milestone badges at $1K, $5K, and $10K in total OTJ Bucks profit. Betting volume badges for total bets placed. Arcade badges for multiplayer wins.

Badges show on your profile and next to your name on the leaderboard. They're permanent — once earned, they stay.

FOLLOWS

Follow any user from their profile or from the leaderboard. Your follows list shows up on your profile and powers the Challenge a Follow feature in the arcade. Following someone doesn't affect your picks or your feed — it's a social layer for tracking the bettors you respect.

THE LEADERBOARD SEARCH

The leaderboard page now has a username search bar at the top. Type any username and jump directly to their profile. No scrolling through pages. Works on both the global leaderboard and the arcade leaderboard.

This is the social layer OTJ needed. The model gives you the edge. Your profile proves you know how to use it. 🔥`,
  },
  {
    category: 'PRODUCT UPDATE',
    date: 'Mar 17',
    title: 'Leaderboard Search & User Profiles Are Browsable 🔍',
    excerpt: 'Search any OTJ username from the leaderboard. See their full record, badges, and betting history. Find the sharpest bettors and follow them.',
    content: `Small but important feature — the leaderboard now has a search bar.

WHAT IT DOES

Type any username into the search field at the top of the leaderboard page. Results filter in real time as you type. Click any result to jump to their full profile — betting record, badges, ROI, current balance, everything.

WHY IT MATTERS

With the betting system and profiles now live, the leaderboard is going to grow fast. Scrolling through hundreds of users to find someone specific isn't going to scale. Search fixes that.

It also powers discovery. Want to find the top earners? Sort by profit. Want to see who's on a hot streak? Sort by win streak. Want to look up a specific user someone mentioned in Discord? Search their name.

HOW IT WORKS

The search queries Supabase profiles in real time with a case-insensitive prefix match. Type "j" and you see every username starting with J. Type "juan" and it narrows down instantly. Results show username, avatar, current rank, and record at a glance.

COMING NEXT

Community activity feed — see what bets people you follow are placing in real time. Referral codes — invite friends and both accounts get an OTJ Bucks bonus. And the MLB model drops at Opening Day.

The leaderboard is the scoreboard for OTJ. Now you can actually find people on it. 🔥`,
  },
    {
    category: 'PRODUCT UPDATE',
    date: 'Mar 17',
    title: 'New Signal: Positional Mismatch 📐',
    excerpt: 'The model now detects when a franchise star is facing a depleted defensive matchup. Giannis vs a backup center with a -4 bench net is not the same game as Giannis vs a healthy starter. Now the edge score knows that.',
    content: `The model just got smarter about one of the most consistently underpriced edges in the NBA — positional mismatches.

WHAT IT DOES

When a franchise-caliber player is active and their primary defensive matchup is either injured or backed by a weak unit, a new POSITIONAL_MISMATCH signal fires. The edge score adjusts. The signal shows up in the game card.

THE REAL-WORLD EXAMPLE

Say Giannis is playing tonight. The opposing team's starting center is out. Their backup is logging a -4.2 bench net rating — meaning they're actively hurting the team when they're on the floor. That's not just a personnel change. That's a structural mismatch Vegas lines often fail to fully price, especially on same-day scratches.

Before today: model saw the injury, applied a fresh scratch bonus if it was recent, and moved on.

After today: model cross-references the star's position against the opposing depth chart. If the defensive matchup is weak — by injury, by bench net, or both — the signal fires with a 2.0-4.5 point impact on the edge score depending on severity.

WHAT IT COVERS

15 franchise stars are mapped with positional types — bigs like Jokic, Wemby, Giannis. Wings like Tatum, Durant, Kawhi. Guards like Curry, Morant, Lillard. For each one, if the opposing team is thin at that position, the mismatch gets flagged.

HOW IT'S WEIGHTED

The signal is intentionally conservative — supporting signal only, never lead signal. It won't flip a game from INFO to SHARP on its own. But when it stacks with net rating, B2B fatigue, or fresh scratch signals, it adds meaningful conviction to an existing lean.

We'll track outcomes against this signal over the next few weeks to validate it before weighting it higher. That's how OTJ builds — ship the signal, log the outcomes, let the data speak. 🔥`,
  },
  {
    category: "TONIGHT'S LESSON",
    date: 'Mar 16',
    title: 'One Number. Three Tickets. Here\'s What Separated the Wins From the Losses. 📐',
    excerpt: 'WAS +8.5 cashed. WAS +7.5 didn\'t. Same game, same side, one point apart. The gut check rule exists for exactly this reason — and last night proved it again.',
    content: `5-3 on the night. 47-22 all time. W5 streak. Let's talk about what actually happened.

THE THREE TICKETS

Two won. One lost. Here's the breakdown:

3-Leg Parlay — $25 → $71.23 ✅
PHX +8.5 ✅ NOP ML ✅ CHI ML ✅
Clean sweep. The model liked all three and all three delivered.

2-Leg Parlay — $60 → $133.33 ✅
ATL ML ✅ WAS +8.5 ✅
Also clean. Two legs, two covers.

7-Leg Parlay — $10 → Lost ❌
WAS +10 ✅ ATL ML ✅ PHX +12.5 ✅ NOP ML ✅ CHI ML ✅ SAS ML ✅ HOU ML ❌
Six of seven. One leg killed it.

THE NUMBER THAT MATTERED

Washington covered +8.5 on two separate tickets. On the 7-leg, we had WAS +10 — also hit. But on the 6-leg, WAS +7.5 — didn't cover. GSW won by more than 7.5.

That's the gut check rule working in real time. When the model sees a closer game than Vegas prices, the value isn't in taking the raw line — it's in finding a number with cushion. +8.5 had it. +7.5 didn't.

THE LESSON ON BROOKLYN

BKN was a bad spot and it shouldn't have been on the ticket at all. Their best player on the floor averaged 12 points a game. That's not a backup — that's a decimated roster. The model flagged it as a value spot based on the line, but a team with no real offensive engine isn't a spread play regardless of what the line says.

We have a roster decimation flag in the pipeline for exactly this scenario. When a team's top available player is averaging sub-15 points, the model will kill the lean entirely rather than chase a bad number. That ships this week.

THE HOUSTON MISS

LAL won 100-92. The model leaned HOU at home — reasonable on paper given the matchup data. Lakers had different plans. These happen. The line was close, the game was close, one team executed. Lakers have been on a roll, and the model was not confident on the Rockets. This one was on me.

THE TAKEAWAY

The structure worked. Three tickets, two hit clean using the correlated milk approach — same games, different numbers, different sizing. The winners were methodical. The losses came from two spots that had warning signs the model is now being patched to catch.

47-22. W5. We move. 🔥`,
  },

  {
    category: 'PRODUCT UPDATE',
    date: 'Mar 15',
    title: 'Line Movement Charts Are Live 📈',
    excerpt: 'Every game card now shows real-time line movement charts — ML and spread tracked from opening line to now. Watch the money move in real time.',
    content: `We shipped the line movement charts today. Here's what they do and why they matter.

WHAT THEY SHOW

Every expanded game card now has two sparkline charts at the bottom — one for moneyline movement, one for spread movement. Both track from the opening line logged at the morning push through every refresh during game hours.

The chart updates every 10 minutes automatically during game hours. By tip-off you have hours of pre-game movement. By halftime you have a full story.

WHY IT MATTERS

Last night's DET @ TOR was the perfect example. TOR opened at +145 and closed at -3200. The line moved -3345 points. You could literally see the scratch happen on the chart — the curve drops hard, the alert fires, and the value window banner tells you OTJ still likes DET at the new inflated number.

That's the whole idea. Model likes the dog. They go down big or a star gets scratched. Live line swings to +250 or worse. That's your window to buy in at better odds before the market corrects.

THE ALERT BANNERS

Two banners can fire based on line movement:

🚨 Red — ML moved 100+ pts. Sharp money or a late scratch. Significant shift detected.
⚡ Yellow — Value window. OTJ still likes a team but the line has drifted away from them. Current odds may be better than opening.

HOW IT WORKS UNDER THE HOOD

Every push logs a snapshot to the odds_history table with a timestamp. The frontend reads those rows and draws the chart. No extra API calls, no extra cost — it piggybacks on the refresh pipeline that was already running.

The model is becoming fully auditable. Every pick, every line, every movement — logged and visible. That's what OTJ is building toward. 🔥`,
  },
  {
    category: 'PRODUCT UPDATE',
    date: 'Mar 14',
    title: 'Live Line Movement Charts — Coming Soon 📈',
    excerpt: "We're building real-time line movement charts inside every game card. Watch the spread and moneyline shift as the game plays out — so you know exactly when to buy in.",
    content: `WHAT'S NEXT

We're building live in-game line movement charts — so you can watch the spread and moneyline shift in real time as the game plays out.

THE IDEA

Model likes the underdog. They go down 14 in the third. Live ML swings to +250. That's your window to buy in at better odds before they come back.

Tonight's Lakers game in OT is exactly the kind of spot this was built for. If you could see the line moving in real time — when to hold, when to buy — that's a real edge.

HOW IT WORKS

Every game card will show two live charts: moneyline movement and spread movement, both updating automatically throughout the game. When a line moves hard in one direction and the model still likes the other side, we flag it.

The data logs every 10 minutes during game hours. By tip-off you already have hours of pre-game movement. By halftime the chart tells a story.

FIRST TEST

Wolves vs OKC — Sunday 10AM ET. We're running the live data pull during the game to see exactly what the line does in real time. Charts ship after that.

More soon. 🔥`,
  },
  {
    category: 'PRODUCT UPDATE',
    date: 'Mar 13',
    title: 'OTJ Now Shows Live vs Opening Scores 📡',
    excerpt: "We just shipped a major update — every game card now shows the score OTJ had at tip-off, locked forever, plus a live score that updates as lines move. You'll never wonder if a late injury changed the pick again.",
    content: `One of the biggest complaints we heard: the model score would change mid-day and users couldn't tell if the original pick was still valid or if something broke.

Today that's fixed.

WHAT CHANGED

Every game card now shows two scores side by side:

OPEN SCORE — locked at the time of the morning slate push. This is what the model believed when the picks were set. It never changes, no matter what happens during the day.

LIVE SCORE → 📡 — recalculated in real time as injuries, line movement, and roster news come in. If the live score drops significantly from the open score, something changed and you should know about it.

WHY THIS MATTERS

Before today: CHI @ LAC showed SHARP 17.2 at tip-off. Jalen Smith gets scratched mid-afternoon. Lines move. The score recalculates to 12.1 LEAN. Users who checked earlier saw one thing. Users who checked later saw another. No way to know which was the real pick.

After today: You'll see OPEN 17.2 SHARP and LIVE 12.1 LEAN → 📡 side by side. The original pick is preserved. The live update is clearly flagged. You decide what to do with both numbers.

THE BIGGER PICTURE

This also fixes the garbage time problem. When a game goes live and a team blows out the other by 30, post-game ML odds go extreme. Before today that was zeroing out scores on completed games. Now completed games are correctly ignored — the open score stays frozen and the live detector only fires on pre-game line moves.

OTJ is building toward a full model audit trail. Every pick logged before tip. Every score frozen at push time. Every deviation from the opening line flagged in real time. The record is already verifiable — the model is becoming fully transparent. 🔥`,
  },
  {
    category: "TONIGHT'S LESSON",
    date: 'Mar 13',
    title: 'All In or Nothing 🎯',
    excerpt: 'When you feel a slate, you feel it. The move isn\'t to spread $200 across five small bets — it\'s to fire one big ticket and one insurance ticket. Win big or break even. Never bleed out slow.',
    content: `There\'s a specific feeling every serious bettor knows. You look at the slate, you see the spots, and something just clicks. The model is green across the board, the lines feel soft, and you\'re confident.

Most people in that spot do the wrong thing. They spread their money across five different bets, win three, lose two, and end up basically flat after juice. They were right about the slate and still lost money.

THE CONCEPT

When you feel a slate — really feel it — the move is two tickets:

Ticket 1: Your big bet. The parlay you actually believe in. Size it like you mean it.
Ticket 2: A correlated insurance ticket at lower stakes. Structured so that if your big ticket loses on one leg, the insurance ticket catches the result.

Win both: big night.
Win insurance, lose main: break even or small profit.
Win main, lose insurance: still a big night.
Lose both: you misread the slate, happens.

The goal is to eliminate the "I was right but still lost money" outcome.

LAST NIGHT

The slate felt right. Model was firing on IND, MEM, TOR, HOU, UTA. Two tickets went in:

3-Leg Parlay — $200: MIN ML ✅ UTA +16 ✅ LAC -13 ❌ — one bad leg, lost $200, but so close to making it a $1250 profit day!
6-Leg Parlay — $25: IND +18.5 ✅ MEM +20 ✅ TOR ML ✅ HOU ML ✅ UTA +20 ✅ LAC -7.5 ✅ — hit clean, $282 back with a 25% boost.

Down $20 on the night. But here\'s the thing — the $25 ticket was the insurance. It was built with wider spreads and more cushion on the same games. The $200 ticket was the conviction play.

The LAC -13 leg killed the conviction ticket. LAC -7.5 on the insurance ticket hit easy.

That\'s the all-in or nothing structure working exactly as designed. The big ticket lost. The insurance caught it. Instead of being down $200, down $20.

THE LESSON

If you\'re going to size up on a slate you believe in — always build the insurance ticket first. It forces you to think about where the real cushion is, not just where the model points.

The insurance ticket on last night\'s slate wasn\'t random. It was the same games, same sides, but wider numbers. IND +18.5 instead of whatever the main ticket had. LAC -7.5 instead of -13. The cushion is where you don\'t get killed when one game script goes sideways.

Could have profited big last night. Instead broke even. That\'s not a loss — that\'s the system working.

THE COMMUNITY

Five readers sent us their screenshots of the same 6-leg spread parlay hitting last night. Same games. Same structure. $25 to $280+. If you hit it, you already know who you are — and we see you.

This is what OTJ is supposed to be. Not a picks service. A community of people who actually understand the edge and use it the right way.

For pregame breakdowns, live betting discussion, and ticket sharing — join the growing OTJ community on Discord. Drop your screenshots, talk through the model, share your wins and your losses.

Join here: https://discord.gg/j3nV3CBY 🔥`,
  },
  {
    category: "TONIGHT'S LESSON",
    date: 'Mar 12',
    title: 'We Lost. Here\'s Exactly Why. 📓',
    excerpt: 'Two legs killed everything last night — SAS moneyline and CHI spread. The gut check was right about the game script. The number was wrong. Here\'s the lesson, and how one reader turned the same slate into $238.',
    content: `We're not going to hide this one. That's not what OTJ is.

THE OVERTIME JOURNAL IS NOT A PICKS SERVICE.

It's a place for real gamblers who want to find the best edge and value for their money. No tout nonsense. No cherry-picked records. Every result — win or loss — gets logged, explained, and learned from. Over time, with a genuine edge, the math works in your favor. That's expected value. That's what we're building toward.

Last night was a loss. Here's exactly what happened.

THE TWO KILLERS

Every ticket on the board died on the same two legs: San Antonio moneyline and Chicago Bulls spread (+11 / +11.5).

The Spurs: The model flagged a value spot after the Wembanyama scratch — but it didn't have a hard stop for full roster decimation scenarios. That gap is being patched this week. When a franchise star goes down that late, the lean should die entirely. Lesson logged. Fix shipping.

The Bulls: This one stings different. Vegas had Chicago as 11.5-point dogs. The gut check model projected a much closer game — and it was RIGHT. Bulls lost by 12. One point off the raw Vegas line. The game script played out almost exactly as modeled. The number just didn't have enough cushion.

THE TICKETS

- 6-Leg Parlay (+2346) — MIA ML ✅ BKN +16.5 ✅ MEM +10.5 ✅ SAS ML ❌ BOS +8 ✅ CHI +11.5 ❌
- 3-Leg Parlay (+327) — SAS ML ❌ BOS +2.5 ✅ CHI +10.5 ❌
- 2-Leg Parlays (+256 each) — BOS +8.5 ✅ CHI +11.5 ❌

Same two legs. Every time.

THE LESSON ON THE BULLS

When gut check fires and says "closer game than Vegas thinks," the raw spread is not where the value lives. The value is in shopping for a bigger number.

A reader figured this out on their own last night. Same slate, same Bulls game — but they took Chicago +16 as part of a 9-leg spread parlay. Bulls lost by 12. Covered +16 by 4 points. One number decision turned the same information into $238 on a $15 FanCash ticket.

That's the correlated parlay milk applied correctly. You don't just take the side — you take the right number on the right side. The model gave the direction. The cushion made it cashable.

Starting today, when the gut check fires, OTJ will show you a padded spread recommendation alongside the raw line — so you know where the actual value lives, not just which side the model likes.

THE RECORD

26-13. We post everything. The streak was going to end eventually. What matters is the system keeps getting smarter and we stay honest about every result.

Send your bad beats. Send your wins. This journal belongs to anyone who's serious about the game. 🔥`,
  },
  {
    category: 'STRATEGY',
    date: 'Mar 11',
    title: 'Correlated Parlay Milk 🥛',
    excerpt: 'How I turned $88 into $1,400+ in one night — stack your favorites on the money line, hedge with fat opposite spreads on the same games. If the chalk wins but doesn\'t blow anyone out, both tickets print.',
    content: `Last night was one of those sessions where everything clicks. Five winning tickets. Multiple parlays cashing. And a strategy I've been quietly refining that I'm finally putting a name to: The Correlated Parlay Milk.

THE CONCEPT

Stack your favorites on the money line, then hedge with fat opposite spreads on the same games. If the chalk wins but doesn't blow anyone out, both tickets print. You're not betting on upsets. You're betting on game script.

THE NIGHT IN NUMBERS

Five tickets. All green.

5-Leg Parlay — $16.86 in, $307.32 out (+1722)
5-Leg Parlay — $13.00 in, $325.83 out (+2406)
3-Leg Parlay — $100 FanCash in, $400.00 out (+400)
3-Leg Parlay — $33.14 in, $146.58 out (+342)
4-Leg Parlay — $25.00 in, $278.49 out (+1013 with 25% boost)
Single — ORL +3.5, $6.86 FanCash in, $5.72 out

Total out: $1,460+. Total real cash in: ~$88.

WHAT IS CORRELATED PARLAYING?

In a standard parlay, each leg is supposed to be independent. Sportsbooks price them that way. But in the NBA, game outcomes are deeply connected — if a team wins, HOW they win matters for every other line in the game.

Correlation means using that connection intentionally. The classic example: if you bet a team to win the money line AND bet the other team to cover a big spread, you're saying "I think this game stays close even though one team wins." That's a correlated position — and books consistently misprice it.

THE MILK PART

The milk is the squeeze. On nights with heavy chalk, oddsmakers give out plus-money on the underdogs to cover large spreads. If you combine favorites on the money line with underdogs covering big spreads from the same games, you're milking two outcomes at once. The favorite wins — but doesn't go nuclear. That's the sweet spot.

LAST NIGHT'S EXECUTION

The Kings showed up twice — as a +8 and +18 underdog spread pick. In both tickets I was betting Sacramento would stay within range even if they lost. The Nuggets were on the money line in the same parlays. Denver wins, Sacramento doesn't get embarrassed. Ticket prints.

The Magic +3.5 single was insurance — standalone coverage on a game where I had exposure. Cleveland at Orlando was close all night and ORL pulled it out 128-122.

THE RISK

This isn't a cheat code. The milk dries up when a favorite blows the game open early, the underdog actually wins outright, or you overload too many legs and one bad game script collapses everything.

That's why ticket sizing matters. Notice the wagers — $13, $16, $25, $33. Small entries, big upside. Never bet the mortgage on a parlay no matter how clean the setup looks.

THE TAKEAWAY

You're not chasing upsets. You're reading game script and letting the lines work against each other. When the model flags a game as a likely close win for the favorite, that's your green light to run the milk on both sides.`,
  },
  {
    category: 'MODEL',
    date: 'Mar 10',
    title: 'How OTJ Works: The Edge Model Explained',
    excerpt: 'Every pick on this site comes from a multi-signal composite scorer. Here\'s exactly what it looks at, and why each signal earns its weight.',
    content: `OTJ is not a tipster service. There's no gut feel, no hot takes, no fading the public because Reddit said so. Every pick is the output of a Python model that runs against live NBA data every afternoon at 3PM ET. Here's what it actually looks at.

THE SIGNALS

NET RATING GAP — The single most predictive team-level stat in the NBA. When one team's net rating exceeds the other by 3+ points, the model pays attention. A 6+ point gap is labeled STRONG. Max impact: ±8 pts on the edge score.

BENCH EDGE — Starters are priced in. Sportsbooks know LeBron's numbers. What they consistently undervalue is the second unit. The model pulls bench net ratings from *Classified* depth charts and fires when the gap exceeds 2 points. Max impact: ±7 pts.

B2B FATIGUE — Teams on back-to-backs cover the spread at a materially lower rate than rested opponents. This is the most underpriced structural edge in the NBA right now, and books are slow to adjust for travel schedules and compressed rest.

CLOSE GAME RECORD — Some teams just know how to win close games. Others choke. The model tracks win percentage in games decided by 5 points or fewer — but only fires when both teams have played 8+ close games. Small sample sizes kill bettors. We don't let them kill this model.

DEF TRENDING WORSE — A team's season defensive rating is one number. Their last 10 games is another. When a team is allowing 4+ more points per game recently vs. their season average, that's real deterioration, not noise.

FRESH SCRATCH — An injury report from 3 days ago is priced in. One from 3 hours ago is not. The model classifies every Out/Doubtful player by tenure and only applies a bonus for injuries the line hasn't had time to adjust to.

THE GUT CHECK

Every game also runs through a gut check: the model estimates what it thinks the actual point total will be and compares it to the Vegas spread. When those numbers disagree by 5+ points in the same direction, a LINE_VALUE flag fires. These mismatch games are vetoed from the parlay builder.

THE CONFIDENCE TIERS

SHARP: absolute edge score >= 14. These are the picks the model is most convicted on.
LEAN: score >= 8. Real signal, less certainty.
INFO: everything else. Context only, not a pick recommendation.

Only SHARP and LEAN picks enter the parlay builder. The model caps itself at 2 SHARP picks and 1 LEAN per night.

THE TRACK RECORD

Every pick is logged to Supabase before tip-off. Every outcome is graded automatically overnight. The record you see on this site is real, dated, and auditable — not cherry-picked from a highlight reel. That's the whole point.`,
  },

  
  {
    category: 'ANALYSIS',
    date: 'Mar 11',
    title: '$8 → $3,307: Inside the 11-Leg Parlay That Hit Last Night',
    excerpt: 'PHI ML, ATL -9.5, MIA -10.5, DET -9, HOU ML, SAS ML, PHX ML, CHI +6.5, CHA ML, SAC ML, LAL ML. Eleven legs. +39465 odds. All hit. Here\'s why the model liked every single one.',
    content: `Last night OTJ's parlay builder assembled an 11-legger that paid out $3,307 on an $8.36 ticket at +39465 odds. That's a 395x return with a 25% profit boost. Here's the breakdown of every leg and why the model picked it.

76ERS ML (-160)

Philly at home with a fresh scratch on the opposing starting center. The FRESH_SCRATCH signal fired at tip — the injury came out too late to be fully priced into the -160 line. Model confidence: SHARP.

HAWKS -9.5 (-110)

Atlanta on 3 days rest against a team on a back-to-back. B2B_FATIGUE plus a DEF_TRENDING_WORSE signal on the opponent — allowing 6 more pts/game over their last 10 vs. season avg. The model's gut check estimated a 12-point Atlanta win. Spread cleared easily.

HEAT -10.5 (-225)

The leg with the most signal convergence: home court, opponent B2B, NET_RATING_GAP at +9.1, and a CLOSE_GAME_RECORD signal showing the opposing team losing 6 of their last 7 close games. SHARP confidence.

PISTONS -9 (-285)

Detroit at home, opponent on a back-to-back, and a significant bench edge. Model showed DET bench net +4.2 vs. opponent bench -1.8. That's a massive second-unit mismatch in a game where the opponent will be running shortened rotations due to fatigue.

ROCKETS ML (-210)

Houston at home against Toronto. NET_RATING_GAP was wide and the Raptors came in on the wrong end of multiple fatigue and defensive signals. Comfortable ML play at -210.

SPURS ML (-150)

San Antonio at home against Boston. The model caught a rest/fatigue edge — Celtics on a schedule spot the books didn't fully adjust for. Spurs had home court and a favorable matchup profile. LEAN confidence.

SUNS ML (-115)

Phoenix at Milwaukee. Close line, but the model liked PHX with a guard matchup advantage and Bucks defensive trending worse over their last 10. At -115 this was near a coin flip by the books but the model had clear separation.

BULLS +6.5 (-110)

Chicago at Golden State getting 6.5 points. The spread gut check rule fired here — the model's fair spread estimate was tighter than 6.5, meaning the Bulls were getting more points than the data supported. Classic value on the underdog spread.

HORNETS ML (-150)

Charlotte at Portland. Trail Blazers on a rough stretch with multiple signals stacking against them. Hornets had the better net rating gap and a bench edge in a game where Portland's depth was thin.

KINGS ML (-160)

Sacramento at home against Indiana. Home court plus a NET_RATING_GAP advantage. The Pacers came in on a schedule spot that the model flagged as exploitable. Clean ML play.

LAKERS ML (+120)

Lakers at home against Minnesota. The model had LAL with a +7.2 net rating advantage and a BENCH_EDGE signal firing. Line value on the ML at +120 triggered the ML preference over the spread. This was the value anchor — the only plus-money leg on the ticket.

WHY THE MODEL WORKS HERE

None of these legs were picks because "this team is good." Every leg had a specific, named signal firing. The parlay builder also ran gut-check vetoes on all 11 — none had a LINE_VALUE mismatch, so none were blocked.

The parlay offered a cash-out at $2,164 with the Lakers up 19 with 42 seconds left in the 3rd quarter. We didn't sell. Final result: full payout.

Eleven legs. $8.36 in. $3,307 out. This is what the model is built for.`,
  },
  {
    category: 'EDGE',
    date: 'Mar 9',
    title: 'B2B Fatigue Is the Most Underpriced Edge in the NBA Right Now',
    excerpt: 'Sportsbooks are still pricing B2B games as if teams had 15-man rosters and no travel data. We ran the numbers on this season.',
    content: `There's a structural inefficiency in NBA betting that has existed for years and hasn't gone away. Back-to-back games are consistently underpriced by sportsbooks, and the edge is most pronounced in the spread — not the moneyline.

THE DATA

Teams on back-to-backs cover the spread at a rate roughly 4-6 percentage points below their season average. That sounds small. Against a -110 vig, you need to be right 52.4% of the time to break even. A 4-point drag on coverage rate turns a neutral team into a losing bet almost by definition.

But here's what makes it exploitable: the line usually only moves 1-1.5 points for a B2B team. The market acknowledges fatigue exists but consistently undervalues it — particularly in road B2Bs, where travel adds another variable.

WHY BOOKS UNDERADJUST

The betting public loves backing teams they know. The Lakers, Celtics, Warriors — these get heavy action regardless of schedule situation. Books shade their lines to balance action, not to perfectly price in fatigue. The result is structural value on the rested opponent.

WHERE OTJ CATCHES IT

The model pulls B2B status from Balldontlie's game logs for every team every night. But Balldontlie sometimes lags on yesterday's results by 12-24 hours. So OTJ cross-checks ESPN's free scoreboard API and patches in any missing B2B flags before the slate runs.

B2B_FATIGUE in OTJ carries a max impact of ±8 points on the edge score. It's one of the highest-weighted signals in the model. When it fires alongside 2-3 supporting signals, it frequently produces SHARP-confidence picks.

Watch for it. When you see B2B_FATIGUE in the signals list, that's not a secondary consideration — that's the model saying the line doesn't fully price what it should.`,
  },
  {
    category: 'RECAP',
    date: 'Mar 8',
    title: 'March Week 1 Recap: What Hit, What Missed, What We Learned',
    excerpt: 'Full transparency on every pick from the first week of March. The model went 5-2 on SHARP picks. Here\'s the breakdown.',
    content: `Full transparency is the whole point of OTJ. Here's the complete breakdown of every graded pick from March 1-7, including the misses.

THE WINS (5)

Mar 3 — BOS -6.5 (SHARP) ✓
Celtics at home, opponent B2B, strong NET_RATING_GAP. Boston won by 14. The model estimated 10-point margin; the spread was set at 6.5. Clean cover.

Mar 4 — OKC -4 (SHARP) ✓
Thunder have the best net rating in the West this season. BENCH_EDGE fired hard — their second unit is elite. Won by 11.

Mar 5 — DEN ML -185 (LEAN) ✓
Home, rested, and Jokic had a favorable matchup signal. Took the ML over the spread because the line value was better. Won straight up.

Mar 6 — MIL -8 (SHARP) ✓
Classic B2B_FATIGUE setup. Opponent on their second game in two nights, Milwaukee on 3 days rest. Bucks won by 11. Covered easily.

Mar 7 — LAL +2.5 (LEAN) ✓
Underdog play. JUICE_FADE signal fired on the favorite — heavy public money with no corresponding edge in the model. Lakers covered +2.5.

THE LOSSES (2)

Mar 1 — MIA -3 (SHARP) ✗
The model had this right statistically. Miami had the better net rating, the better bench, and a rested schedule. What it couldn't account for: a key rotation player exiting in Q1. Heat lost by 2. These happen.

Mar 2 — PHX +6 (LEAN) ✗
Underdog play that didn't connect. The JUICE_FADE signal was present but weak. In retrospect this one was borderline — the edge score was 8.1, right at the LEAN threshold. Picks at exactly threshold will get extra scrutiny going forward.

TAKEAWAYS

The 5-2 record on SHARP picks is meaningful. The 1-1 on LEAN picks matches our expectation — LEANs are lower conviction by design. Every pick was logged before tip-off and every grade is verifiable. That's the standard.`,
  },
  {
  category: 'GUIDE',
  date: 'Always updated',
  title: 'How to Read OTJ: The Complete FAQ',
  excerpt: '22 questions answered — edge scores, signal tags, the parlay builder, record tracking, and how props work. Start here if you\'re new.',
  content: '', // not needed — onClick navigates to /faq instead
}
];

// ── Dynamic Star Injury Alert Banner ─────────────────────────────────────────
// Reads fresh scratches from today's slate data — no hardcoding needed.
// Auto-triggers for any player with tenure="fresh" on game day.
function InjuryAlertBanner({ alerts }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || !alerts?.length) return null;
  return (
    <div style={{
      background: 'rgba(239,68,68,0.08)', borderBottom: '1px solid rgba(239,68,68,0.2)',
      padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1 }}>
        <span style={{ fontSize: 9, fontFamily: MONO, letterSpacing: '0.15em', color: '#ef4444', fontWeight: 700, whiteSpace: 'nowrap' }}>
          🚨 LATE INJURY
        </span>
        {alerts.map((a, i) => (
          <span key={i} style={{ fontSize: 10, fontFamily: MONO, color: '#9ca3af' }}>
            <span style={{ color: '#f87171', fontWeight: 700 }}>{a.player}</span>
            <span style={{ color: '#4a5568' }}> · {a.team} · </span>
            <span style={{ color: '#ef4444' }}>{a.status}</span>
            <span style={{ color: '#4a5568' }}> — {a.note}</span>
            {i < alerts.length - 1 && <span style={{ color: '#374151' }}> &nbsp;·&nbsp; </span>}
          </span>
        ))}
      </div>
      <button onClick={() => setDismissed(true)} style={{
        background: 'none', border: 'none', color: '#4a5568', cursor: 'pointer',
        fontSize: 14, lineHeight: 1, padding: '0 4px', fontFamily: MONO,
        flexShrink: 0,
      }}>✕</button>
    </div>
  );
}

// ── Ticker ────────────────────────────────────────────────────────────────────
function Ticker({ items }) {
  return (
    <div style={{
      overflow: 'hidden', borderBottom: '1px solid rgba(255,255,255,0.04)',
      background: 'rgba(239,68,68,0.04)', height: 28,
      display: 'flex', alignItems: 'center',
    }}>
      <div style={{
        display: 'flex', gap: 48, whiteSpace: 'nowrap',
        animation: 'ticker 20s linear infinite',
        fontSize: 10, color: '#6b7280', fontFamily: MONO, letterSpacing: '0.08em',
      }}>
        {[...items, ...items].map((item, i) => (
          <span key={i}>
            <span style={{ color: item.win ? '#22c55e' : item.win === false ? '#ef4444' : '#4a5568', marginRight: 6 }}>
              {item.win ? '✓' : item.win === false ? '✗' : '·'}
            </span>
            {item.text}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Record badge ──────────────────────────────────────────────────────────────
function RecordBadge({ label, value, accent }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '12px 20px', borderRight: '1px solid rgba(255,255,255,0.05)',
    }}>
      <div style={{ fontSize: 9, color: '#374151', letterSpacing: '0.15em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent || '#f1f5f9', fontFamily: MONO }}>{value}</div>
    </div>
  );
}

// ── Pick card ─────────────────────────────────────────────────────────────────
function PickCard({ pick, onClick }) {
  const conf = pick.confidence || 'LEAN';
  const confColor = { HIGH: '#22c55e', SHARP: '#22c55e', LEAN: '#fbbf24', MED: '#fbbf24', LOW: '#6b7280' }[conf] || '#6b7280';
  return (
    <div onClick={onClick} style={{
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 8, padding: '16px 18px', cursor: 'pointer',
      transition: 'all 0.15s ease', position: 'relative', overflow: 'hidden',
    }}
    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; }}
    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: confColor, borderRadius: '8px 0 0 8px' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: '#6b7280', letterSpacing: '0.1em', marginBottom: 3 }}>{pick.sport || 'NBA'} · {pick.bet_type || 'SPREAD'}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', fontFamily: MONO }}>{pick.team || pick.matchup || '—'}</div>
          <div style={{ fontSize: 11, color: '#4a5568', marginTop: 2 }}>{pick.matchup_label || ''}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, padding: '3px 8px', borderRadius: 4, background: `${confColor}18`, color: confColor, border: `1px solid ${confColor}40`, letterSpacing: '0.12em', fontFamily: MONO }}>{conf}</div>
          {pick.edge_score && <div style={{ fontSize: 18, fontWeight: 800, color: '#ef4444', marginTop: 6, fontFamily: MONO }}>{pick.edge_score}</div>}
        </div>
      </div>
      {pick.signal_summary && (
        <div style={{ fontSize: 10, color: '#374151', lineHeight: 1.6, borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 8, marginTop: 4 }}>
          {pick.signal_summary}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {(pick.tags || []).map(tag => (
          <span key={tag} style={{ fontSize: 9, padding: '2px 7px', borderRadius: 3, background: 'rgba(255,255,255,0.04)', color: '#374151', letterSpacing: '0.1em' }}>{tag}</span>
        ))}
      </div>
    </div>
  );
}

// ── Post card ─────────────────────────────────────────────────────────────────
function PostCard({ post, onClick }) {
  return (
    <div onClick={onClick} style={{ padding: '18px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}
    onMouseEnter={e => e.currentTarget.querySelector('.post-title').style.color = '#ef4444'}
    onMouseLeave={e => e.currentTarget.querySelector('.post-title').style.color = '#f1f5f9'}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 3, background: 'rgba(239,68,68,0.12)', color: '#ef4444', letterSpacing: '0.12em', fontFamily: MONO }}>{post.category}</span>
        <span style={{ fontSize: 10, color: '#374151' }}>{post.date}</span>
        <span style={{ fontSize: 9, color: '#1e293b', marginLeft: 'auto', letterSpacing: '0.08em' }}>READ →</span>
      </div>
      <div className="post-title" style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.4, marginBottom: 6, transition: 'color 0.15s ease' }}>{post.title}</div>
      <div style={{ fontSize: 11, color: '#4a5568', lineHeight: 1.6 }}>{post.excerpt}</div>
    </div>
  );
}

// ── Post modal ────────────────────────────────────────────────────────────────
function PostModal({ post, onClose }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  const paragraphs = post.content.split('\n\n').map((block, i) => {
    const lines = block.split('\n').filter(l => l.trim());
    return (
      <div key={i} style={{ marginBottom: 20 }}>
        {lines.map((line, j) => {
          const isHeader = line === line.toUpperCase() && line.trim().length > 3 && !line.includes('.') && line.trim().length < 60;
          return (
            <div key={j} style={{
              fontSize: isHeader ? 10 : 13,
              fontWeight: isHeader ? 700 : 400,
              color: isHeader ? '#ef4444' : '#94a3b8',
              letterSpacing: isHeader ? '0.18em' : '0',
              lineHeight: isHeader ? 1.4 : 1.85,
              marginTop: isHeader ? 28 : 0,
              marginBottom: isHeader ? 12 : 0,
              fontFamily: isHeader ? MONO : "'Georgia', serif",
            }}>{line}</div>
          );
        })}
      </div>
    );
  });

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '40px 16px', overflowY: 'auto',
    }}>
      <div style={{
        width: '100%', maxWidth: 680, background: '#0d0d18',
        border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
        overflow: 'hidden', animation: 'slideUp 0.2s ease',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(239,68,68,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 3, background: 'rgba(239,68,68,0.15)', color: '#ef4444', letterSpacing: '0.12em', fontFamily: MONO }}>{post.category}</span>
              <span style={{ fontSize: 10, color: '#374151' }}>{post.date}</span>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a5568', fontSize: 18, padding: 4, transition: 'color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.color = '#f1f5f9'}
              onMouseLeave={e => e.currentTarget.style.color = '#4a5568'}>✕</button>
          </div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#f1f5f9', lineHeight: 1.3, letterSpacing: '-0.02em' }}>{post.title}</h2>
        </div>
        {/* Body */}
        <div style={{ padding: '24px 28px' }}>{paragraphs}</div>
        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: '#1e293b', letterSpacing: '0.1em' }}>OVERTIME JOURNAL · {post.date}</span>
          <button onClick={onClose} style={{ fontSize: 9, padding: '6px 14px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280', cursor: 'pointer', fontFamily: MONO, letterSpacing: '0.1em', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#f1f5f9'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#6b7280'; }}>
            CLOSE ✕
          </button>
        </div>
      </div>
    </div>
  );
}

const FALLBACK_TICKER = [
  { text: "BOS def DAL 114-103 · FINAL", win: true },
  { text: "MIA def BKN 110-98 · FINAL", win: true },
  { text: "HOU def GSW 115-113 · FINAL", win: false },
  { text: "OKC @ DEN · 9:00 PM ET", win: null },
  { text: "LAL @ PHX · 10:00 PM ET", win: null },
];

function formatGameTime(raw) {
  if (!raw) return 'TBD';
  try {
    const d = new Date(raw);
    if (isNaN(d)) return raw;
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', hour12: true }) + ' ET';
  } catch { return raw; }
}

function formatTickerItem(result) {
  if (!result) return null;
  const win = result.result === 'W' || result.result === 'win' || result.won === true;
  const text = [result.matchup || result.game, result.pick || result.lean, result.score || result.final_score || ''].filter(Boolean).join(' · ');
  return { text, win };
}

// ── Compute all record values from slates array ───────────────────────────────
function computeRecords(slates) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // Yesterday string — resolve writes results to yesterday's slate date
  const yesterdayDate = new Date(today);
  yesterdayDate.setDate(today.getDate() - 1);
  const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

  const dayOfWeek = today.getDay();
  const daysToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - daysToMon);
  const weekStartStr = weekStart.toISOString().split('T')[0];
  const monthStartStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;

  let weekW = 0, weekL = 0, monthW = 0, monthL = 0;
  let yesterday = '—', allTime = '—';

  // Sort descending — most recent first
  const sorted = [...slates].sort((a, b) => b.date.localeCompare(a.date));

  for (const slate of sorted) {
    const results = slate.yesterday_results || [];
    const dateStr = slate.date;

    // Only count results from slates that have actual graded games
    // Skip today's slate for W/L counting — it hasn't been graded yet
    const w = dateStr < todayStr ? results.filter(r => r.result === 'W' || r.result === 'win').length : 0;
    const l = dateStr < todayStr ? results.filter(r => r.result === 'L' || r.result === 'loss').length : 0;

    // Yesterday = most recent slate with graded results (skip today)
    if (yesterday === '—' && (w + l) > 0 && dateStr < todayStr) yesterday = `${w}-${l}`;

    // Week/month sums — only past dates with results
    if (dateStr >= weekStartStr && dateStr < todayStr) { weekW += w; weekL += l; }
    if (dateStr >= monthStartStr && dateStr < todayStr) { monthW += w; monthL += l; }

    // All-time: use cumulative_record from the most recent slate that has it
    // Check yesterday's slate first, then fall back to any recent slate
    if (allTime === '—' && slate.cumulative_record && dateStr <= todayStr) {
      allTime = slate.cumulative_record;
    }
  }

  // Fallback all-time: sum all graded results if no cumulative_record anywhere
  if (allTime === '—') {
    let totalW = 0, totalL = 0;
    for (const slate of slates) {
      if (slate.date >= todayStr) continue; // skip today
      const results = slate.yesterday_results || [];
      totalW += results.filter(r => r.result === 'W' || r.result === 'win').length;
      totalL += results.filter(r => r.result === 'L' || r.result === 'loss').length;
    }
    if (totalW + totalL > 0) allTime = `${totalW}-${totalL}`;
  }

  return {
    yesterday,
    week:  weekW  + weekL  > 0 ? `${weekW}-${weekL}`   : '—',
    month: monthW + monthL > 0 ? `${monthW}-${monthL}` : '—',
    allTime,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

// ── Community Wins Carousel ───────────────────────────────────────────────────
const TESTIMONIALS = [
  {
    img: '/testimonials/t1.jpeg',
    caption: 'Helping pay for vet bills 🐶',
    sub: 'OTJ community · Mar 12',
  },
  {
    img: '/testimonials/t2.jpeg',
    caption: '$15 → $154 on the safe 6-leg parlay',
    sub: 'live-betting-chat · Mar 13',
  },
  {
    img: '/testimonials/t3.jpeg',
    caption: '$291 profit + $98 FanCash',
    sub: '"You learn and come back better"',
  },
  {
    img: '/testimonials/t4.jpeg',
    caption: '"Three days in a row!!! Shout out to @theovertimejournal"',
    sub: '$20 → $171 · 5-Leg Parlay · +757',
  },
];

function CommunityCarousel() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActive(prev => (prev + 1) % TESTIMONIALS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const t = TESTIMONIALS[active];

  return (
    <div style={{ fontFamily: "'JetBrains Mono','SF Mono',monospace", width: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 9, letterSpacing: '0.18em', color: '#ef4444', fontWeight: 700 }}>🏆 COMMUNITY WINS</span>
        <div style={{ fontSize: 10, color: '#4a5568', marginTop: 3 }}>Real tickets. Real people. Real edge.</div>
      </div>

      {/* Card */}
      <div style={{
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 10, overflow: 'hidden',
      }}>
        {/* Image — contain so nothing gets cut off */}
        <div style={{
          width: '100%', background: '#0d0d18',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 280,
        }}>
          <img
            src={t.img}
            alt={t.caption}
            style={{
              maxWidth: '100%',
              maxHeight: 380,
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        </div>

        {/* Caption */}
        <div style={{ padding: '10px 14px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#f1f5f9', marginBottom: 3 }}>{t.caption}</div>
          <div style={{ fontSize: 10, color: '#4a5568' }}>{t.sub}</div>
        </div>
      </div>

      {/* Dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 }}>
        {TESTIMONIALS.map((_, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            style={{
              width: i === active ? 20 : 6, height: 6, borderRadius: 3,
              background: i === active ? '#ef4444' : '#1e293b',
              border: 'none', cursor: 'pointer', padding: 0,
              transition: 'all 0.3s ease',
            }}
          />
        ))}
      </div>

      {/* Discord CTA */}
      <div style={{ textAlign: 'center', marginTop: 12 }}>
        <a
          href="https://discord.gg/j3nV3CBY"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 10, color: '#818cf8', fontWeight: 700,
            textDecoration: 'none', letterSpacing: '0.05em',
          }}
        >
          Share your win in the community →
        </a>
      </div>
    </div>
  );
}

export default function LandingPage({ user, profile, sessionValidated }) {
  const navigate = useNavigate();
  const [activePost,  setActivePost]  = useState(null);
  const [tickerItems, setTickerItems] = useState([]);
  const [picks,       setPicks]       = useState([]);
  const [record,      setRecord]      = useState({ yesterday: '—', week: '—', month: '—', allTime: '—' });
  const [loading,     setLoading]     = useState(true);
  const [starAlerts,   setStarAlerts]   = useState([]);
  const heroRef = useRef(null);

  // ── Live News Feed ──
  const [liveFeed, setLiveFeed] = useState([]);
  const [blogPosts, setBlogPosts] = useState([]);
  const [feedFilter, setFeedFilter] = useState('all'); // all, nba, ncaa, injuries, scores, journal
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedLimit, setFeedLimit] = useState(25);

  // Fetch live news feed + blog posts from Supabase
  const fetchFeed = useCallback(async () => {
    try {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); })();

      const [newsRes, blogRes] = await Promise.all([
        supabase.from('news_feed')
          .select('*')
          .gte('date', yesterday)
          .eq('published', true)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('blog_posts')
          .select('*')
          
          .order('date', { ascending: false })
          .limit(10),
      ]);

      setLiveFeed(newsRes.data || []);
      setBlogPosts(blogRes.data || []);
    } catch (e) {
      console.warn('[Feed] fetch error:', e.message);
    } finally {
      setFeedLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed();
    // Refresh feed every 60 seconds
    const interval = setInterval(fetchFeed, 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchFeed]);

  const fetchSlateData = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      const { data: slates, error } = await supabase
        .from('slates')
        .select('date, games, yesterday_record, yesterday_results, cumulative_record, headline, games_count, otj_parlay')
        .eq('sport', 'nba')
        .order('date', { ascending: false })
        .limit(30);

      if (error) throw error;
      if (!slates?.length) { setLoading(false); return; }

      const todaySlate = slates.find(s => s.date === today) || slates[0];

      // ── Live record from real data ──────────────────────────────────
      setRecord(computeRecords(slates));

      // ── Ticker ──────────────────────────────────────────────────────
      const etHour = (new Date().getUTCHours() + 24 - 5) % 24;

      if (etHour >= 21 || etHour < 6) {
        const liveTicker = todaySlate?.live_ticker || [];
        if (liveTicker.length > 0) {
          setTickerItems(liveTicker.map(t => ({ text: t.display, win: t.pick_result === 'W' ? true : t.pick_result === 'L' ? false : null })));
          setLoading(false); return;
        }
      }

      if (etHour >= 15 && etHour < 21) {
        const upcoming = (todaySlate?.games || []).map(g => ({ text: `${g.matchup || ''} · ${formatGameTime(g.game_time)}`, win: null })).filter(t => t.text.length > 5);
        if (upcoming.length > 0) { setTickerItems(upcoming); setLoading(false); return; }
      }

      const allResults = [];
      for (const slate of slates.slice(0, 4)) {
        for (const r of (slate.yesterday_results || [])) {
          const item = formatTickerItem(r);
          if (item?.text) allResults.push(item);
        }
      }
      if (allResults.length > 0) setTickerItems(allResults);

      // ── Today's top picks ──────────────────────────────────────────
      const games = todaySlate?.games || [];
      const topPicks = games
        .filter(g => (g.edge?.score || 0) > 15)
        .sort((a, b) => (b.edge?.score || 0) - (a.edge?.score || 0))
        .slice(0, 3)
        .map(g => ({
          sport: 'NBA', bet_type: g.edge?.bet_type || 'SPREAD',
          team: g.edge?.lean || g.matchup,
          matchup_label: `${g.matchup} · ${formatGameTime(g.game_time)}`,
          confidence: g.edge?.confidence || 'LEAN',
          edge_score: Math.round(g.edge?.score || 0),
          signal_summary: g.edge?.signals?.[0]?.detail || '',
          tags: (g.edge?.signals || []).slice(0, 3).map(s => s.type || '').filter(Boolean),
        }));

      setPicks(topPicks);

      // ── Dynamic star injury alerts ─────────────────────────────────
      // Scan today's games for fresh scratches — auto-banner on game day
      const freshAlerts = [];
      for (const g of games) {
        const allInjuries = [
          ...(g.home?.injuries || []).map(p => ({ ...p, team: g.home?.team || '' })),
          ...(g.away?.injuries || []).map(p => ({ ...p, team: g.away?.team || '' })),
        ];
        for (const inj of allInjuries) {
          if (inj.tenure === 'fresh' && inj.status === 'Out') {
            freshAlerts.push({
              player: inj.name,
              team: inj.team,
              status: 'OUT',
              note: 'Late scratch — lines may not be fully adjusted',
            });
          }
        }
      }
      setStarAlerts(freshAlerts);
    } catch (err) {
      console.warn('[LandingPage] Supabase fetch failed:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSlateData();
    const hour = new Date().getHours();
    if (hour >= 18 || hour < 2) {
      const interval = setInterval(fetchSlateData, 8 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [fetchSlateData]);

  useEffect(() => {
    const onScroll = () => { if (heroRef.current) heroRef.current.style.transform = `translateY(${window.scrollY * 0.3}px)`; };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#08080f', color: '#e2e8f0', fontFamily: MONO }}>
      <style>{`
        @keyframes ticker  { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @keyframes fadeUp  { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes pulse   { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }
        .fade-up   { animation: fadeUp 0.5s ease forwards; }
        .fade-up-1 { animation: fadeUp 0.5s 0.1s ease both; }
        .fade-up-2 { animation: fadeUp 0.5s 0.2s ease both; }
        .fade-up-3 { animation: fadeUp 0.5s 0.3s ease both; }
      `}</style>

      {activePost && <PostModal post={activePost} onClose={() => setActivePost(null)} />}

      <InjuryAlertBanner alerts={starAlerts} />
      {/* Discord community banner */}
      <div style={{
        background: 'rgba(88,101,242,0.08)', borderBottom: '1px solid rgba(88,101,242,0.2)',
        padding: '7px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        fontFamily: "'JetBrains Mono','SF Mono',monospace",
      }}>
        <span style={{ fontSize: 13 }}>🔧</span>
        <span style={{ fontSize: 10, color: '#9ca3af' }}>
          live line movement charts incoming — model likes the dog, they go down big, live line gets juicy — that's the window ·
        </span>
        <a
          href="https://discord.gg/j3nV3CBY"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 10, color: '#818cf8', fontWeight: 700, textDecoration: 'none', letterSpacing: '0.05em' }}
        >
          JOIN THE OTJ COMMUNITY →
        </a>
      </div>
      <Ticker items={tickerItems.length ? tickerItems : FALLBACK_TICKER} />

      {/* ── Hero ── */}
      <div style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '48px 24px 40px' }}>
        <div ref={heroRef} style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `radial-gradient(ellipse 60% 50% at 50% 0%, rgba(239,68,68,0.08) 0%, transparent 70%), radial-gradient(ellipse 30% 40% at 80% 50%, rgba(239,68,68,0.04) 0%, transparent 60%)`,
        }} />

        <div style={{ maxWidth: 900, margin: '0 auto', position: 'relative' }}>
          <div className="fade-up" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 9, padding: '4px 10px', borderRadius: 4, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', letterSpacing: '0.15em', marginBottom: 16 }}>
            <span style={{ animation: 'pulse 1.5s infinite', display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#ef4444' }} />
            LIVE PICKS TODAY
          </div>

          <h1 className="fade-up-1" style={{ fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.03em', color: '#f1f5f9', margin: '0 0 12px' }}>
            OVERTIME JOURNAL
          </h1>

          <p className="fade-up-2" style={{ fontSize: 13, color: '#4a5568', lineHeight: 1.7, maxWidth: 480, margin: '0 0 28px' }}>
            Data-driven sports analysis. Bench net ratings, fatigue edges, variance signals — no hype, just numbers.
          </p>

          {/* Record strip — live from Supabase */}
          <div className="fade-up-3" style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden', marginBottom: 28 }}>
            <RecordBadge label="YESTERDAY" value={record.yesterday} accent="#22c55e" />
            <RecordBadge label="THIS WEEK"  value={record.week} />
            <RecordBadge label="THIS MONTH" value={record.month} accent="#fbbf24" />
            <RecordBadge label="ALL TIME"   value={record.allTime} />
          </div>

          <div className="fade-up-3" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/nba')} style={{ padding: '10px 22px', borderRadius: 6, cursor: 'pointer', background: '#ef4444', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, fontFamily: MONO, letterSpacing: '0.1em', transition: 'opacity 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.85'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
              TODAY'S PICKS →
            </button>
            <button onClick={() => navigate('/record')} style={{ padding: '10px 22px', borderRadius: 6, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#6b7280', fontSize: 11, fontWeight: 700, fontFamily: MONO, letterSpacing: '0.1em', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = '#f1f5f9'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#6b7280'; }}>
              VIEW RECORD
            </button>
            {!user && (
              <button onClick={() => navigate('/nba')} style={{ padding: '10px 22px', borderRadius: 6, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: 11, fontWeight: 700, fontFamily: MONO, letterSpacing: '0.1em', transition: 'all 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(239,68,68,0.5)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)'}>
                CREATE FREE ACCOUNT
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 60px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 40, paddingTop: 36 }}>

          {/* ── Left: Live Feed ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: 9, letterSpacing: '0.2em', color: '#374151', borderLeft: '2px solid #ef4444', paddingLeft: 10 }}>LIVE FEED</div>
              <span style={{ fontSize: 9, color: '#1e293b', letterSpacing: '0.1em' }}>
                {feedLoading ? '...' : `${liveFeed.length + blogPosts.length} ITEMS`}
              </span>
            </div>

            {/* Filter pills */}
            <div style={{ display: 'flex', gap: 4, marginTop: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: 'ALL' },
                { id: 'journal', label: '📰 JOURNAL' },
                { id: 'nba', label: '🏀 NBA' },
                { id: 'ncaa', label: '🏀 MARCH MADNESS' },
                { id: 'nhl', label: '🏒 NHL' },
                { id: 'mlb', label: '⚾ MLB' },
                { id: 'nfl', label: '🏈 NFL' },
                { id: 'injuries', label: '🏥 INJURIES' },
                { id: 'scores', label: '🏁 SCORES' },
                { id: 'standout', label: '⭐ STANDOUTS' },
              ].map(f => (
                <button key={f.id} onClick={() => setFeedFilter(f.id)} style={{
                  fontSize: 9, padding: '4px 8px', borderRadius: 4,
                  background: feedFilter === f.id ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${feedFilter === f.id ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  color: feedFilter === f.id ? '#ef4444' : '#4a5568',
                  cursor: 'pointer', fontFamily: MONO, fontWeight: 600, letterSpacing: '0.06em',
                }}>{f.label}</button>
              ))}
            </div>

            {/* Journal posts from blog_posts table */}
            {(feedFilter === 'all' || feedFilter === 'journal') && blogPosts.map((post, i) => (
              <PostCard key={`blog-${i}`} post={{
                ...post,
                date: post.display_date || post.date,
              }} onClick={() => setActivePost({
                ...post,
                date: post.display_date || post.date,
              })} />
            ))}

            {/* Live news items from news_feed table */}
            {(() => {
              let filtered = liveFeed;
              if (feedFilter === 'nba') filtered = liveFeed.filter(n => n.sport === 'nba');
              else if (feedFilter === 'ncaa') filtered = liveFeed.filter(n => n.sport === 'ncaa' || n.type === 'march_madness');
              else if (feedFilter === 'nhl') filtered = liveFeed.filter(n => n.sport === 'nhl');
              else if (feedFilter === 'mlb') filtered = liveFeed.filter(n => n.sport === 'mlb');
              else if (feedFilter === 'nfl') filtered = liveFeed.filter(n => n.sport === 'nfl');
              else if (feedFilter === 'injuries') filtered = liveFeed.filter(n => n.type === 'injury');
              else if (feedFilter === 'scores') filtered = liveFeed.filter(n => n.type?.includes('final') || n.type === 'march_madness');
              else if (feedFilter === 'trades') filtered = liveFeed.filter(n => n.type === 'trade');
              else if (feedFilter === 'standout') filtered = liveFeed.filter(n => n.type === 'standout');
              else if (feedFilter === 'journal') filtered = [];

              const limited = filtered.slice(0, feedLimit);
              const hasMore = filtered.length > feedLimit;

              return (
                <>
                  {limited.map((item, i) => (
                    <div key={`news-${item.id || i}`} style={{
                      padding: '12px 0',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                        <span style={{
                          fontSize: 8, padding: '2px 6px', borderRadius: 3, fontFamily: MONO, letterSpacing: '0.1em',
                          background: item.severity === 'breaking' ? 'rgba(239,68,68,0.15)' : item.severity === 'important' ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.04)',
                          color: item.severity === 'breaking' ? '#ef4444' : item.severity === 'important' ? '#fbbf24' : '#4a5568',
                        }}>
                          {item.severity === 'breaking' ? '🚨 BREAKING' : item.type === 'march_madness' ? '🏀 MADNESS' : item.type === 'highlights' ? '🎬 HIGHLIGHTS' : item.type === 'injury' ? '🏥 INJURY' : item.type === 'trade' ? '💼 TRADE' : item.type === 'line_move' ? '📈 LINE MOVE' : item.type === 'standout' ? '⭐ STANDOUT' : item.type?.includes('live') ? '📡 LIVE' : item.type?.includes('final') ? '🏁 FINAL' : '📰 NEWS'}
                        </span>
                        <span style={{ fontSize: 9, color: '#374151', fontFamily: MONO }}>
                          {item.sport?.toUpperCase()}
                        </span>
                        {item.team && (
                          <span style={{ fontSize: 9, color: '#374151', fontFamily: MONO }}>{item.team}</span>
                        )}
                        <span style={{ fontSize: 9, color: '#1e293b', fontFamily: MONO, marginLeft: 'auto' }}>
                          {new Date(item.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', lineHeight: 1.4, marginBottom: item.body ? 4 : 0 }}>
                        {item.source_url ? (
                          <a href={item.source_url} target="_blank" rel="noopener noreferrer" style={{
                            color: '#f1f5f9', textDecoration: 'none', borderBottom: '1px dotted rgba(255,255,255,0.2)',
                          }}
                            onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                            onMouseLeave={e => e.currentTarget.style.color = '#f1f5f9'}
                          >
                            {item.headline} <span style={{ fontSize: 9, color: '#4a5568' }}>↗</span>
                          </a>
                        ) : item.headline}
                      </div>
                      {item.body && (
                        <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, fontStyle: 'italic' }}>
                          {item.character && (
                            <span style={{
                              fontSize: 9, fontWeight: 700, fontFamily: MONO,
                              color: item.character === 'yumi' ? '#60a5fa' : item.character === 'johnnybot' ? '#f59e0b' : '#22c55e',
                              marginRight: 6,
                            }}>
                              {item.character === 'yumi' ? 'YUMI' : item.character === 'johnnybot' ? 'JBOT' : 'KRASH'}
                            </span>
                          )}
                          {item.body}
                        </div>
                      )}
                    </div>
                  ))}
                  {hasMore && (
                    <button onClick={() => setFeedLimit(prev => prev + 25)} style={{
                      width: '100%', padding: '12px', marginTop: 12, borderRadius: 8,
                      background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)',
                      color: '#ef4444', fontSize: 11, fontFamily: MONO, fontWeight: 700,
                      cursor: 'pointer', letterSpacing: '0.08em',
                    }}>
                      LOAD MORE ({filtered.length - feedLimit} remaining)
                    </button>
                  )}
                </>
              );
            })()}

            {/* Fallback: show hardcoded posts if no Supabase data yet */}
            {blogPosts.length === 0 && liveFeed.length === 0 && !feedLoading && (
              <div style={{ marginTop: 8 }}>
                {BLOG_POSTS.map((post, i) => (
                  <PostCard key={i} post={post} onClick={() => setActivePost(post)} />
                ))}
              </div>
            )}

            {feedLoading && (
              <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 10, color: '#374151', fontFamily: MONO }}>
                Loading feed...
              </div>
            )}

            {/* Newsletter */}
            <div style={{ marginTop: 24, padding: '20px', background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.12)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>GET PICKS IN YOUR INBOX</div>
              <div style={{ fontSize: 10, color: '#4a5568', marginBottom: 14 }}>Daily picks drop at 12PM ET. No spam, unsubscribe anytime.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="email" placeholder="your@email.com" style={{ flex: 1, padding: '8px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#f1f5f9', fontSize: 11, fontFamily: MONO, outline: 'none' }} />
                <button style={{ padding: '8px 16px', borderRadius: 6, cursor: 'pointer', background: '#ef4444', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, fontFamily: MONO, letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>SUBSCRIBE</button>
              </div>
            </div>
          </div>

          {/* ── Right: Picks ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 9, letterSpacing: '0.2em', color: '#374151', borderLeft: '2px solid #ef4444', paddingLeft: 10 }}>TODAY'S PICKS</div>
              <button onClick={() => navigate('/nba')} style={{ fontSize: 9, color: '#1e293b', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.1em', fontFamily: MONO }}>FULL ANALYSIS →</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {picks.length > 0
                ? picks.map((pick, i) => <PickCard key={i} pick={pick} onClick={() => navigate('/nba')} />)
                : (
                  <div style={{ padding: '24px 16px', textAlign: 'center', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 8, color: '#374151', fontSize: 11 }}>
                    {loading ? 'Loading picks...' : 'Picks drop at 3PM ET'}
                  </div>
                )
              }
            </div>

            <div style={{ marginTop: 16, fontSize: 9, color: '#1e293b', lineHeight: 1.7 }}>
              ⚠ All picks are for informational purposes only. Not financial advice. Gamble responsibly. 1-800-GAMBLER.
            </div>

            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 9, letterSpacing: '0.2em', color: '#374151', borderLeft: '2px solid #4a5568', paddingLeft: 10, marginBottom: 12 }}>EXPLORE OTJ</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: '🏀 NBA Edge Analyzer', sub: 'Bench ratings, B2B, variance', path: '/nba' },
                  { label: '🎯 Props', sub: 'Player prop analysis', path: '/props' },
                  { label: '📊 Record', sub: 'Full pick history + ROI', path: '/record' },
                  { label: '🕹 Arcade', sub: 'OTJ JAM & mini games', path: '/arcade' },
                ].map(item => (
                  <div key={item.path} onClick={() => navigate(item.path)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', transition: 'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#f1f5f9' }}>{item.label}</div>
                      <div style={{ fontSize: 9, color: '#374151', marginTop: 2 }}>{item.sub}</div>
                    </div>
                    <span style={{ fontSize: 12, color: '#1e293b' }}>→</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Community Carousel — under picks column ── */}
            <div style={{ marginTop: 24 }}>
              <CommunityCarousel />
            </div>

            {/* ── Discord Live Widget ── */}
            <div style={{ marginTop: 24 }}>
              <div style={{ marginBottom: 10 }}>
                <span style={{ fontSize: 9, letterSpacing: '0.18em', color: '#818cf8', fontWeight: 700 }}>💬 LIVE COMMUNITY</span>
                <div style={{ fontSize: 10, color: '#4a5568', marginTop: 3 }}>See who's online and what's being discussed right now.</div>
              </div>
              <iframe
                src="https://discord.com/widget?id=1480421218158116934&theme=dark"
                width="100%"
                height="400"
                allowTransparency="true"
                frameBorder="0"
                style={{ borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)' }}
                sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
                title="OTJ Discord Community"
              />
            </div>

          </div>

        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, fontSize: 9, color: '#1e293b', letterSpacing: '0.1em' }}>
        <span style={{ color: '#374151', fontWeight: 700 }}>OVERTIME JOURNAL © 2026</span>
        <div style={{ display: 'flex', gap: 20 }}>
          <a href="/privacy" style={{ color: '#1e293b', textDecoration: 'none' }}>PRIVACY</a>
          <a href="/terms"   style={{ color: '#1e293b', textDecoration: 'none' }}>TERMS</a>
          <span>18+ · GAMBLE RESPONSIBLY</span>
        </div>
      </div>
    </div>
  );
}
