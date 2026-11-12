import { notFound, redirect } from "next/navigation";
import { DOC_SECTIONS } from "@/components/DocsContent";

export const dynamic = "force-dynamic";

// Old per-section links (/docs/env) now go to the matching spot on the single docs page.
export default async function DocSectionRedirect({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!DOC_SECTIONS.some((s) => s.id === section)) notFound();
  redirect(`/docs#${section}`);
}