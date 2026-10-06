import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { Logo } from "@/components/ui";
import { isAuthed, missingEnv } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function Login() {
  const missing = missingEnv();
  if (!missing.length && (await isAuthed())) redirect("/dashboard");
  return (
    <div className="center">
      <div className="login">
        <div className="brand"><Logo size={26} /> NUKE</div>
        <div>
          <h1>Sign in</h1>
          <p className="sub">Private hosting for your HTML files and folders.</p>
        </div>
        {missing.length ? (
          <div className="card card-pad stack">
            <strong>Setup needed</strong>
            <p className="sub" style={{ margin: 0 }}>Add these environment variables, then redeploy or restart:</p>
            <ul className="mono" style={{ margin: 0, paddingLeft: 18 }}>{missing.map((m) => <li key={m}>{m}</li>)}</ul>
            <p className="hint" style={{ margin: 0 }}>See .env.example and README.md.</p>
          </div>
        ) : <LoginForm />}
      </div>
    </div>
  );
}
