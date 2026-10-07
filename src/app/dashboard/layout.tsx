import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import { Logo } from "@/components/ui";
import { requirePage } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requirePage();
  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <Link href="/dashboard" className="brand"><Logo /> NUKE</Link>
          <span className="spacer" />
          <Link href="/dashboard/docs" className="btn btn-sm">Docs</Link>
          <LogoutButton />
        </div>
      </header>
      <main className="container">{children}</main>
    </>
  );
}
