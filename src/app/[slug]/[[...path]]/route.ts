import { NextRequest } from "next/server";
import { q } from "@/lib/db";
import { missingEnv } from "@/lib/auth";
import { findFunction, runFunction } from "@/lib/functions";
import { RequestBodyError, readBytesLimited } from "@/lib/request-body";
import { slugError } from "@/lib/shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const LOGO = `<img src="/nuke-logo.svg" alt="" width="52" height="52">`;

function page(status: number, title: string, text: string) {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<body style="margin:0;min-height:100dvh;display:grid;place-items:center;background:#000;color:#ededed;font:15px system-ui,sans-serif;text-align:center;padding:24px">
<div>${LOGO}<div style="font:600 56px/1.1 system-ui;margin:14px 0 10px">${status}</div><div style="color:#a1a1a1;max-width:34ch">${text}</div></div>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

// Makes root-style calls such as fetch("/api/tracker") reach this project's functions at /<slug>/api/tracker.
function shim(slug: string) {
  return `(function(){var P="/${slug}",O=location.origin;function fix(u){if(typeof u!=="string")return u;if(u.indexOf("/api/")===0)return P+u;if(u.indexOf(O+"/api/")===0)return O+P+u.slice(O.length);return u}` +
    `var f=window.fetch;window.fetch=function(i,o){try{if(typeof i==="string")i=fix(i);else if(i&&i.url&&i.url.indexOf(O+"/api/")===0)i=new Request(fix(i.url),i)}catch(e){}return f.call(this,i,o)};` +
    `var x=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){arguments[1]=fix(String(u));return x.apply(this,arguments)};` +
    `var b=navigator.sendBeacon&&navigator.sendBeacon.bind(navigator);if(b)navigator.sendBeacon=function(u,d){return b(fix(String(u)),d)}})();`;
}

function injectEnv(html: string, env: Record<string, string>, slug: string, hasApi: boolean) {
  const json = JSON.stringify(env || {}).replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
  const tag = `<script>window.NUKE_ENV=Object.freeze(${json});${hasApi ? shim(slug) : ""}</script>`;
  const head = /<head\b[^>]*>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + tag + html.slice(head.index + head[0].length);
  const doctype = /<!doctype\b[^>]*>/i.exec(html);
  if (doctype) return html.slice(0, doctype.index + doctype[0].length) + tag + html.slice(doctype.index + doctype[0].length);
  return tag + html;
}

type Ctx = { params: Promise<{ slug: string; path?: string[] }> };

async function serve(req: NextRequest, ctx: Ctx, head: boolean) {
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

  const proj = (await q<{ id: number; did: number | null; env: Record<string, string> | null; has_api: boolean }>(
    `SELECT p.id, p.active_deployment_id AS did, d.env,
            EXISTS (SELECT 1 FROM nuke_files f WHERE f.deployment_id = p.active_deployment_id AND f.path LIKE 'api/%' AND f.path ~ '\\.(js|mjs|cjs|ts)$') AS has_api
     FROM nuke_projects p LEFT JOIN nuke_deployments d ON d.id = p.active_deployment_id WHERE p.slug=$1`, [slug]))[0];
  if (!proj) return page(404, "Not found", "No project lives at this address.");
  if (!proj.did) return page(404, "Not deployed", "This project has no live deployment yet.");

  // Everything under api/ is private server code: it runs, it is never downloaded.
  if (rel === "api" || rel.startsWith("api/")) {
    const route = rel.replace(/\/+$/, "");
    const entry = await findFunction(proj.did, route);
    if (!entry) {
      return Response.json({ error: `No function found for /${slug}/${route}. Add api/${route.slice(4) || "index"}.js to your project and redeploy.` }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    let body: Buffer;
    try { body = await readBytesLimited(req, 4 * 1024 * 1024); }
    catch (e) { return Response.json({ error: e instanceof RequestBodyError ? e.message : "Bad request." }, { status: e instanceof RequestBodyError ? e.status : 400 }); }
    const headers = Object.fromEntries(req.headers);
    if (headers.cookie) headers.cookie = headers.cookie.split(";").filter((c) => !/^\s*nuke_session=/.test(c)).join(";");
    const ip = (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
    return runFunction({
      project: { id: proj.id, slug }, deploymentId: proj.did, entry, method: req.method,
      url: `/${route}${req.nextUrl.search}`, headers, body, ip,
    });
  }

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
  const body = isHtml ? injectEnv(blob.data.toString("utf8"), proj.env || {}, slug, proj.has_api) : new Uint8Array(blob.data);
  return new Response(body, { headers });
}

async function handle(req: NextRequest, ctx: Ctx, head = false) {
  try { return await serve(req, ctx, head); }
  catch (e) { console.error("serve failed:", (e as Error).message); return page(500, "Error", "Something went wrong."); }
}
export const GET = (req: NextRequest, ctx: Ctx) => handle(req, ctx);
export const HEAD = (req: NextRequest, ctx: Ctx) => handle(req, ctx, true);
// Functions accept every method; static files do not.
const fnOnly = async (req: NextRequest, ctx: Ctx) => {
  const { path } = await ctx.params;
  if (path?.[0] !== "api") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  return handle(req, ctx);
};
export const POST = fnOnly;
export const PUT = fnOnly;
export const PATCH = fnOnly;
export const DELETE = fnOnly;
export const OPTIONS = fnOnly;
