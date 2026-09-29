import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listActiveBgm } from "@/lib/bgm/repository";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  const items = await listActiveBgm();
  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      key: item.key,
      name: item.name,
      durationMs: item.durationMs,
      genre: item.genre,
      mood: item.mood,
      tags: item.tags,
      suitableStyles: item.suitableStyles,
    })),
  });
}
