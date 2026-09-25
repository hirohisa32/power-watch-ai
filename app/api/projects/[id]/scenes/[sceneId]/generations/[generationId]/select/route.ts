import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import { selectGeneration } from "@/lib/video/repository";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; sceneId: string; generationId: string }> },
) {
  try {
    await assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { id, sceneId, generationId } = await params;
    await selectGeneration({ projectId: id, sceneId, generationId, userId: user.id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, "Generationを選択できませんでした");
  }
}
