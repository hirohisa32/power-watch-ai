import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
import { chooseApprovedBgm } from "@/lib/bgm/repository";
import { getDb } from "@/lib/db";
import { apiUsage, audioRecords, finalRenders, projects, storyboards } from "@/lib/db/schema";
import {
  GOLD_KHANJAR_QUARTER_DURATION,
  GOLD_KHANJAR_QUARTER_MODEL,
  GOLD_KHANJAR_QUARTER_PREFIX,
  GOLD_KHANJAR_QUARTER_SCENES,
  GOLD_KHANJAR_QUARTER_SCRIPT,
  GOLD_KHANJAR_QUARTER_VOICE,
  type GoldKhanjarQuarterSceneId,
} from "@/lib/demo/gold-khanjar-quarter-test";
import { GOLD_KHANJAR_TITLE } from "@/lib/demo/gold-khanjar";
import { createAssSubtitles } from "@/lib/render/ass";
import { renderWithFfmpeg } from "@/lib/render/ffmpeg";
import type { FinalRenderInput, RenderScene } from "@/lib/render/types";
import { assertSameOrigin } from "@/lib/security";
import { createReadUrl, privateObjectExists, readPrivateObject, uploadPrivateObject } from "@/lib/storage";
import { isAdminEmail } from "@/lib/ui/presentation";
import { renderProductPhotoMotion } from "@/lib/video/product-photo";
import { RunwayVideoProvider } from "@/lib/video/runway";

export const maxDuration = 300;
type TaskRecord = { taskId: string; status: "submitted" | "completed" | "failed"; estimatedCredits: number; actualCredits?: number; usageRecorded?: boolean; submittedAt: string; completedAt?: string; failure?: string };

export async function GET(request: Request) {
  const denied = await requireAdmin(); if (denied) return denied;
  const url = new URL(request.url);
  const asset = url.searchParams.get("asset");
  if (asset === "narration" && await privateObjectExists(`${GOLD_KHANJAR_QUARTER_PREFIX}/narration.mp3`)) return NextResponse.redirect(await createReadUrl(`${GOLD_KHANJAR_QUARTER_PREFIX}/narration.mp3`, 3600, "inline"));
  const scene = sceneId(url.searchParams.get("scene"));
  if (scene && await privateObjectExists(sceneKeys(scene).video)) return NextResponse.redirect(await createReadUrl(sceneKeys(scene).video, 3600, "inline"));
  const render = await existingRender();
  const scenes = await Promise.all(Object.keys(GOLD_KHANJAR_QUARTER_SCENES).map(async (id) => ({ id, ...(await readTask(id as GoldKhanjarQuarterSceneId)) })));
  return NextResponse.json({ scenes, narrationReady: await privateObjectExists(`${GOLD_KHANJAR_QUARTER_PREFIX}/narration.mp3`), render: render ? renderResult(render.id, true) : null });
}

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    const denied = await requireAdmin(); if (denied) return denied;
    const body = await request.json() as { action?: string };
    if (body.action === "start") return start(request);
    if (body.action === "poll") return poll();
    if (body.action === "render") return renderTest();
    return NextResponse.json({ error: "操作が不正です" }, { status: 400 });
  } catch (error) {
    console.error("Gold Khanjar quarter test failed", error);
    return NextResponse.json({ error: "1/4本番品質テストを処理できませんでした", detail: error instanceof Error ? error.message : "unknown" }, { status: 500 });
  }
}

async function start(request: Request) {
  if (!process.env.RUNWAY_API_KEY) return NextResponse.json({ error: "Production RUNWAY_API_KEYが設定されていません" }, { status: 409 });
  if (!process.env.ELEVENLABS_API_KEY) return NextResponse.json({ error: "Production ELEVENLABS_API_KEYが設定されていません" }, { status: 409 });
  const context = await productionContext();
  await ensureNarration(context.project.id, context.storyboard.id);
  const provider = new RunwayVideoProvider();
  for (const [id, scene] of Object.entries(GOLD_KHANJAR_QUARTER_SCENES) as Array<[GoldKhanjarQuarterSceneId, (typeof GOLD_KHANJAR_QUARTER_SCENES)[GoldKhanjarQuarterSceneId]]>) {
    const keys = sceneKeys(id);
    if (await privateObjectExists(keys.video) || await readTask(id)) continue;
    const referenceImageUrl = new URL(`/client-final/gold-khanjar-v2/keyframes/${scene.image}`, request.url).toString();
    const generation = await provider.generate({ model: "gen4.5", prompt: scene.prompt, duration: 5, ratio: "720:1280", referenceImageUrl });
    const estimatedCredits = generation.estimatedCostCredits ?? 60;
    if (estimatedCredits > 60) { await provider.cancel?.(generation.taskId); throw new Error(`${id}の推定${estimatedCredits} creditsが上限60を超えました`); }
    await writeTask(id, { taskId: generation.taskId, status: "submitted", estimatedCredits, submittedAt: new Date().toISOString() });
  }
  return NextResponse.json({ status: "submitted", narrationReady: true });
}

