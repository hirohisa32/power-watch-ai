import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { projects, scenes, storyboards } from "@/lib/db/schema";
import { GOLD_KHANJAR_NARRATION, GOLD_KHANJAR_SCENES, GOLD_KHANJAR_TITLE } from "@/lib/demo/gold-khanjar";
import { apiError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import { isAdminEmail } from "@/lib/ui/presentation";

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    if (!isAdminEmail(user.email)) return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
    const db = getDb();
    const [existing] = await db.select({ id: projects.id }).from(projects).where(eq(projects.title, GOLD_KHANJAR_TITLE)).limit(1);
    if (existing) return NextResponse.json({ projectId: existing.id, existing: true });
    const projectId = randomUUID();
    const storyboardId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(projects).values({
        id: projectId,
        userId: user.id,
        title: GOLD_KHANJAR_TITLE,
        script: GOLD_KHANJAR_NARRATION,
        style: "cinematic_real",
        language: "ja",
        targetDuration: 60,
        bgmKey: "journey-begins-cinematic",
        status: "storyboard",
      });
      await tx.insert(storyboards).values({ id: storyboardId, projectId, version: 1, totalDuration: 60 });
      await tx.insert(scenes).values(GOLD_KHANJAR_SCENES.map((scene) => ({
        storyboardId,
        projectId,
        order: scene[0],
        preset: scene[1],
        title: scene[2],
        duration: 3,
        narration: scene[0] === 6 ? GOLD_KHANJAR_NARRATION : "",
        narrationTone: "documentary",
        subtitle: scene[3],
        year: scene[4],
        location: scene[5],
        visualDescription: scene[6],
        visualPrompt: scene[6],
        camera: scene[7],
        shotType: scene[8],
        lighting: scene[9],
        motion: scene[10],
        colorMood: scene[11],
        transition: scene[12],
        watchReference: false,
      })));
    });
    return NextResponse.json({ projectId, existing: false });
  } catch (error) {
    return apiError(error, "Gold Khanjarプロジェクトを初期化できませんでした");
  }
}
