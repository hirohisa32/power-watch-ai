import JaegerReelClient from "./client";

export default function JaegerReelPage() {
  return (
    <main className="studio-page">
      <section className="panel">
        <p className="eyebrow">PRODUCTION REEL QUALITY</p>
        <h1>Jaeger-LeCoultre 最終再編集</h1>
        <p>5章構成、実物写真の役割分離、Narration字幕OFF、Story Quality Gateを一度に適用します。</p>
      </section>
      <JaegerReelClient />
    </main>
  );
}
