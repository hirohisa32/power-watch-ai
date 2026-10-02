import { GoldKhanjarSetup } from "./setup";
import Link from "next/link";

export default function GoldKhanjarAdminPage() {
  return (
    <main className="page-shell">
      <div className="page-heading">
        <div><p className="eyebrow">管理者専用</p><h1>Gold Khanjar Demo Setup</h1><p>承認済み実写真と非AI Camera MotionだけをProductionへ登録します。</p></div>
      </div>
      <section className="panel">
        <h2>Human Quality Gate</h2>
        <p>元時計Reference、Stylized Master、Character × Watch Previewを比較します。</p>
        <Link className="btn btn-secondary" href="/admin/gold-khanjar/character-watch">Character × Watchを確認</Link>
        <Link className="btn btn-secondary" href="/admin/gold-khanjar/shot-previews">Shot 1 / Shot 4を確認</Link>
      </section>
      <GoldKhanjarSetup />
    </main>
  );
}
