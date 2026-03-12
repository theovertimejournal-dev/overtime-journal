import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const MONO = "'JetBrains Mono','SF Mono','Fira Code',monospace";

// ── Blog posts with full content ─────────────────────────────────────────────
const BLOG_POSTS = [
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

  const dayOfWeek = today.getDay();
  const daysToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - daysToMon);
  const weekStartStr = weekStart.toISOString().split('T')[0];
  const monthStartStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;

  let weekW = 0, weekL = 0, monthW = 0, monthL = 0;
  let yesterday = '—', allTime = '—';

  const sorted = [...slates].sort((a, b) => b.date.localeCompare(a.date));

  for (const slate of sorted) {
    const results = slate.yesterday_results || [];
    const dateStr = slate.date;
    const w = results.filter(r => r.result === 'W' || r.result === 'win').length;
    const l = results.filter(r => r.result === 'L' || r.result === 'loss').length;

    if (yesterday === '—' && (w + l) > 0) yesterday = `${w}-${l}`;
    if (dateStr >= weekStartStr && dateStr <= todayStr) { weekW += w; weekL += l; }
    if (dateStr >= monthStartStr && dateStr <= todayStr) { monthW += w; monthL += l; }
    if (allTime === '—' && slate.cumulative_record) allTime = slate.cumulative_record;
  }

  // Fallback all-time: sum all results
  if (allTime === '—') {
    let totalW = 0, totalL = 0;
    for (const slate of slates) {
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
export default function LandingPage({ user, profile, sessionValidated }) {
  const navigate = useNavigate();
  const [activePost,  setActivePost]  = useState(null);
  const [tickerItems, setTickerItems] = useState([]);
  const [picks,       setPicks]       = useState([]);
  const [record,      setRecord]      = useState({ yesterday: '—', week: '—', month: '—', allTime: '—' });
  const [loading,     setLoading]     = useState(true);
  const heroRef = useRef(null);

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

          {/* ── Left: Blog ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: 9, letterSpacing: '0.2em', color: '#374151', borderLeft: '2px solid #ef4444', paddingLeft: 10 }}>LATEST FROM OTJ</div>
              <span style={{ fontSize: 9, color: '#1e293b', letterSpacing: '0.1em' }}>{BLOG_POSTS.length} POSTS</span>
            </div>
            <div style={{ marginTop: 8 }}>
              {BLOG_POSTS.map((post, i) => (
                <PostCard key={i} post={post} onClick={() => setActivePost(post)} />
              ))}
            </div>

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
