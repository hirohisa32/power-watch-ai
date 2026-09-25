import Link from "next/link";
import { LogOut } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { LogoutButton } from "./logout-button";

export const dynamic = "force-dynamic";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/projects" className="brand">
          <span>POWER</span> WATCH <small>STUDIO</small>
        </Link>
        <div className="nav-actions">
          <span className="user-email">{user.email}</span>
          <LogoutButton>
            <LogOut size={14} /> ログアウト
          </LogoutButton>
        </div>
      </header>
      {children}
    </div>
  );
}
