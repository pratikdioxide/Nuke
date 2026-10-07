import Landing from "@/components/Landing";
import { isAuthed, missingEnv } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function Login() {
  const missing = missingEnv();
  return <Landing missing={missing} authed={!missing.length && (await isAuthed())} />;
}
