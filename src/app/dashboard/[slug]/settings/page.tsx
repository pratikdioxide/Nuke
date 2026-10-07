import { notFound } from "next/navigation";
import { DangerCard, GeneralForm, HookCard } from "@/components/SettingsForms";
import { getOrigin } from "@/lib/auth";
import { getProject } from "@/lib/projects";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function Settings({ params }: { params: Promise<{ slug: string }> }) {
  const project = await getProject((await params).slug);
  if (!project) notFound();
  return (
    <div className="stack">
      <GeneralForm slug={project.slug} name={project.name} />
      {project.git_repo && <div className="card card-pad"><h2>Git source</h2><p className="sub" style={{ margin: 0 }}><code className="i">{project.git_repo}</code>{project.git_branch ? ` @ ${project.git_branch}` : ""}{project.git_dir ? ` / ${project.git_dir}` : ""}. Redeploy it from the Overview tab or the deploy hook.</p></div>}
      <HookCard slug={project.slug} token={project.hook_token} origin={await getOrigin()} />
      <DangerCard slug={project.slug} />
    </div>
  );
}
