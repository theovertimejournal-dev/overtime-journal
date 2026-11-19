import { useEffect, useState } from "react";

/**
 * RosterPanel — slide-in roster with season averages for one team.
 *
 * Usage (from NBAGameCard):
 *   const [rosterTeam, setRosterTeam] = useState(null);
 *   // make the team abbr / starter clickable:
 *   <span className="team-click" onClick={() => setRosterTeam(game.home_team)}>
 *     {game.home_team}
 *   </span>
 *   {rosterTeam && (
 *     <RosterPanel
 *       supabase={supabase}          // your shared client
 *       team={rosterTeam}
 *       date={game.date}             // slate date "YYYY-MM-DD"
 *       onClose={() => setRosterTeam(null)}
 *     />
 *   )}
 */
export default function RosterPanel({ supabase, team, date, onClose }) {
  const [players, setPlayers] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // get the latest roster row for this team (today, else most recent)
        let q = supabase
          .from("team_rosters")
          .select("players, date")
          .eq("team", team)
          .order("date", { ascending: false })
          .limit(1);
        if (date) q = q.lte("date", date);
        const { data, error } = await q;
        if (error) throw error;
        if (alive) setPlayers(data?.[0]?.players ?? []);
      } catch (e) {
        if (alive) setErr(e.message || "Could not load roster");
      }
    })();
    return () => {
      alive = false;
    };
  }, [supabase, team, date]);

  return (
    <div className="roster-overlay" onClick={onClose}>
      <div className="roster-panel" onClick={(e) => e.stopPropagation()}>
        <div className="roster-head">
          <span className="roster-team">{team} roster</span>
          <button className="roster-close" onClick={onClose}>✕</button>
        </div>

        {err && <div className="roster-msg">⚠ {err}</div>}
        {!err && players === null && <div className="roster-msg">Loading…</div>}
        {!err && players?.length === 0 && <div className="roster-msg">No roster data yet.</div>}

        {players?.length > 0 && (
          <table className="roster-table">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Player</th>
                <th>Pos</th><th>PPG</th><th>RPG</th><th>APG</th>
                <th>FG%</th><th>3P%</th><th>MIN</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p, i) => (
                <tr key={i} className={p.status === "OUT" ? "is-out" : ""}>
                  <td style={{ textAlign: "left" }}>
                    {p.name}
                    {p.status === "OUT" && <span className="out-badge">OUT</span>}
                  </td>
                  <td>{p.pos || "—"}</td>
                  <td>{p.ppg?.toFixed?.(1) ?? p.ppg}</td>
                  <td>{p.rpg?.toFixed?.(1) ?? p.rpg}</td>
                  <td>{p.apg?.toFixed?.(1) ?? p.apg}</td>
                  <td>{p.fg_pct}%</td>
                  <td>{p.fg3_pct}%</td>
                  <td>{p.min ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <style>{`
        .roster-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);
          display:flex;justify-content:flex-end;z-index:1000;}
        .roster-panel{width:min(520px,92vw);height:100%;overflow-y:auto;
          background:#12161c;color:#e8edf2;padding:18px 20px;box-shadow:-8px 0 24px rgba(0,0,0,.4);}
        .roster-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;}
        .roster-team{font-weight:700;font-size:18px;letter-spacing:.3px;}
        .roster-close{background:none;border:none;color:#9aa6b2;font-size:18px;cursor:pointer;}
        .roster-msg{color:#9aa6b2;padding:24px 4px;}
        .roster-table{width:100%;border-collapse:collapse;font-size:13px;}
        .roster-table th{color:#8a96a3;font-weight:600;text-align:center;padding:8px 6px;
          border-bottom:1px solid #263040;position:sticky;top:0;background:#12161c;}
        .roster-table td{text-align:center;padding:8px 6px;border-bottom:1px solid #1b2230;}
        .roster-table tr.is-out td{opacity:.5;}
        .out-badge{margin-left:8px;font-size:10px;font-weight:700;color:#ff6b6b;
          border:1px solid #ff6b6b;border-radius:4px;padding:1px 5px;}
        .team-click{cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px;}
      `}</style>
    </div>
  );
}
