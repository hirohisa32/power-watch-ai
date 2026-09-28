import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { projects, scenes, sceneVoiceAssignments, storyboards } from "@/lib/db/schema";
import { apiError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";

const overrideSchema = z.object({
  role: z.enum(["narration", "dialogue"]),
  speakerKey: z.string().trim().min(1).max(80).optional(),
  voiceId: z.string().trim().min(3).max(100),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { id } = await params;
    const input = overrideSchema.parse(await request.json());
    const speakerKey = input.role === "narration" ? "narrator" : normalizeSpeaker(input.speakerKey);
    if (!speakerKey) return NextResponse.json({ error: "Speakerを指定してください" }, { status: 400 });
    const db = getDb();
    await db.transaction(async (transaction) => {
      const [project] = await transaction
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, id), eq(projects.userId, user.id)))
        .limit(1);
      if (!project) throw new Error("PROJECT_NOT_FOUND");
      const [storyboard] = await transaction
        .select({ id: storyboards.id })
        .from(storyboards)
        .where(and(eq(storyboards.projectId, id), eq(storyboards.isActive, true)))
        .limit(1);
      if (!storyboard) throw new Error("STORYBOARD_NOT_FOUND");
      const sceneRows = await transaction
        .select({ id: scenes.id, dialogue: scenes.dialogue })
        .from(scenes)
        .where(eq(scenes.storyboardId, storyboard.id));
      const targets = sceneRows.filter(
        (scene) =>
          input.role === "narration" ||
          scene.dialogue.some((line) => normalizeSpeaker(line.speaker) === speakerKey),
      );
      if (!targets.length) throw new Error("SPEAKER_NOT_FOUND");
      const reason = `Human Override: ${input.role}/${speakerKey}`;
      if (input.role === "narration")
        await transaction
          .update(projects)
          .set({
            narratorVoiceId: input.voiceId,
            narratorSelectionReason: reason,
            updatedAt: new Date(),
          })
          .where(eq(projects.id, id));
      for (const scene of targets) {
        await transaction
          .insert(sceneVoiceAssignments)
          .values({
            projectId: id,
            storyboardId: storyboard.id,
            sceneId: scene.id,
            speakerKey,
            role: input.role,
            voiceId: input.voiceId,
            tone: "manual",
            selectionSource: "manual_override",
            selectionReason: reason,
            selectionMetadata: { source: "manual_override" },
            manualOverride: true,
          })
          .onConflictDoUpdate({
            target: [
              sceneVoiceAssignments.sceneId,
              sceneVoiceAssignments.speakerKey,
              sceneVoiceAssignments.role,
            ],
            set: {
              voiceId: input.voiceId,
              selectionSource: "manual_override",
              selectionReason: reason,
              selectionMetadata: { source: "manual_override" },
              manualOverride: true,
              updatedAt: new Date(),
            },
          });
        if (input.role === "narration")
          await transaction
            .update(scenes)
            .set({
              voiceId: input.voiceId,
              voiceSelectionSource: "manual_override",
              voiceSelectionMetadata: { source: "manual_override", reason },
              updatedAt: new Date(),
            })
            .where(eq(scenes.id, scene.id));
      }
    });
    return NextResponse.json({ ok: true, role: input.role, speakerKey, voiceId: input.voiceId });
  } catch (error) {
    if (error instanceof Error && error.message === "PROJECT_NOT_FOUND")
      return NextResponse.json({ error: "プロジェクトが見つかりません" }, { status: 404 });
    if (error instanceof Error && error.message === "STORYBOARD_NOT_FOUND")
      return NextResponse.json({ error: "Storyboardが見つかりません" }, { status: 404 });
    if (error instanceof Error && error.message === "SPEAKER_NOT_FOUND")
      return NextResponse.json({ error: "指定されたSpeakerが見つかりません" }, { status: 404 });
    return apiError(error, "Voice Overrideを保存できませんでした");
  }
}

function normalizeSpeaker(value?: string) {
  return value?.trim().toLocaleLowerCase().replace(/\s+/g, "-") || "";
}
