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
      {/* same grid and card shape as the real project cards, so nothing jumps when they arrive */}
      <div className="grid">
        {Array.from({ length: 8 }, (_, index) => (
          <div className="card project" key={index}>
            <div className="thumb"><div className="thumb-skel" /></div>
            <div className="skeleton skeleton-line" style={{ width: "58%", height: 16, margin: "0 0 8px" }} />
            <div className="skeleton skeleton-line" style={{ width: "80%", margin: "0 0 14px" }} />
            <div className="skeleton skeleton-line" style={{ width: "64%", margin: 0 }} />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading your projects…</span>
    </section>
  );
}