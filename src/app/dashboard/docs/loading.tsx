export default function DocsLoading() {
  return (
    <section className="prose" aria-busy="true" aria-label="Loading documentation" role="status" style={{ maxWidth: 720 }}>
      <div className="page-head"><div className="skeleton skeleton-title" /><div className="skeleton" style={{ width: 75, height: 36 }} /></div>
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} style={{ marginBottom: 30 }}>
          <div className="skeleton skeleton-line" style={{ width: `${28 + (index % 3) * 7}%`, height: 17, marginBottom: 15 }} />
          <div className="skeleton skeleton-line" style={{ width: "100%" }} />
          <div className="skeleton skeleton-line" style={{ width: `${78 + index % 3 * 6}%` }} />
          <div className="skeleton skeleton-line" style={{ width: "59%" }} />
        </div>
      ))}
      <span className="sr-only">Loading documentation…</span>
    </section>
  );
}
