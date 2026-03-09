import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const MONO = "'JetBrains Mono','SF Mono','Fira Code',monospace";

// ── Animated ticker ───────────────────────────────────────────────────────────
function Ticker({ items }) {
  return (
    <div style={{
      overflow: 'hidden', borderBottom: '1px solid rgba(255,255,255,0.04)',
      background: 'rgba(239,68,68,0.04)', height: 28,
      display: 'flex', alignItems: 'center',
    }}>
      <div style={{
        display: 'flex', gap: 48, whiteSpace: 'nowrap',
        animation: 'ticker 40s linear infinite',
        fontSize: 10, color: '#6b7280', fontFamily: MONO, letterSpacing: '0.08em',
      }}>
        {[...items, ...items].map((item, i) => (
          <span key={i}>
            <span style={{ color: item.win ? '#22c55e' : '#ef4444', marginRight: 6 }}>
              {item.win ? '✓' : '✗'}
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
  const conf = pick.confidence || 'MED';
  const confColor = { HIGH: '#22c55e', MED: '#fbbf24', LOW: '#6b7280' }[conf] || '#6b7280';

  return (
    <div onClick={onClick} style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 8, padding: '16px 18px',
      cursor: 'pointer', transition: 'all 0.15s ease',
      position: 'relative', overflow: 'hidden',
    }}
    onMouseEnter={e => {
      e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
      e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)';
    }}
    onMouseLeave={e => {
      e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
    }}>
      {/* Confidence stripe */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
        background: confColor, borderRadius: '8px 0 0 8px',
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: '#6b7280', letterSpacing: '0.1em', marginBottom: 3 }}>
            {pick.sport || 'NBA'} · {pick.bet_type || 'SPREAD'}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', fontFamily: MONO }}>
            {pick.team || pick.matchup || '—'}
          </div>
          <div style={{ fontSize: 11, color: '#4a5568', marginTop: 2 }}>{pick.matchup_label || ''}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontSize: 9, padding: '3px 8px', borderRadius: 4,
            background: `${confColor}18`, color: confColor,
            border: `1px solid ${confColor}40`, letterSpacing: '0.12em', fontFamily: MONO,
          }}>
            {conf}
          </div>
          {pick.edge_score && (
            <div style={{ fontSize: 18, fontWeight: 800, color: '#ef4444', marginTop: 6, fontFamily: MONO }}>
              {pick.edge_score}
            </div>
          )}
        </div>
      </div>

      {pick.signal_summary && (
        <div style={{
          fontSize: 10, color: '#374151', lineHeight: 1.6,
          borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 8, marginTop: 4,
        }}>
          {pick.signal_summary}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {(pick.tags || []).map(tag => (
          <span key={tag} style={{
            fontSize: 9, padding: '2px 7px', borderRadius: 3,
            background: 'rgba(255,255,255,0.04)', color: '#374151',
            letterSpacing: '0.1em',
          }}>{tag}</span>
        ))}
      </div>
    </div>
  );
}

// ── Blog/post card ────────────────────────────────────────────────────────────
function PostCard({ post, onClick }) {
  return (
    <div onClick={onClick} style={{
      padding: '18px 0',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      cursor: 'pointer',
    }}
    onMouseEnter={e => e.currentTarget.querySelector('.post-title').style.color = '#ef4444'}
    onMouseLeave={e => e.currentTarget.querySelector('.post-title').style.color = '#f1f5f9'}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6 }}>
        <span style={{
          fontSize: 9, padding: '2px 7px', borderRadius: 3,
          background: 'rgba(239,68,68,0.12)', color: '#ef4444',
          letterSpacing: '0.12em', fontFamily: MONO,
        }}>
          {post.category || 'ANALYSIS'}
        </span>
        <span style={{ fontSize: 10, color: '#374151' }}>
          {post.date || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      </div>
      <div className="post-title" style={{
        fontSize: 15, fontWeight: 700, color: '#f1f5f9',
        lineHeight: 1.4, marginBottom: 6,
        transition: 'color 0.15s ease',
      }}>
        {post.title}
      </div>
      <div style={{ fontSize: 11, color: '#4a5568', lineHeight: 1.6 }}>
        {post.excerpt}
      </div>
    </div>
  );
}

