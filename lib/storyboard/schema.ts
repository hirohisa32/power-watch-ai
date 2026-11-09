import { z } from "zod";
import { PRESET_NAMES } from "@/lib/storyboard/presets";
import { sceneDurationRule } from "@/lib/storyboard/styles/epoca-story";
import { evaluateVisualRelevance } from "@/lib/storyboard/visual-relevance";
import { planProductPhotoUsage, PRODUCT_PHOTO_ROLES } from "@/lib/storyboard/product-photo-planner";
import { STORY_PHASES } from "@/lib/storyboard/story-quality";

export const storyboardSceneSchema = z
  .object({
    sceneNumber: z.number().int().min(1).max(30),
    preset: z.enum(PRESET_NAMES),
    title: z.string().trim().min(1).max(120),
    // Backward-compatible default for persisted/fixture storyboards created before the
    // six-phase Reel structure. New Production prompts always provide an explicit phase.
    storyPhase: z.enum(STORY_PHASES).default("context"),
    duration: z.number().int().min(3).max(8),
    narration: z.string().trim().min(1).max(1200),
    narrationSegmentId: z.string().trim().min(1).max(80),
    narrationTone: z.string().trim().min(1).max(40),
    dialogue: z
      .array(
        z.object({
          speaker: z.string().trim().min(1).max(80),
          text: z.string().trim().min(1).max(600),
          tone: z.string().trim().min(1).max(40),
        }),
      )
      .max(12),
    subtitle: z.string().trim().min(1).max(500),
    visualIntent: z.string().trim().min(5).max(1000),
    visualSubject: z.string().trim().min(2).max(300),
    historicalPeriod: z.string().trim().min(1).max(100).nullable(),
    characterId: z.string().trim().min(1).max(100).nullable(),
    productPhotoRole: z.enum(PRODUCT_PHOTO_ROLES).nullable(),
    visualType: z.enum(["story", "product_photo", "technical", "environment"]),
    visualDescription: z.string().trim().min(10).max(1000),
    visualPrompt: z.string().trim().min(30).max(1600),
    camera: z.string().trim().min(2).max(300),
    shotType: z.string().trim().min(2).max(200),
    lighting: z.string().trim().min(2).max(300),
    motion: z.string().trim().min(2).max(300),
    colorMood: z.string().trim().min(2).max(300),
    transition: z.string().trim().min(2).max(300),
    watchReference: z.boolean(),
    preferredAssetLabels: z.array(z.string().trim().min(1).max(50)).max(6),
    year: z.string().trim().min(1).max(20).nullable(),
    location: z.string().trim().min(1).max(100).nullable(),
  })
  .strict();

export const storyboardOutputSchema = z
  .object({ scenes: z.array(storyboardSceneSchema).min(8).max(30) })
  .strict();

export const editableSceneSchema = storyboardSceneSchema
  .omit({ sceneNumber: true })
  .partial({
    narrationSegmentId: true,
    visualIntent: true,
    visualSubject: true,
    historicalPeriod: true,
    characterId: true,
    productPhotoRole: true,
    storyPhase: true,
    visualType: true,
  })
  .strip();

export type StoryboardSceneInput = z.infer<typeof storyboardSceneSchema>;
export type StoryboardOutput = z.infer<typeof storyboardOutputSchema>;

export class StoryboardValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoryboardValidationError";
  }
}

const REQUIRED_WATCH_REFERENCE_PRESETS = new Set([
  "WatchReveal",
  "WristShot",
  "WatchMacro",
  "ProductHero",
]);

export function totalStoryboardDuration(storyboard: StoryboardOutput) {
  return storyboard.scenes.reduce((sum, scene) => sum + scene.duration, 0);
}

export function rebalanceStoryboardDuration(
  storyboard: StoryboardOutput,
  targetDuration: number,
): StoryboardOutput {
  const scenes = storyboard.scenes.map((scene, index) => {
    const rule = sceneDurationRule(scene.preset);
    return {
      ...scene,
      sceneNumber: index + 1,
      duration: Math.min(scene.watchReference ? 6 : rule.max, Math.max(rule.min, scene.duration)),
    };
  });
  let remaining = targetDuration - scenes.reduce((sum, scene) => sum + scene.duration, 0);
  for (const useStyleLimits of [true, false]) {
    const direction = Math.sign(remaining);
    while (remaining !== 0) {
      let changed = false;
      for (let index = scenes.length - 1; index >= 0 && remaining !== 0; index -= 1) {
        const rule = sceneDurationRule(scenes[index].preset);
        const min = useStyleLimits ? rule.min : 3;
        const max = scenes[index].watchReference ? 6 : useStyleLimits ? rule.max : 8;
        const next = scenes[index].duration + direction;
        if (next >= min && next <= max) {
          scenes[index] = { ...scenes[index], duration: next };
          remaining -= direction;
          changed = true;
        }
      }
      if (!changed) break;
    }
    if (remaining === 0) break;
  }
  if (remaining !== 0) throw new StoryboardValidationError("Scene数では目標尺へ調整できません");
  return { scenes };
}

