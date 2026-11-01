import { describe, expect, it } from "vitest";
import { assertProjectAssetIsolation } from "@/lib/render/asset-isolation";

const project = {
  id: "project-jaeger",
  title: "Jaeger-LeCoultre 478",
  script: "France and Swiss watchmaking",
};
const scene = {
  projectId: project.id,
  sceneId: "scene-9",
  narrationSegmentId: "segment-09",
  historicalPeriod: "16th century",
  location: "France to Geneva",
  characterId: null,
  visualIntent: "French Huguenot watchmakers moving toward Geneva",
};

describe("Project Asset Isolation", () => {
  it("同一Project / Scene / Story BeatのAssetだけを許可する", () => {
    expect(
      assertProjectAssetIsolation(project, scene, {
        projectId: project.id,
        sceneId: scene.sceneId,
        storyBeatId: scene.narrationSegmentId,
        historicalPeriod: scene.historicalPeriod,
        location: scene.location,
        characterId: scene.characterId,
        visualIntent: scene.visualIntent,
        keyframePrompt: "France to Geneva, historical watchmakers",
      }).status,
    ).toBe("pass");
  });

  it("別ProjectまたはOman人物PromptをFinal採用前に拒否する", () => {
    expect(() =>
      assertProjectAssetIsolation(project, scene, {
        projectId: project.id,
        sceneId: scene.sceneId,
        storyBeatId: scene.narrationSegmentId,
        keyframePrompt: "same Omani man in turban crossing a desert",
      }),
    ).toThrow(/PROJECT_ASSET_ISOLATION.*Middle East/);
  });
});