// ── Fallback mock posts (replace with Supabase posts table later) ────────────
const MOCK_POSTS = [
  {
    category: 'BREAKDOWN',
    date: 'Mar 8',
    title: 'Why B2B Fatigue Is The Most Underpriced Edge In The NBA Right Now',
    excerpt: 'Sportsbooks are still pricing B2B games as if teams had 15-man rosters and no travel fatigue data. We ran the numbers on 200+ back-to-backs this season.',
  },
  {
    category: 'SYSTEM',
    date: 'Mar 7',
    title: 'The Close Game Signal: Why 8 Games Minimum Actually Matters',
    excerpt: 'Small sample sizes kill bettors. We explain how OTJ filters out noise and why we require a minimum threshold before trusting close-game performance data.',
  },
  {
    category: 'RECORD',
    date: 'Mar 6',
    title: 'March Week 1 Review: 5-2 On Our Best Confidence Picks',
    excerpt: 'A breakdown of every pick from this week — what hit, what missed, and what the model learned. Transparency is everything.',
  },
  {
    category: 'ANALYSIS',
    date: 'Mar 5',
    title: 'Boston Is Still The Best Bet In The East — Here\'s Why',
    excerpt: 'Despite a rough stretch, BOS underlying numbers remain elite. Fade the narrative, trust the data.',
  },
];

// ── Format a result row into ticker text ─────────────────────────────────────
function formatTickerItem(result) {
  // result shape from yesterday_results array: { matchup, pick, result, score }
  // OR from games table: { matchup, lean, confidence, final_score }
  if (!result) return null;
  const win = result.result === 'W' || result.result === 'win' || result.won === true;
  const text = [
    result.matchup || result.game,
    result.pick || result.lean,
    result.score || result.final_score || '',
  ].filter(Boolean).join(' · ');
  return { text, win };
}