async function poll() {
  const context = await productionContext();
  const provider = new RunwayVideoProvider();
  const results = [];
  for (const id of Object.keys(GOLD_KHANJAR_QUARTER_SCENES) as GoldKhanjarQuarterSceneId[]) {
    const keys = sceneKeys(id); let record = await readTask(id);
    if (!record) { results.push({ id, status: "missing" }); continue; }
    if (record.status === "submitted") {
      const status = await provider.getStatus(record.taskId);
      if (status.status === "succeeded") {
        const output = await fetch(status.outputUrl); if (!output.ok) throw new Error(`${id} Runway出力取得失敗:${output.status}`);
        await uploadPrivateObject(keys.video, new Uint8Array(await output.arrayBuffer()), "video/mp4");
        record = { ...record, status: "completed", actualCredits: status.actualCostCredits ?? record.estimatedCredits, completedAt: new Date().toISOString() };
      } else if (status.status === "failed" || status.status === "canceled") record = { ...record, status: "failed", actualCredits: status.actualCostCredits, completedAt: new Date().toISOString(), failure: status.message };
      if (record.status !== "submitted" && !record.usageRecorded) {
        await getDb().insert(apiUsage).values({ projectId: context.project.id, provider: "runway", operation: "quarter_test_scene_generation", model: "gen4.5", units: Math.round(record.actualCredits ?? record.estimatedCredits), requestId: record.taskId, durationMs: Date.now() - new Date(record.submittedAt).getTime(), estimatedCost: (record.actualCredits ?? record.estimatedCredits) * 0.01 });
        record.usageRecorded = true;
      }
      await writeTask(id, record);
    }
    results.push({ id, ...record, previewUrl: record.status === "completed" ? `/api/admin/demo/gold-khanjar/quarter-test?scene=${id}` : null });
  }
  return NextResponse.json({ scenes: results, allCompleted: results.every((item) => item.status === "completed") });
}

