import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import { Logo } from "@/components/ui";
import { isAuthed } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Public: anyone (and any AI or crawler) can open /docs. The header only differs for a signed-in owner.
export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  const authed = await isAuthed();
  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <Link href={authed ? "/dashboard" : "/"} className="brand"><Logo /> NUKE</Link>
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
      <main className="container">{children}</main>
    </>
  );
}