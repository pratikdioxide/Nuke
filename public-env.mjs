export function normalizePublicEnv(input) {
  if (input === undefined || input === null) return {};
  const entries = Array.isArray(input)
    ? input.map((item) => [item?.key, item?.value])
    : input && typeof input === "object"
      ? Object.entries(input)
      : null;
  if (!entries) throw new Error("Environment variables must be a list of key/value pairs.");
  if (entries.length > 100) throw new Error("A project can have up to 100 environment variables.");

  const result = Object.create(null);
  let totalBytes = 0;
  for (const [rawKey, rawValue] of entries) {
    const key = typeof rawKey === "string" ? rawKey.trim() : "";
    const value = typeof rawValue === "string" ? rawValue : null;
    if (!key && value === "") continue;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error("Variable names must start with a letter or underscore and contain only letters, numbers, and underscores.");
    }
    if (value === null) throw new Error(`Add a text value for ${key}.`);
    if (Object.hasOwn(result, key)) throw new Error(`Variable ${key} is listed more than once.`);
    totalBytes += Buffer.byteLength(key) + Buffer.byteLength(value);
    if (totalBytes > 256_000) throw new Error("Environment variables must total less than 256 KB.");
    Object.defineProperty(result, key, { value, enumerable: true, writable: true, configurable: true });
  }
  return result;
}

export function injectPublicEnv(html, values) {
  const serialized = JSON.stringify(values || {}).replace(/[<>&\u2028\u2029]/g, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
  const script = `<script>window.NUKE_ENV=Object.freeze(JSON.parse(${JSON.stringify(serialized)}));</script>`;
  const head = /<head\b[^>]*>/i.exec(html);
  if (head) {
    const insertAt = head.index + head[0].length;
    return `${html.slice(0, insertAt)}${script}${html.slice(insertAt)}`;
  }
  const htmlTag = /<html\b[^>]*>/i.exec(html);
  if (htmlTag) {
    const insertAt = htmlTag.index + htmlTag[0].length;
    return `${html.slice(0, insertAt)}<head>${script}</head>${html.slice(insertAt)}`;
  }
  const doctype = /<!doctype\b[^>]*>/i.exec(html);
  if (doctype) {
    const insertAt = doctype.index + doctype[0].length;
    return `${html.slice(0, insertAt)}${script}${html.slice(insertAt)}`;
  }
  return `${script}${html}`;
}
