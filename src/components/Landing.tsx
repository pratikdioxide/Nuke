"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import LoginForm from "@/components/LoginForm";
import { Logo } from "@/components/ui";

type LandingProject = { name: string; slug: string };
type Bubble = { x: number; y: number; r: number; vx: number; vy: number; name: string; slug: string };
type Obstacle = { left: number; top: number; right: number; bottom: number; vx: number; vy: number };
type Point = { x: number; y: number };

function resolveCircleRect(bubble: Bubble, obstacle: Obstacle) {
  const nearestX = Math.max(obstacle.left, Math.min(bubble.x, obstacle.right));
  const nearestY = Math.max(obstacle.top, Math.min(bubble.y, obstacle.bottom));
  const dx = bubble.x - nearestX;
  const dy = bubble.y - nearestY;
  const distance = Math.hypot(dx, dy);
  if (distance >= bubble.r) return;

  let nx: number;
  let ny: number;
  let overlap: number;
  if (distance > 0.001) {
    nx = dx / distance;
    ny = dy / distance;
    overlap = bubble.r - distance;
  } else {
    const exits = [
      { distance: bubble.x - obstacle.left, x: -1, y: 0 },
      { distance: obstacle.right - bubble.x, x: 1, y: 0 },
      { distance: bubble.y - obstacle.top, x: 0, y: -1 },
      { distance: obstacle.bottom - bubble.y, x: 0, y: 1 },
    ].sort((a, b) => a.distance - b.distance);
    nx = exits[0].x;
    ny = exits[0].y;
    overlap = exits[0].distance + bubble.r;
  }

  bubble.x += nx * (overlap + 0.5);
  bubble.y += ny * (overlap + 0.5);

  const relativeNormalSpeed = (bubble.vx - obstacle.vx) * nx + (bubble.vy - obstacle.vy) * ny;
  if (relativeNormalSpeed < 0) {
    const impulse = (1 + 0.88) * relativeNormalSpeed;
    bubble.vx -= impulse * nx;
    bubble.vy -= impulse * ny;
  }
}