// ─────────────────────────────────────────────────────────────────────────────
export default function LandingPage({ user, profile, sessionValidated }) {
  const navigate = useNavigate();
  const [posts]        = useState(MOCK_POSTS);
  const [tickerItems,  setTickerItems]  = useState([]);
  const [picks,        setPicks]        = useState([]);
  const [record,       setRecord]       = useState({ yesterday: '—', week: '—', month: '—', allTime: '—' });
  const [loading,      setLoading]      = useState(true);
  const heroRef = useRef(null);

  // ── Live data from Supabase ───────────────────────────────────────────────
  const fetchSlateData = useCallback(async () => {
    try {
      // Get today's slate + most recent 3 slates for ticker results
      const today = new Date().toISOString().split('T')[0];

      const { data: slates, error } = await supabase
        .from('slates')
        .select('date, games, yesterday_record, yesterday_results, cumulative_record, headline, games_count, otj_parlay')
        .eq('sport', 'nba')
        .order('date', { ascending: false })
        .limit(4);

      if (error) throw error;
      if (!slates?.length) { setLoading(false); return; }

      const todaySlate  = slates.find(s => s.date === today) || slates[0];
      const recentSlate = slates.find(s => s.yesterday_results?.length > 0) || slates[1];

      // ── Time-aware ticker logic ──────────────────────────────────────
      // ET hour (approximate using UTC-5/UTC-4)
      const nowET = new Date();
      const etOffset = -5; // EST; use -4 for EDT
      const etHour = (nowET.getUTCHours() + 24 + etOffset) % 24;

      // 1. 9PM–6AM ET: show live_ticker from Supabase (Tank01 live scores)
      if (etHour >= 21 || etHour < 6) {
        const liveTicker = todaySlate?.live_ticker || [];
        if (liveTicker.length > 0) {
          setTickerItems(liveTicker.map(t => ({
            text: t.display,
            win: t.pick_result === 'W' ? true : t.pick_result === 'L' ? false : null,
            status: t.status,
          })));
          setLoading(false);
          return;
        }
      }

      // 2. 3PM–9PM ET: show today's upcoming games — matchup + tip time ONLY (no lean)
      if (etHour >= 15 && etHour < 21) {
        const upcoming = (todaySlate?.games || []).map(g => ({
          text: `${g.matchup || ''} · ${g.game_time || 'TBD'} ET`,
          win: null,
          status: 'upcoming',
        })).filter(t => t.text.length > 5);
        if (upcoming.length > 0) {
          setTickerItems(upcoming);
          setLoading(false);
          return;
        }
      }

      // 3. 6AM–3PM ET: show last night's final results with W/L
      const allResults = [];
      for (const slate of slates) {
        const results = slate.yesterday_results || [];
        for (const r of results) {
          const item = formatTickerItem(r);
          if (item?.text) allResults.push(item);
        }
      }
      if (allResults.length > 0) {
        setTickerItems(allResults);
      }

      // ── Record badges ──
      const cumulative = todaySlate?.cumulative_record || recentSlate?.cumulative_record || '—';
      const yesterday  = recentSlate?.yesterday_record || '—';
      setRecord({
        yesterday,
        week: '—',   // not stored separately yet — add later
        month: '—',  // not stored separately yet
        allTime: cumulative,
      });

      // ── Today's top picks from games ──
      const games = todaySlate?.games || [];
      const topPicks = games
        .filter(g => g.edge?.score > 15)
        .sort((a, b) => (b.edge?.score || 0) - (a.edge?.score || 0))
        .slice(0, 3)
        .map(g => ({
          sport: 'NBA',
          bet_type: g.edge?.bet_type || 'SPREAD',
          team: g.edge?.lean || g.matchup,
          matchup_label: `${g.matchup} · ${g.game_time || ''}`,
          confidence: g.edge?.confidence || 'MED',
          edge_score: Math.round(g.edge?.score || 0),
          signal_summary: g.narrative?.summary || g.edge?.signals?.[0]?.detail || '',
          tags: (g.edge?.signals || []).slice(0, 3).map(s => s.type || s.tag || '').filter(Boolean),
        }));

      setPicks(topPicks.length ? topPicks : []);

    } catch (err) {
      console.warn('[LandingPage] Supabase fetch failed:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSlateData();

    // Poll every 5 minutes for live score updates during game time (6PM–midnight ET)
    const hour = new Date().getHours();
    const isGameTime = hour >= 18 || hour < 2;
    if (isGameTime) {
      const interval = setInterval(fetchSlateData, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [fetchSlateData]);

  // Parallax on hero
  useEffect(() => {
    const onScroll = () => {
      if (heroRef.current) {
        heroRef.current.style.transform = `translateY(${window.scrollY * 0.3}px)`;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div style={{
      minHeight: '100vh', background: '#08080f', color: '#e2e8f0',
      fontFamily: MONO,
    }}>
      <style>{`
        @keyframes ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
        .fade-up { animation: fadeUp 0.5s ease forwards; }
        .fade-up-1 { animation: fadeUp 0.5s 0.1s ease both; }
        .fade-up-2 { animation: fadeUp 0.5s 0.2s ease both; }
        .fade-up-3 { animation: fadeUp 0.5s 0.3s ease both; }
      `}</style>

      {/* ── Ticker ── */}
      <Ticker items={tickerItems.length ? tickerItems : [{text: "Loading results...", win: null}]} />

      {/* ── Hero ── */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '48px 24px 40px',
      }}>
        {/* Background glow */}
        <div ref={heroRef} style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `
            radial-gradient(ellipse 60% 50% at 50% 0%, rgba(239,68,68,0.08) 0%, transparent 70%),
            radial-gradient(ellipse 30% 40% at 80% 50%, rgba(239,68,68,0.04) 0%, transparent 60%)
          `,
        }} />

        <div style={{ maxWidth: 900, margin: '0 auto', position: 'relative' }}>
          {/* Live badge */}
          <div className="fade-up" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 9, padding: '4px 10px', borderRadius: 4,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            color: '#ef4444', letterSpacing: '0.15em', marginBottom: 16,
          }}>
            <span style={{ animation: 'pulse 1.5s infinite', display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#ef4444' }} />
            LIVE PICKS TODAY
          </div>

          <h1 className="fade-up-1" style={{
            fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 900,
            lineHeight: 1.1, letterSpacing: '-0.03em',
            color: '#f1f5f9', margin: '0 0 12px',
          }}>
            OVERTIME JOURNAL
          </h1>

          <p className="fade-up-2" style={{
            fontSize: 13, color: '#4a5568', lineHeight: 1.7,
            maxWidth: 480, margin: '0 0 28px',
          }}>
            Data-driven sports analysis. Bench net ratings, fatigue edges, variance signals — no hype, just numbers.
          </p>

          {/* Record strip */}
          <div className="fade-up-3" style={{
            display: 'inline-flex',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 8, overflow: 'hidden',
            marginBottom: 28,
          }}>
            <RecordBadge label="YESTERDAY" value={record.yesterday} accent="#22c55e" />
            <RecordBadge label="THIS WEEK"  value={record.week} />
            <RecordBadge label="THIS MONTH" value={record.month} accent="#fbbf24" />
            <RecordBadge label="ALL TIME"   value={record.allTime} />
          </div>

          {/* CTA buttons */}
          <div className="fade-up-3" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/nba')} style={{
              padding: '10px 22px', borderRadius: 6, cursor: 'pointer',
              background: '#ef4444', border: 'none',
              color: '#fff', fontSize: 11, fontWeight: 700,
              fontFamily: MONO, letterSpacing: '0.1em',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
              TODAY'S PICKS →
            </button>
            <button onClick={() => navigate('/record')} style={{
              padding: '10px 22px', borderRadius: 6, cursor: 'pointer',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#6b7280', fontSize: 11, fontWeight: 700,
              fontFamily: MONO, letterSpacing: '0.1em',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = '#f1f5f9'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#6b7280'; }}>
              VIEW RECORD
            </button>
            {!user && (
              <button onClick={() => navigate('/nba')} style={{
                padding: '10px 22px', borderRadius: 6, cursor: 'pointer',
                background: 'transparent',
                border: '1px solid rgba(239,68,68,0.2)',
                color: '#ef4444', fontSize: 11, fontWeight: 700,
                fontFamily: MONO, letterSpacing: '0.1em',
                transition: 'all 0.15s',
              }}
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
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
          gap: 40,
          paddingTop: 36,
        }}>

          {/* ── Left: Blog/analysis posts ── */}
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 4,
            }}>
              <div style={{
                fontSize: 9, letterSpacing: '0.2em', color: '#374151',
                borderLeft: '2px solid #ef4444', paddingLeft: 10,
              }}>
                LATEST FROM OTJ
              </div>
              <span style={{ fontSize: 9, color: '#1e293b', cursor: 'pointer', letterSpacing: '0.1em' }}>
                ALL POSTS →
              </span>
            </div>

            <div style={{ marginTop: 8 }}>
              {posts.map((post, i) => (
                <PostCard key={i} post={post} onClick={() => {}} />
              ))}
            </div>

            {/* Newsletter CTA */}
            <div style={{
              marginTop: 24,
              padding: '20px 20px',
              background: 'rgba(239,68,68,0.04)',
              border: '1px solid rgba(239,68,68,0.12)',
              borderRadius: 8,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>
                GET PICKS IN YOUR INBOX
              </div>
              <div style={{ fontSize: 10, color: '#4a5568', marginBottom: 14 }}>
                Daily picks drop at 12PM ET. No spam, unsubscribe anytime.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="email"
                  placeholder="your@email.com"
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: 6,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#f1f5f9', fontSize: 11, fontFamily: MONO,
                    outline: 'none',
                  }}
                />
                <button style={{
                  padding: '8px 16px', borderRadius: 6, cursor: 'pointer',
                  background: '#ef4444', border: 'none',
                  color: '#fff', fontSize: 11, fontWeight: 700,
                  fontFamily: MONO, letterSpacing: '0.08em', whiteSpace: 'nowrap',
                }}>
                  SUBSCRIBE
                </button>
              </div>
            </div>
          </div>

          {/* ── Right: Today's picks ── */}
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 12,
            }}>
              <div style={{
                fontSize: 9, letterSpacing: '0.2em', color: '#374151',
                borderLeft: '2px solid #ef4444', paddingLeft: 10,
              }}>
                TODAY'S PICKS
              </div>
              <button onClick={() => navigate('/nba')} style={{
                fontSize: 9, color: '#1e293b', background: 'none',
                border: 'none', cursor: 'pointer', letterSpacing: '0.1em',
                fontFamily: MONO,
              }}>
                FULL ANALYSIS →
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {picks.map((pick, i) => (
                <PickCard key={i} pick={pick} onClick={() => navigate('/nba')} />
              ))}
            </div>

            {/* Disclaimer */}
            <div style={{
              marginTop: 16, fontSize: 9, color: '#1e293b',
              lineHeight: 1.7, letterSpacing: '0.02em',
            }}>
              ⚠ All picks are for informational purposes only. Not financial advice. Gamble responsibly. 1-800-GAMBLER.
            </div>

            {/* Explore modules */}
            <div style={{ marginTop: 24 }}>
              <div style={{
                fontSize: 9, letterSpacing: '0.2em', color: '#374151',
                borderLeft: '2px solid #4a5568', paddingLeft: 10, marginBottom: 12,
              }}>
                EXPLORE OTJ
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: '🏀 NBA Edge Analyzer', sub: 'Bench ratings, B2B, variance', path: '/nba' },
                  { label: '🎯 Props', sub: 'Player prop analysis', path: '/props' },
                  { label: '📊 Record', sub: 'Full pick history + ROI', path: '/record' },
                  { label: '🕹 Arcade', sub: 'OTJ JAM & mini games', path: '/arcade' },
                ].map(item => (
                  <div key={item.path} onClick={() => navigate(item.path)} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px', borderRadius: 6,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)';
                  }}>
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
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.04)',
        padding: '20px 24px', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 12,
        fontSize: 9, color: '#1e293b', letterSpacing: '0.1em',
      }}>
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