async function renderTest() {
  const existing = await existingRender(); if (existing) return NextResponse.json(renderResult(existing.id, true));
  for (const id of Object.keys(GOLD_KHANJAR_QUARTER_SCENES) as GoldKhanjarQuarterSceneId[]) if (!(await privateObjectExists(sceneKeys(id).video))) return NextResponse.json({ error: `${id}が未完成です` }, { status: 409 });
  const context = await productionContext();
  const narration = await latestNarration(context.project.id); if (!narration?.objectKey) return NextResponse.json({ error: "短尺Narrationが未完成です" }, { status: 409 });
  if (!narration.durationMs || narration.durationMs > GOLD_KHANJAR_QUARTER_DURATION * 1000) return NextResponse.json({ error: `Narration実尺${narration.durationMs ? (narration.durationMs / 1000).toFixed(2) : "不明"}秒のため、末尾を切らず12〜15秒へ収めるには台本調整が必要です` }, { status: 409 });
  const bgm = await chooseApprovedBgm({ script: GOLD_KHANJAR_QUARTER_SCRIPT, style: "animation", targetDuration: GOLD_KHANJAR_QUARTER_DURATION, storyProfile: "1970年代オマーン、英国、アスプレイ、高級時計の歴史ドキュメンタリー" });
  const [latest] = await getDb().select({ version: finalRenders.version }).from(finalRenders).where(eq(finalRenders.projectId, context.project.id)).orderBy(desc(finalRenders.version)).limit(1);
  const [render] = await getDb().insert(finalRenders).values({ projectId: context.project.id, storyboardId: context.storyboard.id, audioRecordId: narration.id, version: (latest?.version ?? 0) + 1, status: "rendering", width: 1080, height: 1920, fps: 30, durationMs: Math.round(GOLD_KHANJAR_QUARTER_DURATION * 1000), bgmKey: bgm.key, estimatedCost: 0, renderInput: { purpose: "gold-khanjar-quarter-production-test", opening: null, ending: null, voiceId: GOLD_KHANJAR_QUARTER_VOICE, model: GOLD_KHANJAR_QUARTER_MODEL, originalWatchPhoto: "MG_1220.jpg", watchTransformation: "non-generative-product-photo-motion", bgmSelectionReasons: bgm.reasons } }).returning();
  const work = await mkdtemp(path.join(tmpdir(), "gold-khanjar-quarter-"));
  try {
    const videos: string[] = [];
    for (const [index, id] of (Object.keys(GOLD_KHANJAR_QUARTER_SCENES) as GoldKhanjarQuarterSceneId[]).entries()) { const file = path.join(work, `scene-${index}.mp4`); await writeFile(file, await readPrivateObject(sceneKeys(id).video)); videos.push(file); }
    const photoSource = path.join(process.cwd(), "public", "production-tests", "gold-khanjar", "MG_1220.jpg");
    const photoVideo = path.join(work, "original-watch-reveal.mp4"); await renderProductPhotoMotion(photoSource, photoVideo, 3.6); videos.push(photoVideo);
    const narrationFile = path.join(work, "narration.mp3"); await writeFile(narrationFile, await readPrivateObject(narration.objectKey));
    const bgmFile = path.join(work, `bgm${path.extname(bgm.filePath) || ".mp3"}`); await writeFile(bgmFile, await readPrivateObject(bgm.filePath));
    const sceneRows: RenderScene[] = [
      row("a", 1, "VintageRoom", "1970年代のオマーン", "1970年代、オマーン", sceneKeys("01-oman-entry").video),
      row("b", 2, "HistoricalCharacter", "新しい時代の始まり", "新しい時代を迎えていました", sceneKeys("02-char-01-letter").video),
      row("c", 3, "HistoricalCharacter", "英国の名門へ", "英国の名門アスプレイ", sceneKeys("03-uk-asprey").video),
      row("d", 4, "WatchReveal", "本物のGold Khanjar", "特別な時計", "original-photo:MG_1220.jpg"),
    ];
    const input: FinalRenderInput = { width: 1080, height: 1920, fps: 30, language: "ja", bgmKey: bgm.key, totalDuration: GOLD_KHANJAR_QUARTER_DURATION, missingSceneCount: 0, scenes: sceneRows, subtitles: [
      { sceneId: "a", startMs: 450, endMs: 3200, text: "1970年代、オマーン" },
      { sceneId: "b", startMs: 4050, endMs: 6600, text: "新しい時代の始まり" },
      { sceneId: "c", startMs: 7900, endMs: 10600, text: "英国の名門、アスプレイ" },
      { sceneId: "d", startMs: 11300, endMs: 14000, text: "特別な時計へ" },
    ], overlays: [], voiceAssignments: [], openingAsset: null, endingAsset: null };
    const subtitleFile = path.join(work, "subtitles.ass"); await writeFile(subtitleFile, createAssSubtitles(input), "utf8");
    const output = path.join(work, "quarter-test.mp4"); await renderWithFfmpeg(input, { videos, narration: narrationFile, bgm: bgmFile, subtitles: subtitleFile, output });
    const objectKey = `projects/${context.project.id}/renders/${render.id}.mp4`; await uploadPrivateObject(objectKey, new Uint8Array(await readFile(output)), "video/mp4");
    await getDb().transaction(async (tx) => { await tx.update(finalRenders).set({ status: "completed", outputObjectKey: objectKey, completedAt: new Date(), updatedAt: new Date() }).where(eq(finalRenders.id, render.id)); await tx.insert(apiUsage).values({ projectId: context.project.id, provider: "internal-render", operation: "quarter_test_final_render", model: "ffmpeg-h264-aac-v1", durationMs: 0, estimatedCost: 0 }); });
    return NextResponse.json(renderResult(render.id, false));
  } catch (error) { await getDb().update(finalRenders).set({ status: "failed", errorCode: "QUARTER_TEST_RENDER_FAILED", errorMessage: error instanceof Error ? error.message : "unknown", updatedAt: new Date() }).where(eq(finalRenders.id, render.id)); throw error; }
  finally { await rm(work, { recursive: true, force: true }); }
}

