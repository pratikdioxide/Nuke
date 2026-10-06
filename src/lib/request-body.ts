export class RequestBodyError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function readBytesLimited(request: Request, maxBytes: number): Promise<Buffer> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestBodyError("Request body is too large.", 413);
  }
  if (!request.body) return Buffer.alloc(0);

  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new RequestBodyError("Request body is too large.", 413);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

export async function readJsonLimited<T>(request: Request, maxBytes: number): Promise<T> {
  const bytes = await readBytesLimited(request, maxBytes);
  try {
    return JSON.parse(bytes.toString("utf8")) as T;
  } catch {
    throw new RequestBodyError("Send a valid JSON request body.", 400);
  }
}
