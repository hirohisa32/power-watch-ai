import Link from "next/link";
import { Home, ListVideo, LogOut, Plus, Settings } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/ui/presentation";
import { LogoutButton } from "./logout-button";

export const dynamic = "force-dynamic";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const isAdmin = isAdminEmail(user.email);
  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/projects" className="brand">
          <span>POWER</span> WATCH <small>STUDIO</small>
        </Link>
        <nav className="main-nav" aria-label="メインナビゲーション">
          <Link href="/projects"><Home size={15} /> ホーム</Link>
          <Link href="/projects/new"><Plus size={15} /> 新しい動画を作る</Link>
          <Link href="/videos"><ListVideo size={15} /> 動画一覧</Link>
          {isAdmin && <Link href="/admin"><Settings size={15} /> 管理</Link>}
        </nav>
        <div className="nav-actions user-menu">
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
