import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const MONO = "'JetBrains Mono','SF Mono','Fira Code',monospace";

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Lora:ital,wght@0,400;0,600;1,400&display=swap');

  .otj-daily { 
    --rule: rgba(255,255,255,0.08); 
    --rule-heavy: rgba(239,68,68,0.4);
    --ink: #c9d1d9;
    --ink-dim: #6b7280;
    --ink-faint: #374151;
    --accent: #ef4444;
    --yumi: #60a5fa;
    --jbot: #f59e0b;
    --krash: #22c55e;
  }

  .otj-daily * { box-sizing: border-box; }

  .otj-daily .masthead-title {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: clamp(36px, 8vw, 64px);
    font-weight: 900;
    letter-spacing: -0.02em;
    line-height: 1;
    color: #f1f5f9;
  }

  .otj-daily .headline {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: clamp(22px, 4vw, 32px);
    font-weight: 900;
    line-height: 1.2;
    color: #f1f5f9;
    margin: 0;
  }

  .otj-daily .body-text {
    font-family: 'Lora', Georgia, serif;
    font-size: 15px;
    line-height: 1.85;
    color: var(--ink);
  }

  .otj-daily .section-label {
    font-size: 9px; font-weight: 700; letter-spacing: 0.2em;
    color: var(--accent); text-transform: uppercase;
  }

  .otj-daily .content-columns {
    column-count: 2;
    column-gap: 32px;
    column-rule: 1px solid var(--rule);
  }
  .otj-daily .content-columns > * { break-inside: avoid; }

  .otj-daily .section-head {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 19px; font-weight: 900; color: #f1f5f9;
    letter-spacing: 0.01em; line-height: 1.2;
    margin: 26px 0 12px; padding-bottom: 7px;
    border-bottom: 2px solid var(--accent);
    break-inside: avoid; break-after: avoid;
  }
  .otj-daily .section-head:first-child { margin-top: 0; }

  .otj-daily .team  { font-weight: 700; color: #f1f5f9; }
  .otj-daily .score { font-weight: 700; color: var(--accent); font-family: 'Playfair Display', Georgia, serif; }

  .otj-daily .rundown { list-style: none; padding: 0; margin: 0 0 8px; }
  .otj-daily .rundown li {
    font-family: 'Lora', Georgia, serif; font-size: 14.5px; line-height: 1.6;
    color: var(--ink); padding-left: 20px; position: relative; margin-bottom: 9px;
    break-inside: avoid;
  }
  .otj-daily .rundown li::before {
    content: '▸'; position: absolute; left: 2px; top: 0; color: var(--accent); font-weight: 700;
  }

  .otj-daily .main-grid {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 2fr);
    gap: 0;
  }

  @media (max-width: 768px) {
    .otj-daily .content-columns { column-count: 1; column-rule: none; }
    .otj-daily .main-grid { grid-template-columns: 1fr; }
    .otj-daily .date-row-ends { display: none; }
  }

  .otj-daily .col-border-right {
    border-right: 1px solid var(--rule);
    padding-right: 24px;
    margin-right: 24px;
  }

  @media (max-width: 768px) {
    .otj-daily .col-border-right {
      border-right: none; padding-right: 0; margin-right: 0;
      border-bottom: 1px solid var(--rule);
      padding-bottom: 20px; margin-bottom: 20px;
    }
  }

  .otj-daily .char-tag {
    font-size: 10px; font-weight: 800; letter-spacing: 0.05em;
    padding: 1px 6px; border-radius: 3px; display: inline-block; margin-right: 6px;
  }

  .otj-daily .nav-btn {
    background: none; border: 1px solid var(--rule);
    color: var(--ink-dim); cursor: pointer; padding: 4px 10px;
    border-radius: 4px; font-size: 11px; transition: all 0.15s;
  }
  .otj-daily .nav-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .otj-daily .nav-btn:disabled { opacity: 0.2; cursor: default; }

  .otj-daily .sidebar-section { padding: 16px 0; border-bottom: 1px solid var(--rule); }

  .otj-daily .quote-line {
    padding: 10px 0 10px 16px; margin: 8px 0;
    font-family: 'Lora', Georgia, serif;
    font-size: 14px; line-height: 1.8; color: var(--ink);
  }

  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  .otj-daily .fade { animation: fadeIn 0.4s ease both; }
