import Link from "next/link";
import LoginForm from "./LoginForm";
import { Logo } from "./ui";

// Deterministic values so server and browser render the same markup.
const BUBBLES = Array.from({ length: 18 }, (_, i) => ({
  x: 4 + ((i * 53) % 90),
  s: 10 + ((i * 17) % 34),
  d: 9 + ((i * 7) % 9),
  delay: -((i * 29) % 17),
  sway: (i % 2 ? 1 : -1) * (14 + ((i * 11) % 30)),
}));

export default function Landing({ missing, authed }: { missing: string[]; authed: boolean }) {
  return (
    <main className="home">
      <section className="home-copy">
        <div className="brand"><Logo size={30} /> NUKE</div>
        <div>
          <p className="eyebrow">PRIVATE HOSTING</p>
          <h1 className="home-title">Ship a page.<br />Get a link.</h1>
          <p className="sub" style={{ maxWidth: "38ch" }}>Drop in an HTML file, a folder or a GitHub repo. Nuke hosts it at <span className="mono" style={{ color: "#fff" }}>/yourname</span>, runs your <span className="mono" style={{ color: "#fff" }}>api/</span> functions, and keeps your secrets encrypted.</p>
        </div>

        {missing.length ? (
          <div className="card card-pad stack">
            <strong>Setup needed</strong>
            <p className="sub" style={{ margin: 0 }}>Add these environment variables in Vercel, then redeploy:</p>
            <ul className="mono" style={{ margin: 0, paddingLeft: 18 }}>{missing.map((m) => <li key={m}>{m}</li>)}</ul>
            <p className="hint" style={{ margin: 0 }}>See .env.example and README.md.</p>
          </div>
        ) : authed ? (
          <div className="row"><Link href="/dashboard" className="btn btn-primary">Open dashboard →</Link></div>
        ) : (
          <div className="card card-pad" style={{ maxWidth: 380 }}>
            <h2>Sign in</h2>
            <LoginForm />
          </div>
        )}
        <div className="hint mono">OWNER WORKSPACE · PRIVATE BY DEFAULT</div>
      </section>

      <section className="hero" aria-hidden="true">
        <div className="hero-ring" />
        <div className="hero-ring r2" />
        {BUBBLES.map((b, i) => (
          <span key={i} className="bubble" style={{ ["--x" as string]: `${b.x}%`, ["--s" as string]: `${b.s}px`, ["--d" as string]: `${b.d}s`, ["--delay" as string]: `${b.delay}s`, ["--sway" as string]: `${b.sway}px` }} />
        ))}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="hero-logo" src="/nuke-logo.svg" alt="" width={600} height={598} />
      </section>
    </main>
  );
}
