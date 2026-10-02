import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import { createReadUrl, privateObjectExists, readPrivateObject, uploadPrivateObject } from "@/lib/storage";
import { isAdminEmail } from "@/lib/ui/presentation";
import { RunwayVideoProvider } from "@/lib/video/runway";

export const maxDuration = 60;

const PREFIX = "projects/gold-khanjar-client-final/story-v2";
const SCENES = {
  "01-story-entry-oman": { image: "01-story-entry-oman.png", prompt: "Slow cinematic forward dolly through the parchment frame into 1970s Oman. Gentle sea shimmer, distant atmospheric haze, sparse airborne dust and restrained warm light drift. Preserve all architecture and landscape. No people, text, logos, modern objects or new elements. Premium hand-painted anime documentary, smooth motion, no morphing." },
  "02-qaboos-letter": { image: "02-qaboos-letter.png", prompt: "The same dignified Omani man remains seated and silent with mouth fully closed. One action only: his eyes settle gently on the sealed letter, with one natural blink and barely visible breathing. Hands remain still. Slow subtle camera push, dust motes in warm lamp light. Preserve face, beard, turban, clothing, anatomy and room exactly. No speech, lip movement, head turn, new objects or morphing." },
  "03-oman-uk": { image: "03-oman-uk.png", prompt: "Preserve both fixed men exactly. One action only: the British jeweller slides the sealed letter just a few centimeters toward the Omani man, who watches silently. Both mouths stay closed; heads, faces and other hands remain stable. Subtle lateral camera drift and warm lamp flicker. Preserve anatomy, clothing, table, map and period room. No handshake, speaking, extra people, morphing or new objects." },
  "04-asprey-london": { image: "04-asprey-london.png", prompt: "The same fixed British jeweller remains silent with mouth closed. One action only: his eyes lower to inspect the closed presentation box, with minimal breathing. Hands and box stay still. Gentle camera dolly, shallow focus shift from foreground tools to the man and box, subtle warm practical light movement. Preserve face, silver hair, clothing, anatomy and workshop exactly. No watch, speech, morphing or new objects." },
  "05-gift-preparation": { image: "05-gift-preparation.png", prompt: "Preserve the same British jeweller, assistant hands, closed box and workshop exactly. One action only: the white-gloved assistant centers the closed box by a few centimeters on the velvet tray, then stops. The jeweller watches silently, mouth closed and body stable. Natural five-finger anatomy, simple side-view hand motion, subtle camera push and warm highlight drift. No opening box, no watch, no morphing, no new objects." },
  "06-gift-reception": { image: "06-gift-reception.png", prompt: "Preserve the same Omani man, white-gloved assistant hands, tray, closed presentation box and room exactly. One action only: the tray moves slowly forward a few centimeters and stops while the man lowers his gaze. His mouth remains closed and head nearly still. Natural hands, restrained camera dolly, gentle dust in amber light. No opening box, no watch, no speech, no morphing or new objects." },
  "07-character-reaction": { image: "07-character-reaction.png", prompt: "The same fixed Omani man silently looks down at an unseen precious object below frame. One action only: a tiny natural eye movement downward, one restrained blink and subtle breathing. Mouth fully closed, head almost still, hands still, no watch visible. Slow elegant camera push and slight warm light change. Preserve face, beard, turban, clothing and room exactly. No speech, facial morph, new objects or exaggerated emotion." },
} as const;
type SceneId = keyof typeof SCENES;
type TaskRecord = { taskId: string; status: "submitted" | "completed" | "failed"; estimatedCredits: number; actualCredits?: number; submittedAt: string; completedAt?: string; failure?: string };

function sceneId(value: unknown): SceneId | null { return typeof value === "string" && value in SCENES ? value as SceneId : null; }
function keys(id: SceneId) { return { video: `${PREFIX}/${id}.mp4`, task: `${PREFIX}/${id}.json` }; }
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  return null;
}

