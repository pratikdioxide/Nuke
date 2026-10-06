"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Tabs({ slug }: { slug: string }) {
  const path = usePathname();
  const base = `/dashboard/${slug}`;
  const tabs = [
    ["Overview", base], ["Deployments", `${base}/deployments`], ["Files", `${base}/files`],
    ["Environment", `${base}/env`], ["Secrets & API", `${base}/secrets`], ["Settings", `${base}/settings`],
  ];
  return (
    <nav className="project-links" aria-label="Project">
      {tabs.map(([label, href]) => {
        const active = href === base ? path === base : path.startsWith(href);
        return <Link key={href} href={href} className={`tab ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>{label}</Link>;
      })}
    </nav>
  );
}
