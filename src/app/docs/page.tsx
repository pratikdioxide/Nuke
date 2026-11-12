import { DocPage } from "@/components/DocsContent";

export const dynamic = "force-dynamic";
// The rest of the site is noindex; the docs are meant to be found, shared and read by people and AI tools.
export const metadata = {
  title: "Docs",
  description: "How to host sites, set environment variables and write api/ functions on Nuke.",
  robots: { index: true, follow: true },
};

export default function Docs() {
  return <DocPage id="start" />;
}