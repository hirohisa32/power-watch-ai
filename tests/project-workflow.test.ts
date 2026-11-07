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
    expect(projectWorkflow({ ...base, hasStoryboard: false })).toEqual({
      currentStep: 3,
      action: "create_storyboard",
    });
  });

  it("asks the user to review a fresh storyboard", () => {
    expect(projectWorkflow(base)).toEqual({ currentStep: 3, action: "review_storyboard" });
  });

  it("restores active scene generation from persisted status", () => {
    expect(
      projectWorkflow({ ...base, hasAnySceneGeneration: true, hasActiveSceneGeneration: true }),
    ).toEqual({ currentStep: 4, action: "wait_for_scenes" });
  });

  it("offers final rendering only after all body scenes are complete", () => {
    expect(projectWorkflow({ ...base, hasAnySceneGeneration: true, completedScenes: 6 })).toEqual({
      currentStep: 5,
      action: "render_final",
    });
  });

  it("makes the completed video the final action", () => {
    expect(projectWorkflow({ ...base, hasCompletedRender: true })).toEqual({
      currentStep: 6,
      action: "view_final",
    });
  });
});
