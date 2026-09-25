"use client";
import { useRouter } from "next/navigation";

export function LogoutButton({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <button
      className="btn btn-ghost"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.replace("/login");
        router.refresh();
      }}
    >
      {children}
    </button>
  );
}
