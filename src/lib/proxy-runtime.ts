import { createHmac } from "node:crypto";
import dns from "node:dns/promises";
import https from "node:https";
import { tx, q } from "./db";
import { decryptSecret } from "./private-secrets";
import { validateProxyDefinition, type ApiProxy } from "./proxy-config";
import { readBytesLimited, RequestBodyError } from "./request-body";

const CLIENT_LIMIT_PER_MINUTE = 30;
const PROXY_LIMIT_PER_MINUTE = 300;
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 8_000;

let cleanupCounter = 0;

function responseError(status: number, error: string, headers?: HeadersInit): Response {
  const resultHeaders = new Headers(headers);
  resultHeaders.set("Cache-Control", "no-store");
  resultHeaders.set("X-Content-Type-Options", "nosniff");
  return Response.json({ error }, { status, headers: resultHeaders });
}

function isPublicIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && ((b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99) || b === 168)) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

async function resolvePublicIpv4(hostname: string): Promise<string> {
  const answers = await dns.lookup(hostname, { all: true, verbatim: true });
  const ipv4 = answers.filter((answer) => answer.family === 4);
  if (!ipv4.length || ipv4.some((answer) => !isPublicIpv4(answer.address))) {
    throw new Error("Upstream must resolve only to public IPv4 addresses.");
  }
  return ipv4[0].address;
}

function getClientKey(request: Request): string {
  const forwarded = request.headers.get("cf-connecting-ip")
    || request.headers.get("x-real-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
  const encryptionKey = process.env.NUKE_SECRETS_ENCRYPTION_KEY;
  if (!encryptionKey) throw new Error("Private proxy is not configured.");
  return createHmac("sha256", encryptionKey).update(forwarded.slice(0, 128)).digest("hex");
}

async function checkRateLimit(projectId: number, proxyId: string, request: Request): Promise<boolean> {
  const clientKey = getClientKey(request);
  const counts = await tx(async (client) => {
    const upsert = async (key: string) => {
      const result = await client.query<{ hits: number }>(
        `INSERT INTO nuke_proxy_usage (project_id, proxy_id, client_key, window_start, hits)
         VALUES ($1, $2, $3, date_trunc('minute', NOW()), 1)
         ON CONFLICT (project_id, proxy_id, client_key, window_start)
         DO UPDATE SET hits = nuke_proxy_usage.hits + 1
         RETURNING hits`,
        [projectId, proxyId, key],
      );
      return Number(result.rows[0]?.hits ?? 0);
    };
    const clientHits = await upsert(clientKey);
    const proxyHits = await upsert("__all__");
    return { clientHits, proxyHits };
  });

  cleanupCounter++;
  if (cleanupCounter % 128 === 0) {
    void q("DELETE FROM nuke_proxy_usage WHERE window_start < NOW() - INTERVAL '15 minutes'").catch(() => {});
  }
  return counts.clientHits <= CLIENT_LIMIT_PER_MINUTE && counts.proxyHits <= PROXY_LIMIT_PER_MINUTE;
}

function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const expectedHost = forwardedHost.split(",")[0].trim().toLowerCase();
  try {
    return new URL(origin).host.toLowerCase() === expectedHost;
  } catch {
    return false;
  }
}

function validatePathSegments(segments: string[] | undefined): string[] {
  const path = segments ?? [];
  if (path.length > 16) throw new Error("The proxy path is too long.");
  for (const part of path) {
    if (
      !part ||
      part === "." ||
      part === ".." ||
      part.includes("/") ||
      part.includes("\\") ||
      /[\0-\x1f\x7f?#]/.test(part) ||
      Buffer.byteLength(part, "utf8") > 128
    ) {
      throw new Error("The proxy path contains an invalid segment.");
    }
  }
  return path;
}

function pinnedLookup(address: string) {
  return (_hostname: string, options: any, callback: any) => {
    if (options?.all) callback(null, [{ address, family: 4 }]);
    else callback(null, address, 4);
  };
}

function requestUpstream(
  target: URL,
  address: string,
  method: string,
  headers: Record<string, string>,
  body: Buffer,
): Promise<{ status: number; contentType: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    if (body.length) headers["content-length"] = String(body.length);
    let deadline: ReturnType<typeof setTimeout>;
    const req = https.request({
      hostname: target.hostname,
      port: 443,
      method,
      path: `${target.pathname}${target.search}`,
      headers,
      lookup: pinnedLookup(address) as any,
      timeout: UPSTREAM_TIMEOUT_MS,
    }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let tooLarge = false;
      res.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > MAX_RESPONSE_BYTES) {
          tooLarge = true;
          res.destroy();
          return;
        }
        chunks.push(buffer);
      });
      res.on("end", () => {
        if (tooLarge) {
          clearTimeout(deadline);
          reject(new Error("Upstream response exceeded the size limit."));
          return;
        }
        const contentEncoding = res.headers["content-encoding"];
        if (typeof contentEncoding === "string" && contentEncoding.toLowerCase() !== "identity") {
          clearTimeout(deadline);
          reject(new Error("Upstream returned an encoded response."));
          return;
        }
        const contentType = typeof res.headers["content-type"] === "string"
          ? res.headers["content-type"].slice(0, 160)
          : "application/octet-stream";
        clearTimeout(deadline);
        resolve({ status: res.statusCode || 502, contentType, body: Buffer.concat(chunks, size) });
      });
      res.on("aborted", () => {
        clearTimeout(deadline);
        reject(new Error("Upstream response was interrupted."));
      });
      res.on("error", (error) => {
        clearTimeout(deadline);
        reject(error);
      });
    });
    deadline = setTimeout(() => req.destroy(new Error("Upstream timed out.")), UPSTREAM_TIMEOUT_MS);
    req.on("timeout", () => req.destroy(new Error("Upstream timed out.")));
    req.on("error", (error) => {
      clearTimeout(deadline);
      reject(error);
    });
    req.end(body.length ? body : undefined);
  });
}

