import { handlePublicProxy } from "@/lib/proxy-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 15;

type Context = { params: Promise<{ slug: string; proxyId: string; path?: string[] }> };

async function run(request: Request, { params }: Context) {
  const { slug, proxyId, path } = await params;
  try {
    return await handlePublicProxy(request, slug, proxyId, path);
  } catch {
    return Response.json(
      { error: "The proxy is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
    );
  }
}

export { run as GET, run as POST, run as PUT, run as PATCH, run as DELETE };

export function HEAD() {
  return Response.json({ error: "This request method is not enabled for the proxy." }, { status: 405, headers: { Allow: "GET, POST, PUT, PATCH, DELETE", "Cache-Control": "no-store" } });
}

export function OPTIONS() {
  return Response.json({ error: "Cross-origin proxy requests are not allowed." }, { status: 405, headers: { Allow: "GET, POST, PUT, PATCH, DELETE", "Cache-Control": "no-store" } });
}
