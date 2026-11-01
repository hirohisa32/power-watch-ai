import { describe, expect, it } from "vitest";
import {
  buildAlignedSubtitleCues,
  buildDurationFallbackAlignment,
  sceneSpeechWindows,
} from "@/lib/audio/timing";
import { evaluateVisualRelevance } from "@/lib/storyboard/visual-relevance";
import {
  inferProductPhotoRole,
  planProductPhotoUsage,
} from "@/lib/storyboard/product-photo-planner";
import { buildFinalRenderInput } from "@/lib/render/plan";

describe("Story Beat production standard", () => {
  it("音声Alignmentの75ms前から字幕を出し発話終了で消す", () => {
    const scenes = [
      {
        id: "scene-1",
        narrationSegmentId: "segment-01",
        duration: 4,
        narration: "英国の名門アスプレイでした。",
        subtitle: "英国の名門アスプレイ。",
      },
    ];
    const alignment = buildDurationFallbackAlignment(scenes[0].narration, 2400);
    alignment.characterStartTimesSeconds = alignment.characterStartTimesSeconds.map(
      (value) => value + 0.2,
    );
    alignment.characterEndTimesSeconds = alignment.characterEndTimesSeconds.map(
      (value) => value + 0.2,
    );
    const cues = buildAlignedSubtitleCues(scenes, alignment);
    const windows = sceneSpeechWindows(scenes, alignment);
    expect(cues[0].narrationSegmentId).toBe("segment-01");
    expect(cues[0].startMs - windows[0].speechStartMs).toBe(-75);
    expect(cues.at(-1)?.endMs).toBe(windows[0].speechEndMs);
  });

  it("Visual Relevanceを100点換算しNGを分離する", () => {
    const pass = evaluateVisualRelevance({
      narration: "フランス市場向けの18金ケースに鷲の刻印が残ります。",
      visualIntent: "フランス市場向け18金ケースの鷲の刻印を見せる",
      visualSubject: "実時計ケースの鷲刻印",
      historicalPeriod: null,
      location: "フランス",
      characterId: null,
      watchReference: true,
      productPhotoRole: "engraving",
      visualType: "product_photo",
    });
    const ng = evaluateVisualRelevance({
      narration: "フランス市場向けの18金ケース。",
      visualIntent: "砂漠を走る現代の車",
      visualSubject: "自動車",
      historicalPeriod: "1930年代",
      location: "東京",
      characterId: "CHAR_99",
      watchReference: false,
      productPhotoRole: null,
      visualType: "story",
    });
    expect(pass.status).toBe("pass");
    expect(pass.score).toBeGreaterThanOrEqual(85);
    expect(ng.status).toBe("ng");
    expect(ng.score).toBeLessThan(70);
  });

  it("時計史とムーブメントを技術系譜の同一Story Beatとして評価する", () => {
    const result = evaluateVisualRelevance({
      narration: "名機478とフレンチケースには、フランスとスイスを結ぶ時計史が息づきます。",
      visualIntent: "実物のムーブメント写真を静かに見せ、技術の系譜へ視線を戻す。",
      visualSubject: "機械に刻まれた系譜",
      historicalPeriod: null,
      location: null,
      characterId: null,
      watchReference: true,
      productPhotoRole: "movement",
      visualType: "product_photo",
    });
    expect(result.status).toBe("pass");
  });

  it("商品写真をNarrationの意味で選び同じ写真を連続させない", () => {
    const planned = planProductPhotoUsage(
      [
        {
          watchReference: true,
          preferredAssetLabels: [],
          narration: "文字盤を見る",
          visualIntent: "文字盤",
          visualSubject: "Dial",
        },
        {
          watchReference: true,
          preferredAssetLabels: [],
          narration: "ムーブメントを見る",
          visualIntent: "機械構造",
          visualSubject: "Movement",
        },
        {
          watchReference: true,
          preferredAssetLabels: [],
          narration: "裏蓋の刻印",
          visualIntent: "刻印",
          visualSubject: "Caseback",
        },
      ],
      ["正面Dial", "Movement", "Caseback刻印"],
    );
    expect(inferProductPhotoRole("正面Dial")).toBe("dial");
    expect(planned.map((scene) => scene.productPhotoRole)).toEqual([
      "dial",
      "movement",
      "caseback",
    ]);
    expect(new Set(planned.map((scene) => scene.preferredAssetLabels[0])).size).toBe(3);
  });

  it("刻印には裏蓋、ケースには側面を代替候補として優先する", () => {
    const planned = planProductPhotoUsage(
      [
        {
          watchReference: true,
          preferredAssetLabels: [],
          narration: "ケースにはメーカーズマークの刻印が残ります。",
          visualIntent: "刻印を見せる",
          visualSubject: "ケース刻印",
        },
        {
          watchReference: true,
          preferredAssetLabels: [],
          narration: "18金無垢のケースです。",
          visualIntent: "ケースを見せる",
          visualSubject: "ケース",
        },
      ],
      ["正面", "側面", "裏蓋"],
    );
    expect(planned[0].preferredAssetLabels[0]).toBe("裏蓋");
    expect(planned[1].preferredAssetLabels[0]).toBe("側面");
  });

  it("Endingの推奨区間だけをFinal尺へ算入する", () => {
    const plan = buildFinalRenderInput({
      language: "ja",
      bgmKey: "approved",
      totalSceneCount: 1,
      scenes: [
        {
          sceneId: "s1",
          generationId: "g1",
          order: 1,
          preset: "HistoricalEvent",
          duration: 4,
          narration: "物語です。",
          subtitle: "物語です。",
          year: null,
          location: null,
          objectKey: "scene.mp4",
        },
      ],
      endingAsset: {
        id: "end",
        key: "end",
        storagePath: "ending.mp4",
        duration: 5,
        recommendedStart: 0,
        recommendedEnd: 3.5,
        recommendedDuration: 3.5,
        width: 1080,
        height: 1920,
        fps: 30,
        hasAudio: true,
      },
    });
    expect(plan.totalDuration).toBe(7.5);
  });
});
