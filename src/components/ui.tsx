import type { LogLine } from "@/lib/shared";

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path d="M16 3l2.9 7.2L26 7.5l-3.8 6.8L29 16l-6.8 1.7L26 24.5l-7.1-2.7L16 29l-2.9-7.2L6 24.5l3.8-6.8L3 16l6.8-1.7L6 7.5l7.1 2.7z" fill="#fff" />
    </svg>
  );
}

export function StatusBadge({ status, prod }: { status: string | null; prod?: boolean }) {
  if (prod) return <span className="badge prod">Production</span>;
  if (!status) return <span className="badge"><i className="dot" />No deployment</span>;
  const ok = status === "READY";
  return <span className={`badge ${ok ? "ok" : "err"}`}><i className={`dot ${ok ? "ok" : "err"}`} />{ok ? "Ready" : "Error"}</span>;
}

function clock(ts: number) {
  const d = new Date(ts);
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${p(d.getUTCMilliseconds(), 3)}`;
}

export function LogView({ logs }: { logs: LogLine[] }) {
  return (
    <div className="logs mono" role="log">
      {logs.length === 0 && <div className="log"><span className="ts">--</span><span className="m">No logs.</span></div>}
      {logs.map((l, i) => (
        <div key={i} className={`log ${l.level}`}>
          <span className="ts">{clock(l.ts)}</span>
          <span className="m">{l.msg}</span>
        </div>
      ))}
    </div>
  );
}
