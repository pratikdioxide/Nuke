import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const KEY_NAME = "NUKE_SECRETS_ENCRYPTION_KEY";
const KEY_SALT = Buffer.from("nuke-project-secrets-v1", "utf8");

export function validateSecretName(input: unknown): string {
  const name = typeof input === "string" ? input.trim() : "";
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)) {
    throw new Error("Use a secret name with 1–64 letters, numbers, or underscores, starting with a letter or underscore.");
  }
  return name;
}

export function validateSecretValue(input: unknown): string {
  if (typeof input !== "string" || !input.trim()) throw new Error("Enter a secret value.");
  if (Buffer.byteLength(input, "utf8") > 8192) throw new Error("Secret values must be 8 KB or smaller.");
  if (/[^\x20-\x7e]/.test(input)) throw new Error("Secret values used by the proxy must contain printable ASCII characters on one line.");
  return input;
}

function encryptionKey(): Buffer {
  const master = process.env[KEY_NAME];
  if (!master || Buffer.byteLength(master, "utf8") < 32) {
    throw new Error(`Private secrets are unavailable. Configure ${KEY_NAME} with at least 32 characters.`);
  }
  return Buffer.from(hkdfSync(
    "sha256",
    Buffer.from(master, "utf8"),
    KEY_SALT,
    Buffer.from("aes-256-gcm", "utf8"),
    32,
  ));
}

function associatedData(projectId: number, name: string): Buffer {
  return Buffer.from(`nuke-private-secret:v1:${projectId}:${name}`, "utf8");
}

export function encryptSecret(projectId: number, name: string, value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(associatedData(projectId, name));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptSecret(projectId: number, name: string, payload: string): string {
  try {
    const [version, ivText, tagText, valueText, extra] = payload.split(".");
    if (version !== "v1" || !ivText || !tagText || valueText === undefined || extra !== undefined) {
      throw new Error("Invalid encrypted value.");
    }
    const iv = Buffer.from(ivText, "base64url");
    const tag = Buffer.from(tagText, "base64url");
    if (iv.length !== 12 || tag.length !== 16) throw new Error("Invalid encrypted value.");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAAD(associatedData(projectId, name));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(valueText, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Stored secret cannot be decrypted. Check the server encryption key and saved secret.");
  }
}
