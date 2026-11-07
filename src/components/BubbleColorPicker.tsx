"use client";
import { BUBBLE_COLORS } from "@/lib/shared";

/** Picks the landing-page bubble color. `null` = no color (the default look). */
export default function BubbleColorPicker({ value, onChange }: { value: string | null; onChange: (color: string | null) => void }) {
  const swatch = (selected: boolean) => ({
    width: 28, height: 28, borderRadius: "50%", cursor: "pointer", padding: 0,
    border: selected ? "2px solid #fff" : "1px solid var(--line-2)",
    outline: selected ? "2px solid rgba(255,255,255,.25)" : "none", outlineOffset: 2,
  }) as const;
  const preview = value
    ? `linear-gradient(135deg, ${value}8c, ${value}2e 48%, #17171af5)`
    : "linear-gradient(135deg, rgba(255,255,255,.18), rgba(255,255,255,.045) 48%, #17171af5)";
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 12, alignItems: "center" }}>
        <div aria-hidden="true" style={{ width: 44, height: 44, borderRadius: "50%", flex: "none", background: preview, border: `2px solid ${value ?? "rgba(255,255,255,.58)"}` }} />
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }} role="group" aria-label="Bubble color">
          <button type="button" title="No color (default)" aria-label="No color (default)" aria-pressed={value === null}
            onClick={() => onChange(null)}
            style={{ ...swatch(value === null), background: "transparent", color: "var(--muted)", fontSize: 14, lineHeight: 1 }}>∅</button>
          {BUBBLE_COLORS.map((c) => (
            <button key={c} type="button" title={c} aria-label={`Color ${c}`} aria-pressed={value === c}
              onClick={() => onChange(c)} style={{ ...swatch(value === c), background: c }} />
          ))}
          <label title="Custom color" style={{ ...swatch(false), position: "relative", overflow: "hidden", display: "inline-block", background: "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)" }}>
            <input type="color" value={value ?? "#3b82f6"} onChange={(e) => onChange(e.target.value)} aria-label="Custom color"
              style={{ position: "absolute", inset: -8, width: 48, height: 48, opacity: 0, cursor: "pointer" }} />
          </label>
        </div>
      </div>
      <p className="hint" style={{ margin: 0 }}>{value ? `Bubble color: ${value}` : "No color: the bubble keeps its default look."}</p>
    </div>
  );
}