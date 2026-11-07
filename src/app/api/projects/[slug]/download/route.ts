import { Zip, ZipDeflate, ZipPassThrough } from "fflate";
import { guard } from "@/lib/auth";
import { q } from "@/lib/db";
import { getFiles, getProject } from "@/lib/projects";
import { cleanPath } from "@/lib/shared";

export const dynamic = "force-dynamic";

// Already-compressed formats are stored as-is instead of being deflated again.
const STORE_ONLY = /\.(zip|gz|png|jpe?g|gif|webp|avif|mp3|mp4|m4a|mov|webm|ogg|woff2?|pdf)$/i;

/** Content-Disposition header that is safe for any file name (ASCII fallback + UTF-8 name). */
function attachment(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]|["\\%;]/g, "_");
  const utf8 = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

/**
 * Download project files (signed-in owner only).
 *   GET /api/projects/<slug>/download                  -> every file of the live deployment as <slug>.zip
 *   GET /api/projects/<slug>/download?path=css/a.css   -> that one file
 *   add &deployment=<number> to use an older deployment instead of the live one.
 * Files under api/ are included: they are the owner's own source code. Environment variables are never included.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const denied = await guard(req);
  if (denied) return denied;

  const { slug } = await params;
  const project = await getProject(slug);
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

  const url = new URL(req.url);
  const rawPath = url.searchParams.get("path");
  const depParam = url.searchParams.get("deployment");

  let deploymentId = project.active_deployment_id;
  let label = "";
  if (depParam) {
    if (!/^\d+$/.test(depParam)) return Response.json({ error: "Invalid deployment number." }, { status: 400 });
    const rows = await q<{ id: number; status: string }>(
      "SELECT id, status FROM nuke_deployments WHERE project_id=$1 AND number=$2", [project.id, Number(depParam)]);
    if (!rows[0]) return Response.json({ error: "Deployment not found." }, { status: 404 });
    deploymentId = rows[0].id;
    label = `-v${depParam}`;
  }
  if (!deploymentId) return Response.json({ error: "Nothing is deployed yet." }, { status: 404 });

  // ---- one file ----
  if (rawPath !== null) {
    let path: string;
    try { path = cleanPath(rawPath); } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
    const rows = await q<{ data: Buffer }>(
      `SELECT b.data FROM nuke_files f JOIN nuke_blobs b ON b.hash = f.hash
       WHERE f.deployment_id = $1 AND f.path = $2`, [deploymentId, path]);
    if (!rows[0]) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(rows[0].data), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": attachment(path.split("/").pop() || "file"),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  }

  // ---- everything, as a zip streamed file by file (low memory, no response size cap) ----
  const files = await getFiles(deploymentId);
  if (!files.length) return Response.json({ error: "This deployment has no files." }, { status: 404 });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) { controller.error(err); return; }
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      try {
        for (const f of files) {
          const rows = await q<{ data: Buffer }>("SELECT data FROM nuke_blobs WHERE hash=$1", [f.hash]);
          if (!rows[0]) continue;
          const entry = STORE_ONLY.test(f.path) ? new ZipPassThrough(f.path) : new ZipDeflate(f.path, { level: 6 });
          zip.add(entry);
          entry.push(new Uint8Array(rows[0].data), true);
        }
        zip.end();
      } catch (e) {
        controller.error(e);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": attachment(`${project.slug}${label}.zip`),
      "Cache-Control": "no-store",
    },
  });
}