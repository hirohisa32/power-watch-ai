import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listActiveSystemVideoAssets } from "@/lib/system-media/repository";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  const items = await listActiveSystemVideoAssets();
  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      key: item.key,
      type: item.type,
      brand: item.brand,
      displayName: item.displayName,
      durationMs: item.durationMs,
      width: item.width,
      height: item.height,
      fps: item.fps,
      previewUrl: `/api/system-video-assets/${item.id}/video`,
    })),
  });
}
