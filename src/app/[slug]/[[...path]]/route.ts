import { NextRequest } from "next/server";
import { q } from "@/lib/db";
import { missingEnv } from "@/lib/auth";
import { findFunction, runFunction } from "@/lib/functions";
import { RequestBodyError, readBytesLimited } from "@/lib/request-body";
import { SUBDOMAIN_ROOT, slugError } from "@/lib/shared";
import { checkSitePassword, clearAttempts, createUnlockToken, tooManyAttempts, unlockCookieName, verifyUnlockToken } from "@/lib/site-password";

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

function lockPage(error?: string, status = 401) {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Password required</title>
<body style="margin:0;min-height:100dvh;display:grid;place-items:center;background:#000;color:#ededed;font:15px system-ui,sans-serif;padding:24px">
<form method="post" action="?__unlock=1" style="width:100%;max-width:320px;text-align:center"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#a1a1a1" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
<div style="font:600 20px/1.2 system-ui;margin:16px 0 6px">This site is protected</div>
<div style="color:#a1a1a1;margin-bottom:18px">Enter the password to continue.</div>
<input name="password" type="password" autocomplete="current-password" autofocus required placeholder="Password" style="box-sizing:border-box;width:100%;height:42px;padding:0 12px;border-radius:8px;border:1px solid #333;background:#0a0a0a;color:#fff;font:inherit;outline:none">
${error ? `<div style="color:#f87171;font-size:13px;margin-top:10px">${error}</div>` : ""}
<button type="submit" style="margin-top:12px;width:100%;height:42px;border-radius:8px;border:0;background:#fff;color:#000;font:600 14px system-ui;cursor:pointer">Unlock</button></form>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
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

  // Sites live on <slug>.<root>. A plain visit to <root>/<slug>/... is sent there; the Worker (and our own
  // screenshot browser) mark their requests with x-nuke-via so they are served directly. Functions (api/) are never redirected.
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").toLowerCase();
  if (host === SUBDOMAIN_ROOT && !req.headers.get("x-nuke-via") && (req.method === "GET" || req.method === "HEAD")) {
    const rest = pathname.slice(slug.length + 1);
    if (rest !== "/api" && !rest.startsWith("/api/")) {
      return Response.redirect(`https://${slug}.${SUBDOMAIN_ROOT}${rest || "/"}${req.nextUrl.search}`, 308);
    }
  }

  const trailing = pathname.endsWith("/") || rel === "";
  if (rel.includes("\0") || rel.includes("\\") || rel.split("/").some((s, i, a) => s === ".." || s === "." || (s === "" && i < a.length - 1))) {
    return page(404, "Not found", "This page does not exist.");
  }

  const proj = (await q<{ id: number; did: number | null; env: Record<string, string> | null; has_api: boolean; pw: string | null }>(
    `SELECT p.id, p.active_deployment_id AS did, d.env, p.site_password AS pw,
            EXISTS (SELECT 1 FROM nuke_files f WHERE f.deployment_id = p.active_deployment_id AND f.path LIKE 'api/%' AND f.path ~ '\\.(js|mjs|cjs|ts)$') AS has_api
     FROM nuke_projects p LEFT JOIN nuke_deployments d ON d.id = p.active_deployment_id WHERE p.slug=$1`, [slug]))[0];
  if (!proj) return page(404, "Not found", "No project lives at this address.");
  if (!proj.did) return page(404, "Not deployed", "This project has no live deployment yet.");

  // Password protection (off unless the owner turned it on in Settings).
  const cookieName = unlockCookieName(slug);
  const unlocked = !proj.pw || verifyUnlockToken(slug, proj.pw, req.cookies.get(cookieName)?.value);
  if (req.method === "POST" && req.nextUrl.searchParams.has("__unlock")) {
    if (!proj.pw) return new Response(null, { status: 303, headers: { Location: pathname, "Cache-Control": "no-store" } });
    const ip = (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
    const key = `${ip}:${slug}`;
    if (tooManyAttempts(key)) return lockPage("Too many attempts. Try again in a few minutes.", 429);
    const form = await req.formData().catch(() => null);
    const given = form?.get("password");
    if (typeof given !== "string" || given.length > 200 || !checkSitePassword(given, proj.pw)) return lockPage("Wrong password.");
    clearAttempts(key);
    const { token, maxAge } = createUnlockToken(slug, proj.pw);
    // On <slug>.<root> the browser sees the site at "/", on <root>/<slug> it lives under /<slug>.
    const cookiePath = req.headers.get("x-nuke-via") === "worker" ? "/" : `/${slug}`;
    const secure = req.nextUrl.protocol === "https:" ? "; Secure" : "";
    return new Response(null, { status: 303, headers: {
      Location: pathname, "Cache-Control": "no-store",
      "Set-Cookie": `${cookieName}=${token}; Path=${cookiePath}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`,
    } });
  }
  if (!unlocked) {
    if (rel === "api" || rel.startsWith("api/")) return Response.json({ error: "This site is password protected." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    return lockPage();
  }

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
  let file = (await q<{ path: string; hash: string; content_type: string }>(
    `SELECT path, hash, content_type FROM nuke_files WHERE deployment_id=$1 AND path = ANY($2::text[])
     ORDER BY array_position($2::text[], path) LIMIT 1`, [proj.did, candidates]))[0];

  // Single-page-app fallback: an address with no file extension (/home, /sessions/diwali-week) that matches no file
  // gets the project's index.html with status 200, so the page's own router can show the right screen.
  // A project that ships its own 404.html keeps the old behaviour (that page is sent with 404).
  if (!file && !/\.[A-Za-z0-9]+$/.test(bare.split("/").pop() || "")) {
    const hasCustom404 = (await q(`SELECT 1 FROM nuke_files WHERE deployment_id=$1 AND path='404.html'`, [proj.did])).length > 0;
    if (!hasCustom404) {
      file = (await q<{ path: string; hash: string; content_type: string }>(
        `SELECT path, hash, content_type FROM nuke_files WHERE deployment_id=$1 AND path='index.html'`, [proj.did]))[0];
    }
  }

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
    // Tells the Cloudflare Worker it may keep this response at the edge for 60 s. Never for protected sites.
    "X-Nuke-Edge": "60",
  };
  if (proj.pw) { headers["Cache-Control"] = "private, no-store"; delete headers["X-Nuke-Edge"]; }
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
  if (path?.[0] !== "api" && !req.nextUrl.searchParams.has("__unlock")) return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  return handle(req, ctx);
};
export const POST = fnOnly;
export const PUT = fnOnly;
export const PATCH = fnOnly;
export const DELETE = fnOnly;
export const OPTIONS = fnOnly;