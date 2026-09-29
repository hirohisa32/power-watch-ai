import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    { error: "Openingは固定System Assetです。時計差し替えJobは無効です" },
    { status: 410 },
  );
}
