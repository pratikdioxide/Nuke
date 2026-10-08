import { redirect } from "next/navigation";
import Landing from "@/components/Landing";
import { isAuthed, missingEnv } from "@/lib/auth";
import { listLandingProjects } from "@/lib/projects";

export const dynamic = "force-dynamic";

export default async function Home() {
  const missing = missingEnv();
  if (!missing.length && (await isAuthed())) redirect("/dashboard");

  let projects: { name: string; slug: string }[] | null = null;
  if (process.env.DATABASE_URL) {
    try {
      projects = await listLandingProjects();
    } catch (error) {
      // Keep the sign-in page available if the database is temporarily unreachable,
      // but log the cause so a broken connection is not silent.
      console.error("[landing] could not load projects:", error);
      projects = null;
    }
  }

  return <Landing missing={missing} projects={projects} />;
}