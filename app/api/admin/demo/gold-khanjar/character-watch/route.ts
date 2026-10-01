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
const SOURCE_FILE = path.join(ASSET_DIR, "source-full-watch.jpg");
const MASTER_FILE = path.join(ASSET_DIR, "stylized-full-watch.png");
const KEYFRAME_FILE = path.join(ASSET_DIR, "character-watch-keyframe.png");
const FINAL_FILE = path.join(ASSET_DIR, "character-watch-preview.mp4");

const PREFIX = "system-assets/previews/gold-khanjar/character-watch-v2";
const SOURCE_KEY = `${PREFIX}/source-full-watch.jpg`;
const MASTER_KEY = `${PREFIX}/stylized-full-watch.png`;
const KEYFRAME_KEY = `${PREFIX}/character-watch-keyframe.png`;
const RAW_KEY = `${PREFIX}/runway-raw.mp4`;
const TASK_KEY = `${PREFIX}/task.json`;

const PROMPT = [
  "Unified cinematic anime and premium editorial illustration, not photorealistic.",
  "White-gloved hands slowly and carefully lift the exact illustrated vintage wristwatch shown in the first frame only a few centimeters from the open leather presentation box.",
  "The dignified recipient keeps his gaze on the watch with subtle natural eye movement.",
  "Very restrained slow camera dolly-in, subtle rack focus from gloves to the recipient's eyes, warm lamp flicker and fine dust movement.",
  "Preserve the exact composition and anatomy from the first frame.",
  "The watch stays front-facing and centered, with the existing fingertips naturally overlapping only its far left and right edges.",
  "Preserve the exact dial, gold Khanjar emblem, hands, bezel, case and bracelet from the first frame.",
  "No invented watch details, no logo changes, no extra fingers, no large rotation, no fast movement, no photorealism.",
].join(" ");

type TaskRecord = {
  taskId: string;
  status: "submitted" | "completed" | "failed";
  estimatedCredits: number;
  actualCredits?: number;
  submittedAt: string;
  completedAt?: string;
  failure?: string;
};

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  if (!isAdminEmail(user.email))
    return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  return null;
}

export async function GET(request: Request) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;
    const url = new URL(request.url);
    const asset = url.searchParams.get("asset");
    const disposition = url.searchParams.get("download") === "1" ? "attachment" : "inline";
    if (asset === "source") return localAsset(SOURCE_FILE, "image/jpeg");
    if (asset === "master") return localAsset(MASTER_FILE, "image/png");
    if (asset === "keyframe") return localAsset(KEYFRAME_FILE, "image/png");
    if (asset === "preview") {
      try {
        return await localAsset(FINAL_FILE, "video/mp4");
      } catch {
        if (!(await privateObjectExists(RAW_KEY)))
          return NextResponse.json({ error: "Previewはまだ生成されていません" }, { status: 404 });
        return NextResponse.redirect(await createReadUrl(RAW_KEY, 900, disposition));
      }
    }
    if (asset === "raw") {
      if (!(await privateObjectExists(RAW_KEY)))
        return NextResponse.json({ error: "Runway出力はまだありません" }, { status: 404 });
      return NextResponse.redirect(await createReadUrl(RAW_KEY, 900, disposition));
    }
    return NextResponse.json({ error: "Asset指定が不正です" }, { status: 400 });
  } catch (error) {
    return apiError(error, "Character × Watch Assetを取得できませんでした");
  }
}

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    const denied = await requireAdmin();
    if (denied) return denied;
    if (!process.env.RUNWAY_API_KEY)
      return NextResponse.json(
        { error: "Production RUNWAY_API_KEYが設定されていません" },
        { status: 409 },
      );

    await ensureReferenceAssets();
    const provider = new RunwayVideoProvider();
    const record = await readTaskRecord();
    if (record?.status === "completed" && (await privateObjectExists(RAW_KEY)))
      return NextResponse.json(responseFor(record, true));
    if (record?.status === "failed")
      return NextResponse.json(responseFor(record, true), { status: 409 });

    if (record) {
      const status = await provider.getStatus(record.taskId);
      if (status.status === "pending" || status.status === "running")
        return NextResponse.json({
          ...responseFor(record, true),
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
        await writeTaskRecord(failed);
        return NextResponse.json(responseFor(failed, true), { status: 409 });
      }
      const response = await fetch(status.outputUrl);
      if (!response.ok) throw new Error(`Runway動画取得に失敗しました: ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      await uploadPrivateObject(RAW_KEY, bytes, "video/mp4");
      const completed: TaskRecord = {
        ...record,
        status: "completed",
        actualCredits: status.actualCostCredits ?? record.estimatedCredits,
        completedAt: new Date().toISOString(),
      };
      await writeTaskRecord(completed);
      return NextResponse.json(responseFor(completed, true));
    }

    const referenceImageUrl = await createReadUrl(KEYFRAME_KEY, 1800, "inline");
    const generation = await provider.generate({
      model: "gen4.5",
      prompt: PROMPT,
      duration: 5,
      ratio: "720:1280",
      referenceImageUrl,
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
    await writeTaskRecord(submitted);
    return NextResponse.json(responseFor(submitted, false), { status: 202 });
  } catch (error) {
    return apiError(error, "Character × Watch Previewを生成できませんでした");
  }
}

async function localAsset(filename: string, contentType: string) {
  const bytes = await readFile(filename);
  return new NextResponse(bytes, {
    headers: { "Content-Type": contentType, "Cache-Control": "private, no-store" },
  });
}

async function ensureReferenceAssets() {
  const assets = [
    [SOURCE_KEY, SOURCE_FILE, "image/jpeg"],
    [MASTER_KEY, MASTER_FILE, "image/png"],
    [KEYFRAME_KEY, KEYFRAME_FILE, "image/png"],
  ] as const;
  for (const [key, file, contentType] of assets) {
    if (!(await privateObjectExists(key)))
      await uploadPrivateObject(key, await readFile(file), contentType);
  }
}

async function readTaskRecord() {
  if (!(await privateObjectExists(TASK_KEY))) return null;
  return JSON.parse(new TextDecoder().decode(await readPrivateObject(TASK_KEY))) as TaskRecord;
}

async function writeTaskRecord(record: TaskRecord) {
  await uploadPrivateObject(
    TASK_KEY,
    new TextEncoder().encode(JSON.stringify(record)),
    "application/json",
  );
}

function responseFor(record: TaskRecord, reused: boolean) {
  return {
    status: record.status,
    model: "gen4.5",
    durationSeconds: 5,
    estimatedCredits: record.estimatedCredits,
    actualCredits: record.actualCredits,
    failure: record.failure,
    submittedAt: record.submittedAt,
    completedAt: record.completedAt,
    reused,
    previewUrl: "/api/admin/demo/gold-khanjar/character-watch?asset=preview",
    rawDownloadUrl: "/api/admin/demo/gold-khanjar/character-watch?asset=raw&download=1",
  };
}
