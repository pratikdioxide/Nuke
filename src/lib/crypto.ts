import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const KEY_NAME = "NUKE_SECRETS_ENCRYPTION_KEY";
const KEY_SALT = Buffer.from("nuke-project-secrets-v1", "utf8");

export function validateEnvName(input: unknown): string {
  const name = typeof input === "string" ? input.trim() : "";
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)) {
    throw new Error(`"${name || "(empty)"}" is not a valid name. Use 1-64 letters, numbers or underscores, not starting with a number.`);
  }
  return name;
}

/** "dedicated" = NUKE_SECRETS_ENCRYPTION_KEY is set. "session" = falling back to SESSION_SECRET. */
export function encryptionMode(): "dedicated" | "session" | "none" {
  if ((process.env[KEY_NAME] || "").length >= 32) return "dedicated";
  if ((process.env.SESSION_SECRET || "").length >= 16) return "session";
  return "none";
}

function encryptionKey(): Buffer {
  const mode = encryptionMode();
  if (mode === "none") throw new Error(`Set ${KEY_NAME} (32+ characters) to store environment variables.`);
  const master = mode === "dedicated" ? process.env[KEY_NAME]! : process.env.SESSION_SECRET!;
  return Buffer.from(hkdfSync("sha256", Buffer.from(master, "utf8"), KEY_SALT, Buffer.from("aes-256-gcm", "utf8"), 32));
}

// Bound to project + name, so a stored value cannot be copied to another variable.
function aad(projectId: number, name: string): Buffer {
  return Buffer.from(`nuke-private-secret:v1:${projectId}:${name}`, "utf8");
}

export function encryptValue(projectId: number, name: string, value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(aad(projectId, name));
  const enc = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

export function decryptValue(projectId: number, name: string, payload: string): string {
  const [version, ivText, tagText, valueText, extra] = payload.split(".");
  if (version !== "v1" || !ivText || !tagText || valueText === undefined || extra !== undefined) throw new Error("Invalid encrypted value.");
  const iv = Buffer.from(ivText, "base64url");
  const tag = Buffer.from(tagText, "base64url");
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Invalid encrypted value.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAAD(aad(projectId, name));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(valueText, "base64url")), decipher.final()]).toString("utf8");
}
