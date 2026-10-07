import { guard } from "@/lib/auth";
import { q, sha256 } from "@/lib/db";
import { MAX_FILE_BYTES, formatBytes } from "@/lib/shared";

export const maxDuration = 30;

export async function PUT(req: Request, { params }: { params: Promise<{ hash: string }> }) {
  const denied = await guard(req);
  if (denied) return denied;
  const { hash } = await params;
  const data = Buffer.from(await req.arrayBuffer());
  if (data.length > MAX_FILE_BYTES) {
    return Response.json({ error: `File is ${formatBytes(data.length)}. The per-file limit is ${formatBytes(MAX_FILE_BYTES)}.` }, { status: 413 });
  }
  if (sha256(data) !== hash) return Response.json({ error: "Upload was corrupted. Please retry." }, { status: 400 });
  await q("INSERT INTO nuke_blobs (hash,size,data) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [hash, data.length, data]);
  return Response.json({ ok: true });
}
