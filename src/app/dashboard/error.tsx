"use client";

export default function DashboardError({ reset }: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="card card-pad stack" role="alert" style={{ maxWidth: 560, margin: "32px auto" }}>
      <div>
        <h1>Couldn’t load your projects</h1>
        <p className="sub">The database request failed or timed out. Check the connection, then try again.</p>
      </div>
      <button type="button" className="btn btn-primary" onClick={reset}>Try again</button>
    </section>
  );
}
