export default function DashboardLoading() {
  return (
    <section aria-busy="true" aria-label="Loading projects" role="status">
      <div className="page-head">
        <div>
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-line" style={{ width: 130 }} />
        </div>
        <div className="skeleton" style={{ width: 132, height: 38 }} />
      </div>
      <div className="skeleton-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="skeleton-card" key={index}>
            <div className="skeleton skeleton-line" style={{ width: "48%", height: 17 }} />
            <div className="skeleton skeleton-line" style={{ width: "72%" }} />
            <div className="skeleton skeleton-line" style={{ width: "58%", marginTop: 28 }} />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading your projects…</span>
    </section>
  );
}
