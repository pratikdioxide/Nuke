import type { LogLine } from "@/lib/shared";
import Image from "next/image";

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <Image
      src="/nuke.svg"
      alt=""
      width={600}
      height={598}
      aria-hidden="true"
      style={{ width: size, height: "auto", flex: "none" }}
    />
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