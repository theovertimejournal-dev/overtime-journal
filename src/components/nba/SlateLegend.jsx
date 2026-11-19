import HowToBet from "./HowToBet";

/**
 * SlateLegend — always-visible key for the top of the NBA slate page.
 * Compact tier chips + a one-line score/stake explainer + the full "How to bet"
 * modal button. Drop <SlateLegend /> above the list of game cards.
 */
export default function SlateLegend() {
  const chips = [
    { tag: "SHARP", cls: "sharp", note: "best plays · ~61% ATS" },
    { tag: "LEAN",  cls: "lean",  note: "solid · ~58%" },
    { tag: "INFO",  cls: "info",  note: "context only, no play" },
    { tag: "FADE",  cls: "fade",  note: "model's blind spot — flip it" },
  ];

  return (
    <div className="sl-wrap">
      <div className="sl-top">
        <span className="sl-title">KEY</span>
        <HowToBet />
      </div>

      <div className="sl-chips">
        {chips.map((c) => (
          <div className="sl-chip" key={c.tag}>
            <span className={`sl-tag ${c.cls}`}>{c.tag}</span>
            <span className="sl-note">{c.note}</span>
          </div>
        ))}
      </div>

      <div className="sl-fine">
        <span><b>SCORE</b> + = leans home, − = leans road · <b>moderate edges beat extreme ones</b></span>
        <span className="sl-dot">·</span>
        <span><b>%</b> = suggested bankroll stake</span>
        <span className="sl-dot">·</span>
        <span>tap a team name for its roster &amp; averages</span>
      </div>

      <style>{`
        .sl-wrap{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);
          border-radius:12px;padding:12px 16px;margin-bottom:14px;color:#e8edf2;}
        .sl-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;}
        .sl-title{font-size:11px;font-weight:800;letter-spacing:1.6px;color:#7f8c9b;}
        .sl-chips{display:flex;flex-wrap:wrap;gap:10px 18px;}
        .sl-chip{display:flex;align-items:center;gap:8px;font-size:12.5px;color:#c6d0db;}
        .sl-tag{font-size:10.5px;font-weight:800;letter-spacing:.5px;border-radius:5px;
          padding:3px 8px;min-width:48px;text-align:center;}
        .sl-tag.sharp{background:#3b1d1d;color:#ff6b6b;border:1px solid #ff6b6b;}
        .sl-tag.lean{background:#2a2410;color:#f5c451;border:1px solid #f5c451;}
        .sl-tag.info{background:#1a2230;color:#8aa0b8;border:1px solid #3a4a5e;}
        .sl-tag.fade{background:#2a1530;color:#d08bff;border:1px solid #d08bff;}
        .sl-note{color:#9aa6b2;}
        .sl-fine{margin-top:11px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06);
          display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;font-size:12px;color:#9aa6b2;line-height:1.5;}
        .sl-fine b{color:#dbe3ec;}
        .sl-dot{color:#4a5666;}
        @media (max-width:560px){ .sl-fine .sl-dot{display:none;} .sl-fine span{flex:1 1 100%;} }
      `}</style>
    </div>
  );
}
