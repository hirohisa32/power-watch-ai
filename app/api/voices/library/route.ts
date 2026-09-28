import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ElevenLabsNarrationProvider } from "@/lib/audio/elevenlabs";
import { apiError } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const query = new URL(request.url).searchParams;
    const language = query.get("language");
    const gender = query.get("gender");
    return NextResponse.json(
      await new ElevenLabsNarrationProvider().listLibraryVoices({
        language:
          language === "ja" || language === "en" || language === "zh" ? language : undefined,
        gender:
          gender === "male" || gender === "female" || gender === "neutral"
            ? gender
            : undefined,
        search: query.get("search") || undefined,
        page: Number(query.get("page") || 0),
        pageSize: Number(query.get("pageSize") || 30),
      }),
    );
  } catch (error) {
    return apiError(error, "ElevenLabs Voice Libraryを取得できませんでした");
  }
}
