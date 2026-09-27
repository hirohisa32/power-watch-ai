import type { StoryboardDirector } from "@/lib/storyboard/director";
import type { StoryboardPersistence } from "@/lib/storyboard/repository";
import { buildStoryboardPrompt } from "@/lib/storyboard/prompt";
import { validateStoryboard } from "@/lib/storyboard/schema";

export type GenerateStoryboardInput = {
  projectId: string;
  script: string;
  style: "cinematic_real" | "animation";
  language: "ja" | "en" | "zh";
  targetDuration: 60 | 90;
  assetLabels: string[];
};

export async function generateAndSaveStoryboard(
  input: GenerateStoryboardInput,
  director: StoryboardDirector,
  persistence: StoryboardPersistence,
) {
  const prompt = buildStoryboardPrompt(input);
  const generated = await director.generate(prompt);
  let storyboard;
  try {
    storyboard = validateStoryboard(generated.storyboard, input.targetDuration, input.assetLabels);
  } catch (error) {
    await persistence.recordUsage({
      projectId: input.projectId,
      operation: "storyboard_generation_failed",
      usage: generated.usage,
    });
    throw error;
  }
  const saved = await persistence.replace({
    projectId: input.projectId,
    storyboard,
    usage: generated.usage,
  });
  return { ...saved, totalDuration: input.targetDuration, sceneCount: storyboard.scenes.length };
}
