import { NextRequest } from "next/server";
import { q } from "@/lib/db";
import { missingEnv } from "@/lib/auth";
import { slugError } from "@/lib/shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function page(status: number, title: string, text: string) {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<body style="margin:0;min-height:100dvh;display:grid;place-items:center;background:#000;color:#ededed;font:15px system-ui,sans-serif;text-align:center;padding:24px">
<div><div style="font:600 56px/1 system-ui;margin-bottom:12px">${status}</div><div style="color:#a1a1a1">${text}</div></div>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

function injectEnv(html: string, env: Record<string, string>) {
  const json = JSON.stringify(env || {}).replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
  const tag = `<script>window.NUKE_ENV=Object.freeze(${json});</script>`;
  const head = /<head\b[^>]*>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + tag + html.slice(head.index + head[0].length);
  const doctype = /<!doctype\b[^>]*>/i.exec(html);
  if (doctype) return html.slice(0, doctype.index + doctype[0].length) + tag + html.slice(doctype.index + doctype[0].length);
  return tag + html;
}

async function serve(req: NextRequest, ctx: { params: Promise<{ slug: string; path?: string[] }> }, head: boolean) {
  const { slug } = await ctx.params;
  if (slugError(slug) || missingEnv().length) return page(404, "Not found", "This page does not exist.");

  const pathname = req.nextUrl.pathname;
  let rel: string;
  try {
    rel = decodeURIComponent(pathname.slice(slug.length + 1).replace(/^\//, ""));
  } catch {
    return page(404, "Not found", "This page does not exist.");
  }
  const trailing = pathname.endsWith("/") || rel === "";
  if (rel.includes("\0") || rel.includes("\\") || rel.split("/").some((s, i, a) => s === ".." || s === "." || (s === "" && i < a.length - 1))) {
    return page(404, "Not found", "This page does not exist.");
  }

  const proj = (await q<{ did: number | null; env: Record<string, string> | null }>(
    `SELECT p.active_deployment_id AS did, d.env FROM nuke_projects p
     LEFT JOIN nuke_deployments d ON d.id = p.active_deployment_id WHERE p.slug=$1`, [slug]))[0];
  if (!proj) return page(404, "Not found", "No project lives at this address.");
  if (!proj.did) return page(404, "Not deployed", "This project has no live deployment yet.");

  const bare = rel.replace(/\/$/, "");
  const candidates = trailing ? [`${bare ? bare + "/" : ""}index.html`] : [bare, `${bare}.html`, `${bare}/index.html`];
  const file = (await q<{ path: string; hash: string; content_type: string }>(
    `SELECT path, hash, content_type FROM nuke_files WHERE deployment_id=$1 AND path = ANY($2::text[])
     ORDER BY array_position($2::text[], path) LIMIT 1`, [proj.did, candidates]))[0];

  if (!file) {
    const nf = (await q<{ data: Buffer }>(
      `SELECT b.data FROM nuke_files f JOIN nuke_blobs b ON b.hash=f.hash WHERE f.deployment_id=$1 AND f.path='404.html'`, [proj.did]))[0];
    if (nf) return new Response(head ? null : new Uint8Array(nf.data), { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    return page(404, "Not found", "This file does not exist in the project.");
  }

  // Folder without trailing slash -> add it so relative links work.
  if (!trailing && file.path === `${bare}/index.html`) {
    const url = new URL(req.url);
    url.pathname = `${pathname}/`;
    return Response.redirect(url, 308);
  }

  const isHtml = file.content_type.startsWith("text/html");
  const etag = `${isHtml ? "W/" : ""}"${file.hash.slice(0, 32)}${isHtml ? `-${proj.did}` : ""}"`;
  const headers: Record<string, string> = {
    "Content-Type": file.content_type,
    "Cache-Control": "public, max-age=0, must-revalidate",
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
  };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });

  const blob = (await q<{ data: Buffer }>("SELECT data FROM nuke_blobs WHERE hash=$1", [file.hash]))[0];
  if (!blob) return page(500, "Error", "File data is missing.");
  if (head) return new Response(null, { headers });
  const body = isHtml ? injectEnv(blob.data.toString("utf8"), proj.env || {}) : new Uint8Array(blob.data);
  return new Response(body, { headers });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string; path?: string[] }> }) {
  try { return await serve(req, ctx, false); } catch (e) { console.error("serve failed:", (e as Error).message); return page(500, "Error", "Something went wrong."); }
}
export async function HEAD(req: NextRequest, ctx: { params: Promise<{ slug: string; path?: string[] }> }) {
  try { return await serve(req, ctx, true); } catch { return page(500, "Error", "Something went wrong."); }
}
