export type AssetScopeSnapshot = {
  projectId: string;
  sceneId: string;
  storyBeatId?: string | null;
  historicalPeriod?: string | null;
  location?: string | null;
  characterId?: string | null;
  visualIntent?: string | null;
  generationPrompt?: string | null;
  keyframePrompt?: string | null;
};

export type SceneScope = {
  projectId: string;
  sceneId: string;
  narrationSegmentId?: string | null;
  historicalPeriod?: string | null;
  location?: string | null;
  characterId?: string | null;
  visualIntent?: string | null;
};

const MIDDLE_EAST_MARKERS =
  /\boman(?:i)?\b|オマーン|カンジャル|khanjar|arab(?:ic|ian)?\s+(?:dress|clothing|man)|disha?dasha|bisht|turban|desert|砂漠/iu;

const NEGATIVE_INSTRUCTION_MARKERS =
  /\b(?:do not|don't|never|without|exclude|excluded|prohibit(?:ed)?)\b|禁止|含めない|一切含めない|除外/iu;

function positivePromptClauses(prompt: string) {
  return prompt
    .split(/[。.!\n]+/u)
    .filter((clause) => !NEGATIVE_INSTRUCTION_MARKERS.test(clause))
    .join(" ");
}

export function assertProjectAssetIsolation(
  project: { id: string; title: string; script: string },
  scene: SceneScope,
  asset: AssetScopeSnapshot,
) {
  const failures: string[] = [];
  if (asset.projectId !== project.id || asset.projectId !== scene.projectId)
    failures.push("Project Scopeが一致しません");
  if (asset.sceneId !== scene.sceneId) failures.push("Scene Scopeが一致しません");
  const semanticPairs: Array<[string, string | null | undefined, string | null | undefined]> = [
    ["Story Beat", asset.storyBeatId, scene.narrationSegmentId],
    ["Historical Period", asset.historicalPeriod, scene.historicalPeriod],
    ["Location", asset.location, scene.location],
    ["Character", asset.characterId, scene.characterId],
    ["Visual Intent", asset.visualIntent, scene.visualIntent],
  ];
  for (const [label, actual, expected] of semanticPairs) {
    if (actual != null && expected != null && actual.trim() !== expected.trim())
      failures.push(`${label}が現在のSceneと一致しません`);
  }
  const story = `${project.title} ${project.script}`;
  const prompt = `${asset.generationPrompt ?? ""} ${asset.keyframePrompt ?? ""}`;
  if (!MIDDLE_EAST_MARKERS.test(story) && MIDDLE_EAST_MARKERS.test(positivePromptClauses(prompt)))
    failures.push("Story外のMiddle East / Oman系Visual指定を検出しました");
  if (failures.length) throw new Error(`PROJECT_ASSET_ISOLATION: ${failures.join(" / ")}`);
  return {
    storyBeatId: scene.narrationSegmentId ?? null,
    narration: `${scene.visualIntent ?? ""}`,
    asset: `${scene.historicalPeriod ?? "時代指定なし"} / ${scene.location ?? "場所指定なし"} / ${scene.characterId ?? "人物固定なし"}`,
    status: "pass" as const,
  };
}
