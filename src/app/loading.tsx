export default function AppLoading() {
  return (
    <main className="container" aria-busy="true" aria-label="Loading page" role="status">
      <div className="page-head">
        <div>
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-line" style={{ width: 180 }} />
        </div>
        <div className="skeleton" style={{ width: 120, height: 36 }} />
      </div>
      <div className="stack">
        <div className="skeleton-card"><div className="skeleton skeleton-line" style={{ width: "58%" }} /><div className="skeleton skeleton-line" style={{ width: "84%" }} /></div>
        <span className="sr-only">Loading page…</span>
      </div>
    </main>
  );
}
