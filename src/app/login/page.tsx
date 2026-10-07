import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Sign-in now lives on the landing page.
export default function Login() {
  redirect("/");
}