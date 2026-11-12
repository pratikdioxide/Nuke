import { notFound } from "next/navigation";
import { DOC_SECTIONS, DocPage, type DocId } from "@/components/DocsContent";

export const dynamic = "force-dynamic";

const find = (id: string) => DOC_SECTIONS.find((s) => s.id === id && s.id !== "start");

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }) {
  const s = find((await params).section);
  return {
    title: s ? s.label : "Docs",
    description: s ? s.blurb : undefined,
    robots: { index: true, follow: true },
  };
}

export default async function DocSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const s = find((await params).section);
  if (!s) notFound();
  return <DocPage id={s.id as DocId} />;
}