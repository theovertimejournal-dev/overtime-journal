import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const MONO = "'JetBrains Mono','SF Mono','Fira Code',monospace";

// ── FAQ Data ──────────────────────────────────────────────────────────────────
const FAQ_SECTIONS = [
  {
    section: 'READING THE GAME CARDS',
    icon: '🏀',
    items: [
      {
        q: 'What does the edge score number mean?',
        a: `The edge score is the model's confidence rating for a pick, on a scale from 0–100. Think of it as how many signals are pointing in the same direction at once.\n\nSHARP (score ≥ 14): Multiple strong signals aligned. This is the model's highest conviction tier.\nLEAN (score ≥ 8): Real signal present, but less certainty. Playable but size down.\nINFO (< 8): Context only. Not a pick recommendation.\n\nThe higher the score, the more the data is stacking up on one side. A score of 18 doesn't mean "guaranteed win" — it means the model found more evidence than usual. Nothing is guaranteed in sports.`,
      },
      {
        q: 'What are the signal tags like B2B_FATIGUE and NET_RATING_GAP?',
        a: `Each signal is a specific, named reason the model is leaning one way. Here's a quick reference:\n\nNET_RATING_GAP — One team is significantly better per possession than the other (best overall predictor).\nBENCH_EDGE — The second unit of one team is meaningfully better. Books often don't price this in fully.\nB2B_FATIGUE — A team played last night and is now fatigued. Road B2Bs are especially punishing.\nCLOSE_GAMES — One team has a proven track record in tight games (requires 8+ game sample).\nDEF_TRENDING_WORSE — A team is allowing more points recently than their season average suggests.\n3PT_VARIANCE — A team is shooting way above/below their season 3PT% — regression likely coming.\nFRESH_SCRATCH — A player just got ruled out and the line may not have fully adjusted yet.\nGUARD_MATCHUP — A fast, sharp-shooting team is attacking a defense that struggles on the perimeter.\nJUICE_FADE — Heavy public money on one side with no model edge to back it up. Fade signal.\n\nSignals marked STRONG carry more weight than MODERATE or MILD ones.`,
      },
      {
        q: 'What is the Gut Check?',
        a: `The Gut Check is a sanity check on Vegas's spread. The model estimates what it thinks the actual margin will be based on team quality, rest, and situational factors — then compares that to the line.\n\nIf the model thinks a team wins by 8 points but the spread is set at -14, that's a LINE_VALUE mismatch. The model is saying the line looks inflated.\n\nWhen a mismatch of 5+ points is detected, that game gets a gut check flag and is vetoed from the parlay builder. We won't put a leg in a parlay when the model thinks the line is off.`,
      },
      {
        q: 'What does SHARP vs. LEAN mean for my bet sizing?',
        a: `This is personal to your bankroll, but here's the framework OTJ uses internally:\n\nSHARP picks: Full unit. The model is as convicted as it gets.\nLEAN picks: Half unit. Real signal but lower certainty.\nINFO picks: These aren't picks. They're context for understanding the game.\n\nNever bet more than you're comfortable losing on any single game. A 60% win rate is excellent — that still means losing 4 out of 10.`,
      },
      {
        q: 'Why are some games showing no pick?',
        a: `The model only surfaces picks when the evidence clears a minimum threshold. If a game has no SHARP or LEAN recommendation, it means the data didn't produce enough conviction in either direction.\n\nThis is intentional. Forcing a pick on every game is how bad models work. OTJ would rather show you nothing on a toss-up than guess. "No pick" IS a signal — it means both sides look roughly fair.`,
      },
    ],
  },
  {
    section: 'THE OTJ PARLAY BUILDER',
    icon: '🎯',
    items: [
      {
        q: 'How does OTJ build the parlay?',
        a: `The parlay builder runs automatically every day after the main slate is generated. Here's what it does:\n\n1. Takes all SHARP and LEAN picks from that day\n2. Runs two veto checks on each leg:\n   — Gut Check Veto: If the model's estimated margin disagrees with the line by 5+ points, that game is blocked from the parlay\n   — ML Value Filter: If the moneyline odds are worse than -400, it tries the spread instead\n3. Selects the top 3 legs by edge score (max 2 SHARP + 1 LEAN)\n4. Locks the parlay odds at the time it's built — no retroactive changes\n\nThe result is a 3-leg parlay built on the model's best work, with structural guardrails to avoid bad lines.`,
      },
      {
        q: 'Should I always tail the parlay?',
        a: `The parlay is a high-upside product, not a daily staple. Parlays carry vig on every leg — the more legs, the more the books are taking. OTJ caps it at 3 legs for this reason.\n\nTreat the parlay as a bonus play on days when you already like the individual legs. If you don't like one of the three legs as a standalone pick, you probably shouldn't be in the parlay that day.\n\nThe March 11 parlay going $8 → $3,307 was real. So was the -vig on every losing parlay before it.`,
      },
      {
        q: 'Why did the parlay builder skip a game I thought was good?',
        a: `One of two things happened:\n\n1. The game was gut-check vetoed — the model estimated a very different margin than the line, making it a suspect leg even if the pick direction was correct.\n2. The ML odds were heavy (-400+) with a score below SHARP threshold, and the spread wasn't a better option — so the leg was skipped entirely.\n\nYou can still play those games individually. The veto only applies to the parlay builder, not to the individual pick recommendations.`,
      },
    ],
  },
  {
    section: 'THE RECORD & TRANSPARENCY',
    icon: '📊',
    items: [
      {
        q: 'How is the win/loss record tracked?',
        a: `Every pick is logged to a Supabase database before tip-off. The timestamp is immutable — nobody can go back and add retroactive picks after the result is known.\n\nEvery morning, a script runs that pulls final scores and grades every pick from the night before. Wins and losses are logged against the pick that was logged pre-game.\n\nThe record you see on the landing page and the Record page is pulled live from this database every time the page loads. It's not manually updated. It's not cherry-picked.`,
      },
      {
        q: 'Why does the record show dashes for some periods?',
        a: `Dashes (—) mean no graded picks exist for that time period yet. This happens in two situations:\n\n1. The site is new and picks haven't been graded retroactively for early dates yet.\n2. The current week or month started recently and there aren't enough picks to show a meaningful number.\n\nAs the grading system accumulates more history, the dashes will fill in. The goal is full transparency — showing a fake record is worse than showing a dash.`,
      },
      {
        q: 'What counts as a win? Do pushes count?',
        a: `A win is a pick that covered. A loss is a pick that didn't. Pushes (exact line hit) are not counted as wins or losses — they're excluded from the record entirely.\n\nUnit tracking uses a simplified model: +1.0 unit for a win, -1.1 units for a loss (to account for standard -110 vig). This gives you a realistic picture of profitability, not just raw win percentage.`,
      },
    ],
  },
  {
    section: 'PLAYER PROPS',
    icon: '🎲',
    items: [
      {
        q: 'How does the props scorer work?',
        a: `The props scorer is separate from the game pick model. It looks at individual players and scores them on OVER/UNDER for their stat lines.\n\nKey factors:\nL5 Hit Rate: Did the player actually go over this line in their last 5 games? If they hit 1/5, that's a massive red flag regardless of season averages.\nForm Collapse: If the player's last 5 average is 30%+ below their season average, the model applies a heavy FORM_COLLAPSE penalty.\nHot Streak: If L5 average is 20%+ above season, the model adds a hot streak bonus.\nOpponent Defense Rank: How many points does the opponent allow per game? Affects OVER/UNDER lean.\nPace Factor: High-pace matchups favor counting stats. Slow games suppress them.\nMinutes Trending: If a player is getting significantly fewer minutes recently, props are penalized.`,
      },
      {
        q: 'What does the hit rate check mean?',
        a: `Hit rate is how often the player actually went OVER their line in the last 5 games — not based on averages, but on the actual game-by-game results.\n\n4-5/5 hit rate = +12 to +18 score bonus (hot, keep going OVER)\n2-3/5 = neutral\n0-1/5 = -14 to -20 score penalty (not hitting this line recently)\n\nThis is the most important check for props. A player can average 25 points on the season but if they've hit their 24.5 line only once in 5 games, the OVER is a bad bet.`,
      },
      {
        q: 'Why do some good players not show up in the props slate?',
        a: `The props slate is limited to the top 20 props by score each day, filtered by a minimum threshold. A player won't appear if:\n\n— Their score falls below the minimum confidence threshold\n— They have a form collapse or minutes trending down signal that tanks their score\n— Their season average is too close to the line to generate a strong signal either way\n— Their last 5 hit rate is neutral (2-3/5) with no other supporting signals\n\nNot appearing in the slate isn't necessarily bad — it just means the model doesn't have enough conviction on them today.`,
      },
    ],
  },
  {
    section: 'ACCOUNT & SUBSCRIPTIONS',
    icon: '⚡',
    items: [
      {
        q: 'What do I get for free vs. paid?',
        a: `Free tier: Game cards with basic team info, injury report, and gut check flag. You can see that a pick exists but not the full signal breakdown.\n\nPro ($9.99/mo): Full signal breakdown on every game, complete parlay builder with all legs, props slate (top 20 daily), gut check detail with LINE_VALUE flags, and full pick history.\n\nVIP ($24.99/mo): Everything in Pro, plus VIP discussion threads on every game, leaderboard access with badge display, and early access to new sports when they launch.\n\nStripe-managed subscriptions — cancel anytime, no annual commitment required.`,
      },
      {
        q: 'When do picks come out?',
        a: `The main slate runs every day at 3PM ET. That's when the Python pipeline fires, pulls live data from the APIs, runs the model, and pushes the results to the site.\n\nProps also drop at 3PM when they're included in the daily run.\n\nThe site updates in real time — when the data is ready, it appears. No manual intervention needed.`,
      },
      {
        q: 'I subscribed to the email list — what should I expect?',
        a: `Daily picks email drops around 3:30PM ET, shortly after the model runs. It includes:\n\n— Today's SHARP and LEAN picks with key signals\n— The day's parlay if one was built\n— Any notable injuries or gut check flags\n— Previous night's results if available\n\nNo spam. No affiliate links. No "hot tip" garbage. Just the model output, formatted for your inbox.`,
      },
    ],
  },
  {
    section: 'GENERAL',
    icon: '💡',
    items: [
      {
        q: 'Is OTJ telling me to bet money?',
        a: `No. All analysis on OTJ is for informational and entertainment purposes only. Nothing on this site is financial advice or betting advice.\n\nThe model is designed to surface edges — situations where the data suggests one side is undervalued. What you do with that information is entirely your decision.\n\nIf you or someone you know has a gambling problem: 1-800-GAMBLER (1-800-426-2537). Please gamble responsibly.`,
      },
      {
        q: 'What sports does OTJ cover?',
        a: `Currently: NBA (full feature set — game picks, parlay builder, props, gut check).\n\nPlanned expansions:\nNHL — launching for the 2026–27 season\nMLB — launching for the 2026 season\nNFL — launching for the 2026–27 season\nNCAA Basketball — targeted for 2027 tournament\n\nThe NBA model architecture is modular, so new sports plug into the same signal framework without rebuilding from scratch.`,
      },
      {
        q: 'How is OTJ different from other sports analytics sites?',
        a: `Three things:\n\n1. The model shows its work. Every pick displays the exact signals that drove it, with strength ratings. You're not taking someone's word for it — you're seeing the reasoning.\n\n2. The record is auditable. Every pick is timestamped before the game. The grading runs automatically. Nobody can go back and change history.\n\n3. It's built to get better. The gut check outcome table, the props hit rate tracking, the signal weight tuning — all of this is data collection infrastructure. Six months from now, the model will be validated or it won't. Either way, the data will tell the truth.`,
      },
    ],
  },
];

