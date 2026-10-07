export default function LoginLoading() {
  return (
    <main className="center" aria-busy="true" aria-label="Loading sign in" role="status">
      <div className="login">
        <div className="skeleton skeleton-title" style={{ width: 110 }} />
        <div className="skeleton skeleton-line" style={{ width: "70%" }} />
        <div className="skeleton" style={{ height: 40 }} />
        <div className="skeleton" style={{ height: 40 }} />
        <span className="sr-only">Loading sign in…</span>
      </div>
    </main>
  );
}