export async function handlePublicProxy(
  request: Request,
  slug: string,
  proxyId: string,
  rawPath: string[] | undefined,
): Promise<Response> {
  if (!isSameOriginRequest(request)) return responseError(403, "Cross-origin proxy requests are not allowed.");

  const project = (await q<{ id: number }>("SELECT id FROM nuke_projects WHERE slug=$1", [slug]))[0];
  if (!project) return responseError(404, "Proxy not found.");

  const proxy = (await q<ApiProxy>(
    `SELECT id, project_id, name, origin, path_prefix, allowed_methods, secret_name,
            secret_header, secret_prefix, created_at, updated_at
     FROM nuke_api_proxies WHERE id=$1 AND project_id=$2`,
    [proxyId, project.id],
  ))[0];
  if (!proxy) return responseError(404, "Proxy not found.");

  const method = request.method.toUpperCase();
  if (!proxy.allowed_methods.includes(method as ApiProxy["allowed_methods"][number])) {
    return responseError(405, "This request method is not enabled for the proxy.", { Allow: proxy.allowed_methods.join(", ") });
  }
  if (method === "OPTIONS" || method === "HEAD") return responseError(405, "This request method is not enabled for the proxy.");

  let config: ReturnType<typeof validateProxyDefinition>;
  let pathSegments: string[];
  try {
    config = validateProxyDefinition(proxy);
    pathSegments = validatePathSegments(rawPath);
  } catch {
    return responseError(503, "This proxy configuration is invalid.");
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.search.length > 2048) return responseError(400, "The query string is too long.");

  try {
    const allowed = await checkRateLimit(project.id, proxy.id, request);
    if (!allowed) return responseError(429, "Proxy rate limit reached. Try again in a minute.", { "Retry-After": "60" });
  } catch {
    return responseError(503, "The proxy is temporarily unavailable.");
  }

  let body: Buffer;
  try {
    body = method === "GET" || method === "HEAD" ? Buffer.alloc(0) : await readBytesLimited(request, MAX_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyError) return responseError(error.status, error.message);
    return responseError(400, "Could not read the request body.");
  }

  let secretValue: string;
  try {
    const secret = (await q<{ encrypted_value: string }>(
      "SELECT encrypted_value FROM nuke_project_secrets WHERE project_id=$1 AND name=$2",
      [project.id, config.secret_name],
    ))[0];
    if (!secret || !process.env.NUKE_SECRETS_ENCRYPTION_KEY || Buffer.byteLength(process.env.NUKE_SECRETS_ENCRYPTION_KEY, "utf8") < 32) {
      return responseError(503, "The proxy's private credential is unavailable.");
    }
    secretValue = decryptSecret(project.id, config.secret_name, secret.encrypted_value);
  } catch {
    return responseError(503, "The proxy's private credential is unavailable.");
  }

  try {
    const address = await resolvePublicIpv4(new URL(config.origin).hostname);
    const target = new URL(config.origin);
    const prefix = config.path_prefix.replace(/\/+$/, "");
    const tail = pathSegments.map((part) => encodeURIComponent(part)).join("/");
    target.pathname = tail ? `${prefix}/${tail}` : prefix;
    target.search = requestUrl.search;

    const headers: Record<string, string> = {
      "accept-encoding": "identity",
      [config.secret_header]: `${config.secret_prefix}${secretValue}`,
    };
    const accept = request.headers.get("accept");
    if (accept && accept.length <= 256) headers.accept = accept;
    const contentType = request.headers.get("content-type");
    if (contentType && contentType.length <= 128 && !/[\r\n]/.test(contentType)) headers["content-type"] = contentType;

    const upstream = await requestUpstream(target, address, method, headers, body);
    if (upstream.status < 200 || upstream.status > 599) {
      return responseError(502, "The upstream API returned an unsupported response.");
    }
    if (upstream.status >= 300 && upstream.status < 400) {
      return responseError(502, "The upstream API redirected the request. Redirects are not followed.");
    }
    const responseHeaders = new Headers({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (upstream.contentType && !/[\r\n]/.test(upstream.contentType)) {
      responseHeaders.set("Content-Type", upstream.contentType);
    }
    const responseBody = upstream.status === 204 || upstream.status === 205 || upstream.status === 304
      ? null
      : new Uint8Array(upstream.body);
    return new Response(responseBody, { status: upstream.status, headers: responseHeaders });
  } catch {
    return responseError(502, "The upstream API could not be reached safely.");
  }
}
