"use client";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/upload";

export default function LogoutButton() {
  const router = useRouter();
  return <button className="btn btn-sm" onClick={async () => { await api("/api/auth/logout", "POST"); router.replace("/"); router.refresh(); }}>Log out</button>;
}