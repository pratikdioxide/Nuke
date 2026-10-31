import crypto from "node:crypto";

/** Password protection for a hosted site. The password is stored only as a salted scrypt hash. */

const SCRYPT = { N: 16384, r: 8, p: 1 };
export const UNLOCK_DAYS = 30;
export const MIN_SITE_PASSWORD = 4;

export function hashSitePassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32, SCRYPT);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function checkSitePassword(password: string, stored: string): boolean {
  const [kind, saltText, hashText, extra] = stored.split("$");
  if (kind !== "scrypt" || !saltText || !hashText || extra !== undefined) return false;
  const expected = Buffer.from(hashText, "base64url");
  const actual = crypto.scryptSync(password, Buffer.from(saltText, "base64url"), expected.length, SCRYPT);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export const unlockCookieName = (slug: string) => `nuke_site_${slug.replace(/-/g, "_")}`;

function sign(value: string): string {
  return crypto.createHmac("sha256", process.env.SESSION_SECRET || "").update(value).digest("base64url");
}

/** The token is tied to the project and to the current password, so changing the password locks everyone out again. */
export function createUnlockToken(slug: string, stored: string): { token: string; maxAge: number } {
  const exp = Date.now() + UNLOCK_DAYS * 24 * 3600 * 1000;
  return { token: `${exp}.${sign(`unlock:${slug}:${stored}:${exp}`)}`, maxAge: UNLOCK_DAYS * 24 * 3600 };
}

export function verifyUnlockToken(slug: string, stored: string, token: string | undefined): boolean {
  if (!token || !process.env.SESSION_SECRET) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !(Number(exp) > Date.now())) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(`unlock:${slug}:${stored}:${exp}`));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Slows down password guessing (per server instance; good enough to stop casual brute force).
const attempts = new Map<string, { n: number; reset: number }>();
export function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.reset < now) { attempts.set(key, { n: 1, reset: now + 10 * 60 * 1000 }); return false; }
  entry.n++;
  if (attempts.size > 5000) attempts.clear();
  return entry.n > 8;
}
export function clearAttempts(key: string) { attempts.delete(key); }