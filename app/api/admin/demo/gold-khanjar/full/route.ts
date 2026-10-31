import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
import { apiUsage, audioRecords, bgmAssets, finalRenders, projects, storyboards, systemVideoAssets } from "@/lib/db/schema";
import {
  GOLD_KHANJAR_APPROVED_BGM_KEY,
  GOLD_KHANJAR_FULL_BODY_DURATION,
  GOLD_KHANJAR_FULL_MODEL,
  GOLD_KHANJAR_FULL_PREFIX,
  GOLD_KHANJAR_FULL_SCRIPT,
  GOLD_KHANJAR_FULL_TITLE,
  GOLD_KHANJAR_FULL_VOICE,
  GOLD_KHANJAR_PRODUCT_SCENES,
  GOLD_KHANJAR_REFINED_STORY_SCENES,
  GOLD_KHANJAR_STORY_SCENES,
  type GoldKhanjarStorySceneId,
} from "@/lib/demo/gold-khanjar-full";
import { createAssSubtitles } from "@/lib/render/ass";
import { assemblePreparedRender, mixBgmIntoEndingSegment, normalizeSystemMedia, renderWithFfmpeg } from "@/lib/render/ffmpeg";
import type { FinalRenderInput, RenderScene, RenderSystemAsset } from "@/lib/render/types";
import { assertSameOrigin } from "@/lib/security";
import { createReadUrl, privateObjectExists, readPrivateObject, uploadPrivateObject } from "@/lib/storage";
import { isAdminEmail } from "@/lib/ui/presentation";
import { renderProductPhotoMotion } from "@/lib/video/product-photo";
import { RunwayVideoProvider } from "@/lib/video/runway";

export const maxDuration = 300;
type TaskRecord = { taskId: string; status: "submitted" | "completed" | "failed"; estimatedCredits: number; actualCredits?: number; usageRecorded?: boolean; submittedAt: string; completedAt?: string; failure?: string };

export async function GET(request: Request) {
  const denied = await requireAdmin(); if (denied) return denied;
  await cleanupStaleRenders();
  const url = new URL(request.url);
  const scene = sceneId(url.searchParams.get("scene"));
  if (scene && await privateObjectExists(sceneKey(scene))) return NextResponse.redirect(await createReadUrl(sceneKey(scene), 3600, "inline"));
  if (url.searchParams.get("asset") === "narration" && await privateObjectExists(narrationKey())) return NextResponse.redirect(await createReadUrl(narrationKey(), 3600, "inline"));
  const render = await existingRender();
  const systemReady = await systemMediaReady();
  return NextResponse.json({ scenes: await sceneResults(), narrationReady: await privateObjectExists(narrationKey()), productsReady: await productMotionsReady(), storyBodyReady: await privateObjectExists(bodySegmentKey("story")), productBodyReady: await privateObjectExists(bodySegmentKey("product")), ...systemReady, render: render ? renderResult(render.id, true) : null });
}

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    const denied = await requireAdmin(); if (denied) return denied;
    const body = await request.json() as { action?: string };
    if (body.action === "start") return start(request);
    if (body.action === "poll") return poll();
    if (body.action === "prepare-products") return prepareProductMotions();
    if (body.action === "prepare-story-body") return prepareBodySegment("story");
    if (body.action === "prepare-product-body") return prepareBodySegment("product");
    if (body.action === "prepare-opening") return prepareSystemAsset("opening");
    if (body.action === "prepare-ending") return prepareSystemAsset("ending");
    if (body.action === "render") return renderFull();
    return NextResponse.json({ error: "操作が不正です" }, { status: 400 });
  } catch (error) {
    console.error("Gold Khanjar full production failed", error);
    return NextResponse.json({ error: "Gold Khanjar全編を処理できませんでした", detail: error instanceof Error ? error.message : "unknown" }, { status: 500 });
  }
}

