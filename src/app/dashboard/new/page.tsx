import Link from "next/link";
import NewProjectForm from "@/components/NewProjectForm";
import { getOrigin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "New project" };

export default async function New() {
  return (
    <>
      <div className="page-head">
        <div><h1>New project</h1><p className="sub">Pick a name, add your files, get a live URL.</p></div>
        <Link href="/dashboard" className="btn">Cancel</Link>
      </div>
      <NewProjectForm origin={await getOrigin()} />
    </>
  );
}
