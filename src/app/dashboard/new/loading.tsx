export default function NewProjectLoading() {
  return (
    <section aria-busy="true" aria-label="Loading new project form" role="status">
      <div className="page-head">
        <div><div className="skeleton skeleton-title" /><div className="skeleton skeleton-line" style={{ width: 260 }} /></div>
        <div className="skeleton" style={{ width: 78, height: 36 }} />
      </div>
      <div className="stack">
        <div className="skeleton-card">
          <div className="skeleton skeleton-line" style={{ width: 150, height: 17 }} />
          <div className="skeleton skeleton-line" style={{ width: "54%", marginTop: 22 }} />
          <div className="skeleton" style={{ height: 38, marginTop: 8 }} />
        </div>
        <div className="skeleton-card" style={{ minHeight: 220 }}>
          <div className="skeleton skeleton-line" style={{ width: 190, height: 17 }} />
          <div className="skeleton" style={{ height: 118, marginTop: 20 }} />
        </div>
      </div>
      <span className="sr-only">Loading new project form…</span>
    </section>
  );
}
