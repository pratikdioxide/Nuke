import { notFound } from "next/navigation";
import EnvEditor from "@/components/EnvEditor";
import { encryptionMode } from "@/lib/crypto";
import { listEnv } from "@/lib/env-vars";
import { getProject } from "@/lib/projects";

export const dynamic = "force-dynamic";
export const metadata = { title: "Environment variables" };

export default async function Env({ params }: { params: Promise<{ slug: string }> }) {
  const project = await getProject((await params).slug);
  if (!project) notFound();
  const vars = await listEnv(project.id);
  return <EnvEditor slug={project.slug} initial={vars.map(({ name, note, is_public, broken }) => ({ name, note, is_public, broken }))} mode={encryptionMode()} />;
}
