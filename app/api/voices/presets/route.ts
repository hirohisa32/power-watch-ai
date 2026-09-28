import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { listVoicePresets, saveVoicePreset } from "@/lib/audio/voice-repository";
import { assertSameOrigin } from "@/lib/security";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  return NextResponse.json({ presets: await listVoicePresets() });
}

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    return NextResponse.json(await saveVoicePreset(await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error, "Voice Presetを保存できませんでした");
  }
}