export async function GET(request: Request) {
  try {
    const denied = await requireAdmin(); if (denied) return denied;
    const id = sceneId(new URL(request.url).searchParams.get("scene"));
    if (!id) return NextResponse.json({ error: "Scene指定が不正です" }, { status: 400 });
    const target = keys(id);
    if (!(await privateObjectExists(target.video))) return NextResponse.json({ error: "未生成です" }, { status: 404 });
    return NextResponse.redirect(await createReadUrl(target.video, 3600, "inline"));
  } catch (error) { return apiError(error, "Story Sceneを取得できませんでした"); }
}

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    const denied = await requireAdmin(); if (denied) return denied;
    if (!process.env.RUNWAY_API_KEY) return NextResponse.json({ error: "Production RUNWAY_API_KEYが設定されていません" }, { status: 409 });
    const id = sceneId((await request.json() as { scene?: string }).scene);
    if (!id) return NextResponse.json({ error: "Scene指定が不正です" }, { status: 400 });
    const target = keys(id);
    const provider = new RunwayVideoProvider();
    const record = await readRecord(target.task);
    if (record?.status === "completed" && await privateObjectExists(target.video)) return NextResponse.json(response(id, record, true));
    if (record?.status === "failed") return NextResponse.json(response(id, record, true), { status: 409 });
    if (record) {
      const status = await provider.getStatus(record.taskId);
      if (status.status === "pending" || status.status === "running") return NextResponse.json({ ...response(id, record, true), status: status.status, progress: status.status === "running" ? status.progress : undefined }, { status: 202 });
      if (status.status === "failed" || status.status === "canceled") {
        const failed: TaskRecord = { ...record, status: "failed", actualCredits: status.actualCostCredits, completedAt: new Date().toISOString(), failure: status.message };
        await writeRecord(target.task, failed);
        return NextResponse.json(response(id, failed, true), { status: 409 });
      }
      const output = await fetch(status.outputUrl);
      if (!output.ok) throw new Error(`Runway動画取得に失敗しました: ${output.status}`);
      await uploadPrivateObject(target.video, new Uint8Array(await output.arrayBuffer()), "video/mp4");
      const completed: TaskRecord = { ...record, status: "completed", actualCredits: status.actualCostCredits ?? record.estimatedCredits, completedAt: new Date().toISOString() };
      await writeRecord(target.task, completed);
      return NextResponse.json(response(id, completed, true));
    }
    const referenceImageUrl = new URL(`/client-final/gold-khanjar-v2/keyframes/${SCENES[id].image}`, request.url).toString();
    const generation = await provider.generate({ model: "gen4.5", prompt: SCENES[id].prompt, duration: 5, ratio: "720:1280", referenceImageUrl });
    const estimatedCredits = generation.estimatedCostCredits ?? 60;
    if (estimatedCredits > 60) { await provider.cancel?.(generation.taskId); throw new Error(`推定${estimatedCredits} creditsのためScene上限60を超えました`); }
    const submitted: TaskRecord = { taskId: generation.taskId, status: "submitted", estimatedCredits, submittedAt: new Date().toISOString() };
    await writeRecord(target.task, submitted);
    return NextResponse.json(response(id, submitted, false), { status: 202 });
  } catch (error) {
    console.error("Gold Khanjar story generation failed", error);
    return NextResponse.json({ error: "Story Sceneを生成できませんでした", detail: error instanceof Error ? error.message : "unknown" }, { status: 500 });
  }
}

async function readRecord(key: string) { if (!(await privateObjectExists(key))) return null; return JSON.parse(new TextDecoder().decode(await readPrivateObject(key))) as TaskRecord; }
async function writeRecord(key: string, record: TaskRecord) { await uploadPrivateObject(key, new TextEncoder().encode(JSON.stringify(record)), "application/json"); }
function response(id: SceneId, record: TaskRecord, reused: boolean) { return { scene: id, status: record.status, model: "gen4.5", durationSeconds: 5, estimatedCredits: record.estimatedCredits, actualCredits: record.actualCredits, submittedAt: record.submittedAt, completedAt: record.completedAt, failure: record.failure, reused, previewUrl: `/api/admin/demo/gold-khanjar/client-final-historical?scene=${id}` }; }
