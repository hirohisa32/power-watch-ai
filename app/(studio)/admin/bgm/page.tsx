import type { Metadata } from "next";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { bgmAssets } from "@/lib/db/schema";
import { isAdminEmail } from "@/lib/ui/presentation";
import { BgmLibraryManager } from "./bgm-library-manager";

export const metadata: Metadata = { title: "BGMライブラリ" };
export const dynamic = "force-dynamic";

export default async function BgmLibraryPage() {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) notFound();
  const items = await getDb().select().from(bgmAssets).orderBy(asc(bgmAssets.name));
  return (
    <main className="content">
      <div className="page-head">
        <div>
          <p className="eyebrow">管理者専用</p>
          <h1>BGMライブラリ</h1>
          <p className="lead">承認済みBGMの試聴、タグ、有効状態、ライセンス情報を管理します。</p>
        </div>
        <Link href="/admin" className="btn">管理トップへ</Link>
      </div>
      <BgmLibraryManager items={items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(), acquiredAt: item.acquiredAt?.toISOString() ?? null }))} />
    </main>
  );
}
