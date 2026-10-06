import { guard } from "@/lib/auth";
import { q } from "@/lib/db";

// Raw (un-injected) file contents of the live deployment, used by the editor.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const denied = await guard(req);
  if (denied) return denied;
  const path = new URL(req.url).searchParams.get("path") || "";
  const rows = await q<{ data: Buffer }>(
    `SELECT b.data FROM nuke_projects p
     JOIN nuke_files f ON f.deployment_id = p.active_deployment_id AND f.path = $2
     JOIN nuke_blobs b ON b.hash = f.hash WHERE p.slug = $1`,
    [(await params).slug, path],
  );
  if (!rows[0]) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(rows[0].data), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