async function start(request: Request) {
  if (!process.env.RUNWAY_API_KEY) return NextResponse.json({ error: "Production RUNWAY_API_KEYが設定されていません" }, { status: 409 });
  if (!process.env.ELEVENLABS_API_KEY) return NextResponse.json({ error: "Production ELEVENLABS_API_KEYが設定されていません" }, { status: 409 });
  const context = await productionContext();
  await ensureNarration(context.project.id, context.storyboard.id);
  const provider = new RunwayVideoProvider();
  for (const [id, scene] of Object.entries(GOLD_KHANJAR_STORY_SCENES) as Array<[GoldKhanjarStorySceneId, (typeof GOLD_KHANJAR_STORY_SCENES)[GoldKhanjarStorySceneId]]>) {
    if (scene.source === "approved-quarter") continue;
    if (await privateObjectExists(sceneKey(id)) || await readTask(id)) continue;
    const referenceImageUrl = new URL(`/client-final/gold-khanjar-v2/keyframes/${scene.image}`, request.url).toString();
    const generation = await provider.generate({ model: "gen4.5", prompt: scene.prompt, duration: 5, ratio: "720:1280", referenceImageUrl });
    const estimatedCredits = generation.estimatedCostCredits ?? 60;
    if (estimatedCredits > 60) { await provider.cancel?.(generation.taskId); throw new Error(`${id}の推定creditsが上限を超えました`); }
    await writeTask(id, { taskId: generation.taskId, status: "submitted", estimatedCredits, submittedAt: new Date().toISOString() });
  }
  return NextResponse.json({ status: "submitted", narrationReady: true, scenes: await sceneResults() });
}

async function poll() {
  const context = await productionContext();
  const provider = new RunwayVideoProvider();
  for (const id of Object.keys(GOLD_KHANJAR_STORY_SCENES) as GoldKhanjarStorySceneId[]) {
    const scene = GOLD_KHANJAR_STORY_SCENES[id];
    if (scene.source === "approved-quarter") continue;
    let record = await readTask(id); if (!record || record.status !== "submitted") continue;
    const status = await provider.getStatus(record.taskId);
    if (status.status === "succeeded") {
      const output = await fetch(status.outputUrl); if (!output.ok) throw new Error(`${id} Runway出力取得失敗:${output.status}`);
      await uploadPrivateObject(sceneKey(id), new Uint8Array(await output.arrayBuffer()), "video/mp4");
      record = { ...record, status: "completed", actualCredits: status.actualCostCredits ?? record.estimatedCredits, completedAt: new Date().toISOString() };
    } else if (status.status === "failed" || status.status === "canceled") record = { ...record, status: "failed", actualCredits: status.actualCostCredits, completedAt: new Date().toISOString(), failure: status.message };
    if (record.status !== "submitted" && !record.usageRecorded) {
      await getDb().insert(apiUsage).values({ projectId: context.project.id, provider: "runway", operation: "gold_khanjar_full_scene", model: "gen4.5", units: Math.round(record.actualCredits ?? record.estimatedCredits), requestId: record.taskId, durationMs: Date.now() - new Date(record.submittedAt).getTime(), estimatedCost: (record.actualCredits ?? record.estimatedCredits) * 0.01 });
      record.usageRecorded = true;
    }
    await writeTask(id, record);
  }
  const scenes = await sceneResults();
  return NextResponse.json({ scenes, allCompleted: scenes.every((item) => item.status === "completed"), productsReady: await productMotionsReady(), storyBodyReady: await privateObjectExists(bodySegmentKey("story")), productBodyReady: await privateObjectExists(bodySegmentKey("product")), ...(await systemMediaReady()) });
}

