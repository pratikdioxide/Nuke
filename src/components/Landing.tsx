"use client";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import LoginForm from "@/components/LoginForm";
import { Logo } from "@/components/ui";

type LandingProject = { name: string };
type Bubble = { x: number; y: number; r: number; vx: number; vy: number; name: string };

/** Project bubbles move freely and bounce off one another and the viewport edges. */
function Bubbles({ projects }: { projects: LandingProject[] | null }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, raf = 0, previous = 0;
    let bubbles: Bubble[] = [];

    const resolveCollision = (a: Bubble, b: Bubble) => {
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let distance = Math.hypot(dx, dy);
      const minDistance = a.r + b.r;
      if (distance >= minDistance) return;
      if (distance < 0.001) {
        dx = 1;
        dy = 0;
        distance = 1;
      }

      const nx = dx / distance;
      const ny = dy / distance;
      const overlap = minDistance - distance;
      a.x -= nx * overlap * 0.5;
      a.y -= ny * overlap * 0.5;
      b.x += nx * overlap * 0.5;
      b.y += ny * overlap * 0.5;

      const relativeSpeed = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (relativeSpeed >= 0) return;
      const massA = a.r * a.r;
      const massB = b.r * b.r;
      const impulse = -(1 + 0.92) * relativeSpeed / (1 / massA + 1 / massB);
      a.vx -= impulse * nx / massA;
      a.vy -= impulse * ny / massA;
      b.vx += impulse * nx / massB;
      b.vy += impulse * ny / massB;
    };

    const drawTitle = (bubble: Bubble) => {
      const fontSize = Math.max(9, Math.min(15, bubble.r * 0.3));
      const maxWidth = bubble.r * 1.5;
      const lineHeight = fontSize * 1.16;
      const maxLines = Math.max(2, Math.floor((bubble.r * 1.15) / lineHeight));
      ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(225,209,219,.88)";
      ctx.save();
      ctx.beginPath();
      ctx.arc(bubble.x, bubble.y, bubble.r * 0.84, 0, Math.PI * 2);
      ctx.clip();

      const lines: string[] = [];
      let line = "";
      for (const word of bubble.name.trim().split(/\s+/).filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(candidate).width > maxWidth) {
          lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      if (line) lines.push(line);

      if (lines.length > maxLines) {
        lines.length = maxLines;
        let last = lines[maxLines - 1];
        while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
        lines[maxLines - 1] = `${last}…`;
      }

      const visibleLines = lines.length;
      lines.forEach((text, index) => {
        ctx.fillText(text, bubble.x, bubble.y + (index - (visibleLines - 1) / 2) * lineHeight, maxWidth);
      });
      ctx.restore();
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const bubble of bubbles) {
        const gradient = ctx.createRadialGradient(
          bubble.x - bubble.r * 0.35, bubble.y - bubble.r * 0.4, bubble.r * 0.06,
          bubble.x, bubble.y, bubble.r,
        );
          gradient.addColorStop(0, "rgba(131,88,116,.13)");
          gradient.addColorStop(1, "rgba(63,41,55,.035)");
          ctx.beginPath();
          ctx.arc(bubble.x, bubble.y, bubble.r * 1.08, 0, Math.PI * 2);
          ctx.lineWidth = 0.8;
          ctx.strokeStyle = "rgba(144,99,128,.2)";
          ctx.stroke();
        ctx.beginPath();
        ctx.arc(bubble.x, bubble.y, bubble.r, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(150,105,134,.63)";
        ctx.stroke();
        ctx.beginPath();
          ctx.setLineDash([1.2, 2.8]);
          ctx.arc(bubble.x, bubble.y, bubble.r * 0.76, 0, Math.PI * 2);
          ctx.lineWidth = 0.8;
          ctx.strokeStyle = "rgba(151,105,135,.46)";
          ctx.stroke();
          ctx.setLineDash([]);
        drawTitle(bubble);
      }
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = projects?.length ?? 0;
      const idealRadius = Math.sqrt((w * h * 0.08) / (Math.max(1, count) * Math.PI));
      const radius = Math.max(16, Math.min(36, idealRadius, w * 0.085, h * 0.14));
      bubbles = (projects ?? []).map(({ name }) => {
        let x = radius + Math.random() * Math.max(0, w - radius * 2);
        let y = radius + Math.random() * Math.max(0, h - radius * 2);
        for (let attempt = 0; attempt < 70; attempt++) {
          const candidateX = radius + Math.random() * Math.max(0, w - radius * 2);
          const candidateY = radius + Math.random() * Math.max(0, h - radius * 2);
          const spaced = bubbles.every((other) => Math.hypot(other.x - candidateX, other.y - candidateY) > other.r + radius + 8);
          x = candidateX;
          y = candidateY;
          if (spaced) break;
        }
        const angle = Math.random() * Math.PI * 2;
        const speed = 24 + Math.random() * 42;
        return { x, y, r: radius, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, name };
      });
      draw();
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) {
        previous = now;
        return;
      }
      const elapsed = previous ? Math.min((now - previous) / 1000, 0.04) : 0;
      previous = now;
      for (const bubble of bubbles) {
        bubble.x += bubble.vx * elapsed;
        bubble.y += bubble.vy * elapsed;
        if (bubble.x < bubble.r) { bubble.x = bubble.r; bubble.vx = Math.abs(bubble.vx); }
        if (bubble.x > w - bubble.r) { bubble.x = w - bubble.r; bubble.vx = -Math.abs(bubble.vx); }
        if (bubble.y < bubble.r) { bubble.y = bubble.r; bubble.vy = Math.abs(bubble.vy); }
        if (bubble.y > h - bubble.r) { bubble.y = h - bubble.r; bubble.vy = -Math.abs(bubble.vy); }
      }
      for (let i = 0; i < bubbles.length; i++) {
        for (let j = i + 1; j < bubbles.length; j++) resolveCollision(bubbles[i], bubbles[j]);
      }
      draw();
    };

    resize();
    window.addEventListener("resize", resize);
    if (!reduce) raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [projects]);

  return (
    <>
      <canvas ref={ref} className="nk-bubbles" aria-hidden="true" />
      {projects && (
        <ul className="sr-only" aria-label="Projects shown in the background">
          {projects.map((project, index) => <li key={`${project.name}-${index}`}>{project.name}</li>)}
        </ul>
      )}
    </>
  );
}

