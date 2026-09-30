import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { VOICE_PREVIEW_OPTIONS, VOICE_PREVIEW_TEXT } from "@/lib/audio/voice-preview";
import { isAdminEmail } from "@/lib/ui/presentation";
import { VoicePreviewClient } from "./voice-preview-client";

export const metadata: Metadata = { title: "ElevenLabs Voice比較" };

export default async function VoicePreviewPage() {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) notFound();
  return (
    <main className="content">
      <div className="page-head">
        <div>
          <p className="eyebrow">管理者専用 · Gold Khanjar品質確認</p>
          <h1>ElevenLabs Voice A / B比較</h1>
          <p className="lead">固定テスト文を各Voiceにつき1回だけ生成し、R2保存後は再利用します。</p>
        </div>
        <Link href="/admin" className="btn">
          管理トップへ
        </Link>
      </div>
      <section className="panel">
        <p className="eyebrow">比較テスト文</p>
        <p>{VOICE_PREVIEW_TEXT}</p>
      </section>
      <VoicePreviewClient options={[...VOICE_PREVIEW_OPTIONS]} />
    </main>
  );
}
