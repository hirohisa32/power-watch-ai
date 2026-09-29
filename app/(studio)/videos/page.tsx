import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listUserProjects } from "@/lib/ui/project-list";
import { ProjectCollection } from "../projects/project-collection";

export const metadata: Metadata = { title: "動画一覧" };
export const dynamic = "force-dynamic";

export default async function VideosPage() {
  const user = await requireUser();
  const rows = await listUserProjects(user.id);
  return <main className="content">
    <div className="page-head"><div><p className="eyebrow">動画一覧</p><h1>制作した動画</h1><p className="lead">制作途中の動画を開いたり、過去の動画を複製して新しい時計に活用できます。</p></div><Link href="/projects/new" className="btn btn-primary"><Plus size={15} />新しい動画を作る</Link></div>
    {rows.length ? <ProjectCollection rows={rows} /> : <div className="empty"><h2>まだ動画がありません。</h2><Link href="/projects/new" className="btn btn-primary">新しい動画を作る</Link></div>}
  </main>;
}
