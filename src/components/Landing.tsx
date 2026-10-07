"use client";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import LoginForm from "@/components/LoginForm";
import { Logo } from "@/components/ui";

type Bubble = { x: number; y: number; r: number; vy: number; ph: number; sp: number; a: number };
type Pop = { x: number; y: number; r: number; t: number };

/** Floating bubble field. Bubbles drift up, dodge the cursor, pop on click, and surge when sign-in opens. */
function Bubbles({ open }: { open: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const kick = useRef(false);
  useEffect(() => { if (open) kick.current = true; }, [open]);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, raf = 0, boost = 1;
    let bubbles: Bubble[] = [];
    const pops: Pop[] = [];
    const mouse = { x: -999, y: -999 };

    const make = (initial: boolean): Bubble => {
      const r = 6 + Math.random() * 30;
      return {
        x: Math.random() * w, y: initial ? Math.random() * h : h + r + Math.random() * 120, r,
        vy: 0.2 + r * 0.012 + Math.random() * 0.3, ph: Math.random() * 6.28, sp: 0.6 + Math.random(), a: 0.5 + Math.random() * 0.5,
      };
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.max(14, Math.min(52, Math.round((w * h) / 22000)));
      bubbles = Array.from({ length: n }, () => make(true));
      if (reduce) draw();
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const b of bubbles) {
        const g = ctx.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.1, b.x, b.y, b.r);
        g.addColorStop(0, `rgba(255,255,255,${0.1 * b.a})`);
        g.addColorStop(1, `rgba(255,255,255,${0.015 * b.a})`);
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.2832); ctx.fillStyle = g; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = `rgba(255,255,255,${0.22 * b.a})`; ctx.stroke();
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.72, -2.5, -1.7); ctx.strokeStyle = `rgba(255,255,255,${0.5 * b.a})`; ctx.stroke();
      }
      for (const p of pops) {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + p.t * 30, 0, 6.2832);
        ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - p.t)})`; ctx.lineWidth = 1.5; ctx.stroke();
      }
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) return;
      if (kick.current) { boost = 7; kick.current = false; }
      boost += (1 - boost) * 0.03;
      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i];
        b.ph += 0.012 * b.sp;
        b.x += Math.sin(b.ph) * 0.35;
        b.y -= b.vy * boost;
        const dx = b.x - mouse.x, dy = b.y - mouse.y, d = Math.hypot(dx, dy);
        if (d < 130 && d > 0.01) { const f = (1 - d / 130) * 1.6; b.x += (dx / d) * f; b.y += (dy / d) * f; }
        if (b.y < -b.r * 2) bubbles[i] = make(false);
      }
      for (let i = pops.length - 1; i >= 0; i--) { pops[i].t += 0.04; if (pops[i].t >= 1) pops.splice(i, 1); }
      draw();
    };

    const onMove = (e: globalThis.PointerEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const onLeave = () => { mouse.x = mouse.y = -999; };
    const onDown = (e: globalThis.PointerEvent) => {
      if ((e.target as HTMLElement | null)?.closest("button, input, a, [role=slider]")) return;
      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i];
        if (Math.hypot(b.x - e.clientX, b.y - e.clientY) < b.r + 6) { pops.push({ x: b.x, y: b.y, r: b.r, t: 0 }); bubbles[i] = make(false); if (reduce) draw(); break; }
      }
    };

    resize();
    window.addEventListener("resize", resize);
    if (!reduce) {
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerdown", onDown);
      document.addEventListener("pointerleave", onLeave);
      raf = requestAnimationFrame(tick);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <canvas ref={ref} className="nk-bubbles" aria-hidden="true" />;
}

const KNOB = 72, PAD = 8;

export default function Landing({ missing }: { missing: string[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = useRef(0);
  const [x, setX] = useState(0);
  const [drag, setDrag] = useState(false);
  const [phase, setPhase] = useState<"idle" | "done" | "open">("idle");

  useEffect(() => () => clearTimeout(timer.current), []);

  const max = () => Math.max(1, (trackRef.current?.clientWidth ?? 340) - KNOB - PAD * 2);
  const progress = Math.min(1, x / max());

  const unlock = () => {
    if (phase !== "idle") return;
    setDrag(false); setX(max()); setPhase("done");
    timer.current = setTimeout(() => setPhase("open"), 460);
  };
  const back = () => { clearTimeout(timer.current); setPhase("idle"); setX(0); };

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (phase !== "idle") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = e.clientX - x; setDrag(true);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    setX(Math.min(max(), Math.max(0, e.clientX - start.current)));
  };
  const up = () => {
    if (!drag) return;
    setDrag(false);
    if (x >= max() * 0.88) unlock(); else setX(0);
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") { e.preventDefault(); unlock(); }
  };

  return (
    <div className="nk">
      <Bubbles open={phase !== "idle"} />
      <div className="nk-glow" aria-hidden="true" />
      <main className="nk-stage">
        <h1 className="nk-word" aria-label="NUKE">
          {"NUKE".split("").map((c, i) => <span key={i} aria-hidden="true" style={{ animationDelay: `${0.45 + i * 0.09}s` }}>{c}</span>)}
        </h1>
        <p className="nk-tag">Private hosting for your HTML files and folders.</p>

        {phase !== "open" ? (
          <section className={`nk-slide${phase === "done" ? " is-done" : ""}`}>
            <div className="nk-track" ref={trackRef}>
              <div className={`nk-fill${drag ? " drag" : ""}`} style={{ width: x + KNOB + PAD }} />
              <span className="nk-hint" style={{ opacity: Math.max(0, 1 - progress * 1.5) }}>Slide to sign in</span>
              <span className="nk-chev" aria-hidden="true" style={{ opacity: Math.max(0, 1 - progress * 2) }}>›››</span>
              <div
                className={`nk-knob${drag ? " drag" : ""}`}
                role="slider" tabIndex={0} aria-label="Slide to sign in"
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}
                style={{ transform: `translateX(${x}px)` }}
                onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}
              >
                <span className="nk-knob-in"><Logo size={40} /></span>
              </div>
            </div>
            <span className="hint">Drag the logo to the end, or press Enter on it.</span>
          </section>
        ) : (
          <section className="nk-card card card-pad stack" onKeyDown={(e) => { if (e.key === "Escape") back(); }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="brand"><Logo size={22} /> NUKE</div>
              <button type="button" className="btn btn-sm" onClick={back}>Back</button>
            </div>
            <div>
              <h2 className="nk-h">Sign in</h2>
              <p className="sub">Enter your password to open the dashboard.</p>
            </div>
            {missing.length ? (
              <div className="stack">
                <strong>Setup needed</strong>
                <p className="sub" style={{ margin: 0 }}>Add these environment variables, then redeploy or restart:</p>
                <ul className="mono" style={{ margin: 0, paddingLeft: 18 }}>{missing.map((m) => <li key={m}>{m}</li>)}</ul>
                <p className="hint" style={{ margin: 0 }}>See .env.example and README.md.</p>
              </div>
            ) : <LoginForm />}
          </section>
        )}
      </main>
    </div>
  );
}