import Link from "next/link";
import DocsNav from "@/components/DocsNav";
import LogoutButton from "@/components/LogoutButton";
import { Logo } from "@/components/ui";
import { isAuthed } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Public: anyone (and any AI or crawler) can open /docs. The header only differs for a signed-in owner.
export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  const authed = await isAuthed();
  const backHref = authed ? "/dashboard" : "/";
  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <Link href={backHref} className="brand"><Logo /> NUKE</Link>
          <span className="spacer" />
          {authed ? (
            <>
              <Link href="/dashboard" className="btn btn-sm">Dashboard</Link>
              <LogoutButton />
            </>
          ) : (
            <Link href="/" className="btn btn-sm">Sign in</Link>
          )}
        </div>
      </header>
      <main className="container">
        <div className="project-workspace">
          <aside className="project-sidebar" aria-label="Documentation navigation">
            <Link href={backHref} className="project-home">
              <span className="project-home-mark" aria-hidden="true">←</span>
              <span>{authed ? "Dashboard" : "Home"}</span>
            </Link>
            <div className="project-identity">
              <div className="hint">Documentation</div>
              <div className="docs-name">Docs</div>
              <span className="url">Hosting, secrets and functions</span>
            </div>
            <DocsNav />
          </aside>
          <section className="project-content" aria-label="Documentation">{children}</section>
        </div>
      </main>
    </>
  );
}