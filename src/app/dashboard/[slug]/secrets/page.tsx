import PrivateApiManager from "@/components/PrivateApiManager";
import { getProject } from "@/lib/projects";
import { notFound } from "next/navigation";

export const metadata = { title: "Secrets & API proxies" };

export default async function SecretsPage({ params }: { params: Promise<{ slug: string }> }) {
  const project = await getProject((await params).slug);
  if (!project) notFound();
  return <PrivateApiManager slug={project.slug} />;
}
