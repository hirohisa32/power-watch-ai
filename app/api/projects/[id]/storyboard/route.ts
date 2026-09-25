import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assets, projects } from "@/lib/db/schema";
import { assertSameOrigin } from "@/lib/security";
import { OpenAIStoryboardDirector, StoryboardDirectorError } from "@/lib/storyboard/director";
import { DrizzleStoryboardPersistence } from "@/lib/storyboard/repository";
import { StoryboardValidationError } from "@/lib/storyboard/schema";
import { generateAndSaveStoryboard } from "@/lib/storyboard/service";

export const maxDuration = 70;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const db = getDb();
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, user.id)))
      .limit(1);
    if (!project)
      return NextResponse.json({ error: "プロジェクトが見つかりません" }, { status: 404 });
    if (!project.script.trim())
      return NextResponse.json({ error: "Storyboard生成には台本が必要です" }, { status: 400 });
    if (project.targetDuration !== 60 && project.targetDuration !== 90)
      return NextResponse.json({ error: "動画尺を確認してください" }, { status: 400 });
    const watchAssets = await db
      .select({ label: assets.label })
      .from(assets)
      .where(eq(assets.projectId, id));
    const result = await generateAndSaveStoryboard(
      {
        projectId: id,
        script: project.script,
        style: project.style,
        language: project.language,
        targetDuration: project.targetDuration,
        assetLabels: watchAssets.map((asset) => asset.label),
      },
      new OpenAIStoryboardDirector(),
      new DrizzleStoryboardPersistence(),
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof StoryboardDirectorError) {
      console.error("Storyboard provider failure", {
        projectId: id,
        code: error.code,
        message: error.message,
      });
      if (error.code === "rate_limit")
        return NextResponse.json(
          { error: "現在生成が混み合っています。少し待ってから再度お試しください。" },
          { status: 429 },
        );
      if (error.code === "configuration" || error.code === "authentication")
        return NextResponse.json(
          { error: "AI接続設定を確認できません。管理者へお問い合わせください。" },
          { status: 503 },
        );
      if (error.code === "timeout")
        return NextResponse.json(
          { error: "動画構成の生成に時間がかかっています。再度お試しください。" },
          { status: 504 },
        );
    }
    console.error("Storyboard generation failed", {
      projectId: id,
      error: error instanceof Error ? error.message : "unknown",
    });
    const invalid = error instanceof StoryboardValidationError;
    return NextResponse.json(
      {
        error: invalid
          ? "生成された動画構成を検証できませんでした。再度お試しください。"
          : "動画構成の生成に失敗しました。しばらくしてから再度お試しください。",
      },
      { status: 502 },
    );
  }
}
