import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { guard, originFromRequest } from "@/lib/auth";
import { q } from "@/lib/db";
import { slugError } from "@/lib/shared";

/**
 * Project screenshots, taken on the server with a real (headless) Chromium and stored in nuke_thumbs.
 *   POST /api/projects/<slug>/shot   -> opens the live site, saves the picture, returns { ok, thumb_at, deployment }
 *   GET  /api/projects/<slug>/shot   -> the saved picture (used by <img>; the login cookie goes along automatically)
 *
 * Hosted sites are public at /<slug>/, so the headless browser simply opens that address on this same server.
 * If Vercel "Deployment Protection" is on, set VERCEL_AUTOMATION_BYPASS_SECRET so the browser is let in.
 * On a host without the bundled Chromium (e.g. Replit) set CHROME_EXECUTABLE_PATH to a Chrome/Chromium binary.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_THUMB = 600 * 1024;
const VIEW = { width: 1280, height: 800 };

type Ctx = { params: Promise<{ slug: string }> };
const noStore = { "Cache-Control": "no-store" };
const fail = (status: number, error: string) => Response.json({ error }, { status, headers: noStore });

export async function GET(req: Request, { params }: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  const slug = (await params).slug;
  if (slugError(slug)) return fail(404, "Project not found.");
  const t = (await q<{ data: Buffer; content_type: string }>(
    `SELECT t.data, t.content_type FROM nuke_thumbs t JOIN nuke_projects p ON p.id = t.project_id WHERE p.slug=$1`, [slug]))[0];
  if (!t) return fail(404, "No screenshot yet.");
  const versioned = new URL(req.url).searchParams.has("v"); // ?v=<time taken> makes the URL unique per picture
  return new Response(new Uint8Array(t.data), {
    headers: {
      "Content-Type": t.content_type,
      "Cache-Control": versioned ? "private, max-age=31536000, immutable" : "private, no-cache",
    },
  });
}

export async function POST(req: Request, { params }: Ctx) {
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  try {
    const denied = await guard(req);
    if (denied) return denied;
    const slug = (await params).slug;
    if (slugError(slug)) return fail(404, "Project not found.");

    const project = (await q<{ id: number; did: number | null }>(
      "SELECT id, active_deployment_id AS did FROM nuke_projects WHERE slug=$1", [slug]))[0];
    if (!project) return fail(404, "Project not found.");
    if (!project.did) return fail(409, "This project has no live deployment yet.");

    // The address of this very server (works on production, previews and custom domains).
    const target = `${originFromRequest(req)}/${slug}/`;

    chromium.setGraphicsMode = false; // no WebGL, smaller and faster to start
    const custom = process.env.CHROME_EXECUTABLE_PATH;
    browser = await puppeteer.launch({
      args: custom ? ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] : await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
      executablePath: custom || (await chromium.executablePath()),
      headless: "shell",
      defaultViewport: { ...VIEW, deviceScaleFactor: 0.75 }, // 960x600 picture
    });
    const page = await browser.newPage();
    const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    if (bypass) await page.setExtraHTTPHeaders({ "x-vercel-protection-bypass": bypass });

    // Some pages never go fully quiet (polling, websockets): after the wait we shoot what is on screen.
    await page.goto(target, { waitUntil: "networkidle2", timeout: 25_000 }).catch((e: Error) => {
      if (!/timeout/i.test(e.message)) throw e;
    });
    await page.evaluate("document.fonts ? document.fonts.ready.then(() => true) : true").catch(() => {});
    await new Promise((r) => setTimeout(r, 600)); // let entrance animations settle

    let data: Buffer | null = null;
    for (const quality of [72, 55, 40]) {
      data = Buffer.from(await page.screenshot({ type: "jpeg", quality, clip: { x: 0, y: 0, ...VIEW } }));
      if (data.length <= MAX_THUMB) break;
    }
    if (!data || data.length > MAX_THUMB) return fail(413, "Screenshot is too large.");

    // One row per project: the new picture replaces the old one. It is only stored while the deployment we
    // photographed is still the live one, so a slow capture of an old deployment can't overwrite a newer picture.
    await q(
      `INSERT INTO nuke_thumbs (project_id, deployment_id, content_type, data, updated_at)
       SELECT p.id, p.active_deployment_id, 'image/jpeg', $2, NOW() FROM nuke_projects p WHERE p.id=$1 AND p.active_deployment_id=$3
       ON CONFLICT (project_id) DO UPDATE SET deployment_id=EXCLUDED.deployment_id, content_type=EXCLUDED.content_type, data=EXCLUDED.data, updated_at=NOW()`,
      [project.id, data, project.did],
    );
    const at = (await q<{ updated_at: string; deployment_id: number }>(
      "SELECT updated_at, deployment_id FROM nuke_thumbs WHERE project_id=$1", [project.id]))[0];
    if (!at || at.deployment_id !== project.did) return fail(409, "The live deployment changed while the screenshot was being taken. Try again.");
    return Response.json({ ok: true, thumb_at: new Date(at.updated_at).getTime(), deployment: at.deployment_id }, { headers: noStore });
  } catch (e) {
    console.error("project shot error:", (e as Error)?.message);
    return fail(500, "Could not take the screenshot on the server.");
  } finally {
    await browser?.close().catch(() => {});
  }
}
