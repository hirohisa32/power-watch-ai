import { describe, expect, it } from "vitest";
import manifest from "@/system-assets/bgm/library.json";
import { rankBgm, selectBgm } from "@/lib/bgm/selection";

const catalog = manifest.map((item, index) => ({
  id: String(index),
  key: item.key,
  name: item.name,
  filePath: `system-assets/bgm/${item.fileName}`,
  durationMs: item.durationMs,
  genre: item.genre,
  mood: item.mood,
  tags: item.tags,
  suitableStyles: item.suitableStyles,
  active: true,
}));

const goldKhanjar = {
  script: "1970年代のオマーン。国王と英国の関係、国家の贈答品、希少なゴールド・カンジャルを刻んだ高級時計の歴史。",
  style: "cinematic_real" as const,
  targetDuration: 60,
  storyProfile: "historical luxury documentary",
};

describe("approved BGM selection", () => {
  it("ranks historical luxury tracks for Gold Khanjar", () => {
    const top = rankBgm(catalog, goldKhanjar).slice(0, 3).map((item) => item.key);
    expect(top).toContain("royal-fairy-tale-opening");
    expect(top).toContain("journey-begins-cinematic");
  });

  it("always prioritizes a valid Human selection", () => {
    expect(selectBgm(catalog, { ...goldKhanjar, manualKey: "night-patrol" })).toMatchObject({
      key: "night-patrol",
      reasons: ["Human指定"],
    });
  });

  it("never selects an inactive track", () => {
    const inactive = catalog.map((item) => item.key === "royal-fairy-tale-opening" ? { ...item, active: false } : item);
    expect(rankBgm(inactive, goldKhanjar)[0].key).not.toBe("royal-fairy-tale-opening");
  });
});