const KNOB = 72, PAD = 8;

export default function Landing({ missing, projects }: { missing: string[]; projects: LandingProject[] | null }) {
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
    start.current = e.clientX + x; setDrag(true);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    setX(Math.min(max(), Math.max(0, start.current - e.clientX)));
  };
  const up = () => {
    if (!drag) return;
    setDrag(false);
    if (x >= max() * 0.88) unlock(); else setX(0);
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowLeft") { e.preventDefault(); unlock(); }
  };

  return (
    <div className="nk">
      <Bubbles projects={projects} />
      <div className="nk-watermark" aria-hidden="true"><Logo size={160} /></div>
      <div className="nk-glow" aria-hidden="true" />
      <main className="nk-stage">
        <h1 className="nk-word" aria-label="NUKE">
          {"NUKE".split("").map((c, i) => <span key={i} aria-hidden="true" style={{ animationDelay: `${0.45 + i * 0.09}s` }}>{c}</span>)}
        </h1>
        <p className="nk-tag">Private hosting for your HTML files and folders.</p>
        <p className="nk-project-count">
          {projects === null ? "Project list unavailable" : `${projects.length} ${projects.length === 1 ? "project" : "projects"}`}
        </p>

        {phase !== "open" ? (
          <section className={`nk-slide${phase === "done" ? " is-done" : ""}`}>
            <div className="nk-track" ref={trackRef}>
              <div className={`nk-fill${drag ? " drag" : ""}`} style={{ width: x + KNOB + PAD }} />
              <span className="nk-hint" style={{ opacity: Math.max(0, 1 - progress * 1.5) }}>Drag left to sign in</span>
              <span className="nk-chev" aria-hidden="true" style={{ opacity: Math.max(0, 1 - progress * 2) }}>‹‹‹</span>
              <div
                className={`nk-knob${drag ? " drag" : ""}`}
                role="slider" tabIndex={0} aria-label="Slide to sign in"
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}
                 style={{ transform: `translateX(${-x}px)` }}
                onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}
              >
                <span className="nk-knob-in"><Logo size={40} /></span>
              </div>
            </div>
            <span className="hint">Drag the logo left, or press Enter on it.</span>
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