const INTERNAL_NARRATION_PATTERN =
  /^(?:scene|shot|cut|preset|camera|visual|opening|ending|product\s*hero|シーン|カット|映像|画面|カメラ|演出|構図)\s*[:：#\-–—\d]*/iu;

export function validateNarrationContinuity(storyboard: StoryboardOutput) {
  let previous = "";
  for (const scene of storyboard.scenes) {
    const narration = scene.narration.replace(/\s+/g, " ").trim();
    if (INTERNAL_NARRATION_PATTERN.test(narration))
      throw new StoryboardValidationError("Narrationに内部Sceneラベルを含めることはできません");
    if (narration === scene.title.trim() || narration === scene.visualDescription.trim())
      throw new StoryboardValidationError("NarrationにScene説明をそのまま使用できません");
    const comparable = narration.toLocaleLowerCase().replace(/[\s。！？.!?]/g, "");
    if (comparable && comparable === previous)
      throw new StoryboardValidationError("同じNarrationが連続しています");
    previous = comparable;
  }
}

export function narrationOnlySubtitles(storyboard: StoryboardOutput): StoryboardOutput {
  return {
    scenes: storyboard.scenes.map((scene) => ({ ...scene, subtitle: scene.narration.trim() })),
  };
}

export function normalizeStoryboardReferences(
  storyboard: StoryboardOutput,
  availableAssetLabels: string[],
): StoryboardOutput {
  const labels = new Set(availableAssetLabels);
  const normalized = storyboard.scenes.map((scene) => {
    const watchReference =
      scene.watchReference || REQUIRED_WATCH_REFERENCE_PRESETS.has(scene.preset);
    if (!watchReference)
      return { ...scene, watchReference: false, preferredAssetLabels: [], productPhotoRole: null };

    const preferredAssetLabels = scene.preferredAssetLabels.filter((label) => labels.has(label));
    if (labels.size > 0 && preferredAssetLabels.length === 0)
      preferredAssetLabels.push(availableAssetLabels[0]);
    return { ...scene, watchReference: true, preferredAssetLabels };
  });
  return { scenes: planProductPhotoUsage(normalized, availableAssetLabels) };
}

export function validateStoryboard(
  value: unknown,
  targetDuration: number,
  availableAssetLabels: string[],
) {
  const parsed = storyboardOutputSchema.safeParse(value);
  if (!parsed.success) throw new StoryboardValidationError("Storyboardの形式が不正です");
  for (const [index, scene] of parsed.data.scenes.entries()) {
    if (scene.sceneNumber !== index + 1)
      throw new StoryboardValidationError("Scene番号が連続していません");
  }
  const storyboard = narrationOnlySubtitles(
    normalizeStoryboardReferences(
      rebalanceStoryboardDuration(parsed.data, targetDuration),
      availableAssetLabels,
    ),
  );
  if (
    !storyboard.scenes.some((scene) =>
      ["WatchReveal", "WatchMacro", "ProductHero"].includes(scene.preset),
    )
  )
    throw new StoryboardValidationError("時計を主役にしたSceneが必要です");
  const labels = new Set(availableAssetLabels);
  for (const scene of storyboard.scenes) {
    if (scene.preferredAssetLabels.some((label) => !labels.has(label)))
      throw new StoryboardValidationError("存在しない時計画像Labelが指定されています");
    if (!scene.watchReference && scene.preferredAssetLabels.length > 0)
      throw new StoryboardValidationError("Reference不要Sceneに時計画像が指定されています");
    if (scene.watchReference && labels.size > 0 && scene.preferredAssetLabels.length === 0)
      throw new StoryboardValidationError("時計SceneのReference画像が指定されていません");
    if (scene.watchReference && scene.duration > 6)
      throw new StoryboardValidationError("同一商品写真を6秒を超えて連続表示できません");
    if (REQUIRED_WATCH_REFERENCE_PRESETS.has(scene.preset) && !scene.watchReference)
      throw new StoryboardValidationError("時計を表示するPresetにはReference指定が必要です");
    if (/power\s*watch/i.test(scene.visualPrompt))
      throw new StoryboardValidationError("POWER WATCH文字は映像Promptへ含められません");
    const relevance = evaluateVisualRelevance(scene);
    if (relevance.status === "ng")
      throw new StoryboardValidationError(
        `Scene ${scene.sceneNumber}はNarrationとVisualの関連性が不足しています (${relevance.score}/100)`,
      );
  }
  validateNarrationContinuity(storyboard);
  if (totalStoryboardDuration(storyboard) !== targetDuration)
    throw new StoryboardValidationError("Scene合計時間が目標尺と一致しません");
  return storyboard;
}

export function validateSceneAssetLabels(
  scene: Pick<StoryboardSceneInput, "preset" | "watchReference" | "preferredAssetLabels">,
  availableAssetLabels: string[],
) {
  const labels = new Set(availableAssetLabels);
  if (scene.preferredAssetLabels.some((label) => !labels.has(label)))
    throw new StoryboardValidationError("存在しない時計画像Labelが指定されています");
  if (!scene.watchReference && scene.preferredAssetLabels.length > 0)
    throw new StoryboardValidationError("Reference不要Sceneに時計画像が指定されています");
  if (REQUIRED_WATCH_REFERENCE_PRESETS.has(scene.preset) && !scene.watchReference)
    throw new StoryboardValidationError("時計を表示するPresetにはReference指定が必要です");
}
