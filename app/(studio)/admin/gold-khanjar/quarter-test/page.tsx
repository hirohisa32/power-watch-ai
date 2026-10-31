import { QuarterTestClient } from "./client";
import { GOLD_KHANJAR_QUARTER_MODEL, GOLD_KHANJAR_QUARTER_SCRIPT, GOLD_KHANJAR_QUARTER_VOICE } from "@/lib/demo/gold-khanjar-quarter-test";

export default function GoldKhanjarQuarterTestPage() {
  return <main className="page-shell">
    <div className="page-heading"><div><p className="eyebrow">Production Quality Gate</p><h1>Gold Khanjar 1/4本番品質テスト</h1><p>Opening / Endingなし。Story 3 Sceneと元時計写真Revealだけを確認します。</p></div></div>
    <section className="panel"><h2>固定条件</h2><div className="admin-table"><div><span>Voice</span><span>林さん · {GOLD_KHANJAR_QUARTER_VOICE}</span></div><div><span>Model</span><span>{GOLD_KHANJAR_QUARTER_MODEL}</span></div><div><span>Narration</span><span>{GOLD_KHANJAR_QUARTER_SCRIPT}</span></div><div><span>時計</span><span>MG_1220.jpg · 非生成Motionのみ</span></div></div></section>
    <QuarterTestClient />
  </main>;
}
