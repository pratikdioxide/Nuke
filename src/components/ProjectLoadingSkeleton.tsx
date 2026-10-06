type Variant = "overview" | "deployments" | "deployment" | "files" | "env" | "settings";

function Bar({ width = "70%", height = 12 }: { width?: string | number; height?: number }) {
  return <div className="skeleton" style={{ width, height, margin: "9px 0" }} />;
}

export default function ProjectLoadingSkeleton({ variant }: { variant: Variant }) {
  return (
    <section className="project-content project-loading-content" aria-busy="true" aria-label="Loading project view" role="status">
      <div aria-hidden="true">
        {variant === "overview" && (
          <>
            <div className="page-head"><Bar width={180} height={25} /></div>
            <div className="stack">
              <div className="skeleton-card"><Bar width={110} height={17} /><Bar width="84%" /><Bar width="62%" /></div>
              <div className="skeleton-card"><Bar width={190} height={17} /><Bar width="100%" /><Bar width="76%" /></div>
            </div>
          </>
        )}
        {variant === "deployments" && (
          <>
            <div className="page-head"><Bar width={180} height={25} /></div>
            <div className="skeleton-card">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "14px 0", borderBottom: "1px solid var(--line)" }}>
                  <div style={{ flex: 1 }}><Bar width="68%" /><Bar width="42%" /></div>
                  <Bar width={70} />
                </div>
              ))}
            </div>
          </>
        )}
        {variant === "deployment" && (
          <>
            <div className="page-head"><div><Bar width={130} /><Bar width={185} height={25} /></div><Bar width={82} height={32} /></div>
            <div className="skeleton-card"><Bar width={180} height={18} /><div className="skeleton-grid" style={{ marginTop: 20 }}>{Array.from({ length: 6 }, (_, index) => <Bar key={index} width="80%" />)}</div></div>
            <div className="skeleton-card" style={{ minHeight: 190, marginTop: 16 }}><Bar width={115} height={17} />{Array.from({ length: 4 }, (_, index) => <Bar key={index} width={`${92 - index * 8}%`} />)}</div>
          </>
        )}
        {variant === "files" && (
          <>
            <div className="page-head"><Bar width={150} height={25} /></div>
            <div className="skeleton-card" style={{ minHeight: 440, display: "grid", gridTemplateColumns: "minmax(130px, .7fr) minmax(0, 2fr)", gap: 16 }}>
              <div style={{ borderRight: "1px solid var(--line)", paddingRight: 14 }}>{Array.from({ length: 7 }, (_, index) => <Bar key={index} width={`${82 - index % 3 * 10}%`} />)}</div>
              <div><Bar width="44%" />{Array.from({ length: 11 }, (_, index) => <Bar key={index} width={`${96 - index % 5 * 9}%`} />)}</div>
            </div>
          </>
        )}
        {variant === "env" && (
          <>
            <div className="page-head"><Bar width={205} height={25} /></div>
            <div className="skeleton-card"><Bar width="62%" height={17} />{Array.from({ length: 4 }, (_, index) => <div key={index} style={{ display: "grid", gridTemplateColumns: "1fr 2fr 64px", gap: 10, marginTop: 18 }}><Bar width="90%" height={36} /><Bar width="95%" height={36} /><Bar width="100%" height={36} /></div>)}</div>
          </>
        )}
        {variant === "settings" && (
          <>
            <div className="page-head"><Bar width={180} height={25} /></div>
            <div className="stack">
              <div className="skeleton-card"><Bar width={130} height={17} /><Bar width="70%" /> <Bar width="52%" height={36} /></div>
              <div className="skeleton-card"><Bar width={160} height={17} /><Bar width="92%" height={36} /></div>
            </div>
          </>
        )}
      </div>
      <span className="sr-only">Loading project workspace…</span>
    </section>
  );
}
