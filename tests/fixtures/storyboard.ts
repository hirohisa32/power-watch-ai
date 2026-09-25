import type { StoryboardOutput } from "@/lib/storyboard/schema";

export function storyboardFixture(target: 60 | 90): StoryboardOutput {
  const sceneCount = target === 60 ? 12 : 18;
  return {
    scenes: Array.from({ length: sceneCount }, (_, index) => ({
      sceneNumber: index + 1,
      preset:
        index === 0
          ? "Opening"
          : index === sceneCount - 1
            ? "Ending"
            : index === sceneCount - 2
              ? "ProductHero"
              : "HistoricalEvent",
      title: `Scene ${index + 1}`,
      duration: 5,
      narration: `Narration for scene ${index + 1}`,
      subtitle: `Subtitle ${index + 1}`,
      visualDescription: "A production-ready cinematic watch story scene.",
      visualPrompt:
        "Cinematic historical scene, premium editorial composition, 50mm lens feel, low-key lighting, restrained camera motion, rich charcoal color grade",
      camera: "Slow controlled push-in",
      shotType: "Medium cinematic shot",
      lighting: "Low-key directional light",
      motion: "Restrained natural movement",
      colorMood: "Charcoal and warm neutral",
      transition: "Soft cinematic dissolve",
      watchReference: index === sceneCount - 2,
      preferredAssetLabels: [],
      year: null,
      location: null,
    })),
  };
}
