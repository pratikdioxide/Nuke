import { guard } from "@/lib/auth";
import { q } from "@/lib/db";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const denied = await guard(req);
  if (denied) return denied;
  const rows = await q<{ hook_token: string }>(
    "UPDATE nuke_projects SET hook_token = replace(gen_random_uuid()::text,'-','') WHERE slug=$1 RETURNING hook_token",
    [(await params).slug],
  );
  if (!rows[0]) return Response.json({ error: "Project not found." }, { status: 404 });
  return Response.json({ token: rows[0].hook_token });
}
