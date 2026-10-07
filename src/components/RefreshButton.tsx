"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export default function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <button className="btn btn-sm" disabled={pending} onClick={() => start(() => router.refresh())}>{pending ? "Refreshing…" : "Refresh"}</button>;
}
