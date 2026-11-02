import { JaegerQualityClient } from "./jaeger-quality-client";

export default function JaegerQualityPage() {
  return (
    <main className="studio-page">
      <section className="panel admin-section">
        <p className="eyebrow">JAEGER-LECOULTRE</p>
        <h1>Retention / Product Desire 最適化</h1>
        <p className="hint">
          承認済みの実物写真だけを再配置し、EvidenceからProduct Beautyへの流れを適用します。
        </p>
        <JaegerQualityClient />
      </section>
    </main>
  );
}
