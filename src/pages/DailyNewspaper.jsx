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
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
  }
 
  .otj-daily .main-grid {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 2fr);
    gap: 0;
  }
 
  @media (max-width: 768px) {
    .otj-daily .content-columns { grid-template-columns: 1fr; }
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
    const jq = supabase.from("blog_posts").select("*").eq("sport", "nba").order("date", { ascending: false });
    if (date) jq.eq("date", date);
 
    const [jr, sr, rr, nr] = await Promise.all([
      jq.limit(1),
      supabase.from("slates").select("*").eq("sport", "nba").eq("date", date).maybeSingle(),
      supabase.from("yesterday_results").select("*").eq("sport", "nba").order("date", { ascending: false }).limit(1),
      supabase.from("news_feed").select("*").eq("date", date).eq("published", true).order("created_at", { ascending: false }).limit(10),
    ]);
    setJournal(jr.data?.[0] || null);
    setSlate(sr.data || null);
    setYesterdayResults(rr.data?.[0] || null);
    setNewsItems(nr.data || []);
    setLoading(false);
  }, []);
 
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
      return (
        <div key={i} style={{ marginBottom: 20 }}>
          {lines.map((line, j) => {
            const isHeader = line === line.toUpperCase() && line.trim().length > 3
              && !line.includes('.') && line.trim().length < 80;
 
            if (isHeader) return (
              <div key={j} style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: 15, fontWeight: 900, color: '#f1f5f9',
                letterSpacing: '0.06em', marginTop: i > 0 ? 24 : 0, marginBottom: 10,
                paddingBottom: 5, borderBottom: '1px solid var(--rule)',
              }}>{line}</div>
            );
 
            const cm = line.match(/(Yumi|Johnnybot|Krash)/);
            if (cm) {
              const c = cm[1] === 'Yumi' ? 'var(--yumi)' : cm[1] === 'Johnnybot' ? 'var(--jbot)' : 'var(--krash)';
              return (
                <div key={j} className="quote-line" style={{ borderLeft: `3px solid ${c}` }}>
                  {line.split(/(Yumi|Johnnybot|Krash)/).map((p, k) => {
                    if (/Yumi|Johnnybot|Krash/.test(p)) {
                      const cc = p === 'Yumi' ? 'var(--yumi)' : p === 'Johnnybot' ? 'var(--jbot)' : 'var(--krash)';
                      return <span key={k} className="char-tag" style={{ background: `${cc}15`, color: cc }}>{p}</span>;
                    }
                    return <span key={k}>{p}</span>;
                  })}
                </div>
              );
            }
 
            return <div key={j} className="body-text" style={{ marginBottom: 4 }}>{line}</div>;
          })}
        </div>
      );
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
 
                {/* Two-column body on desktop */}
                <div className="content-columns">
                  {(() => {
                    const blocks = (journal.content || '').split('\n\n');
                    const mid = Math.ceil(blocks.length / 2);
                    return (
                      <>
                        <div className="col-border-right">{renderContent(blocks.slice(0, mid).join('\n\n'))}</div>
                        <div>{renderContent(blocks.slice(mid).join('\n\n'))}</div>
                      </>
                    );
                  })()}
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
                <div className="section-label" style={{ fontFamily: MONO, marginBottom: 8 }}>TONIGHT</div>
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
