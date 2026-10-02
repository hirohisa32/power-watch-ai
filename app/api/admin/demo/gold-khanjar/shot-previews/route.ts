import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import {
  createReadUrl,
  privateObjectExists,
  readPrivateObject,
  uploadPrivateObject,
} from "@/lib/storage";
import { isAdminEmail } from "@/lib/ui/presentation";
import { RunwayVideoProvider } from "@/lib/video/runway";

export const maxDuration = 60;

const ROOT = process.cwd();
const ASSET_DIR = path.join(ROOT, "assets", "gold-khanjar-preview");
const CHARACTER_MASTER_FILE = path.join(ASSET_DIR, "character-master-v1.png");
const STYLIZED_MASTER_FILE = path.join(ASSET_DIR, "stylized-full-watch.png");
const SHOT_4_REFERENCE_FILE = path.join(ASSET_DIR, "shot-4-reference-v1.png");
const PREFIX = "system-assets/previews/gold-khanjar/character-shot-gates-v1";

type ShotId = "shot-1" | "shot-4";
type TaskRecord = {
  taskId: string;
  status: "submitted" | "completed" | "failed";
  estimatedCredits: number;
  actualCredits?: number;
  submittedAt: string;
  completedAt?: string;
  failure?: string;
};

const SHOTS: Record<ShotId, { referenceFile: string; prompt: string }> = {
  "shot-1": {
    referenceFile: CHARACTER_MASTER_FILE,
    prompt: [
      "Cinematic anime and premium editorial illustration, 1970s Oman, preserve the exact same adult male character, face, beard, turban, age, clothing, chair, lighting and composition from the first frame.",
      "He silently looks down toward the closed presentation box with only one very small natural eye movement, one subtle blink and restrained breathing.",
      "His mouth remains fully closed and completely still. His head and shoulders remain almost still. No hand movement and no watch visible.",
      "Static camera with only imperceptible cinematic breathing, warm lamp ambience, quiet dignified luxury documentary mood.",
      "No speaking, no lip motion, no head turn, no gesture, no facial morphing, no exaggerated expression, no extra person, no photorealism.",
    ].join(" "),
  },
  "shot-4": {
    referenceFile: SHOT_4_REFERENCE_FILE,
    prompt: [
      "Unified cinematic anime and premium editorial illustration, preserve the exact first-frame composition, open leather box, white-gloved hands and illustrated vintage watch.",
      "The two white-gloved hands perform exactly one restrained action: lift the watch vertically only a few centimeters above the box, then hold it steady.",
      "No face is visible. No regripping, no finger repositioning, no hand-off, no rotation, no tilt, no camera orbit, and no additional action.",
      "Keep the watch front-facing at the same reference angle. Preserve natural five-finger anatomy, glove joints, fingertip contact, occlusion and contact shadow.",
      "Minimal locked camera, matched warm lighting. No invented watch details, no logo changes, no extra fingers, no deformed wrists, no photorealism.",
    ].join(" "),
  },
};

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  if (!isAdminEmail(user.email))
    return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  return null;
}

function parseShot(value: string | null): ShotId | null {
  return value === "shot-1" || value === "shot-4" ? value : null;
}

function keysFor(shot: ShotId) {
  const base = `${PREFIX}/${shot}`;
  return {
    reference: `${base}/reference.png`,
    raw: `${base}/runway-raw.mp4`,
    task: `${base}/task.json`,
  };
}