// ── Accordion item ────────────────────────────────────────────────────────────
function FAQItem({ item, index, isOpen, onToggle }) {
  return (
    <div style={{
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      overflow: 'hidden',
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', textAlign: 'left', background: 'none', border: 'none',
          cursor: 'pointer', padding: '18px 0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          gap: 16,
        }}
        onMouseEnter={e => e.currentTarget.querySelector('.faq-q').style.color = '#f1f5f9'}
        onMouseLeave={e => e.currentTarget.querySelector('.faq-q').style.color = isOpen ? '#f1f5f9' : '#94a3b8'}
      >
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flex: 1 }}>
          <span style={{
            fontSize: 9, fontFamily: MONO, color: '#ef4444',
            letterSpacing: '0.1em', marginTop: 3, flexShrink: 0,
            opacity: isOpen ? 1 : 0.4,
          }}>
            {String(index + 1).padStart(2, '0')}
          </span>
          <span
            className="faq-q"
            style={{
              fontSize: 14, fontWeight: 600, lineHeight: 1.4,
              color: isOpen ? '#f1f5f9' : '#94a3b8',
              transition: 'color 0.15s ease',
              fontFamily: MONO,
            }}
          >
            {item.q}
          </span>
        </div>
        <span style={{
          fontSize: 16, color: isOpen ? '#ef4444' : '#374151',
          transition: 'all 0.2s ease',
          transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
          flexShrink: 0, marginTop: 2,
          display: 'inline-block',
        }}>+</span>
      </button>

      <div style={{
        maxHeight: isOpen ? '800px' : '0',
        overflow: 'hidden',
        transition: 'max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        <div style={{ paddingBottom: 20, paddingLeft: 28 }}>
          {item.a.split('\n\n').map((para, i) => (
            <div key={i} style={{ marginBottom: i < item.a.split('\n\n').length - 1 ? 14 : 0 }}>
              {para.split('\n').map((line, j) => {
                // Lines with — prefix are definition items
                const isDef = line.startsWith('—') || line.match(/^[A-Z_]+\s*[\(—–:]/);
                const isLabel = !line.startsWith('—') && line.match(/^[A-Z][\w\s]+:/) && line.length < 80;
                return (
                  <div key={j} style={{
                    fontSize: isDef || isLabel ? 12 : 13,
                    color: isDef ? '#6b7280' : '#64748b',
                    lineHeight: 1.75,
                    marginBottom: isDef ? 3 : 0,
                    fontFamily: isDef || isLabel ? MONO : "'Georgia', serif",
                    letterSpacing: isDef ? '0.01em' : '0',
                  }}>
                    {isDef
                      ? <><span style={{ color: '#ef4444' }}>—</span>{line.slice(1)}</>
                      : line
                    }
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Section block ─────────────────────────────────────────────────────────────
function FAQSection({ section, openMap, onToggle, offset }) {
  return (
    <div style={{ marginBottom: 48 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 20, paddingBottom: 12,
        borderBottom: '1px solid rgba(239,68,68,0.15)',
      }}>
        <span style={{ fontSize: 18 }}>{section.icon}</span>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.2em',
          color: '#ef4444', fontFamily: MONO,
        }}>
          {section.section}
        </span>
        <span style={{
          fontSize: 9, color: '#1e293b', fontFamily: MONO,
          marginLeft: 'auto', letterSpacing: '0.1em',
        }}>
          {section.items.length} QUESTIONS
        </span>
      </div>

      {section.items.map((item, i) => (
        <FAQItem
          key={i}
          item={item}
          index={offset + i}
          isOpen={openMap[`${offset + i}`] || false}
          onToggle={() => onToggle(`${offset + i}`)}
        />
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FAQ() {
  const navigate = useNavigate();
  const [openMap, setOpenMap] = useState({ '0': true }); // first Q open by default
  const [search, setSearch] = useState('');

  const toggle = (key) => {
    setOpenMap(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Search filter
  const filtered = search.trim().length > 1
    ? FAQ_SECTIONS.map(s => ({
        ...s,
        items: s.items.filter(item =>
          item.q.toLowerCase().includes(search.toLowerCase()) ||
          item.a.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter(s => s.items.length > 0)
    : FAQ_SECTIONS;

  // Compute offsets for index numbering
  const offsets = [];
  let counter = 0;
  for (const s of filtered) {
    offsets.push(counter);
    counter += s.items.length;
  }

  const totalQ = filtered.reduce((s, sec) => s + sec.items.length, 0);

  return (
    <div style={{
      minHeight: '100vh', background: '#08080f',
      color: '#e2e8f0', fontFamily: MONO,
    }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
        .fade-up { animation: fadeUp 0.4s ease forwards; }
        .fade-up-1 { animation: fadeUp 0.4s 0.08s ease both; }
        .fade-up-2 { animation: fadeUp 0.4s 0.16s ease both; }
      `}</style>

      {/* ── Header ── */}
      <div style={{
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '40px 24px 36px',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Background glow */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 50% 60% at 50% 0%, rgba(239,68,68,0.07) 0%, transparent 70%)',
        }} />

        <div style={{ maxWidth: 720, margin: '0 auto', position: 'relative' }}>
          {/* Breadcrumb */}
          <div className="fade-up" style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 9, color: '#374151', letterSpacing: '0.12em',
            marginBottom: 20,
          }}>
            <span
              onClick={() => navigate('/')}
              style={{ cursor: 'pointer', transition: 'color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
              onMouseLeave={e => e.currentTarget.style.color = '#374151'}
            >HOME</span>
            <span style={{ color: '#1e293b' }}>›</span>
            <span style={{ color: '#6b7280' }}>FAQ</span>
          </div>

          <div className="fade-up" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 9, padding: '3px 10px', borderRadius: 4,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            color: '#ef4444', letterSpacing: '0.15em', marginBottom: 14,
          }}>
            HELP CENTER
          </div>

          <h1 className="fade-up-1" style={{
            fontSize: 'clamp(24px, 4vw, 42px)', fontWeight: 900,
            letterSpacing: '-0.03em', color: '#f1f5f9',
            margin: '0 0 10px', lineHeight: 1.1,
          }}>
            HOW TO READ OTJ
          </h1>

          <p className="fade-up-2" style={{
            fontSize: 13, color: '#4a5568', lineHeight: 1.7,
            margin: '0 0 28px', maxWidth: 480,
          }}>
            Everything you need to understand the picks, signals, parlay builder, and record tracking. {FAQ_SECTIONS.reduce((s, sec) => s + sec.items.length, 0)} questions answered.
          </p>

          {/* Search */}
          <div className="fade-up-2" style={{ position: 'relative', maxWidth: 400 }}>
            <span style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              fontSize: 12, color: '#374151', pointerEvents: 'none',
            }}>⌕</span>
            <input
              type="text"
              placeholder="Search questions..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px 10px 34px',
                borderRadius: 8, boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#f1f5f9', fontSize: 12, fontFamily: MONO,
                outline: 'none', transition: 'border-color 0.15s',
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(239,68,68,0.4)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#374151', fontSize: 14, lineHeight: 1,
                }}
              >✕</button>
            )}
          </div>

          {search && (
            <div style={{ marginTop: 10, fontSize: 10, color: '#374151', letterSpacing: '0.08em' }}>
              {totalQ} result{totalQ !== 1 ? 's' : ''} for "{search}"
            </div>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 80px' }}>

        {filtered.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '60px 20px',
            color: '#374151', fontSize: 13,
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            No questions found for "{search}".<br />
            <span style={{ fontSize: 11, color: '#1e293b' }}>Try different keywords or <span style={{ color: '#ef4444', cursor: 'pointer' }} onClick={() => setSearch('')}>clear the search</span>.</span>
          </div>
        ) : (
          filtered.map((section, si) => (
            <FAQSection
              key={si}
              section={section}
              openMap={openMap}
              onToggle={toggle}
              offset={offsets[si]}
            />
          ))
        )}

        {/* ── Still have questions? ── */}
        {!search && (
          <div style={{
            marginTop: 24,
            padding: '24px',
            background: 'rgba(239,68,68,0.04)',
            border: '1px solid rgba(239,68,68,0.12)',
            borderRadius: 10,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>
              Still have questions?
            </div>
            <div style={{ fontSize: 11, color: '#4a5568', lineHeight: 1.7 }}>
              The best way to learn OTJ is to open a game card and read the signals alongside this FAQ. If something still doesn't make sense, the daily picks email includes a brief signal glossary every week.
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
              <button
                onClick={() => navigate('/nba')}
                style={{
                  padding: '9px 18px', borderRadius: 6, cursor: 'pointer',
                  background: '#ef4444', border: 'none',
                  color: '#fff', fontSize: 11, fontWeight: 700,
                  fontFamily: MONO, letterSpacing: '0.1em',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                SEE TODAY'S PICKS →
              </button>
              <button
                onClick={() => navigate('/')}
                style={{
                  padding: '9px 18px', borderRadius: 6, cursor: 'pointer',
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#6b7280', fontSize: 11, fontWeight: 700,
                  fontFamily: MONO, letterSpacing: '0.1em',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = '#f1f5f9'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#6b7280'; }}
              >
                BACK TO HOME
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.04)',
        padding: '20px 24px', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 12,
        fontSize: 9, color: '#1e293b', letterSpacing: '0.1em',
      }}>
        <span style={{ color: '#374151', fontWeight: 700 }}>OVERTIME JOURNAL © 2026</span>
        <div style={{ display: 'flex', gap: 20 }}>
          <span onClick={() => navigate('/faq')} style={{ cursor: 'pointer', color: '#374151' }}>FAQ</span>
          <a href="/privacy" style={{ color: '#1e293b', textDecoration: 'none' }}>PRIVACY</a>
          <a href="/terms" style={{ color: '#1e293b', textDecoration: 'none' }}>TERMS</a>
          <span>18+ · GAMBLE RESPONSIBLY</span>
        </div>
      </div>
    </div>
  );
}
