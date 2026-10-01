import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { contextPronunciationRules } from "@/lib/db/schema";
import { apiError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import { isAdminEmail } from "@/lib/ui/presentation";

const inputSchema = z.object({
  displayPattern: z.string().min(1).max(300),
  ttsTemplate: z.string().min(1).max(500),
  voiceId: z.enum(["Bj4Malc5SZLoXfPtxRxH", "hV5AJXCCNGT56GPYPLiG"]),
});

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    if (!isAdminEmail(user.email)) return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
    const input = inputSchema.parse(await request.json());
    const db = getDb();
    const [candidate] = await db.select().from(contextPronunciationRules).where(and(isNull(contextPronunciationRules.projectId), eq(contextPronunciationRules.displayPattern, input.displayPattern), eq(contextPronunciationRules.ttsTemplate, input.ttsTemplate))).limit(1);
    if (!candidate) return NextResponse.json({ error: "承認候補が見つかりません" }, { status: 404 });
    await db.update(contextPronunciationRules).set({ status: "approved", approvedVoiceId: input.voiceId, approvedAt: new Date(), updatedAt: new Date(), notes: "Human試聴で自然さ・意味同一性を承認" }).where(eq(contextPronunciationRules.id, candidate.id));
    return NextResponse.json({ id: candidate.id, approved: true });
  } catch (error) {
    return apiError(error, "Context Pronunciation Ruleを承認できませんでした");
  }
}
