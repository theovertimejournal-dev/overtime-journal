import { useState } from "react";

/**
 * HowToBet — self-contained "how to read the card" guide.
 * Renders a small trigger button + a modal. Drop <HowToBet /> anywhere
 * (e.g. the NBA dashboard header). No props, manages its own state.
 *
 * Numbers reflect the v2 model (backtested on 400+ graded picks, opening lines).
 * Update the hit-rate figures here if the tiers get re-tuned.
 */
export default function HowToBet() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="htb-trigger" onClick={() => setOpen(true)}>
        📖 How to bet
      </button>

      {open && (
        <div className="htb-overlay" onClick={() => setOpen(false)}>
          <div className="htb-modal" onClick={(e) => e.stopPropagation()}>
            <div className="htb-head">
              <span className="htb-title">How to read the card</span>
              <button className="htb-close" onClick={() => setOpen(false)}>✕</button>
            </div>

            <p className="htb-intro">
              We rebuilt the model on 400+ graded picks. Here's what every tag and
              number means now — and how to actually bet it.
            </p>

            {/* TIERS */}
            <div className="htb-section">CONFIDENCE TIER</div>
            <div className="htb-row">
              <span className="htb-tag sharp">SHARP</span>
              <div>
                <b>Our best plays.</b> Home team with a moderate model edge.
                Hits <b>~61% against the spread</b> historically. This is where the money is.
              </div>
            </div>
            <div className="htb-row">
              <span className="htb-tag lean">LEAN</span>
              <div>
                <b>Solid secondary plays.</b> Small edge on a road team. ~58% ATS.
                Bet lighter than SHARP.
              </div>
            </div>
            <div className="htb-row">
              <span className="htb-tag info">INFO</span>
              <div>
                <b>No real edge — context only.</b> The market line is fair.
                We show the game, but don't treat it as a play.
              </div>
            </div>
            <div className="htb-row">
              <span className="htb-tag fade">FADE</span>
              <div>
                <b>The model likes a big road favorite too much.</b> That's historically
                its worst spot (covers ~17%), so we flag it to consider the <i>other</i> side —
                small stake, we're still proving it out.
              </div>
            </div>

            {/* SCORE */}
            <div className="htb-section">SCORE</div>
            <p className="htb-p">
              How far the model disagrees with the Vegas spread.
              <b> Positive = it leans the home team, negative = the road team.</b> The
              catch we learned the hard way: a <i>huge</i> score (±10 or more) usually means
              the model is <b>missing something</b> (an injury, rest, a letdown spot) — not
              that it found gold. So our strongest plays sit in the <b>moderate zone (+3 to +10, home)</b>,
              not on the biggest numbers.
            </p>

            {/* STAKE */}
            <div className="htb-section">SUGGESTED STAKE %</div>
            <p className="htb-p">
              How much of your bankroll the math says to risk, using fractional Kelly
              sizing. SHARP ≈ 2% of roll, LEAN ≈ 1.5%, INFO = 0 (no play). If a favorite
              is heavily juiced (think −400), it auto-sizes toward <b>$0</b> — the edge
              can't beat that price, so the model won't let you overbet it.
            </p>

            {/* HOW TO BET */}
            <div className="htb-section">THE SHORT VERSION</div>
            <ul className="htb-list">
              <li>Stick to <b>SHARP</b> and <b>LEAN</b>. Skip INFO.</li>
              <li>Size with the <b>suggested %</b> — don't flat-bet everything the same.</li>
              <li>Bigger score ≠ better bet. Trust the <b>moderate</b> edges.</li>
              <li>Straights beat parlays. If you parlay, keep it light.</li>
              <li>Tap a team name to see its <b>roster + averages</b> and who's OUT.</li>
            </ul>

            <p className="htb-foot">
              Not financial advice. Bet what you can afford to lose. 🏀
            </p>
          </div>
        </div>
      )}

      <style>{`
        .htb-trigger{background:#1b2230;color:#cfe0ff;border:1px solid #2b3647;
          border-radius:8px;padding:6px 12px;font-size:13px;font-weight:600;cursor:pointer;}
        .htb-trigger:hover{background:#222c3c;}
        .htb-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:1100;
          display:flex;align-items:center;justify-content:center;padding:16px;}
        .htb-modal{width:min(560px,96vw);max-height:88vh;overflow-y:auto;
          background:#12161c;color:#e8edf2;border:1px solid #263040;border-radius:14px;
          padding:22px 24px;box-shadow:0 20px 60px rgba(0,0,0,.5);}
        .htb-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;}
        .htb-title{font-size:19px;font-weight:800;letter-spacing:.2px;}
        .htb-close{background:none;border:none;color:#9aa6b2;font-size:18px;cursor:pointer;}
        .htb-intro{color:#aeb9c6;font-size:13px;line-height:1.5;margin:0 0 6px;}
        .htb-section{font-size:11px;font-weight:800;letter-spacing:1.2px;color:#7f8c9b;
          margin:18px 0 8px;border-bottom:1px solid #1d2531;padding-bottom:5px;}
        .htb-row{display:flex;gap:12px;align-items:flex-start;margin:11px 0;font-size:13.5px;line-height:1.5;color:#dbe3ec;}
        .htb-p{font-size:13.5px;line-height:1.55;color:#dbe3ec;margin:0;}
        .htb-list{margin:6px 0 0;padding-left:18px;font-size:13.5px;line-height:1.7;color:#dbe3ec;}
        .htb-tag{flex:0 0 auto;font-size:11px;font-weight:800;letter-spacing:.5px;
          border-radius:5px;padding:3px 9px;margin-top:1px;min-width:52px;text-align:center;}
        .htb-tag.sharp{background:#3b1d1d;color:#ff6b6b;border:1px solid #ff6b6b;}
        .htb-tag.lean{background:#2a2410;color:#f5c451;border:1px solid #f5c451;}
        .htb-tag.info{background:#1a2230;color:#8aa0b8;border:1px solid #3a4a5e;}
        .htb-tag.fade{background:#2a1530;color:#d08bff;border:1px solid #d08bff;}
        .htb-foot{margin:18px 0 0;font-size:12px;color:#7f8c9b;}
        b{color:#f1f5f9;}
      `}</style>
    </>
  );
}
