import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { apiError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import { projectInputSchema } from "@/lib/validation";
import { chooseApprovedBgm } from "@/lib/bgm/repository";
import { HAYASHI_VOICE } from "@/lib/system-media/config";
import { resolveSystemVideoAssetSelection } from "@/lib/system-media/repository";

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const input = projectInputSchema.parse(await request.json());
    const selectedBgm = await chooseApprovedBgm({
      script: input.script,
      style: input.style,
      targetDuration: input.targetDuration,
      manualKey: input.bgmKey,
    });
    const [opening, ending] = await Promise.all([
      resolveSystemVideoAssetSelection(input.openingAssetId, "opening"),
      resolveSystemVideoAssetSelection(input.endingAssetId, "ending"),
    ]);
    const [project] = await getDb()
      .insert(projects)
      .values({
        title: input.title,
        script: input.script,
        style: input.style,
        language: input.language,
        targetDuration: input.targetDuration,
        openingAssetId: opening?.id ?? null,
        endingAssetId: ending?.id ?? null,
        narratorVoiceId: HAYASHI_VOICE.voiceId,
        narratorSelectionReason: `通常生成は${HAYASHI_VOICE.name} / ${HAYASHI_VOICE.model}に固定`,
        bgmKey: selectedBgm.key,
        userId: user.id,
      })
      .returning({ id: projects.id });
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    return apiError(error, "プロジェクトを保存できませんでした");
  }
}
