import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { bgmAssets } from "@/lib/db/schema";
import { apiError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import { uploadPrivateObject } from "@/lib/storage";
import { isAdminEmail } from "@/lib/ui/presentation";
import manifest from "@/system-assets/bgm/library.json";

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    if (!isAdminEmail(user.email))
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
    const body = await request.formData();
    const file = body.get("file");
    if (!(file instanceof File))
      return NextResponse.json({ error: "BGMファイルを選択してください" }, { status: 400 });
    const item = manifest.find((entry) => entry.fileName === file.name);
    if (!item)
      return NextResponse.json({ error: "承認済み11件に含まれないファイルです" }, { status: 400 });
    if (file.size !== item.sizeBytes)
      return NextResponse.json({ error: "承認時とファイルサイズが一致しません" }, { status: 400 });
    const filePath = `system-assets/bgm/${item.fileName}`;
    await uploadPrivateObject(filePath, new Uint8Array(await file.arrayBuffer()), "audio/mpeg");
    const [saved] = await getDb()
      .insert(bgmAssets)
      .values({
        key: item.key,
        name: item.name,
        filePath,
        extension: ".mp3",
        mimeType: "audio/mpeg",
        sizeBytes: item.sizeBytes,
        durationMs: item.durationMs,
        sampleRate: item.sampleRate,
        channels: item.channels,
        genre: item.genre,
        mood: item.mood,
        tags: item.tags,
        suitableStyles: item.suitableStyles,
        analysis: item.analysis,
        active: true,
      })
      .onConflictDoUpdate({
        target: bgmAssets.key,
        set: {
          name: item.name,
          filePath,
          extension: ".mp3",
          mimeType: "audio/mpeg",
          sizeBytes: item.sizeBytes,
          durationMs: item.durationMs,
          sampleRate: item.sampleRate,
          channels: item.channels,
          genre: item.genre,
          mood: item.mood,
          tags: item.tags,
          suitableStyles: item.suitableStyles,
          analysis: item.analysis,
          active: true,
          updatedAt: new Date(),
        },
      })
      .returning({ id: bgmAssets.id, key: bgmAssets.key });
    return NextResponse.json(saved);
  } catch (error) {
    return apiError(error, "BGMをR2へ同期できませんでした");
  }
}