export async function GET(request: Request) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;
    const url = new URL(request.url);
    const asset = url.searchParams.get("asset");
    if (asset === "character-master") return localAsset(CHARACTER_MASTER_FILE, "image/png");
    if (asset === "stylized-master") return localAsset(STYLIZED_MASTER_FILE, "image/png");
    if (asset === "shot-4-reference") return localAsset(SHOT_4_REFERENCE_FILE, "image/png");

    const shot = parseShot(url.searchParams.get("shot"));
    if (!shot) return NextResponse.json({ error: "Shot指定が不正です" }, { status: 400 });
    if (asset !== "preview" && asset !== "raw")
      return NextResponse.json({ error: "Asset指定が不正です" }, { status: 400 });
    const keys = keysFor(shot);
    if (!(await privateObjectExists(keys.raw)))
      return NextResponse.json({ error: "Previewはまだ生成されていません" }, { status: 404 });
    const disposition = url.searchParams.get("download") === "1" ? "attachment" : "inline";
    return NextResponse.redirect(await createReadUrl(keys.raw, 900, disposition));
  } catch (error) {
    return apiError(error, "Shot Preview Assetを取得できませんでした");
  }
}

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    const denied = await requireAdmin();
    if (denied) return denied;
    if (!process.env.RUNWAY_API_KEY)
      return NextResponse.json({ error: "Production RUNWAY_API_KEYが設定されていません" }, { status: 409 });
    const body = (await request.json()) as { shot?: string };
    const shot = parseShot(body.shot ?? null);
    if (!shot) return NextResponse.json({ error: "Shot指定が不正です" }, { status: 400 });

    const config = SHOTS[shot];
    const keys = keysFor(shot);
    if (!(await privateObjectExists(keys.reference)))
      await uploadPrivateObject(keys.reference, await readFile(config.referenceFile), "image/png");

    const provider = new RunwayVideoProvider();
    const record = await readTaskRecord(keys.task);
    if (record?.status === "completed" && (await privateObjectExists(keys.raw)))
      return NextResponse.json(responseFor(shot, record, true));
    if (record?.status === "failed")
      return NextResponse.json(responseFor(shot, record, true), { status: 409 });

    if (record) {
      const status = await provider.getStatus(record.taskId);
      if (status.status === "pending" || status.status === "running")
        return NextResponse.json({
          ...responseFor(shot, record, true),
          status: status.status,
          progress: status.status === "running" ? status.progress : undefined,
        });
      if (status.status === "failed" || status.status === "canceled") {
        const failed: TaskRecord = {
          ...record,
          status: "failed",
          actualCredits: status.actualCostCredits,
          completedAt: new Date().toISOString(),
          failure: status.message,
        };
        await writeTaskRecord(keys.task, failed);
        return NextResponse.json(responseFor(shot, failed, true), { status: 409 });
      }
      const output = await fetch(status.outputUrl);
      if (!output.ok) throw new Error(`Runway動画取得に失敗しました: ${output.status}`);
      await uploadPrivateObject(keys.raw, new Uint8Array(await output.arrayBuffer()), "video/mp4");
      const completed: TaskRecord = {
        ...record,
        status: "completed",
        actualCredits: status.actualCostCredits ?? record.estimatedCredits,
        completedAt: new Date().toISOString(),
      };
      await writeTaskRecord(keys.task, completed);
      return NextResponse.json(responseFor(shot, completed, true));
    }

    const generation = await provider.generate({
      model: "gen4.5",
      prompt: config.prompt,
      duration: 5,
      ratio: "720:1280",
      referenceImageUrl: await createReadUrl(keys.reference, 1800, "inline"),
    });
    const estimatedCredits = generation.estimatedCostCredits ?? 0;
    if (estimatedCredits > 60) {
      await provider.cancel?.(generation.taskId);
      throw new Error(`推定${estimatedCredits} creditsのため承認上限60を超えました`);
    }
    const submitted: TaskRecord = {
      taskId: generation.taskId,
      status: "submitted",
      estimatedCredits,
      submittedAt: new Date().toISOString(),
    };
    await writeTaskRecord(keys.task, submitted);
    return NextResponse.json(responseFor(shot, submitted, false), { status: 202 });
  } catch (error) {
    return apiError(error, "Shot Previewを生成できませんでした");
  }
}

async function localAsset(filename: string, contentType: string) {
  return new NextResponse(await readFile(filename), {
    headers: { "Content-Type": contentType, "Cache-Control": "private, no-store" },
  });
}

async function readTaskRecord(key: string) {
  if (!(await privateObjectExists(key))) return null;
  return JSON.parse(new TextDecoder().decode(await readPrivateObject(key))) as TaskRecord;
}

async function writeTaskRecord(key: string, record: TaskRecord) {
  await uploadPrivateObject(key, new TextEncoder().encode(JSON.stringify(record)), "application/json");
}

function responseFor(shot: ShotId, record: TaskRecord, reused: boolean) {
  const query = `shot=${shot}`;
  return {
    shot,
    status: record.status,
    model: "gen4.5",
    durationSeconds: 5,
    estimatedCredits: record.estimatedCredits,
    actualCredits: record.actualCredits,
    failure: record.failure,
    submittedAt: record.submittedAt,
    completedAt: record.completedAt,
    reused,
    previewUrl: `/api/admin/demo/gold-khanjar/shot-previews?asset=preview&${query}`,
    rawDownloadUrl: `/api/admin/demo/gold-khanjar/shot-previews?asset=raw&download=1&${query}`,
  };
}
