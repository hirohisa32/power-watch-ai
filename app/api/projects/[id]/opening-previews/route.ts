import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/security";

export async function POST(request: Request) {
  await assertSameOrigin(request);
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  return NextResponse.json(
    { error: "Openingは固定System Assetです。再生成と時計差し替えは無効です" },
    { status: 410 },
  );
}
