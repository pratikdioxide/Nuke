import Landing from "@/components/Landing";
import { isAuthed, missingEnv } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const missing = missingEnv();
  return <Landing missing={missing} authed={!missing.length && (await isAuthed())} />;
}
