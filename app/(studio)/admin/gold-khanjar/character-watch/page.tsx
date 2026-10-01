import Link from "next/link";
import { CharacterWatchPreviewClient } from "./preview-client";

const api = "/api/admin/demo/gold-khanjar/character-watch";

export default function CharacterWatchPreviewPage() {
  return (
    <main className="page-shell">
      <div className="page-heading">
        <div>
          <p className="eyebrow">管理者専用 · Human Quality Gate</p>
          <h1>Gold Khanjar · Character × Watch</h1>
          <p>元Reference、承認済みStylized Master、5秒Previewを同一画面で比較します。</p>
        </div>
        <Link className="btn btn-secondary" href="/admin/gold-khanjar">Gold Khanjarへ戻る</Link>
      </div>

      <section className="panel">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
          <figure style={{ margin: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${api}?asset=source`} alt="元時計Reference" style={{ width: "100%", borderRadius: 16 }} />
            <figcaption><strong>元時計Reference</strong><br />Identity正本 · Serial 5082955</figcaption>
          </figure>
          <figure style={{ margin: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${api}?asset=master`} alt="Stylized Watch Master" style={{ width: "100%", borderRadius: 16 }} />
            <figcaption><strong>Stylized Watch Master</strong><br />文字・数字の再描画なし</figcaption>
          </figure>
          <figure style={{ margin: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${api}?asset=keyframe`} alt="Character Watch Keyframe" style={{ width: "100%", borderRadius: 16 }} />
            <figcaption><strong>合成キーフレーム</strong><br />白手袋・接触影・同一画調</figcaption>
          </figure>
        </div>
      </section>

      <CharacterWatchPreviewClient apiUrl={api} />
    </main>
  );
}
