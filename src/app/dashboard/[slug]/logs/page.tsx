import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Function logs are no longer stored, so this tab is gone. Old links go to the project overview.
export default async function Logs({ params }: { params: Promise<{ slug: string }> }) {
  redirect(`/dashboard/${(await params).slug}`);
}