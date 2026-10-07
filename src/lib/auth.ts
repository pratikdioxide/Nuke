import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

export const COOKIE = "nuke_session";
const TTL_MS = 7 * 24 * 3600 * 1000;

export function missingEnv(): string[] {
  const missing: string[] = [];
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!process.env.NUKE_PASSWORD) missing.push("NUKE_PASSWORD");
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 16) missing.push("SESSION_SECRET (16+ characters)");
  return missing;
}

function sign(value: string): string {
  return crypto.createHmac("sha256", process.env.SESSION_SECRET || "").update(value).digest("base64url");
}

export function createToken(): { token: string; maxAge: number } {
  const exp = Date.now() + TTL_MS;
  return { token: `${exp}.${sign(String(exp))}`, maxAge: TTL_MS / 1000 };
}

function verify(token: string | undefined): boolean {
  if (!token || !process.env.SESSION_SECRET) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(exp));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function passwordMatches(input: string): boolean {
  const pw = process.env.NUKE_PASSWORD;
  if (!pw) return false;
  const h = (s: string) => crypto.createHash("sha256").update(s).digest();
  return crypto.timingSafeEqual(h(input), h(pw));
}

export async function isAuthed(): Promise<boolean> {
  return verify((await cookies()).get(COOKIE)?.value);
}

export async function requirePage(): Promise<void> {
  if (!(await isAuthed())) redirect("/");
}

/** For API routes: returns a Response when the request must be rejected. */
export async function guard(req: Request): Promise<Response | null> {
  if (missingEnv().length) return Response.json({ error: "Server is not configured yet." }, { status: 503 });
  if (!(await isAuthed())) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const origin = req.headers.get("origin");
  if (origin && req.method !== "GET" && req.method !== "HEAD") {
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    if (new URL(origin).host !== host) return Response.json({ error: "Cross-site request blocked." }, { status: 403 });
  }
  return null;
}

export async function getOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export function originFromRequest(req: Request): string {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}