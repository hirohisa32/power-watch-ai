import { describe, expect, it } from "vitest";
import {
  getProjectWorkflowStatus,
  projectCardPrimaryAction,
  projectWorkflow,
} from "@/lib/ui/project-workflow";

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

describe("project card primary action", () => {
  it.each([
    ["create_storyboard", "/projects/project-1"],
    ["review_storyboard", "/projects/project-1/storyboard"],
    ["generate_scenes", "/projects/project-1/storyboard#generate-scenes"],
    ["wait_for_scenes", "/projects/project-1/storyboard#generate-scenes"],
    ["render_final", "/projects/project-1/storyboard#final-render"],
    ["wait_for_render", "/projects/project-1/storyboard#final-render"],
  ] as const)("maps %s to the next production step", (action, href) => {
    const workflow = { ...projectWorkflow(base), action };
    expect(projectCardPrimaryAction("project-1", workflow)).toEqual({
      label: "続きから作る",
      href,
    });
  });

  it("opens the completed video when the final render exists", () => {
    const workflow = projectWorkflow({ ...base, hasCompletedRender: true });
    expect(projectCardPrimaryAction("project-1", workflow)).toEqual({
      label: "完成動画を見る",
      href: "/projects/project-1/storyboard?section=completed#completed-video",
    });
  });
});

describe("shared project workflow status", () => {
  const scene = {
    id: "scene-1",
    preset: "HistoricalCharacter",
    selectedGenerationId: null as string | null,
  };
  const generation = {
    id: "generation-1",
    sceneId: scene.id,
    status: "completed" as const,
  };

  it.each([
    {
      name: "A. Draft",
      source: { hasStoryboard: false, scenes: [], generations: [], renders: [] },
      phase: "DRAFT",
    },
    {
      name: "B. Storyboard作成済み",
      source: { hasStoryboard: true, scenes: [scene], generations: [], renders: [] },
      phase: "STORYBOARD_READY",
    },
    {
      name: "C. Scene生成中",
      source: {
        hasStoryboard: true,
        scenes: [scene],
        generations: [{ ...generation, status: "generating" as const }],
        renders: [],
      },
      phase: "SCENES_GENERATING",
    },
    {
      name: "D. Scene完成",
      source: {
        hasStoryboard: true,
        scenes: [{ ...scene, selectedGenerationId: generation.id }],
        generations: [generation],
        renders: [],
      },
      phase: "SCENES_READY",
    },
    {
      name: "E. Final Render中",
      source: {
        hasStoryboard: true,
        scenes: [{ ...scene, selectedGenerationId: generation.id }],
        generations: [generation],
        renders: [{ status: "rendering" as const }],
      },
      phase: "FINAL_RENDERING",
    },
    {
      name: "F. Final完成",
      source: {
        hasStoryboard: true,
        scenes: [{ ...scene, selectedGenerationId: generation.id }],
        generations: [generation],
        renders: [{ status: "completed" as const }],
      },
      phase: "COMPLETED",
    },
    {
      name: "G. Final完成＋過去Stale Jobあり",
      source: {
        hasStoryboard: true,
        scenes: [{ ...scene, selectedGenerationId: generation.id }],
        generations: [{ ...generation, status: "generating" as const }],
        renders: [{ status: "completed" as const }, { status: "rendering" as const }],
      },
      phase: "COMPLETED",
    },
  ])("resolves $name as $phase", ({ source, phase }) => {
    expect(getProjectWorkflowStatus(source)).toMatchObject({ phase });
  });

  it("ignores fixed opening scenes when calculating scene progress", () => {
    expect(
      getProjectWorkflowStatus({
        hasStoryboard: true,
        scenes: [
          { id: "opening", preset: "Opening", selectedGenerationId: null },
          { ...scene, selectedGenerationId: generation.id },
        ],
        generations: [
          generation,
          { id: "opening-generation", sceneId: "opening", status: "generating" },
        ],
        renders: [],
      }),
    ).toMatchObject({ phase: "SCENES_READY", progress: 80 });
  });
});
