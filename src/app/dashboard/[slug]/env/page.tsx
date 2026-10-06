import { notFound } from "next/navigation";
import EnvEditor from "@/components/EnvEditor";
import { getProject } from "@/lib/projects";

export const dynamic = "force-dynamic";
export const metadata = { title: "Environment variables" };

export default async function Env({ params }: { params: Promise<{ slug: string }> }) {
  const project = await getProject((await params).slug);
  if (!project) notFound();
  return <EnvEditor slug={project.slug} initial={project.public_env || {}} hasDeployment={!!project.active_deployment_id} />;
}
