import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { audioRecords, finalRenders, projects, storyboards } from "@/lib/db/schema";
import { GOLD_KHANJAR_TITLE } from "@/lib/demo/gold-khanjar";
import { assertSameOrigin } from "@/lib/security";
import { uploadPrivateObject } from "@/lib/storage";
import { isAdminEmail } from "@/lib/ui/presentation";

export const maxDuration = 120;
const SOURCE_SHA256 = "c6bdae5ea21baa085a1ab97fe8fcb2cfb75c55b4530af70c6497846e07535e27";

export async function POST(request: Request) {
  let renderId: string | undefined;
  try {
    await assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    if (!isAdminEmail(user.email)) return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
    const db = getDb();
    const [project] = await db.select().from(projects).where(eq(projects.title, GOLD_KHANJAR_TITLE)).limit(1);
    if (!project) return NextResponse.json({ error: "Gold Khanjarプロジェクトが見つかりません" }, { status: 404 });
    const existing = (await db.select().from(finalRenders).where(and(eq(finalRenders.projectId, project.id), eq(finalRenders.status, "completed"))).orderBy(desc(finalRenders.version)).limit(10)).find((item) => (item.renderInput as { sourceSha256?: string })?.sourceSha256 === SOURCE_SHA256);
    if (existing) return NextResponse.json(result(existing.id, true));
    const [storyboard] = await db.select().from(storyboards).where(and(eq(storyboards.projectId, project.id), eq(storyboards.isActive, true))).limit(1);
    if (!storyboard) return NextResponse.json({ error: "Storyboardが見つかりません" }, { status: 404 });
    const [audio] = await db.select().from(audioRecords).where(and(eq(audioRecords.projectId, project.id), eq(audioRecords.model, "eleven_v4"), eq(audioRecords.voiceId, "Bj4Malc5SZLoXfPtxRxH"), eq(audioRecords.status, "completed"))).orderBy(desc(audioRecords.createdAt)).limit(1);
    if (!audio) return NextResponse.json({ error: "承認済みNarrationが見つかりません" }, { status: 404 });
    const [latest] = await db.select({ version: finalRenders.version }).from(finalRenders).where(eq(finalRenders.projectId, project.id)).orderBy(desc(finalRenders.version)).limit(1);
    const [render] = await db.insert(finalRenders).values({
      projectId: project.id, storyboardId: storyboard.id, audioRecordId: audio.id,
      version: (latest?.version ?? 0) + 1, status: "rendering", width: 1080, height: 1920, fps: 30,
      durationMs: 61570, bgmKey: "journey-begins", estimatedCost: 0,
      renderInput: {
        sourceSha256: SOURCE_SHA256,
        source: "client-final-meaning-based-v2",
        narrationRegenerated: false,
        voiceId: "Bj4Malc5SZLoXfPtxRxH",
        model: "eleven_v4",
        historicalMode: "character-anchor-production-runway",
        productMode: "identity-locked-depth-motion",
        runwayNewCredits: 540,
        runwayReusedCredits: 0,
        characterAnchors: ["CHAR_01", "CHAR_02", "CHAR_03_HANDS_ONLY"],
        changedScenes: ["story-entry-oman", "qaboos-letter", "oman-uk", "asprey-london", "gift-preparation", "gift-reception", "watch-reveal", "watch-lift", "character-reaction", "dial-macro", "khanjar-focus", "outer-caseback", "serial-5082955", "movement", "side-crown", "bracelet-clasp", "product-hero"],
      },
    }).returning();
    renderId = render.id;
    const media = await fetch(new URL("/client-final/gold-khanjar-motion-final.mp4", request.url));
    if (!media.ok) throw new Error(`Final MP4取得失敗: ${media.status}`);
    const bytes = new Uint8Array(await media.arrayBuffer());
    if (bytes.length !== 50_258_046) throw new Error(`Final MP4 size mismatch: ${bytes.length}`);
    const objectKey = `projects/${project.id}/renders/${render.id}.mp4`;
    await uploadPrivateObject(objectKey, bytes, "video/mp4");
    await db.update(finalRenders).set({ status: "completed", outputObjectKey: objectKey, completedAt: new Date(), updatedAt: new Date() }).where(eq(finalRenders.id, render.id));
    return NextResponse.json(result(render.id, false));
  } catch (error) {
    if (renderId) await getDb().update(finalRenders).set({ status: "failed", errorCode: "CLIENT_FINAL_PUBLISH_FAILED", errorMessage: error instanceof Error ? error.message : "unknown", updatedAt: new Date() }).where(eq(finalRenders.id, renderId));
    return NextResponse.json({ error: "Client FinalをProductionへ登録できませんでした", detail: error instanceof Error ? error.message : "unknown" }, { status: 500 });
  }
}
function result(id: string, reused: boolean) { return { renderId: id, status: "completed", reused, previewUrl: `/api/renders/${id}/video`, downloadUrl: `/api/renders/${id}/download` }; }
