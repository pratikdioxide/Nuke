import { isIP } from "node:net";
import { validateSecretName } from "./private-secrets";

export const PROXY_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type ProxyMethod = (typeof PROXY_METHODS)[number];

export type ProxyDefinition = {
  name: string;
  origin: string;
  path_prefix: string;
  allowed_methods: ProxyMethod[];
  secret_name: string;
  secret_header: string;
  secret_prefix: string;
};

export type ApiProxy = ProxyDefinition & {
  id: string;
  project_id: number;
  created_at: string;
  updated_at: string;
};

const FORBIDDEN_SECRET_HEADERS = new Set([
  "accept", "accept-encoding", "connection", "content-length", "content-type",
  "cookie", "host", "origin", "proxy-authorization", "referer", "set-cookie",
  "te", "trailer", "transfer-encoding", "upgrade", "user-agent",
]);

export function validateProxyDefinition(input: unknown): ProxyDefinition {
  if (!input || typeof input !== "object") throw new Error("Enter the proxy settings.");
  const body = input as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!/^[a-z][a-z0-9-]{0,39}$/.test(name)) {
    throw new Error("Use a proxy name with lowercase letters, numbers, or dashes; it must start with a letter.");
  }

  const rawOrigin = typeof body.origin === "string" ? body.origin.trim() : "";
  let originUrl: URL;
  try {
    originUrl = new URL(rawOrigin);
  } catch {
    throw new Error("Enter a valid HTTPS API origin, such as https://api.vendor.com.");
  }
  const hostname = originUrl.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    originUrl.protocol !== "https:" ||
    originUrl.username ||
    originUrl.password ||
    (originUrl.port && originUrl.port !== "443") ||
    originUrl.pathname !== "/" ||
    originUrl.search ||
    originUrl.hash ||
    isIP(hostname) ||
    !hostname.includes(".") ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(hostname)
  ) {
    throw new Error("Use a public HTTPS hostname on port 443 only. Enter the path separately below.");
  }

  const rawPrefix = typeof body.path_prefix === "string" ? body.path_prefix.trim() : "";
  if (
    !rawPrefix.startsWith("/") ||
    rawPrefix === "/" ||
    rawPrefix.startsWith("//") ||
    !/^[A-Za-z0-9._~!$&'()*+,;=:@/-]+$/.test(rawPrefix)
  ) {
    throw new Error("Use a specific path prefix such as /v1, not the whole API host.");
  }
  const pathPrefix = rawPrefix.replace(/\/+$/, "");
  const pathParts = pathPrefix.slice(1).split("/");
  if (pathPrefix.length > 240 || pathParts.some((part) => !part || part === "." || part === "..")) {
    throw new Error("The path prefix contains an invalid or unsafe path segment.");
  }

  if (!Array.isArray(body.allowed_methods) || body.allowed_methods.length < 1) {
    throw new Error("Choose at least one allowed request method.");
  }
  const methods = [...new Set(body.allowed_methods.map((value) => String(value).toUpperCase()))];
  if (methods.length > PROXY_METHODS.length || methods.some((method) => !(PROXY_METHODS as readonly string[]).includes(method))) {
    throw new Error("Choose only GET, POST, PUT, PATCH, or DELETE.");
  }

  const secretHeader = typeof body.secret_header === "string" ? body.secret_header.trim().toLowerCase() : "";
  if (
    !/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(secretHeader) ||
    FORBIDDEN_SECRET_HEADERS.has(secretHeader) ||
    /^(?:sec-|proxy-|x-forwarded-)/.test(secretHeader)
  ) {
    throw new Error("Choose a safe authentication header, such as Authorization or X-API-Key.");
  }

  const secretPrefix = typeof body.secret_prefix === "string" ? body.secret_prefix : "";
  if (secretPrefix.length > 64 || /[^\x20-\x7e]/.test(secretPrefix)) {
    throw new Error("The header prefix must be 64 printable characters or fewer.");
  }

  return {
    name,
    origin: originUrl.origin,
    path_prefix: pathPrefix,
    allowed_methods: methods as ProxyMethod[],
    secret_name: validateSecretName(body.secret_name),
    secret_header: secretHeader,
    secret_prefix: secretPrefix,
  };
}