async function prepareProductMotions() {
  const work = await mkdtemp(path.join(tmpdir(), "gold-khanjar-products-"));
  try {
    for (const [index, product] of GOLD_KHANJAR_PRODUCT_SCENES.entries()) {
      const objectKey = productMotionKey(product.id);
      if (await privateObjectExists(objectKey)) continue;
      const output = path.join(work, `product-${index}.mp4`);
      await renderProductPhotoMotion(path.join(process.cwd(), "public", "production-tests", "gold-khanjar", product.file), output, 5, "veryfast");
      await uploadPrivateObject(objectKey, new Uint8Array(await readFile(output)), "video/mp4");
    }
    return NextResponse.json({ productsReady: true });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function prepareBodySegment(kind: "story" | "product") {
  const objectKey = bodySegmentKey(kind);
  if (await privateObjectExists(objectKey)) return NextResponse.json(kind === "story" ? { storyBodyReady: true } : { productBodyReady: true });
  const context = await productionContext();
  const narration = await latestNarration(context.project.id); if (!narration?.objectKey) return NextResponse.json({ error: "全編Narrationが未完成です" }, { status: 409 });
  const bgm = await approvedBgm();
  const allRows = renderRows();
  const isStory = kind === "story";
  const rows = isStory ? allRows.slice(0, GOLD_KHANJAR_REFINED_STORY_SCENES.length) : allRows.slice(GOLD_KHANJAR_REFINED_STORY_SCENES.length);
  const offsetSeconds = isStory ? 0 : GOLD_KHANJAR_REFINED_STORY_SCENES.length * 5;
  const segmentDuration = rows.reduce((sum, item) => sum + item.duration, 0);
  const work = await mkdtemp(path.join(tmpdir(), `gold-khanjar-${kind}-body-`));
  try {
    const videos: string[] = [];
    if (isStory) {
      for (const [index, id] of GOLD_KHANJAR_REFINED_STORY_SCENES.entries()) { const file = path.join(work, `story-${index}.mp4`); await writeFile(file, await readPrivateObject(sceneKey(id))); videos.push(file); }
    } else {
      for (const [index, product] of GOLD_KHANJAR_PRODUCT_SCENES.entries()) { const file = path.join(work, `product-${index}.mp4`); await writeFile(file, await readPrivateObject(productMotionKey(product.id))); videos.push(file); }
    }
    const narrationFile = path.join(work, "narration.mp3"); await writeFile(narrationFile, await readPrivateObject(narration.objectKey));
    const bgmFile = path.join(work, `bgm${path.extname(bgm.filePath) || ".mp3"}`); await writeFile(bgmFile, await readPrivateObject(bgm.filePath));
    const offsetMs = offsetSeconds * 1000;
    const endMs = offsetMs + segmentDuration * 1000;
    const segmentInput: FinalRenderInput = {
      width: 1080, height: 1920, fps: 30, language: "ja", bgmKey: bgm.key, totalDuration: segmentDuration, missingSceneCount: 0, scenes: rows,
      subtitles: subtitles().filter((cue) => cue.startMs >= offsetMs && cue.startMs < endMs).map((cue) => ({ ...cue, startMs: cue.startMs - offsetMs, endMs: Math.min(endMs, cue.endMs) - offsetMs })),
      overlays: overlays().filter((item) => item.startMs >= offsetMs && item.startMs < endMs).map((item) => ({ ...item, startMs: item.startMs - offsetMs, endMs: Math.min(endMs, item.endMs) - offsetMs })),
      voiceAssignments: [], openingAsset: null, endingAsset: null,
    };
    const subtitleFile = path.join(work, "subtitles.ass"); await writeFile(subtitleFile, createAssSubtitles(segmentInput), "utf8");
    const output = path.join(work, `${kind}-body.mp4`);
    await renderWithFfmpeg(segmentInput, { videos, narration: narrationFile, bgm: bgmFile, subtitles: subtitleFile, output }, undefined, "veryfast", false, offsetSeconds);
    await uploadPrivateObject(objectKey, new Uint8Array(await readFile(output)), "video/mp4");
    return NextResponse.json(isStory ? { storyBodyReady: true } : { productBodyReady: true });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function prepareSystemAsset(kind: "opening" | "ending") {
  const context = await productionContext();
  const asset = await selectedSystemAsset(kind === "opening" ? context.project.openingAssetId : context.project.endingAssetId, kind);
  if (!asset) return NextResponse.json(kind === "opening" ? { openingReady: true } : { endingReady: true });
  const objectKey = systemMediaKey(kind, asset.id);
  if (await privateObjectExists(objectKey)) return NextResponse.json(kind === "opening" ? { openingReady: true } : { endingReady: true });
  const work = await mkdtemp(path.join(tmpdir(), `gold-khanjar-${kind}-`));
  try {
    const compatible = path.join(work, `${kind}-compatible.mp4`);
    const output = path.join(work, `${kind}-final.mp4`);
    const reusableKey = legacySystemMediaKey(kind, asset.id);
    if (kind === "ending" && await privateObjectExists(reusableKey)) {
      await writeFile(compatible, await readPrivateObject(reusableKey));
    } else {
      const source = path.join(work, `${kind}-source.mp4`); await writeFile(source, await readPrivateObject(asset.storagePath));
      await normalizeSystemMedia({ source, output: compatible, fps: 30, duration: asset.duration, hasAudio: asset.hasAudio, preset: "veryfast" });
    }
    if (kind === "ending") {
      const bgm = await approvedBgm();
      const bgmFile = path.join(work, `bgm${path.extname(bgm.filePath) || ".mp3"}`); await writeFile(bgmFile, await readPrivateObject(bgm.filePath));
      await mixBgmIntoEndingSegment({ video: compatible, bgm: bgmFile, output, bgmOffset: GOLD_KHANJAR_FULL_BODY_DURATION, duration: asset.duration });
    } else await copyFile(compatible, output);
    await uploadPrivateObject(objectKey, new Uint8Array(await readFile(output)), "video/mp4");
    return NextResponse.json(kind === "opening" ? { openingReady: true } : { endingReady: true });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function renderFull() {
  const existing = await existingRender(); if (existing) return NextResponse.json(renderResult(existing.id, true));
  if (!(await productMotionsReady())) return NextResponse.json({ error: "Product Motionの事前準備が未完了です" }, { status: 409 });
  if (!(await privateObjectExists(bodySegmentKey("story"))) || !(await privateObjectExists(bodySegmentKey("product")))) return NextResponse.json({ error: "本編分割Renderの事前準備が未完了です" }, { status: 409 });
  for (const id of Object.keys(GOLD_KHANJAR_STORY_SCENES) as GoldKhanjarStorySceneId[]) if (!(await privateObjectExists(sceneKey(id)))) return NextResponse.json({ error: `${id}が未完成です` }, { status: 409 });
  const context = await productionContext();
  const narration = await latestNarration(context.project.id); if (!narration?.objectKey || !narration.durationMs) return NextResponse.json({ error: "全編Narrationが未完成です" }, { status: 409 });
  if (narration.durationMs > GOLD_KHANJAR_FULL_BODY_DURATION * 1000) return NextResponse.json({ error: `Narration実尺${(narration.durationMs / 1000).toFixed(2)}秒が本編尺を超えています` }, { status: 409 });
  const bgm = await approvedBgm();
  const openingAsset = await selectedSystemAsset(context.project.openingAssetId, "opening");
  const endingAsset = await selectedSystemAsset(context.project.endingAssetId, "ending");
  if (openingAsset && !(await privateObjectExists(systemMediaKey("opening", openingAsset.id)))) return NextResponse.json({ error: "Opening互換素材の準備が未完了です" }, { status: 409 });
  if (endingAsset && !(await privateObjectExists(systemMediaKey("ending", endingAsset.id)))) return NextResponse.json({ error: "Ending互換素材の準備が未完了です" }, { status: 409 });
  const [latest] = await getDb().select({ version: finalRenders.version }).from(finalRenders).where(eq(finalRenders.projectId, context.project.id)).orderBy(desc(finalRenders.version)).limit(1);
  const totalDuration = GOLD_KHANJAR_FULL_BODY_DURATION + (openingAsset?.duration ?? 0) + (endingAsset?.duration ?? 0);
  const [render] = await getDb().insert(finalRenders).values({ projectId: context.project.id, storyboardId: context.storyboard.id, audioRecordId: narration.id, version: (latest?.version ?? 0) + 1, status: "rendering", width: 1080, height: 1920, fps: 30, durationMs: Math.round(totalDuration * 1000), bgmKey: bgm.key, estimatedCost: 0, renderInput: { purpose: "gold-khanjar-refined-final-v8", openingAsset, endingAsset, voiceId: GOLD_KHANJAR_FULL_VOICE, model: GOLD_KHANJAR_FULL_MODEL, approvedQuarterReused: true, originalProductPhotosOnly: true, sceneCount: 9, endingBgmContinuation: true, productMotionCache: true, bodySegmentCache: true, systemMediaCache: true, endingSegmentMix: true } }).returning();
  const work = await mkdtemp(path.join(tmpdir(), "gold-khanjar-full-"));
  try {
    const storyBody = path.join(work, "story-body.mp4"); await writeFile(storyBody, await readPrivateObject(bodySegmentKey("story")));
    const productBody = path.join(work, "product-body.mp4"); await writeFile(productBody, await readPrivateObject(bodySegmentKey("product")));
    const openingFile = openingAsset ? path.join(work, "opening.mp4") : undefined; if (openingAsset && openingFile) await writeFile(openingFile, await readPrivateObject(systemMediaKey("opening", openingAsset.id)));
    const endingFile = endingAsset ? path.join(work, "ending.mp4") : undefined; if (endingAsset && endingFile) await writeFile(endingFile, await readPrivateObject(systemMediaKey("ending", endingAsset.id)));
    const output = path.join(work, "gold-khanjar-refined-final.mp4");
    await assemblePreparedRender({ bodySegments: [openingFile, storyBody, productBody, endingFile].filter((file): file is string => Boolean(file)), fps: 30, output });
    const objectKey = `projects/${context.project.id}/renders/${render.id}.mp4`; await uploadPrivateObject(objectKey, new Uint8Array(await readFile(output)), "video/mp4");
    await getDb().transaction(async (tx) => { await tx.update(finalRenders).set({ status: "completed", outputObjectKey: objectKey, completedAt: new Date(), updatedAt: new Date() }).where(eq(finalRenders.id, render.id)); await tx.insert(apiUsage).values({ projectId: context.project.id, provider: "internal-render", operation: "gold_khanjar_full_render", model: "ffmpeg-h264-aac-v1", durationMs: 0, estimatedCost: 0 }); });
    return NextResponse.json({ ...renderResult(render.id, false), duration: totalDuration, opening: openingAsset?.key ?? null, ending: endingAsset?.key ?? null });
  } catch (error) {
    await getDb().update(finalRenders).set({ status: "failed", errorCode: "GOLD_KHANJAR_FULL_RENDER_FAILED", errorMessage: error instanceof Error ? error.message : "unknown", updatedAt: new Date() }).where(eq(finalRenders.id, render.id)); throw error;
  } finally { await rm(work, { recursive: true, force: true }); }
}

async function ensureNarration(projectId: string, storyboardId: string) {
  if (await privateObjectExists(narrationKey())) return;
  const existing = await latestNarration(projectId); if (existing?.objectKey) return;
  const [audio] = await getDb().insert(audioRecords).values(buildAudioRecord({ projectId, storyboardId, provider: "elevenlabs", model: GOLD_KHANJAR_FULL_MODEL, voiceId: GOLD_KHANJAR_FULL_VOICE, language: "ja", script: GOLD_KHANJAR_FULL_SCRIPT })).returning();
  const started = Date.now(); const generated = await new ElevenLabsNarrationProvider().generateWithTimestamps({ originalScript: GOLD_KHANJAR_FULL_SCRIPT, text: GOLD_KHANJAR_FULL_SCRIPT, speed: 1, voiceId: GOLD_KHANJAR_FULL_VOICE, model: GOLD_KHANJAR_FULL_MODEL, language: "ja" });
  const temp = await mkdtemp(path.join(tmpdir(), "gold-full-narration-")); let analysis;
  try { const file = path.join(temp, "narration.mp3"); await writeFile(file, generated.bytes); analysis = await analyzeNarrationAudio(file); } finally { await rm(temp, { recursive: true, force: true }); }
  const key = narrationKey(); await uploadPrivateObject(key, generated.bytes, "audio/mpeg");
  const cost = generated.characterCost / 1000 * narrationConfig().pricePerThousandCharacters;
  if (generated.audit) await saveElevenLabsGenerationAudit({ audit: generated.audit, purpose: "narration", projectId, storyboardId, audioRecordId: audio.id, videoId: projectId, requestId: generated.requestId, characterCost: generated.characterCost, durationSeconds: analysis.durationSeconds });
  await getDb().transaction(async (tx) => { await tx.update(audioRecords).set({ status: "completed", durationMs: Math.round(analysis.durationSeconds * 1000), objectKey: key, mimeType: "audio/mpeg", estimatedCost: cost, completedAt: new Date(), updatedAt: new Date() }).where(eq(audioRecords.id, audio.id)); await tx.insert(apiUsage).values({ projectId, provider: "elevenlabs", operation: "gold_khanjar_full_narration", model: GOLD_KHANJAR_FULL_MODEL, units: generated.characterCost, requestId: generated.requestId, durationMs: Date.now() - started, estimatedCost: cost }); });
}

function renderRows(): RenderScene[] {
  const story = GOLD_KHANJAR_REFINED_STORY_SCENES.map((id, index) => row(id, index + 1, index === 0 ? "CityEraEstablishing" : "HistoricalCharacter", sceneKey(id)));
  const products = GOLD_KHANJAR_PRODUCT_SCENES.map((item, index) => row(item.id, story.length + index + 1, item.preset, `original-photo:${item.file}`));
  return [...story, ...products];
}
function row(id: string, order: number, preset: string, objectKey: string): RenderScene { return { sceneId: id, generationId: id, order, preset, transition: order === 9 ? "ending dissolve" : order === 5 ? "light transition" : "dissolve", duration: 5, narration: "", subtitle: "", year: null, location: null, objectKey }; }
function subtitles() { return [
  [250, 2500, "1970年代、オマーンは新しい時代へ"], [2600, 4900, "変革の時代を迎えていました"],
  [5100, 7300, "カーブース国王は"], [7400, 9800, "国に尽くした功労者へ"],
  [10100, 12400, "特別な時計を贈ります"], [12500, 14800, "その製作を託されたのは"],
  [15100, 17400, "英国王室とも縁の深い"], [17500, 19900, "名門ジュエラー、アスプレイ"],
  [20100, 22400, "選ばれたのは、ロレックス"], [22500, 24800, "文字盤に輝く"],
  [25100, 27400, "金色のカンジャル"], [27500, 29800, "ただの装飾ではありません"],
  [30100, 32300, "ASPREYの刻印"], [32400, 34600, "500万番台のシリアル"],
  [34700, 36900, "そして、1665/0"], [37100, 39400, "国家と英国"],
  [39500, 42000, "時計製造の歴史が刻まれています"], [42100, 44800, "時を超え、物語を宿す一本"],
].map(([startMs, endMs, text], index) => ({ sceneId: String(index + 1), startMs: Number(startMs), endMs: Number(endMs), text: String(text) })); }
function overlays() { return [
  { kind: "year-location" as const, startMs: 400, endMs: 3400, primary: "1970s", secondary: "OMAN" },
  { kind: "year-location" as const, startMs: 15300, endMs: 18600, primary: "ASPREY", secondary: "LONDON" },
  { kind: "year-location" as const, startMs: 25200, endMs: 28200, primary: "GOLD KHANJAR" },
  { kind: "year-location" as const, startMs: 34800, endMs: 37300, primary: "Ref.1665/0" },
]; }

async function productionContext() { const [project] = await getDb().select().from(projects).where(eq(projects.title, GOLD_KHANJAR_FULL_TITLE)).limit(1); if (!project) throw new Error("Gold Khanjarプロジェクトが見つかりません"); const [storyboard] = await getDb().select().from(storyboards).where(and(eq(storyboards.projectId, project.id), eq(storyboards.isActive, true))).limit(1); if (!storyboard) throw new Error("Active Storyboardが見つかりません"); return { project, storyboard }; }
async function latestNarration(projectId: string) { return (await getDb().select().from(audioRecords).where(and(eq(audioRecords.projectId, projectId), eq(audioRecords.model, GOLD_KHANJAR_FULL_MODEL), eq(audioRecords.voiceId, GOLD_KHANJAR_FULL_VOICE), eq(audioRecords.script, GOLD_KHANJAR_FULL_SCRIPT), eq(audioRecords.status, "completed"), isNotNull(audioRecords.objectKey))).orderBy(desc(audioRecords.createdAt)).limit(1))[0]; }
async function approvedBgm() { const [bgm] = await getDb().select().from(bgmAssets).where(and(eq(bgmAssets.key, GOLD_KHANJAR_APPROVED_BGM_KEY), eq(bgmAssets.active, true))).limit(1); if (!bgm) throw new Error("承認済みBGMが見つかりません"); return bgm; }
async function selectedSystemAsset(id: string | null, type: "opening" | "ending"): Promise<RenderSystemAsset | null> { if (!id) return null; const [asset] = await getDb().select().from(systemVideoAssets).where(and(eq(systemVideoAssets.id, id), eq(systemVideoAssets.type, type), eq(systemVideoAssets.active, true))).limit(1); if (!asset) throw new Error(`選択中${type}を利用できません`); return { id: asset.id, key: asset.key, storagePath: asset.storagePath, duration: asset.durationMs / 1000, width: asset.width, height: asset.height, fps: asset.fps, hasAudio: asset.hasAudio }; }
async function requireAdmin() { const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 }); if (!isAdminEmail(user.email)) return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 }); return null; }
function narrationKey() { return `${GOLD_KHANJAR_FULL_PREFIX}/narration.mp3`; }
function sceneId(value: unknown): GoldKhanjarStorySceneId | null { return typeof value === "string" && value in GOLD_KHANJAR_STORY_SCENES ? value as GoldKhanjarStorySceneId : null; }
function sceneKey(id: GoldKhanjarStorySceneId) { const scene = GOLD_KHANJAR_STORY_SCENES[id]; return scene.source === "approved-quarter" ? scene.sourceKey : `${GOLD_KHANJAR_FULL_PREFIX}/scenes/${id}.mp4`; }
function taskKey(id: GoldKhanjarStorySceneId) { return `${GOLD_KHANJAR_FULL_PREFIX}/scenes/${id}.json`; }
async function readTask(id: GoldKhanjarStorySceneId) { if (!(await privateObjectExists(taskKey(id)))) return null; return JSON.parse(new TextDecoder().decode(await readPrivateObject(taskKey(id)))) as TaskRecord; }
async function writeTask(id: GoldKhanjarStorySceneId, record: TaskRecord) { await uploadPrivateObject(taskKey(id), new TextEncoder().encode(JSON.stringify(record)), "application/json"); }
async function sceneResults() { return Promise.all((Object.keys(GOLD_KHANJAR_STORY_SCENES) as GoldKhanjarStorySceneId[]).map(async (id) => { const scene = GOLD_KHANJAR_STORY_SCENES[id]; if (scene.source === "approved-quarter") return { id, status: await privateObjectExists(sceneKey(id)) ? "completed" : "missing", reused: true, credits: 0 }; const task = await readTask(id); return { id, status: task?.status ?? "missing", reused: false, credits: task?.actualCredits ?? task?.estimatedCredits ?? 0, failure: task?.failure, previewUrl: task?.status === "completed" ? `/api/admin/demo/gold-khanjar/full?scene=${id}` : null }; })); }
async function existingRender() { const context = await productionContext(); return (await getDb().select().from(finalRenders).where(and(eq(finalRenders.projectId, context.project.id), eq(finalRenders.status, "completed"))).orderBy(desc(finalRenders.createdAt)).limit(40)).find((item) => (item.renderInput as { purpose?: string }).purpose === "gold-khanjar-refined-final-v8"); }
function productMotionKey(id: string) { return `${GOLD_KHANJAR_FULL_PREFIX}/refined-products/v2/${id}.mp4`; }
async function productMotionsReady() { return (await Promise.all(GOLD_KHANJAR_PRODUCT_SCENES.map((item) => privateObjectExists(productMotionKey(item.id))))).every(Boolean); }
function bodySegmentKey(kind: "story" | "product") { return `${GOLD_KHANJAR_FULL_PREFIX}/refined-body/v2/${kind}.mp4`; }
function systemMediaKey(kind: "opening" | "ending", id: string) { const version = kind === "ending" ? "v4" : "v3"; return `${GOLD_KHANJAR_FULL_PREFIX}/refined-system/${version}/${kind}-${id}.mp4`; }
function legacySystemMediaKey(kind: "opening" | "ending", id: string) { return `${GOLD_KHANJAR_FULL_PREFIX}/refined-system/v2/${kind}-${id}.mp4`; }
async function systemMediaReady() { const context = await productionContext(); const opening = await selectedSystemAsset(context.project.openingAssetId, "opening"); const ending = await selectedSystemAsset(context.project.endingAssetId, "ending"); return { openingReady: !opening || await privateObjectExists(systemMediaKey("opening", opening.id)), endingReady: !ending || await privateObjectExists(systemMediaKey("ending", ending.id)) }; }
async function cleanupStaleRenders() {
  const context = await productionContext();
  const staleBefore = Date.now() - 5 * 60 * 1000;
  const rows = await getDb().select().from(finalRenders).where(and(eq(finalRenders.projectId, context.project.id), eq(finalRenders.status, "rendering")));
  for (const item of rows) {
    const purpose = (item.renderInput as { purpose?: string }).purpose;
    if (purpose !== "gold-khanjar-full-approved-quarter-standard" || item.outputObjectKey || item.createdAt.getTime() >= staleBefore) continue;
    await getDb().update(finalRenders).set({ status: "failed", errorCode: "VERCEL_RENDER_LIMIT", errorMessage: "Vercel実行上限により停止。完成版Renderで解消済み。", completedAt: new Date(), updatedAt: new Date() }).where(eq(finalRenders.id, item.id));
  }
}
function renderResult(id: string, reused: boolean) { return { renderId: id, status: "completed", reused, previewUrl: `/api/renders/${id}/video`, downloadUrl: `/api/renders/${id}/download` }; }

