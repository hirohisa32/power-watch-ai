import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { closeBillingMonth } from "@/lib/billing/service";
import { apiError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import { isAdminEmail } from "@/lib/ui/presentation";

export async function POST(request: Request, { params }: { params: Promise<{ month: string }> }) {
  try {
    await assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    if (!isAdminEmail(user.email))
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
    const { month } = await params;
    const settlement = await closeBillingMonth(month);
    return NextResponse.json({ id: settlement.id, status: settlement.status });
  } catch (error) {
    return apiError(error, "月締め処理に失敗しました");
  }
}
