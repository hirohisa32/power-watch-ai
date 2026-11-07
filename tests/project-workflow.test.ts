import { describe, expect, it } from "vitest";
import { projectWorkflow } from "@/lib/ui/project-workflow";

const base = {
  hasStoryboard: true,
  hasAnySceneGeneration: false,
  totalScenes: 6,
  completedScenes: 0,
  hasActiveSceneGeneration: false,
  hasActiveRender: false,
  hasCompletedRender: false,
};

describe("project workflow guidance", () => {
  it("guides a new project to create its storyboard", () => {
    expect(projectWorkflow({ ...base, hasStoryboard: false })).toMatchObject({
      currentStep: 3,
      phase: "DRAFT",
      action: "create_storyboard",
    });
  });

  it("asks the user to review a fresh storyboard", () => {
    expect(projectWorkflow(base)).toMatchObject({
      currentStep: 3,
      phase: "STORYBOARD_READY",
      action: "review_storyboard",
    });
  });

  it("restores active scene generation from persisted status", () => {
    expect(
      projectWorkflow({ ...base, hasAnySceneGeneration: true, hasActiveSceneGeneration: true }),
    ).toMatchObject({
      currentStep: 4,
      phase: "SCENES_GENERATING",
      action: "wait_for_scenes",
    });
  });

  it("offers final rendering only after all body scenes are complete", () => {
    expect(
      projectWorkflow({ ...base, hasAnySceneGeneration: true, completedScenes: 6 }),
    ).toMatchObject({ currentStep: 5, phase: "SCENES_READY", action: "render_final" });
  });

  it("shows final rendering without any completed state", () => {
    expect(projectWorkflow({ ...base, hasActiveRender: true })).toMatchObject({
      currentStep: 5,
      phase: "FINAL_RENDERING",
      label: "最終動画を作成中",
      action: "wait_for_render",
    });
  });

  it("makes the completed video the final action", () => {
    expect(projectWorkflow({ ...base, hasCompletedRender: true })).toMatchObject({
      currentStep: 6,
      phase: "COMPLETED",
      progress: 100,
      action: "view_final",
    });
  });

  it("ignores stale active jobs once a final render is completed", () => {
    expect(
      projectWorkflow({
        ...base,
        hasAnySceneGeneration: true,
        hasActiveSceneGeneration: true,
        hasActiveRender: true,
        hasCompletedRender: true,
      }),
    ).toMatchObject({
      currentStep: 6,
      phase: "COMPLETED",
      label: "完成",
      progress: 100,
      action: "view_final",
    });
  });
});