`;

// Team names + cities we auto-bold in the body so a scanning reader instantly
// sees what each line is about. Case-sensitive on purpose — "Magic" the team
// bolds, "magic" the word doesn't.
const TEAMS = [
  // MLB
  "Diamondbacks","Braves","Orioles","Red Sox","White Sox","Cubs","Reds","Guardians",
  "Rockies","Tigers","Astros","Royals","Angels","Dodgers","Marlins","Brewers","Twins",
  "Mets","Yankees","Athletics","Phillies","Pirates","Padres","Giants","Mariners",
  "Cardinals","Rays","Rangers","Blue Jays","Nationals",
  // NBA
  "Hawks","Celtics","Nets","Hornets","Bulls","Cavaliers","Mavericks","Nuggets","Pistons",
  "Warriors","Rockets","Pacers","Clippers","Lakers","Grizzlies","Heat","Bucks",
  "Timberwolves","Pelicans","Knicks","Thunder","Magic","76ers","Suns","Trail Blazers",
  "Kings","Spurs","Raptors","Jazz","Wizards",
  // NHL
  "Senators","Maple Leafs","Mammoth","Bruins","Oilers","Panthers","Lightning","Kraken","Avalanche",
  // Cities / short forms that show up in copy
  "Colorado","Houston","Milwaukee","Pittsburgh","Boston","Atlanta","Washington","Baltimore",
  "Toronto","Detroit","Cincinnati","Philadelphia","Minnesota","Cleveland","Seattle","Tampa Bay",
  "Tampa","Chicago","San Francisco","Miami","New York","Kansas City","Los Angeles","Ottawa",
  "Denver","Phoenix","Dallas","KC",
];
const TEAM_SET = new Set(TEAMS);
const TEAM_ALT = [...TEAMS]
  .sort((a, b) => b.length - a.length)                       // longest match first
  .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");
// One regex that captures a team name OR a score like 4-3 / 16-12
const ENTITY_RE = new RegExp(`(\\b(?:${TEAM_ALT})\\b|\\b\\d{1,2}-\\d{1,2}\\b)`, "g");

function highlightEntities(text, kp) {
  return text.split(ENTITY_RE).map((p, i) => {
    if (!p) return null;
    if (/^\d{1,2}-\d{1,2}$/.test(p)) return <span key={`${kp}s${i}`} className="score">{p}</span>;
    if (TEAM_SET.has(p)) return <span key={`${kp}t${i}`} className="team">{p}</span>;
    return <span key={`${kp}x${i}`}>{p}</span>;
  });
}

// Parse **bold** and then highlight teams/scores inside the text.
function fmtInline(text, kp) {
  const out = [];
  text.split(/\*\*(.+?)\*\*/g).forEach((seg, i) => {
    if (!seg) return;
    if (i % 2 === 1) {
      out.push(<strong key={`${kp}b${i}`} style={{ color: "#f1f5f9" }}>{highlightEntities(seg, `${kp}b${i}`)}</strong>);
    } else {
      out.push(...highlightEntities(seg, `${kp}p${i}`));
    }
  });
  return out;
}

export default function DailyNewspaper() {
  const [journal, setJournal] = useState(null);
  const [slate, setSlate] = useState(null);
  const [yesterdayResults, setYesterdayResults] = useState(null);
  const [newsItems, setNewsItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const navigate = useNavigate();

  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const currentViewDate = selectedDate || todayET;

  const load = useCallback(async (date) => {
    setLoading(true);
    
    // Calculate yesterday relative to the viewed date
    const viewDateObj = new Date(date + 'T12:00:00');
    const yesterdayObj = new Date(viewDateObj);
    yesterdayObj.setDate(yesterdayObj.getDate() - 1);
    const yesterdayStr = yesterdayObj.toLocaleDateString('en-CA');

    // Journal: if viewing a specific date, try that date first, fallback to latest
    const jq = supabase.from("blog_posts").select("*").eq("sport", "daily").order("date", { ascending: false });
    if (selectedDate) jq.eq("date", selectedDate);

    const [jr, sr, rr, nr] = await Promise.all([
      // Journal — latest or date-specific
      jq.limit(1),
      // Slate — always for the VIEWED date (today's games when viewing today)
      supabase.from("slates").select("*").eq("sport", "nba").eq("date", date).maybeSingle(),
      // Results — for yesterday relative to viewed date
      supabase.from("yesterday_results").select("*").eq("sport", "nba").eq("date", yesterdayStr).maybeSingle()
        .then(r => r).catch(() => 
          // Fallback: just get the latest results
          supabase.from("yesterday_results").select("*").eq("sport", "nba").order("date", { ascending: false }).limit(1)
        ),
      // News — pull for both today AND yesterday so the page isn't empty
      supabase.from("news_feed").select("*").gte("date", yesterdayStr).lte("date", date).eq("published", true).order("created_at", { ascending: false }).limit(15),
    ]);
    setJournal(jr.data?.[0] || null);
    setSlate(sr.data || null);
    setYesterdayResults(rr.data?.[0] || (Array.isArray(rr.data) ? rr.data[0] : null));
    setNewsItems(nr.data || []);
    setLoading(false);
  }, [selectedDate]);

  useEffect(() => { load(currentViewDate); }, [currentViewDate, load]);

  function prevDay() {
    const d = new Date(currentViewDate + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toLocaleDateString('en-CA'));
  }
  function nextDay() {
    const d = new Date(currentViewDate + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    const n = d.toLocaleDateString('en-CA');
    if (n <= todayET) setSelectedDate(n);
  }
  const isToday = currentViewDate === todayET;

  const launchDate = new Date('2026-03-08');
  const viewDate = new Date(currentViewDate + 'T12:00:00');
  const vol = Math.max(1, Math.floor((viewDate - launchDate) / 86400000));
  const dateDisplay = viewDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const yRecord = yesterdayResults?.record || '—';
  const yCumulative = yesterdayResults?.cumulative_record || '—';
  const yStreak = yesterdayResults?.streak || '—';
  const yResults = yesterdayResults?.results || [];
  const sharpGames = (slate?.games || []).filter(g => g.edge?.confidence === 'SHARP');
  const leanGames = (slate?.games || []).filter(g => g.edge?.confidence === 'LEAN');

  const freshInjuries = [];
  for (const game of (slate?.games || [])) {
    for (const side of ['away', 'home']) {
      for (const inj of (game[side]?.injuries || [])) {
        if (inj.tenure === 'fresh') freshInjuries.push({ ...inj, team: game[side]?.team });
      }
    }
  }

  function renderContent(content) {
    if (!content) return null;
    return content.split('\n\n').map((block, i) => {
      const lines = block.split('\n').filter(l => l.trim());
      const nodes = [];
      let bullets = [];
      const flush = (k) => {
        if (bullets.length) {
          nodes.push(
            <ul className="rundown" key={`ul${k}`}>
              {bullets.map((b, bi) => <li key={bi}>{fmtInline(b, `${i}-${k}-${bi}`)}</li>)}
            </ul>
          );
          bullets = [];
        }
      };

      lines.forEach((line, j) => {
        const t = line.trim();

        // Section header: **WRAPPED** or an ALL-CAPS short line
        const hm = t.match(/^\*\*(.+?)\*\*$/);
        const capsHeader = !hm && t === t.toUpperCase() && t.length > 3 && !t.includes('.') && t.length < 80;
        if (hm || capsHeader) {
          flush(j);
          nodes.push(
            <div className="section-head" key={`h${j}`}>
              {(hm ? hm[1] : t).replace(/\*\*/g, '').trim()}
            </div>
          );
          return;
        }

        // Bullet (Rundown)
        if (t.startsWith('- ')) { bullets.push(t.slice(2)); return; }
        flush(j);

        // Voice line: "Yumi: ..." / "Johnnybot: ..." / "Krash: ..."
        const cm = t.match(/^(Yumi|Johnnybot|Krash)\s*:/);
        if (cm) {
          const name = cm[1];
          const c = name === 'Yumi' ? 'var(--yumi)' : name === 'Johnnybot' ? 'var(--jbot)' : 'var(--krash)';
          const rest = t.slice(cm[0].length).trim();
          nodes.push(
            <div key={`v${j}`} className="quote-line" style={{ borderLeft: `3px solid ${c}` }}>
              <span className="char-tag" style={{ background: `${c}18`, color: c }}>{name}</span>
              {fmtInline(rest, `${i}-v${j}`)}
            </div>
          );
          return;
        }

        // Plain paragraph
        nodes.push(
          <div key={`p${j}`} className="body-text" style={{ marginBottom: 6 }}>
            {fmtInline(t, `${i}-p${j}`)}
          </div>
        );
      });
      flush('end');

      return <div key={i} style={{ marginBottom: 18 }}>{nodes}</div>;
    });
  }

  if (loading) return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: MONO, fontSize: 11, color: '#1e293b', letterSpacing: '0.15em' }}>LOADING THE DAILY...</div>
    </div>
  );

  return (
    <div className="otj-daily" style={{ minHeight: '100vh', background: '#08080f' }}>
      <style>{STYLES}</style>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 20px 60px' }}>

        {/* ═══ MASTHEAD ═══ */}
        <div style={{ height: 4, background: 'var(--accent)' }} />
        <div style={{ height: 3 }} />
        <div style={{ height: 1, background: 'var(--rule)' }} />

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 0', fontFamily: MONO, fontSize: 9, color: 'var(--ink-faint)', letterSpacing: '0.15em',
        }}>
          <span className="date-row-ends">VOL. 1 · NO. {vol}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="nav-btn" onClick={prevDay} style={{ fontFamily: MONO }}>◀</button>
            <span style={{ color: 'var(--ink-dim)', fontSize: 10, whiteSpace: 'nowrap' }}>{dateDisplay.toUpperCase()}</span>
            <button className="nav-btn" onClick={nextDay} disabled={isToday} style={{ fontFamily: MONO }}>▶</button>
          </div>
          <span className="date-row-ends">OVERTIMEJOURNAL.COM</span>
        </div>

        <div style={{ textAlign: 'center', padding: '4px 0 12px' }}>
          <div className="masthead-title">THE OTJ DAILY</div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '0.25em', marginTop: 4 }}>
            STORIES · DATA · EDGE
          </div>
        </div>

        <div style={{ borderTop: '2px solid var(--accent)', borderBottom: '1px solid var(--rule-heavy)', height: 0, paddingTop: 3 }} />
        <div style={{ height: 20 }} />

        {/* ═══ MAIN GRID ═══ */}
        <div className="main-grid">

          {/* LEFT: Main Story */}
          <div className="col-border-right fade">
            {journal ? (
              <>
                <div className="section-label" style={{ fontFamily: MONO, marginBottom: 8 }}>{journal.category || 'THE JOURNAL'}</div>
                <h1 className="headline">{journal.title}</h1>
                <p style={{
                  fontFamily: "'Lora', Georgia, serif", fontSize: 14,
                  color: 'var(--ink-dim)', fontStyle: 'italic', lineHeight: 1.7, margin: '12px 0 20px',
                }}>{journal.excerpt}</p>
                <div style={{ height: 1, background: 'var(--rule)', marginBottom: 20 }} />

                {/* Content flows into real newspaper columns */}
                <div className="content-columns">
                  {renderContent(journal.content)}
                </div>
              </>
            ) : (
              <div style={{ padding: '60px 20px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--rule)' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📰</div>
                <div style={{ fontFamily: MONO, fontSize: 13, color: 'var(--ink-dim)' }}>Today's edition is being written...</div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink-faint)', marginTop: 6 }}>Drops every morning at 11AM ET</div>
              </div>
            )}
          </div>

          {/* RIGHT: Sidebar */}
          <div className="fade" style={{ animationDelay: '0.1s', paddingLeft: 0 }}>

            {yesterdayResults && (
              <div className="sidebar-section">
                <div className="section-label" style={{ fontFamily: MONO, marginBottom: 8 }}>LAST NIGHT</div>
                <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 36, fontWeight: 900, color: '#f1f5f9', lineHeight: 1 }}>{yRecord}</div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--ink-faint)', marginTop: 6, lineHeight: 2 }}>
                  Season: {yCumulative} · {yStreak}
                </div>
                {yResults.slice(0, 5).map((r, i) => (
                  <div key={i} style={{
                    fontFamily: MONO, fontSize: 10, color: 'var(--ink-dim)',
                    display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--rule)',
                  }}>
                    <span style={{ color: r.result === 'W' ? 'var(--krash)' : 'var(--accent)' }}>
                      {r.result === 'W' ? '✓' : '✗'} {(r.matchup || '').substring(0, 18)}
                    </span>
                    <span style={{ color: 'var(--ink-faint)' }}>{r.final_score}</span>
                  </div>
                ))}
              </div>
            )}

            {slate && (
              <div className="sidebar-section">
                <div className="section-label" style={{ fontFamily: MONO, marginBottom: 8 }}>{isToday ? "TONIGHT'S GAMES" : "THAT DAY'S SLATE"}</div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink-faint)', marginBottom: 6 }}>{slate.games_count || '—'} games</div>
                {sharpGames.map((g, i) => (
                  <div key={i} style={{ fontFamily: MONO, fontSize: 11, color: '#f1f5f9', padding: '5px 0', borderBottom: '1px solid var(--rule)' }}>
                    {g.edge?.lean} <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 9 }}>SHARP</span>
                    <span style={{ color: 'var(--ink-faint)', marginLeft: 8, fontSize: 10 }}>{g.matchup}</span>
                  </div>
                ))}
                {leanGames.slice(0, 3).map((g, i) => (
                  <div key={i} style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink-dim)', padding: '3px 0' }}>
                    {g.edge?.lean} <span style={{ color: 'var(--ink-faint)' }}>{g.matchup}</span>
                  </div>
                ))}
                <button onClick={() => navigate('/nba')} style={{
                  width: '100%', marginTop: 10, padding: '8px', background: 'transparent',
                  border: '1px solid var(--accent)', color: 'var(--accent)', fontSize: 9,
                  fontFamily: MONO, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.1em',
                }}>FULL SLATE →</button>
              </div>
            )}

            {freshInjuries.length > 0 && (
              <div className="sidebar-section">
                <div className="section-label" style={{ fontFamily: MONO, marginBottom: 8 }}>🏥 INJURY WIRE</div>
                {freshInjuries.map((inj, i) => (
                  <div key={i} style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink-dim)', padding: '3px 0', borderBottom: '1px solid var(--rule)' }}>
                    <span style={{ color: '#f87171', fontWeight: 600 }}>{inj.name}</span>
                    <span style={{ color: 'var(--ink-faint)' }}> · {inj.team} · {inj.status}</span>
                  </div>
                ))}
              </div>
            )}

            {newsItems.length > 0 && (
              <div className="sidebar-section">
                <div className="section-label" style={{ fontFamily: MONO, marginBottom: 8 }}>📡 WIRE</div>
                {newsItems.slice(0, 6).map((item, i) => (
                  <div key={i} style={{ padding: '5px 0', borderBottom: '1px solid var(--rule)' }}>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink-dim)', lineHeight: 1.5 }}>
                      {item.character && (
                        <span className="char-tag" style={{
                          fontSize: 8,
                          background: item.character === 'yumi' ? 'rgba(96,165,250,0.1)' : item.character === 'johnnybot' ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)',
                          color: item.character === 'yumi' ? 'var(--yumi)' : item.character === 'johnnybot' ? 'var(--jbot)' : 'var(--krash)',
                        }}>
                          {item.character === 'yumi' ? 'YUMI' : item.character === 'johnnybot' ? 'JBOT' : 'KRASH'}
                        </span>
                      )}
                      {item.headline?.replace(/^[^\w]+ /, '')}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="sidebar-section">
              <div className="section-label" style={{ fontFamily: MONO, marginBottom: 8 }}>EXPLORE</div>
              {[
                { label: 'NBA Slate', path: '/nba', icon: '🏀' },
                { label: 'Props', path: '/props', icon: '🎯' },
                { label: 'Record', path: '/record', icon: '📊' },
                { label: 'Leaderboard', path: '/leaderboard', icon: '🏆' },
                { label: 'Arcade', path: '/arcade', icon: '🕹' },
              ].map(item => (
                <div key={item.path} onClick={() => navigate(item.path)} style={{
                  fontFamily: MONO, fontSize: 10, color: 'var(--ink-dim)',
                  padding: '5px 0', cursor: 'pointer', borderBottom: '1px solid var(--rule)',
                  transition: 'color 0.12s',
                }}
                  onMouseEnter={e => e.currentTarget.style.color = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--ink-dim)'}
                ><span>{item.icon} {item.label}</span><span style={{ float: 'right', color: 'var(--ink-faint)' }}>→</span></div>
              ))}
            </div>

            <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--ink-faint)', padding: '12px 0', lineHeight: 1.8 }}>
              ⚠ All picks are for informational purposes only. Not financial advice. 1-800-GAMBLER.
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div style={{ marginTop: 40 }}>
          <div style={{ height: 4, background: 'var(--accent)' }} />
          <div style={{ height: 3 }} />
          <div style={{ height: 1, background: 'var(--rule)' }} />
          <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--ink-faint)', letterSpacing: '0.12em', textAlign: 'center', padding: '16px 0' }}>
            THE OTJ DAILY · VOL. 1, NO. {vol} · OVERTIME JOURNAL © 2026
          </div>
        </div>
      </div>
    </div>
  );
}
