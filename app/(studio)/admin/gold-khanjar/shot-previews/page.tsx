import Link from "next/link";
import { ShotPreviewClient } from "./preview-client";

const api = "/api/admin/demo/gold-khanjar/shot-previews";

export default function GoldKhanjarShotPreviewPage() {
  return (
    <main className="page-shell">
      <div className="page-heading">
        <div>
          <p className="eyebrow">管理者専用 · Character / Hand Quality Gate</p>
          <h1>Gold Khanjar · Shot 1 / Shot 4</h1>
          <p>Character Masterと人物Animation、Stylized Watch Masterと手×時計を分離して比較します。</p>
        </div>
        <Link className="btn btn-secondary" href="/admin/gold-khanjar">Gold Khanjarへ戻る</Link>
      </div>

      <section className="panel">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
          <figure style={{ margin: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${api}?asset=character-master`} alt="Gold Khanjar Character Master" style={{ width: "100%", borderRadius: 16 }} />
            <figcaption><strong>Character Master</strong><br />顔・髭・年齢・ターバン・衣服の正本</figcaption>
          </figure>
          <figure style={{ margin: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${api}?asset=stylized-master`} alt="Gold Khanjar Stylized Watch Master" style={{ width: "100%", borderRadius: 16 }} />
            <figcaption><strong>Stylized Watch Master</strong><br />Dial / Khanjar / Hands / Bezel / Case / Braceletの正本</figcaption>
          </figure>
          <figure style={{ margin: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${api}?asset=shot-4-reference`} alt="Shot 4 reference frame" style={{ width: "100%", borderRadius: 16 }} />
            <figcaption><strong>Shot 4 Reference</strong><br />顔なし・白手袋・数cmリフトのみ</figcaption>
          </figure>
        </div>
      </section>

      <ShotPreviewClient shot="shot-1" title="Shot 1 · Silent Reaction" description="口を閉じ、箱へ小さく視線を落とす。瞬き・呼吸・微細な視線移動のみ。" />
      <ShotPreviewClient shot="shot-4" title="Shot 4 · Hand × Watch Lift" description="顔なし。白手袋で時計を数cmだけ真上に持ち上げ、持ち替え・回転は行わない。" />
    </main>
  );
}
