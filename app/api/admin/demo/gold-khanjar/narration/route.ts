import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { analyzeNarrationAudio } from "@/lib/audio/analysis";
import { saveElevenLabsGenerationAudit } from "@/lib/audio/audit";
import { narrationConfig } from "@/lib/audio/config";
import { ElevenLabsNarrationProvider } from "@/lib/audio/elevenlabs";
import { buildAudioRecord } from "@/lib/audio/record";
import { getDb } from "@/lib/db";
import {
  apiUsage,
  audioRecords,
  narrationQualityRuns,
  narrationQualitySegments,
  projects,
  scenes,
  sceneVoiceAssignments,
  storyboards,
} from "@/lib/db/schema";
import { GOLD_KHANJAR_NARRATION, GOLD_KHANJAR_TITLE } from "@/lib/demo/gold-khanjar";
import { apiError } from "@/lib/http";
import { narrationObjectKey } from "@/lib/render/plan";
import { assertSameOrigin } from "@/lib/security";
import { createReadUrl, uploadPrivateObject } from "@/lib/storage";
import { isAdminEmail } from "@/lib/ui/presentation";

export const maxDuration = 120;

const VOICE_A = "Bj4Malc5SZLoXfPtxRxH";
const MODEL = "eleven_v4";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  const existing = await latestNarration();
  if (!existing?.objectKey) return NextResponse.json({ error: "本番Narrationは未生成です" }, { status: 404 });
  return NextResponse.redirect(await createReadUrl(existing.objectKey, 15 * 60, "inline"));
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  let audioRecordId: string | undefined;
  try {
    await assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    if (!isAdminEmail(user.email)) return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
    const db = getDb();
    const [project] = await db.select().from(projects).where(eq(projects.title, GOLD_KHANJAR_TITLE)).limit(1);
    if (!project) return NextResponse.json({ error: "Gold Khanjarプロジェクトが見つかりません" }, { status: 404 });
    const [storyboard] = await db.select().from(storyboards).where(and(eq(storyboards.projectId, project.id), eq(storyboards.isActive, true))).limit(1);
    if (!storyboard) return NextResponse.json({ error: "Storyboardが見つかりません" }, { status: 404 });

    const existing = await latestNarration(project.id);
    if (existing?.objectKey) return NextResponse.json({ ...(await narrationResponse(existing)), reused: true });

    await db.transaction(async (tx) => {
      await tx.update(projects).set({ narratorVoiceId: VOICE_A, narratorSelectionReason: "Human selected Voice A for Gold Khanjar production narration", updatedAt: new Date() }).where(eq(projects.id, project.id));
      const sceneRows = await tx.select({ id: scenes.id }).from(scenes).where(eq(scenes.storyboardId, storyboard.id));
      for (const scene of sceneRows) {
        await tx.insert(sceneVoiceAssignments).values({ projectId: project.id, storyboardId: storyboard.id, sceneId: scene.id, speakerKey: "narrator", role: "narration", voiceId: VOICE_A, tone: "luxury-documentary", selectionSource: "manual_override", selectionReason: "Human selected Voice A", selectionMetadata: { source: "human", model: MODEL }, manualOverride: true }).onConflictDoUpdate({ target: [sceneVoiceAssignments.sceneId, sceneVoiceAssignments.speakerKey, sceneVoiceAssignments.role], set: { voiceId: VOICE_A, tone: "luxury-documentary", selectionSource: "manual_override", selectionReason: "Human selected Voice A", selectionMetadata: { source: "human", model: MODEL }, manualOverride: true, updatedAt: new Date() } });
        await tx.update(scenes).set({ voiceId: VOICE_A, voiceSelectionSource: "manual_override", voiceSelectionMetadata: { source: "human", model: MODEL }, updatedAt: new Date() }).where(eq(scenes.id, scene.id));
      }
    });

    const [audio] = await db.insert(audioRecords).values(buildAudioRecord({ projectId: project.id, storyboardId: storyboard.id, provider: "elevenlabs", model: MODEL, voiceId: VOICE_A, language: "ja", script: GOLD_KHANJAR_NARRATION })).returning();
    audioRecordId = audio.id;
    const generated = await new ElevenLabsNarrationProvider().generateWithTimestamps({ originalScript: GOLD_KHANJAR_NARRATION, text: GOLD_KHANJAR_NARRATION, speed: 1, voiceId: VOICE_A, model: MODEL, language: "ja" });
    const workDir = await mkdtemp(path.join(tmpdir(), "gold-khanjar-narration-"));
    let analysis;
    try {
      const file = path.join(workDir, "narration.mp3");
      await writeFile(file, generated.bytes);
      analysis = await analyzeNarrationAudio(file);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
    const alignedText = generated.alignment?.characters.join("") ?? "";
    const lastCharacterEnd = generated.alignment?.character_end_times_seconds.at(-1) ?? null;
    const structuralReasons = [
      ...(alignedText !== GOLD_KHANJAR_NARRATION ? ["全文Alignment不一致"] : []),
      ...(lastCharacterEnd === null ? ["文末Alignmentなし"] : []),
      ...(lastCharacterEnd !== null && analysis.durationSeconds + 0.1 < lastCharacterEnd ? ["音声末尾Cut"] : []),
      ...analysis.silence.filter((item) => item.duration > 2.5).map((item) => `2.5秒超無音:${item.start.toFixed(2)}-${item.end.toFixed(2)}`),
    ];
    const structuralPass = structuralReasons.length === 0;
    const objectKey = narrationObjectKey(project.id, audio.id);
    await uploadPrivateObject(objectKey, generated.bytes, "audio/mpeg");
    const estimatedCost = (generated.characterCost / 1000) * narrationConfig().pricePerThousandCharacters;
    const audit = generated.audit ? await saveElevenLabsGenerationAudit({ audit: generated.audit, purpose: "narration", projectId: project.id, storyboardId: storyboard.id, audioRecordId: audio.id, videoId: project.id, requestId: generated.requestId, characterCost: generated.characterCost, durationSeconds: analysis.durationSeconds }) : undefined;
    await db.transaction(async (tx) => {
      await tx.update(audioRecords).set({ status: "completed", durationMs: Math.round(analysis.durationSeconds * 1000), objectKey, mimeType: "audio/mpeg", estimatedCost, completedAt: new Date(), updatedAt: new Date() }).where(eq(audioRecords.id, audio.id));
      await tx.insert(apiUsage).values({ projectId: project.id, provider: "elevenlabs", operation: "narration_generation", model: MODEL, units: generated.characterCost, requestId: generated.requestId, durationMs: Date.now() - startedAt, estimatedCost });
      const [run] = await tx.insert(narrationQualityRuns).values({ projectId: project.id, storyboardId: storyboard.id, audioRecordId: audio.id, status: "HUMAN_REVIEW", displayScript: GOLD_KHANJAR_NARRATION, voiceId: VOICE_A, model: MODEL, segmentCount: 1, scoreSummary: { structuralPass, alignedCharacters: generated.alignment?.characters.length ?? 0, expectedCharacters: [...GOLD_KHANJAR_NARRATION].length, lastCharacterEnd, durationSeconds: analysis.durationSeconds, integratedLufs: analysis.integratedLufs, truePeakDbtp: analysis.truePeakDbtp, silence: analysis.silence, humanChecksPending: ["数字・固有名詞の重大な誤読", "日本語イントネーション"] }, assembledObjectKey: objectKey }).returning();
      await tx.insert(narrationQualitySegments).values({ runId: run.id, segmentIndex: 0, displayScript: GOLD_KHANJAR_NARRATION, ttsInputText: GOLD_KHANJAR_NARRATION, expectedReading: GOLD_KHANJAR_NARRATION, readingMap: [], status: "HUMAN_REVIEW", retryCount: 0, reasons: [...structuralReasons, "Human試聴待ち:発音・イントネーション"], scores: {}, confidence: structuralPass ? 1 : 0, normalizedObjectKey: objectKey, durationSeconds: analysis.durationSeconds, units: generated.characterCost });
    });
    return NextResponse.json({ audioRecordId: audio.id, auditId: audit?.id, projectId: project.id, voiceId: VOICE_A, model: MODEL, displayScript: GOLD_KHANJAR_NARRATION, ttsInputText: GOLD_KHANJAR_NARRATION, units: generated.characterCost, estimatedCost, analysis, structuralPass, structuralReasons, previewUrl: "/api/admin/demo/gold-khanjar/narration", reused: false });
  } catch (error) {
    if (audioRecordId) await getDb().update(audioRecords).set({ status: "failed", errorMessage: error instanceof Error ? error.message : "Narration生成失敗", updatedAt: new Date() }).where(eq(audioRecords.id, audioRecordId));
    return apiError(error, "Gold Khanjar本番Narrationを生成できませんでした");
  }
}

