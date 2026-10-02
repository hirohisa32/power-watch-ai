import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import { createReadUrl, privateObjectExists, readPrivateObject, uploadPrivateObject } from "@/lib/storage";
import { isAdminEmail } from "@/lib/ui/presentation";
import { RunwayVideoProvider } from "@/lib/video/runway";

export const maxDuration = 60;

const PREFIX = "projects/gold-khanjar-client-final/historical-v1";
const SCENES = {
  "01-oman-establishing": "Vertical 9:16 cinematic anime and premium editorial illustration, 1970s Oman at dawn, Muscat old harbor and rugged mountains, warm dusty atmosphere, archival documentary mood, restrained slow camera push, subtle cloth and palm movement, historically grounded architecture, elegant hand-painted texture, muted sand and deep teal palette, no readable text, no logos, no emblems, no watches, no modern objects, no photorealism, no fantasy magic.",
  "02-qaboos-era": "Vertical 9:16 cinematic anime and premium editorial illustration, a dignified adult Omani statesman in the early 1970s seen in quiet profile inside a restrained palace corridor, closed mouth, silent acting, minimal breathing and a small deliberate gaze, warm window light, historically grounded formal clothing, archival luxury documentary mood, stable face and hands, no readable text, no logos, no royal emblems, no watches, no lip movement, no modern objects, no photorealism.",
  "03-diplomacy": "Vertical 9:16 cinematic anime and premium editorial illustration, 1970s diplomatic meeting between Omani and British officials in an elegant dark wood room, respectful exchange across a table, sealed correspondence and maps without readable writing, silent restrained gestures, warm practical lamps, subtle slow lateral camera move, historical documentary atmosphere, no logos, no emblems, no watches, no readable text, no handshakes close-up, no lip sync, no modern objects, no photorealism.",
  "04-london-jeweller": "Vertical 9:16 cinematic anime and premium editorial illustration, 1970s London high jewellery atelier interior, master artisan at a dark walnut workbench preparing a prestigious commission, velvet trays, brass tools and soft tungsten light, controlled silent movements, refined British luxury, shallow depth of field, restrained camera dolly, no readable text, no brand logos, no watches visible, no modern objects, no photorealism.",
  "05-gift-preparation": "Vertical 9:16 cinematic anime and premium editorial illustration, white-gloved attendants carefully prepare a closed luxury presentation box on deep burgundy velvet, only simple slow placement of the box and ribbon, faces out of frame, elegant warm top light, close editorial composition, natural five-finger anatomy, quiet ceremonial mood, no readable text, no logos, no emblems, no watch visible, no complex hand action, no photorealism.",
  "06-gift-delivery": "Vertical 9:16 cinematic anime and premium editorial illustration, a closed dark leather presentation box is carried on a velvet tray through a dignified 1970s Omani interior, torso and tray only, faces out of frame, slow steady forward motion, warm shafts of dusty light, ceremonial anticipation, restrained luxury documentary style, no readable text, no logos, no emblems, no watch visible, no complex hand action, no modern objects, no photorealism.",
} as const;
type SceneId = keyof typeof SCENES;
type TaskRecord = { taskId: string; status: "submitted" | "completed" | "failed"; estimatedCredits: number; actualCredits?: number; submittedAt: string; completedAt?: string; failure?: string };

function sceneId(value: unknown): SceneId | null {
  return typeof value === "string" && value in SCENES ? value as SceneId : null;
}
function keys(id: SceneId) {
  return { video: `${PREFIX}/${id}.mp4`, task: `${PREFIX}/${id}.json` };
}
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
  } catch (error) { return apiError(error, "Historical Sceneを取得できませんでした"); }
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
    const generation = await provider.generate({ model: "gen4.5", prompt: SCENES[id], duration: 5, ratio: "720:1280" });
    const estimatedCredits = generation.estimatedCostCredits ?? 60;
    if (estimatedCredits > 60) { await provider.cancel?.(generation.taskId); throw new Error(`推定${estimatedCredits} creditsのためScene上限60を超えました`); }
    const submitted: TaskRecord = { taskId: generation.taskId, status: "submitted", estimatedCredits, submittedAt: new Date().toISOString() };
    await writeRecord(target.task, submitted);
    return NextResponse.json(response(id, submitted, false), { status: 202 });
  } catch (error) {
    console.error("Gold Khanjar historical generation failed", error);
    return NextResponse.json(
      { error: "Historical Sceneを生成できませんでした", detail: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}

async function readRecord(key: string) { if (!(await privateObjectExists(key))) return null; return JSON.parse(new TextDecoder().decode(await readPrivateObject(key))) as TaskRecord; }
async function writeRecord(key: string, record: TaskRecord) { await uploadPrivateObject(key, new TextEncoder().encode(JSON.stringify(record)), "application/json"); }
function response(id: SceneId, record: TaskRecord, reused: boolean) { return { scene: id, status: record.status, model: "gen4.5", durationSeconds: 5, estimatedCredits: record.estimatedCredits, actualCredits: record.actualCredits, submittedAt: record.submittedAt, completedAt: record.completedAt, failure: record.failure, reused, previewUrl: `/api/admin/demo/gold-khanjar/client-final-historical?scene=${id}` }; }
