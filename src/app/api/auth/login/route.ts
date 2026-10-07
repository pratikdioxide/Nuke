import { cookies } from "next/headers";
import { COOKIE, createToken, missingEnv, passwordMatches } from "@/lib/auth";

const attempts = new Map<string, { n: number; reset: number }>();

export async function POST(req: Request) {
  if (missingEnv().length) return Response.json({ error: "Server is not configured yet." }, { status: 503 });
  const ip = (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  const now = Date.now();
  const a = attempts.get(ip);
  if (a && a.reset > now && a.n >= 8) return Response.json({ error: "Too many attempts. Wait a minute." }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  if (typeof body?.password !== "string" || !passwordMatches(body.password)) {
    attempts.set(ip, { n: (a && a.reset > now ? a.n : 0) + 1, reset: a && a.reset > now ? a.reset : now + 60_000 });
    return Response.json({ error: "That password isn't right." }, { status: 401 });
  }
  attempts.delete(ip);
  const { token, maxAge } = createToken();
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge,
  });
  return Response.json({ ok: true });
}