async function latestNarration(projectId?: string) {
  const db = getDb();
  const resolvedProjectId = projectId ?? (await db.select({ id: projects.id }).from(projects).where(eq(projects.title, GOLD_KHANJAR_TITLE)).limit(1))[0]?.id;
  if (!resolvedProjectId) return undefined;
  return (await db.select().from(audioRecords).where(and(eq(audioRecords.projectId, resolvedProjectId), eq(audioRecords.provider, "elevenlabs"), eq(audioRecords.model, MODEL), eq(audioRecords.voiceId, VOICE_A), eq(audioRecords.script, GOLD_KHANJAR_NARRATION), eq(audioRecords.status, "completed"), isNotNull(audioRecords.objectKey))).orderBy(desc(audioRecords.createdAt)).limit(1))[0];
}

async function narrationResponse(audio: NonNullable<Awaited<ReturnType<typeof latestNarration>>>) {
  return { audioRecordId: audio.id, projectId: audio.projectId, voiceId: audio.voiceId, model: audio.model, displayScript: audio.script, ttsInputText: audio.script, units: audio.characterCount, estimatedCost: audio.estimatedCost, durationSeconds: audio.durationMs ? audio.durationMs / 1000 : null, previewUrl: "/api/admin/demo/gold-khanjar/narration" };
}
