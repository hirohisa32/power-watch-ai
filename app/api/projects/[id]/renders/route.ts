import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { VercelFinalRenderJobQueue } from "@/lib/render/queue";
import { createFinalRenderJob, markRenderEnqueueFailed } from "@/lib/render/repository";
import { assertSameOrigin } from "@/lib/security";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { id } = await params;
    const created = await createFinalRenderJob({ projectId: id, userId: user.id });
    try {
      await new VercelFinalRenderJobQueue().enqueue({ jobId: created.job.id });
    } catch (error) {
      await markRenderEnqueueFailed(
        created.job.id,
        error instanceof Error ? error.message : "Queue send failed",
      );
      throw error;
    }
    return NextResponse.json(
      { renderId: created.render.id, jobId: created.job.id },
      { status: 202 },
    );
  } catch (error) {
    return apiError(error, "Final Renderを開始できませんでした");
  }
}
