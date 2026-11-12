"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DOC_SECTIONS, docHref } from "@/components/DocsContent";

export default function DocsNav() {
  const path = (usePathname() || "").replace(/\/+$/, "") || "/";
  return (
    <nav className="project-links docs-links" aria-label="Docs sections">
      {DOC_SECTIONS.map((s) => {
        const href = docHref(s.id);
        const active = path === href;
        return <Link key={s.id} href={href} className={`tab ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>{s.label}</Link>;
      })}
    </nav>
  );
}