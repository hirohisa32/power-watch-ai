import { GoldKhanjarSetup } from "./setup";

export default function GoldKhanjarAdminPage() {
  return (
    <main className="page-shell">
      <div className="page-heading">
        <div><p className="eyebrow">管理者専用</p><h1>Gold Khanjar Demo Setup</h1><p>承認済み実写真と非AI Camera MotionだけをProductionへ登録します。</p></div>
      </div>
      <GoldKhanjarSetup />
    </main>
  );
}