/** Project bubbles bounce off one another, viewport edges, the logo, and the sign-in panel. */
function Bubbles({ projects }: { projects: LandingProject[] | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const linkRefs = useRef<Array<HTMLAnchorElement | null>>([]);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, raf = 0, previous = 0;
    let bubbles: Bubble[] = [];
    let previousObstacleCenters = new Map<string, { x: number; y: number }>();

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
      ctx.fillStyle = "rgba(255,255,255,.9)";
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
      bubbles.forEach((bubble, index) => {
        const link = linkRefs.current[index];
        if (link) {
          link.style.left = `${bubble.x}px`;
          link.style.top = `${bubble.y}px`;
          link.style.width = `${bubble.r * 2.16}px`;
          link.style.height = `${bubble.r * 2.16}px`;
        }
        const gradient = ctx.createRadialGradient(
          bubble.x - bubble.r * 0.35, bubble.y - bubble.r * 0.4, bubble.r * 0.06,
          bubble.x, bubble.y, bubble.r,
        );
        gradient.addColorStop(0, "rgba(255,255,255,.1)");
        gradient.addColorStop(1, "rgba(255,255,255,.025)");
        ctx.beginPath();
        ctx.arc(bubble.x, bubble.y, bubble.r * 1.08, 0, Math.PI * 2);
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = "rgba(255,255,255,.17)";
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(bubble.x, bubble.y, bubble.r, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(255,255,255,.58)";
        ctx.stroke();
        ctx.beginPath();
        ctx.setLineDash([1.2, 2.8]);
        ctx.arc(bubble.x, bubble.y, bubble.r * 0.76, 0, Math.PI * 2);
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = "rgba(255,255,255,.32)";
        ctx.stroke();
        ctx.setLineDash([]);
        drawTitle(bubble);
      });
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      previousObstacleCenters.clear();

      const count = projects?.length ?? 0;
      const idealRadius = Math.sqrt((w * h * 0.08) / (Math.max(1, count) * Math.PI));
      const radius = Math.max(16, Math.min(36, idealRadius, w * 0.085, h * 0.14));
      bubbles = (projects ?? []).map(({ name, slug }) => {
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
        return { x, y, r: radius, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, name, slug };
      });
      draw();
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) {
        previous = now;
        previousObstacleCenters.clear();
        return;
      }
      const elapsed = previous ? Math.min((now - previous) / 1000, 0.04) : 0;
      previous = now;
      const canvasRect = cv.getBoundingClientRect();
      const obstacleFor = (id: string, element: Element | null): Obstacle | null => {
        if (!element) {
          previousObstacleCenters.delete(id);
          return null;
        }
        const rect = element.getBoundingClientRect();
        const bounds = {
          left: rect.left - canvasRect.left,
          top: rect.top - canvasRect.top,
          right: rect.right - canvasRect.left,
          bottom: rect.bottom - canvasRect.top,
        };
        const center = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
        const last = previousObstacleCenters.get(id);
        previousObstacleCenters.set(id, center);
        const limitSpeed = (speed: number) => Math.max(-900, Math.min(900, speed));
        return {
          ...bounds,
          vx: last && elapsed > 0 ? limitSpeed((center.x - last.x) / elapsed) : 0,
          vy: last && elapsed > 0 ? limitSpeed((center.y - last.y) / elapsed) : 0,
        };
      };
      const obstacles = [
        obstacleFor("logo", document.getElementById("nk-drag-logo")),
        obstacleFor("login", document.getElementById("nk-login-card")),
      ].filter((obstacle): obstacle is Obstacle => obstacle !== null);

      for (const bubble of bubbles) {
        if (!reduce) {
          bubble.x += bubble.vx * elapsed;
          bubble.y += bubble.vy * elapsed;
        }
        for (const obstacle of obstacles) resolveCircleRect(bubble, obstacle);
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
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [projects]);

  return (
    <>
      <canvas ref={ref} className="nk-bubbles" aria-hidden="true" />
      <nav className="nk-bubble-links" aria-label="Live projects">
        {projects?.map((project, index) => (
          <a
            key={project.slug}
            ref={(element) => { linkRefs.current[index] = element; }}
            className="nk-bubble-link"
            href={`/${encodeURIComponent(project.slug)}`}
            aria-label={`Open ${project.name}`}
            title={project.name}
          />
        ))}
      </nav>
    </>
  );
}

export default function Landing({ missing, projects }: { missing: string[]; projects: LandingProject[] | null }) {
  const logoRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<Point>({ x: 0, y: 0 });
  const startingPosition = useRef<Point>({ x: 0, y: 0 });
  const logoPosition = useRef<Point | null>(null);
  const initialPosition = useRef<Point | null>(null);
  const pointerIsDown = useRef(false);
  const [position, setPosition] = useState<Point | null>(null);
  const [drag, setDrag] = useState(false);
  const [phase, setPhase] = useState<"idle" | "open">("idle");
  const statusMessage = projects === null
    ? missing.includes("DATABASE_URL")
      ? "Project bubbles need a database connection."
      : "Project bubbles are unavailable right now."
    : projects.length === 0
      ? "No active projects to show."
      : null;

  const moveLogo = useCallback((next: Point): Point => {
    const element = logoRef.current;
    if (!element) {
      logoPosition.current = next;
      setPosition(next);
      return next;
    }
    const rect = element.getBoundingClientRect();
    const bounded = {
      x: Math.max(0, Math.min(Math.max(0, window.innerWidth - rect.width), next.x)),
      y: Math.max(0, Math.min(Math.max(0, window.innerHeight - rect.height), next.y)),
    };
    logoPosition.current = bounded;
    setPosition(bounded);
    return bounded;
  }, []);

  const unlock = () => {
    pointerIsDown.current = false;
    setDrag(false);
    setPhase("open");
  };

  const back = () => {
    moveLogo(initialPosition.current ?? { x: 0, y: 0 });
    setPhase("idle");
  };

  useLayoutEffect(() => {
    const measure = () => {
      const element = logoRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const current = logoPosition.current ?? { x: rect.left, y: rect.top };
      if (!initialPosition.current) initialPosition.current = { ...current };
      moveLogo(current);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [moveLogo, phase]);

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (phase !== "idle") return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const current = logoPosition.current ?? { x: rect.left, y: rect.top };
    logoPosition.current = current;
    setPosition(current);
    pointerStart.current = { x: e.clientX, y: e.clientY };
    startingPosition.current = { ...current };
    pointerIsDown.current = true;
    setDrag(true);
  };

  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointerIsDown.current) return;
    moveLogo({
      x: startingPosition.current.x + e.clientX - pointerStart.current.x,
      y: startingPosition.current.y + e.clientY - pointerStart.current.y,
    });
  };

  const up = () => {
    if (!pointerIsDown.current) return;
    pointerIsDown.current = false;
    setDrag(false);
    const element = logoRef.current;
    const current = logoPosition.current;
    const rect = element?.getBoundingClientRect();
    if (current && rect && current.x + rect.width / 2 <= window.innerWidth * 0.52) unlock();
  };

  const cancel = () => {
    pointerIsDown.current = false;
    setDrag(false);
    moveLogo(startingPosition.current);
  };

  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); unlock(); return; }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const element = logoRef.current;
      const rect = element?.getBoundingClientRect();
      const current = logoPosition.current ?? { x: rect?.left ?? 0, y: rect?.top ?? 0 };
      const next = moveLogo({
        x: current.x + (e.key === "ArrowLeft" ? -64 : e.key === "ArrowRight" ? 64 : 0),
        y: current.y + (e.key === "ArrowUp" ? -64 : e.key === "ArrowDown" ? 64 : 0),
      });
      if (e.key === "ArrowLeft" && rect && next.x + rect.width / 2 <= window.innerWidth * 0.52) unlock();
    }
  };

  return (
    <div className="nk">
      <Bubbles projects={projects} />
      <div className="nk-glow" aria-hidden="true" />
      {statusMessage && <p className="nk-project-status" role="status">{statusMessage}</p>}
      {phase === "idle" && (
        <div
          ref={logoRef}
          id="nk-drag-logo"
          className={`nk-logo-drag${drag ? " drag" : ""}`}
          role="button"
          tabIndex={0}
          aria-label="Drag the Nuke logo anywhere. Move it left to sign in."
          aria-controls="nk-login-card"
          aria-expanded={false}
          style={position ? { left: `${position.x}px`, top: `${position.y}px`, transform: "none" } : undefined}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={cancel}
          onKeyDown={key}
        >
          <Logo size={220} />
        </div>
      )}
      <main className="nk-stage">
        <h1 className="sr-only">NUKE</h1>
        {phase === "open" && (
          <section id="nk-login-card" className="nk-card card card-pad stack" onKeyDown={(e) => { if (e.key === "Escape") back(); }}>
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