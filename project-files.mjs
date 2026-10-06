import path from "node:path";

export const MAX_PROJECT_FILES = 500;
export const MAX_PROJECT_BYTES = 16 * 1024 * 1024;

const MIME_TYPES = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".eot": "application/vnd.ms-fontobject",
  ".gif": "image/gif",
  ".htm": "text/html; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".m4a": "audio/mp4",
  ".mov": "video/quicktime",
  ".ogg": "audio/ogg",
  ".otf": "font/otf",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".text": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".wav": "audio/wav",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};

export function contentTypeForProjectPath(filePath) {
  return MIME_TYPES[path.posix.extname(filePath).toLowerCase()] || "application/octet-stream";
}

export function normalizeProjectFiles(input, entryHtml = "") {
  if (input === undefined || input === null) input = [];
  if (!Array.isArray(input)) throw new Error("Project files must be a file list.");
  if (input.length > MAX_PROJECT_FILES) throw new Error(`A project can contain up to ${MAX_PROJECT_FILES} files.`);

  const files = [];
  const paths = new Set();
  let totalBytes = Buffer.byteLength(typeof entryHtml === "string" ? entryHtml : "");
  if (totalBytes > MAX_PROJECT_BYTES) throw new Error("A project’s uploaded files and HTML must total 16 MB or less.");

  for (const item of input) {
    const filePath = typeof item?.path === "string" ? item.path : "";
    const segments = filePath.split("/");
    if (
      !filePath ||
      filePath.startsWith("/") ||
      filePath.includes("\\") ||
      filePath.includes("\0") ||
      /^[a-z]:/i.test(filePath) ||
      segments.some((segment) => !segment || segment === "." || segment === "..")
    ) {
      throw new Error(`Invalid project file path: ${filePath || "(empty)"}. Use paths relative to the project folder.`);
    }
    const lowerSegments = segments.map((segment) => segment.toLowerCase());
    const filename = lowerSegments.at(-1);
    if (
      lowerSegments.includes(".git") ||
      /^\.env/.test(filename) ||
      [".npmrc", ".netrc", "id_rsa", "id_ed25519"].includes(filename)
    ) {
      throw new Error(`Do not upload private or secret files such as ${filePath}. Project files are publicly accessible.`);
    }
    if (filePath.toLowerCase() === "index.html") {
      throw new Error("Keep the root index.html in the main HTML field; other project files go in the folder upload.");
    }
    if (paths.has(filePath)) throw new Error(`Project file path ${filePath} appears more than once.`);
    paths.add(filePath);

    const encoding = item.encoding;
    const content = typeof item.content === "string" ? item.content : null;
    if (content === null || !["utf8", "base64"].includes(encoding)) {
      throw new Error(`Project file ${filePath} has invalid content.`);
    }
    if (encoding === "base64" && !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content)) {
      throw new Error(`Project file ${filePath} is not valid base64 data.`);
    }
    const size = encoding === "base64"
      ? Math.floor(content.length * 3 / 4) - (content.endsWith("==") ? 2 : content.endsWith("=") ? 1 : 0)
      : Buffer.byteLength(content);
    totalBytes += size;
    if (totalBytes > MAX_PROJECT_BYTES) throw new Error("A project’s uploaded files and HTML must total 16 MB or less.");

    files.push({
      path: filePath,
      contentType: contentTypeForProjectPath(filePath),
      encoding,
      content,
    });
  }
  return files;
}

export function normalizeRequestedProjectPath(rawPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  if (!decoded || decoded.startsWith("/") || decoded.includes("\\") || decoded.includes("\0")) return null;

  const isDirectory = decoded.endsWith("/");
  const filePath = isDirectory ? decoded.slice(0, -1) : decoded;
  const segments = filePath.split("/");
  if (!filePath || segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
  return isDirectory ? `${filePath}/index.html` : filePath;
}
