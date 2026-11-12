"use client";
import { useEffect, useRef, useState } from "react";
import { DOC_SECTIONS } from "@/components/DocsContent";

// Sidebar links jump to a section on the same page; the active link follows your scroll.
export default function DocsNav() {
  const [active, setActive] = useState<string>(DOC_SECTIONS[0].id as string);
  const lock = useRef(0);

  useEffect(() => {
    const ids: string[] = DOC_SECTIONS.map((s) => s.id);
    const update = () => {
      if (Date.now() < lock.current) return;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      let current = ids[0];
      if (atBottom) current = ids[ids.length - 1];
      else for (const id of ids) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top <= 110) current = id; }
      setActive(current);
    };
    let raf = 0;
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    const fromHash = () => { const h = decodeURIComponent(window.location.hash.slice(1)); if (ids.includes(h)) setActive(h); else update(); };
    fromHash();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("hashchange", fromHash);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", onScroll); window.removeEventListener("hashchange", fromHash); };
  }, []);

  function go(e: React.MouseEvent, id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    lock.current = Date.now() + 800;
    setActive(id);
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  }

  return (
    <nav className="project-links docs-links" aria-label="Docs sections">
      {DOC_SECTIONS.map((s) => (
        <a key={s.id} href={`#${s.id}`} onClick={(e) => go(e, s.id)} className={`tab ${active === s.id ? "active" : ""}`} aria-current={active === s.id ? "true" : undefined}>{s.label}</a>
      ))}
    </nav>
  );
}