import Link from "next/link";
export default function NotFound() {
  return (
    <main className="content">
      <p className="eyebrow">404</p>
      <h1>ページが見つかりません</h1>
      <p className="lead">指定されたプロジェクトは存在しないか、アクセスできません。</p>
      <Link className="btn btn-primary" href="/projects">
        プロジェクト一覧へ
      </Link>
    </main>
  );
}
