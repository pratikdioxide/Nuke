import { redirect } from "next/navigation";
import Landing from "@/components/Landing";
import { isAuthed, missingEnv } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const missing = missingEnv();
  if (!missing.length && (await isAuthed())) redirect("/dashboard");
  return <Landing missing={missing} />;
}