import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { VercelOpeningPreviewJobQueue } from "@/lib/opening/queue";
import { createOpeningPreview, markOpeningEnqueueFailed } from "@/lib/opening/repository";
import { assertSameOrigin } from "@/lib/security";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { id } = await params;
    const created = await createOpeningPreview({ projectId: id, userId: user.id });
    try {
      await new VercelOpeningPreviewJobQueue().enqueue({ jobId: created.job.id, cycle: 0 });
    } catch (error) {
      await markOpeningEnqueueFailed(
        created.job.id,
        error instanceof Error ? error.message : "Queue send failed",
      );
      throw error;
    }
    return NextResponse.json({ previewId: created.preview.id, jobId: created.job.id }, { status: 202 });
  } catch (error) {
    return apiError(error, "Opening Previewを開始できませんでした");
  }
}
