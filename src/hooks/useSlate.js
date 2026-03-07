import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// ─── Mock data fallback ───────────────────────────────────────────────────────
// Used when Supabase has no data yet (during dev / before Python pipeline runs)
const MOCK_NBA_SLATE = {
  date: "2026-03-06",
  yesterday_record: "5-2",
  cumulative_record: "11-2",
  cumulative_note: "Over two nights",
  headline: "JAYSON TATUM EXPECTED TO MAKE SEASON DEBUT TONIGHT VS DAL",
  b2b_lesson: "PHX -9.5 lost to CHI 103-105 last night. Not all B2Bs are equal — CHI only traveled from OKC (short flight, same time zone).",
  yesterday_results: [
    { game: "DAL @ ORL", lean: "ORL", result: "W", score: "114-115", note: "ORL wins by 1 — Wendell Carter Jr. game-winner" },
    { game: "BKN @ MIA", lean: "MIA", result: "W", score: "110-126", note: "MIA -11.5 covered — blowout" },
    { game: "GSW @ HOU", lean: "HOU", result: "L", score: "115-113", note: "GSW upset — Curry played, hit clutch shots" },
    { game: "DET @ SAS", lean: null, result: "W", score: "106-121", note: "SAS dominant at home — Wembanyama Player of Night" },
    { game: "TOR @ MIN", lean: "MIN", result: "W", score: "107-115", note: "MIN covered comfortably" },
    { game: "CHI @ PHX", lean: "PHX", result: "L", score: "105-103", note: "PHX upset at home by CHI — Bulls close game regression" },
    { game: "NOP @ SAC", lean: "NOP", result: "W", score: "133-123", note: "NOP covered — SAC still terrible" },
    { game: "LAL @ DEN", lean: "DEN", result: "W", score: "113-120", note: "DEN altitude + Jokic feast = easy cover" },
  ],
  games_count: 7,
  games: [
    {
      matchup: "DAL @ BOS", venue: "TD Garden", game_time: "7:00 PM ET", status: "Tonight",
      away: { team: "DAL", name: "Mavericks", record: "21-41", win_pct: .339, net_rating: -4.8, off_rating: 112.5, def_rating: 117.3, bench_net: -2.5, bench_ppg: 34.0, pace: 99.2, three_pct: 35.2, last10_three: 33.8, close_record: "7-14", close_pct: .333, b2b: true, rest_days: 0, last5: "L-L-L-L-L", streak: "L5", key_out: ["Kyrie Irving (knee surgery - out)", "Dereck Lively II (foot surgery - out)"], run_diff: "-312" },
      home: { team: "BOS", name: "Celtics", record: "41-21", win_pct: .661, net_rating: 6.8, off_rating: 117.5, def_rating: 110.7, bench_net: 3.0, bench_ppg: 39.5, pace: 99.5, three_pct: 37.5, last10_three: 36.8, close_record: "12-6", close_pct: .667, b2b: false, rest_days: 1, last5: "W-W-L-W-W", streak: "W1", key_out: ["Jayson Tatum (Achilles - questionable, expected season debut tonight)"], run_diff: "+410" },
      spread: "BOS -14.5", total: "215.0", win_prob: { away: 10.6, home: 89.4 },
      edge: { lean: "BOS", confidence: "HIGH", score: 38.0, signals: [
        { type: "B2B_FATIGUE", detail: "DAL on B2B (lost at ORL last night 114-115) — 5th straight loss", favors: "BOS", strength: "STRONG", impact: 8.0 },
        { type: "TATUM_RETURN", detail: "🚨 Jayson Tatum expected to make SEASON DEBUT tonight — 10 months post-Achilles surgery.", favors: "BOS", strength: "STRONG", impact: 7.0 },
        { type: "NET_RATING_GAP", detail: "BOS +6.8 vs DAL -4.8 — 11.6 point chasm", favors: "BOS", strength: "STRONG", impact: 6.5 },
        { type: "BENCH_EDGE", detail: "BOS bench +3.0 vs DAL -2.5 — massive 5.5 swing", favors: "BOS", strength: "STRONG", impact: 5.5 },
        { type: "INJURY_STACK", detail: "DAL missing Irving (season) + Lively (season) — gutted roster on B2B", favors: "BOS", strength: "STRONG", impact: 6.0 },
        { type: "SPREAD_WARNING", detail: "BOS -14.5 is steep — but DAL is actively tanking and exhausted", favors: "BOS", strength: "MODERATE", impact: -3.0 },
      ], ou_lean: "UNDER" }
    },
    {
      matchup: "MIA @ CHA", venue: "Spectrum Center", game_time: "7:00 PM ET", status: "Tonight",
      away: { team: "MIA", name: "Heat", record: "34-29", win_pct: .540, net_rating: 2.5, off_rating: 114.5, def_rating: 112.0, bench_net: 2.2, bench_ppg: 38.0, pace: 97.5, three_pct: 36.5, last10_three: 37.2, close_record: "11-8", close_pct: .579, b2b: true, rest_days: 0, last5: "W-W-W-L-W", streak: "W1", key_out: ["Terry Rozier (knee - out)", "Nikola Jovic (ankle - out)"], run_diff: "+155" },
      home: { team: "CHA", name: "Hornets", record: "32-31", win_pct: .508, net_rating: 1.5, off_rating: 114.0, def_rating: 112.5, bench_net: 1.0, bench_ppg: 36.5, pace: 100.2, three_pct: 36.8, last10_three: 37.5, close_record: "10-9", close_pct: .526, b2b: false, rest_days: 1, last5: "W-W-L-W-L", streak: "L1", key_out: ["Tidjane Salaun (calf - out)", "Mark Williams (foot - out)"], run_diff: "+95" },
      spread: "CHA -3.5", total: "213.5", win_prob: { away: 27.6, home: 72.4 },
      edge: { lean: "CHA", confidence: "MODERATE", score: 24.0, signals: [
        { type: "B2B_FATIGUE", detail: "MIA on B2B (beat BKN 126-110 last night) — travel to Charlotte", favors: "CHA", strength: "STRONG", impact: 8.0 },
        { type: "NET_RATING_GAP", detail: "Close net ratings (CHA +1.5 vs MIA +2.5) — B2B tips the scale", favors: "CHA", strength: "MODERATE", impact: 3.0 },
        { type: "BENCH_EDGE", detail: "MIA bench +2.2 vs CHA +1.0 — MIA has edge but fatigue erodes it", favors: "PUSH", strength: "MODERATE", impact: 1.0 },
        { type: "INJURY", detail: "MIA missing Rozier + Jovic — thinner rotation on B2B", favors: "CHA", strength: "MODERATE", impact: 4.5 },
        { type: "CHA_MOMENTUM", detail: "CHA beat BOS 118-89 two nights ago — Brandon Miller on fire", favors: "CHA", strength: "MODERATE", impact: 3.5 },
      ], ou_lean: "UNDER" }
    },
    {
      matchup: "POR @ HOU", venue: "Toyota Center", game_time: "8:00 PM ET", status: "Tonight",
      away: { team: "POR", name: "Trail Blazers", record: "30-33", win_pct: .476, net_rating: -1.2, off_rating: 113.0, def_rating: 114.2, bench_net: -1.5, bench_ppg: 34.5, pace: 100.5, three_pct: 35.5, last10_three: 34.8, close_record: "9-11", close_pct: .450, b2b: false, rest_days: 1, last5: "W-L-L-W-L", streak: "L1", key_out: ["Deni Avdija (back - doubtful)", "Damian Lillard (Achilles - out for season)"], run_diff: "-75" },
      home: { team: "HOU", name: "Rockets", record: "38-23", win_pct: .623, net_rating: 5.8, off_rating: 116.5, def_rating: 110.7, bench_net: 3.5, bench_ppg: 40.2, pace: 99.0, three_pct: 37.5, last10_three: 38.2, close_record: "12-6", close_pct: .667, b2b: true, rest_days: 0, last5: "W-L-W-W-L", streak: "L1", key_out: ["Fred VanVleet (knee - out)", "Steven Adams (back - out)"], run_diff: "+345" },
      spread: "HOU -6.5", total: "217.0", win_prob: { away: 32.1, home: 67.9 },
      edge: { lean: "HOU", confidence: "MODERATE", score: 18.0, signals: [
        { type: "B2B_FATIGUE", detail: "HOU on B2B (lost to GSW 113-115 last night) — but home game", favors: "POR", strength: "MODERATE", impact: -4.0 },
        { type: "NET_RATING_GAP", detail: "HOU +5.8 vs POR -1.2 — full tier gap even on B2B", favors: "HOU", strength: "STRONG", impact: 6.0 },
        { type: "BENCH_EDGE", detail: "HOU bench +3.5 vs POR -1.5 — elite HOU bench compensates for fatigue", favors: "HOU", strength: "STRONG", impact: 6.0 },
        { type: "CLOSE_GAMES", detail: "HOU 12-6 (.667) vs POR 9-11 (.450) — HOU closes, POR doesn't", favors: "HOU", strength: "MODERATE", impact: 3.5 },
        { type: "INJURY", detail: "POR without Lillard (season) + Avdija doubtful — thin roster", favors: "HOU", strength: "MODERATE", impact: 3.5 },
        { type: "B2B_CAUTION", detail: "HOU B2B after tough GSW loss — energy could be low, monitor closely", favors: "POR", strength: "MODERATE", impact: -3.0 },
      ], ou_lean: null }
    },
    {
      matchup: "NYK @ DEN", venue: "Ball Arena", game_time: "9:00 PM ET", status: "Tonight",
      away: { team: "NYK", name: "Knicks", record: "40-23", win_pct: .635, net_rating: 5.5, off_rating: 117.0, def_rating: 111.5, bench_net: 2.0, bench_ppg: 37.5, pace: 99.0, three_pct: 37.0, last10_three: 36.2, close_record: "13-7", close_pct: .650, b2b: false, rest_days: 1, last5: "W-W-W-L-W", streak: "L1", key_out: [], run_diff: "+340" },
      home: { team: "DEN", name: "Nuggets", record: "39-24", win_pct: .619, net_rating: 5.5, off_rating: 118.2, def_rating: 112.7, bench_net: 1.8, bench_ppg: 37.5, pace: 98.8, three_pct: 37.0, last10_three: 36.5, close_record: "12-7", close_pct: .632, b2b: true, rest_days: 0, last5: "W-W-L-W-W", streak: "W1", key_out: ["Aaron Gordon (hamstring - out)", "Peyton Watson (hamstring - out)", "Spencer Jones (knee - out)"], run_diff: "+342" },
      spread: "DEN -2.5", total: "224.0", win_prob: { away: 52.3, home: 47.7 },
      edge: { lean: "NYK", confidence: "HIGH", score: 28.0, signals: [
        { type: "B2B_FATIGUE", detail: "DEN on B2B (beat LAL 120-113 last night) — altitude helps but fatigue is real", favors: "NYK", strength: "STRONG", impact: 8.0 },
        { type: "NET_RATING_EVEN", detail: "Both at +5.5 NETRTG — dead even, B2B is the tiebreaker", favors: "NYK", strength: "MODERATE", impact: 3.0 },
        { type: "INJURY_STACK", detail: "DEN missing Gordon + Watson + Jones — thin frontcourt on B2B", favors: "NYK", strength: "STRONG", impact: 6.5 },
        { type: "BENCH_EDGE", detail: "NYK bench +2.0 vs DEN +1.8 — virtually even, but DEN bench depleted by injuries", favors: "NYK", strength: "MODERATE", impact: 3.5 },
        { type: "CLOSE_GAMES", detail: "NYK 13-7 (.650) — elite closer, will capitalize on tired DEN", favors: "NYK", strength: "MODERATE", impact: 4.0 },
        { type: "LINE_VALUE", detail: "DEN favored at -2.5 on a B2B — public overvaluing altitude, sharp value on NYK", favors: "NYK", strength: "STRONG", impact: 5.0 },
      ], ou_lean: "OVER" }
    },
    {
      matchup: "NOP @ PHX", venue: "Footprint Center", game_time: "9:00 PM ET", status: "Tonight",
      away: { team: "NOP", name: "Pelicans", record: "20-44", win_pct: .313, net_rating: -7.0, off_rating: 110.5, def_rating: 117.5, bench_net: -3.5, bench_ppg: 33.0, pace: 101.2, three_pct: 34.0, last10_three: 33.5, close_record: "6-13", close_pct: .316, b2b: true, rest_days: 0, last5: "L-L-L-W-L", streak: "L1", key_out: [], run_diff: "-440" },
      home: { team: "PHX", name: "Suns", record: "35-27", win_pct: .565, net_rating: 4.0, off_rating: 117.5, def_rating: 113.5, bench_net: 1.5, bench_ppg: 37.0, pace: 100.5, three_pct: 37.8, last10_three: 38.5, close_record: "10-10", close_pct: .500, b2b: true, rest_days: 0, last5: "W-W-L-W-L", streak: "L1", key_out: ["Cameron Johnson (ankle - questionable)"], run_diff: "+235" },
      spread: "PHX -9.5", total: "221.0", win_prob: { away: 32.6, home: 67.4 },
      edge: { lean: "PHX", confidence: "MODERATE", score: 22.0, signals: [
        { type: "DOUBLE_B2B", detail: "⚠ BOTH teams on B2B — PHX lost to CHI 103-105, NOP won at SAC 133-123", favors: "PHX", strength: "MODERATE", impact: 2.0 },
        { type: "NET_RATING_GAP", detail: "PHX +4.0 vs NOP -7.0 — 11 point gap even with both tired", favors: "PHX", strength: "STRONG", impact: 6.5 },
        { type: "BENCH_EDGE", detail: "PHX bench +1.5 vs NOP -3.5 — 5.0 swing matters more on B2B", favors: "PHX", strength: "MODERATE", impact: 5.0 },
        { type: "HOME_ADVANTAGE", detail: "PHX at Footprint Center, no travel on B2B", favors: "PHX", strength: "MODERATE", impact: 3.5 },
        { type: "BOUNCE_BACK", detail: "PHX lost upset to CHI — KD/Booker bounce-back game vs weak NOP", favors: "PHX", strength: "MODERATE", impact: 3.5 },
        { type: "SPREAD_WARNING", detail: "PHX -9.5 on a B2B feels inflated — consider ML or alt spread", favors: "NOP", strength: "MODERATE", impact: -2.5 },
      ], ou_lean: "OVER" }
    },
    {
      matchup: "LAC @ SAS", venue: "Frost Bank Center", game_time: "9:30 PM ET", status: "Tonight",
      away: { team: "LAC", name: "Clippers", record: "30-31", win_pct: .492, net_rating: 0.2, off_rating: 114.0, def_rating: 113.8, bench_net: -0.5, bench_ppg: 35.5, pace: 99.0, three_pct: 36.0, last10_three: 35.5, close_record: "10-10", close_pct: .500, b2b: false, rest_days: 1, last5: "W-W-L-L-W", streak: "W1", key_out: ["Norman Powell (knee - out)", "Simone Fontecchio (back - out)"], run_diff: "+12" },
      home: { team: "SAS", name: "Spurs", record: "45-17", win_pct: .726, net_rating: 9.2, off_rating: 118.9, def_rating: 109.7, bench_net: 3.8, bench_ppg: 40.8, pace: 98.5, three_pct: 38.0, last10_three: 37.5, close_record: "13-4", close_pct: .765, b2b: false, rest_days: 1, last5: "W-W-W-W-W", streak: "W1", key_out: [], run_diff: "+590" },
      spread: "SAS -10.5", total: "222.5", win_prob: { away: 27.5, home: 72.5 },
      edge: { lean: "SAS", confidence: "MODERATE", score: 25.0, signals: [
        { type: "NET_RATING_GAP", detail: "SAS +9.2 vs LAC +0.2 — 9 point gap, SAS is elite tier", favors: "SAS", strength: "STRONG", impact: 7.0 },
        { type: "BENCH_EDGE", detail: "SAS bench +3.8 vs LAC -0.5 — Wemby's team is deep", favors: "SAS", strength: "STRONG", impact: 6.0 },
        { type: "CLOSE_GAMES", detail: "SAS 13-4 (.765) — best closer in NBA this season", favors: "SAS", strength: "MODERATE", impact: 4.0 },
        { type: "WEMBY_HOME", detail: "Wembanyama at Frost Bank — Player of the Night last game", favors: "SAS", strength: "STRONG", impact: 5.0 },
        { type: "INJURY", detail: "LAC missing Powell + Fontecchio — scoring depth hit", favors: "SAS", strength: "MODERATE", impact: 3.0 },
        { type: "SPREAD_WARNING", detail: "SAS -10.5 is large — LAC has Kawhi + Harden", favors: "LAC", strength: "MODERATE", impact: -4.0 },
      ], ou_lean: null }
    },
    {
      matchup: "IND @ LAL", venue: "Crypto.com Arena", game_time: "10:30 PM ET", status: "Tonight",
      away: { team: "IND", name: "Pacers", record: "15-47", win_pct: .242, net_rating: -9.5, off_rating: 108.0, def_rating: 117.5, bench_net: -5.0, bench_ppg: 30.0, pace: 100.8, three_pct: 34.0, last10_three: 33.0, close_record: "4-15", close_pct: .211, b2b: false, rest_days: 1, last5: "L-L-L-L-L", streak: "L6", key_out: ["Tyrese Haliburton (Achilles - out for season)"], run_diff: "-590" },
      home: { team: "LAL", name: "Lakers", record: "37-25", win_pct: .597, net_rating: 3.5, off_rating: 116.8, def_rating: 113.3, bench_net: 0.5, bench_ppg: 36.0, pace: 99.5, three_pct: 36.0, last10_three: 37.2, close_record: "11-8", close_pct: .579, b2b: true, rest_days: 0, last5: "W-W-W-L-L", streak: "L1", key_out: ["Anthony Davis (knee - out)", "D'Angelo Russell (hamstring - out)"], run_diff: "+218" },
      spread: "LAL -8.5", total: "219.0", win_prob: { away: 20.8, home: 79.2 },
      edge: { lean: "LAL", confidence: "LOW", score: 12.0, signals: [
        { type: "B2B_FATIGUE", detail: "LAL on B2B (lost at DEN 113-120 last night) — traveled from altitude", favors: "IND", strength: "STRONG", impact: -6.0 },
        { type: "NET_RATING_GAP", detail: "LAL +3.5 vs IND -9.5 — huge gap even on B2B", favors: "LAL", strength: "STRONG", impact: 7.0 },
        { type: "BENCH_EDGE", detail: "LAL bench +0.5 vs IND -5.0 — 5.5 swing, IND bench is bottom 3", favors: "LAL", strength: "MODERATE", impact: 4.5 },
        { type: "INJURY_STACK", detail: "LAL missing AD + D-Lo on B2B — significant scoring/rebounding loss", favors: "IND", strength: "STRONG", impact: -5.0 },
        { type: "CLOSE_GAMES", detail: "IND 4-15 (.211) — worst closer in NBA, can't win tight games", favors: "LAL", strength: "MODERATE", impact: 3.5 },
        { type: "CAUTION", detail: "LAL B2B from altitude + missing AD = risky. IND is terrible but spots are exploitable", favors: "IND", strength: "MODERATE", impact: -3.0 },
      ], ou_lean: "UNDER" }
    },
  ],
  b2b_tiers: [
    { tier: "☠️ TIER 1 — NIGHTMARE", color: "#ef4444", desc: "B2B + road travel + opponent rested 2+ days", example: "Tonight: DAL @ BOS — DAL traveled from Orlando, BOS rested. Also: LAL vs IND — LAL flew back from Denver altitude.", tonight: true },
    { tier: "🔥 TIER 2 — DANGEROUS", color: "#f59e0b", desc: "B2B + road travel + opponent rested 1 day", example: "Tonight: MIA @ CHA — MIA traveled from home, CHA rested. NOP @ PHX — NOP traveled from Sacramento.", tonight: true },
    { tier: "⚡ TIER 3 — MANAGEABLE", color: "#60a5fa", desc: "B2B at home (no travel tax) or both teams on B2B", example: "Tonight: HOU vs POR — HOU home B2B, bench depth helps. DEN vs NYK — DEN home B2B but missing 3 guys. PHX vs NOP — both on B2B, cancels out somewhat.", tonight: true },
  ],
  b2b_tags: [
    { team: "DAL", tier: "☠️", note: "@ BOS", color: "#ef4444" },
    { team: "LAL", tier: "☠️", note: "vs IND (from DEN)", color: "#ef4444" },
    { team: "MIA", tier: "🔥", note: "@ CHA", color: "#f59e0b" },
    { team: "NOP", tier: "🔥", note: "@ PHX", color: "#f59e0b" },
    { team: "HOU", tier: "⚡", note: "vs POR (home)", color: "#60a5fa" },
    { team: "DEN", tier: "⚡", note: "vs NYK (home)", color: "#60a5fa" },
    { team: "PHX", tier: "⚡", note: "vs NOP (both B2B)", color: "#60a5fa" },
  ],
  spread_mismatches: [
    { matchup: "IND @ LAL", b2b_team: "LAL", tier: "☠️ TIER 1", spread: "LAL -8.5", penalty: "~4-5 pts", adjusted: "LAL -3.5 to -4.5", verdict: "🚨 BEST MISMATCH — LAL favored by 8.5 on a nightmare B2B from Denver altitude, missing AD + D-Lo. IND +8.5 has real value.", verdictColor: "#ef4444", value: "HIGH" },
    { matchup: "NYK @ DEN", b2b_team: "DEN", tier: "⚡ TIER 3", spread: "DEN -2.5", penalty: "~1-2 pts", adjusted: "PICK'EM to NYK -0.5", verdict: "🎯 SHARP VALUE — DEN home B2B but missing Gordon/Watson/Jones. Identical net ratings. NYK +2.5 or ML is the play.", verdictColor: "#f59e0b", value: "HIGH" },
    { matchup: "NOP @ PHX", b2b_team: "PHX", tier: "⚡ TIER 3", spread: "PHX -9.5", penalty: "~1-2 pts (both B2B)", adjusted: "PHX -7.5 to -8.5", verdict: "⚠ MILD — Both teams tired so fatigue cancels, but PHX -9.5 still feels inflated. Consider alt spread PHX -6.5.", verdictColor: "#f59e0b", value: "MEDIUM" },
    { matchup: "POR @ HOU", b2b_team: "HOU", tier: "⚡ TIER 3", spread: "HOU -6.5", penalty: "~1-2 pts", adjusted: "HOU -4.5 to -5.5", verdict: "📌 MINOR — HOU home B2B with elite bench depth. Fatigue exists but bench compensates. Slight lean POR +6.5.", verdictColor: "#6b7280", value: "LOW" },
    { matchup: "DAL @ BOS", b2b_team: "DAL", tier: "☠️ TIER 1", spread: "BOS -14.5", penalty: "~4-5 pts", adjusted: "Already priced in", verdict: "✅ NO MISMATCH — DAL is Tier 1 nightmare but BOS -14.5 already prices in fatigue + Tatum return hype.", verdictColor: "#22c55e", value: "NONE" },
  ]
};

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useSlate(sport = 'nba', date = null) {
  const targetDate = date || new Date().toISOString().split('T')[0];
  const [slate, setSlate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [source, setSource] = useState('loading'); // 'supabase' | 'mock'

  useEffect(() => {
    async function fetchSlate() {
      setLoading(true);
      setError(null);
      try {
        const { data, error: sbError } = await supabase
          .from('slates')
          .select(`
            *,
            games(*),
            yesterday_results(*)
          `)
          .eq('sport', sport)
          .eq('date', targetDate)
          .single();

        if (sbError || !data) {
          // Fall back to mock data silently during dev
          console.info('[useSlate] No Supabase data found — using mock data');
          setSlate(MOCK_NBA_SLATE);
          setSource('mock');
        } else {
          // Normalize Supabase response to match mock shape
          setSlate({
            ...data,
            games: data.games || [],
            yesterday_results: data.yesterday_results || [],
          });
          setSource('supabase');
        }
      } catch (err) {
        console.warn('[useSlate] Fetch failed, using mock:', err.message);
        setSlate(MOCK_NBA_SLATE);
        setSource('mock');
      } finally {
        setLoading(false);
      }
    }

    fetchSlate();
  }, [sport, targetDate]);

  return { slate, loading, error, source };
}