async function ensureNarration(projectId: string, storyboardId: string) {
  if (await privateObjectExists(`${GOLD_KHANJAR_QUARTER_PREFIX}/narration.mp3`)) return;
  const existing = await latestNarration(projectId); if (existing?.objectKey) return;
  const [audio] = await getDb().insert(audioRecords).values(buildAudioRecord({ projectId, storyboardId, provider: "elevenlabs", model: GOLD_KHANJAR_QUARTER_MODEL, voiceId: GOLD_KHANJAR_QUARTER_VOICE, language: "ja", script: GOLD_KHANJAR_QUARTER_SCRIPT })).returning();
  const started = Date.now(); const generated = await new ElevenLabsNarrationProvider().generateWithTimestamps({ originalScript: GOLD_KHANJAR_QUARTER_SCRIPT, text: GOLD_KHANJAR_QUARTER_SCRIPT, speed: 1, voiceId: GOLD_KHANJAR_QUARTER_VOICE, model: GOLD_KHANJAR_QUARTER_MODEL, language: "ja" });
  const temp = await mkdtemp(path.join(tmpdir(), "quarter-narration-")); let analysis;
  try { const file = path.join(temp, "narration.mp3"); await writeFile(file, generated.bytes); analysis = await analyzeNarrationAudio(file); } finally { await rm(temp, { recursive: true, force: true }); }
  const key = `${GOLD_KHANJAR_QUARTER_PREFIX}/narration.mp3`; await uploadPrivateObject(key, generated.bytes, "audio/mpeg");
  const cost = generated.characterCost / 1000 * narrationConfig().pricePerThousandCharacters;
  if (generated.audit) await saveElevenLabsGenerationAudit({ audit: generated.audit, purpose: "narration", projectId, storyboardId, audioRecordId: audio.id, videoId: projectId, requestId: generated.requestId, characterCost: generated.characterCost, durationSeconds: analysis.durationSeconds });
  await getDb().transaction(async (tx) => { await tx.update(audioRecords).set({ status: "completed", durationMs: Math.round(analysis.durationSeconds * 1000), objectKey: key, mimeType: "audio/mpeg", estimatedCost: cost, completedAt: new Date(), updatedAt: new Date() }).where(eq(audioRecords.id, audio.id)); await tx.insert(apiUsage).values({ projectId, provider: "elevenlabs", operation: "quarter_test_narration", model: GOLD_KHANJAR_QUARTER_MODEL, units: generated.characterCost, requestId: generated.requestId, durationMs: Date.now() - started, estimatedCost: cost }); });
}

async function latestNarration(projectId: string) { return (await getDb().select().from(audioRecords).where(and(eq(audioRecords.projectId, projectId), eq(audioRecords.model, GOLD_KHANJAR_QUARTER_MODEL), eq(audioRecords.voiceId, GOLD_KHANJAR_QUARTER_VOICE), eq(audioRecords.script, GOLD_KHANJAR_QUARTER_SCRIPT), eq(audioRecords.status, "completed"), isNotNull(audioRecords.objectKey))).orderBy(desc(audioRecords.createdAt)).limit(1))[0]; }
async function productionContext() { const [project] = await getDb().select().from(projects).where(eq(projects.title, GOLD_KHANJAR_TITLE)).limit(1); if (!project) throw new Error("Gold Khanjarプロジェクトが見つかりません"); const [storyboard] = await getDb().select().from(storyboards).where(and(eq(storyboards.projectId, project.id), eq(storyboards.isActive, true))).limit(1); if (!storyboard) throw new Error("Active Storyboardが見つかりません"); return { project, storyboard }; }
async function requireAdmin() { const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 }); if (!isAdminEmail(user.email)) return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 }); return null; }
function sceneId(value: unknown): GoldKhanjarQuarterSceneId | null { return typeof value === "string" && value in GOLD_KHANJAR_QUARTER_SCENES ? value as GoldKhanjarQuarterSceneId : null; }
function sceneKeys(id: GoldKhanjarQuarterSceneId) { return { video: `${GOLD_KHANJAR_QUARTER_PREFIX}/scenes/${id}.mp4`, task: `${GOLD_KHANJAR_QUARTER_PREFIX}/scenes/${id}.json` }; }
async function readTask(id: GoldKhanjarQuarterSceneId) { const key = sceneKeys(id).task; if (!(await privateObjectExists(key))) return null; return JSON.parse(new TextDecoder().decode(await readPrivateObject(key))) as TaskRecord; }
async function writeTask(id: GoldKhanjarQuarterSceneId, record: TaskRecord) { await uploadPrivateObject(sceneKeys(id).task, new TextEncoder().encode(JSON.stringify(record)), "application/json"); }
async function existingRender() { const context = await productionContext(); return (await getDb().select().from(finalRenders).where(and(eq(finalRenders.projectId, context.project.id), eq(finalRenders.status, "completed"))).orderBy(desc(finalRenders.createdAt)).limit(30)).find((item) => (item.renderInput as { purpose?: string }).purpose === "gold-khanjar-quarter-production-test"); }
function renderResult(id: string, reused: boolean) { return { renderId: id, status: "completed", reused, previewUrl: `/api/renders/${id}/video`, downloadUrl: `/api/renders/${id}/download` }; }
function row(id: string, order: number, preset: string, narration: string, subtitle: string, objectKey: string): RenderScene { return { sceneId: id, generationId: id, order, preset, transition: order === 3 ? "light transition" : "dissolve", duration: 3.6, narration, subtitle, year: null, location: null, objectKey }; }
