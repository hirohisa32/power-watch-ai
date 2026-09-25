import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import { VercelVideoJobQueue } from "@/lib/video/queue";
import { createGenerationJob, markEnqueueFailed } from "@/lib/video/repository";

const bodySchema = z.object({ instruction: z.string().trim().min(1).max(500).optional() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; sceneId: string }> },
) {
  try {
    await assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { id, sceneId } = await params;
    const raw = await request.json().catch(() => ({}));
    const { instruction } = bodySchema.parse(raw);
    const created = await createGenerationJob({
      projectId: id,
      sceneId,
      userId: user.id,
      regenerationInstruction: instruction,
    });
    try {
      await new VercelVideoJobQueue().enqueue({ jobId: created.job.id, cycle: 0 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Queue send failed";
      await markEnqueueFailed(created.job.id, message);
      throw error;
    }
    return NextResponse.json(
      { generationId: created.generation.id, jobId: created.job.id },
      { status: 202 },
    );
  } catch (error) {
    return apiError(error, "動画生成を開始できませんでした");
  }
}
