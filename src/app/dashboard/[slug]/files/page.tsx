import { notFound } from "next/navigation";
import FileEditor from "@/components/FileEditor";
import { getFiles, getProject } from "@/lib/projects";

export const dynamic = "force-dynamic";
export const metadata = { title: "Files" };

export default async function Files({ params }: { params: Promise<{ slug: string }> }) {
  const project = await getProject((await params).slug);
  if (!project) notFound();
  const files = project.active_deployment_id ? await getFiles(project.active_deployment_id) : [];
  return <FileEditor slug={project.slug} files={files.map(({ path, hash, size }) => ({ path, hash, size }))} />;
}
