import { guard } from "@/lib/auth";
import { q } from "@/lib/db";

// Tells the browser which file hashes the server does not have yet.
export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  const { hashes } = await req.json().catch(() => ({ hashes: [] }));
  if (!Array.isArray(hashes) || hashes.length > 2000 || hashes.some((h) => typeof h !== "string" || !/^[a-f0-9]{64}$/.test(h))) {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  const have = await q<{ hash: string }>("SELECT hash FROM nuke_blobs WHERE hash = ANY($1::text[])", [hashes]);
  const set = new Set(have.map((r) => r.hash));
  return Response.json({ missing: hashes.filter((h) => !set.has(h)) });
}
