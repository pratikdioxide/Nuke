import Link from "next/link";

export default function NotFound() {
  return (
    <div className="center">
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 56 }}>404</h1>
        <p className="sub">This page does not exist.</p>
        <Link href="/dashboard" className="btn" style={{ marginTop: 16 }}>Go to dashboard</Link>
      </div>
    </div>
  );
}
