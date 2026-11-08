import { isFixedOpeningPreset } from "@/lib/opening/policy";

export type ProjectWorkflowInput = {
  hasStoryboard: boolean;
  hasAnySceneGeneration: boolean;
  totalScenes: number;
  completedScenes: number;
  hasActiveSceneGeneration: boolean;
  hasActiveRender: boolean;
  hasCompletedRender: boolean;
};

export type ProjectWorkflowSource = {
  hasStoryboard: boolean;
  scenes: Array<{
    id: string;
    preset: string;
    selectedGenerationId: string | null;
  }>;
  generations: Array<{
    id: string;
    sceneId: string;
    status: "queued" | "generating" | "completed" | "failed" | "canceled";
  }>;
  renders: Array<{
    status: "queued" | "rendering" | "completed" | "failed";
  }>;
};

export type ProjectWorkflow = {
  currentStep: 1 | 2 | 3 | 4 | 5 | 6;
  phase:
    | "DRAFT"
    | "STORYBOARD_READY"
    | "SCENES_GENERATING"
    | "SCENES_READY"
    | "FINAL_RENDERING"
    | "COMPLETED";
  label: string;
  progress: number;
  description: string;
  action:
    | "create_storyboard"
    | "review_storyboard"
    | "generate_scenes"
    | "wait_for_scenes"
    | "render_final"
    | "wait_for_render"
    | "view_final";
};

export function projectWorkflow(input: ProjectWorkflowInput): ProjectWorkflow {
  if (input.hasCompletedRender)
    return {
      currentStep: 6,
      phase: "COMPLETED",
      label: "完成",
      progress: 100,
      description: "完成動画を確認・ダウンロードできます。",
      action: "view_final",
    };
  if (input.hasActiveRender)
    return {
      currentStep: 5,
      phase: "FINAL_RENDERING",
      label: "最終動画を作成中",
      progress: 90,
      description: "音声・字幕・映像を結合しています。",
      action: "wait_for_render",
    };
  if (!input.hasStoryboard)
    return {
      currentStep: 3,
      phase: "DRAFT",
      label: "動画構成の準備前",
      progress: 20,
      description: "台本と時計画像を確認し、動画構成を作成してください。",
      action: "create_storyboard",
    };
  if (!input.hasAnySceneGeneration)
    return {
      currentStep: 3,
      phase: "STORYBOARD_READY",
      label: "動画構成を確認中",
      progress: 40,
      description: "動画構成を確認し、シーン作成へ進めます。",
      action: "review_storyboard",
    };
  const sceneProgress = input.totalScenes
    ? Math.min(79, 45 + Math.round((input.completedScenes / input.totalScenes) * 34))
    : 45;
  if (input.hasActiveSceneGeneration)
    return {
      currentStep: 4,
      phase: "SCENES_GENERATING",
      label: "シーン生成中",
      progress: sceneProgress,
      description: `${input.completedScenes} / ${input.totalScenes} シーンが完成しています。`,
      action: "wait_for_scenes",
    };
  if (input.totalScenes > 0 && input.completedScenes >= input.totalScenes)
    return {
      currentStep: 5,
      phase: "SCENES_READY",
      label: "シーン生成完了",
      progress: 80,
      description: "全シーンを確認し、最終動画を作成できます。",
      action: "render_final",
    };
  return {
    currentStep: 4,
    phase: "STORYBOARD_READY",
    label: "シーン作成待ち",
    progress: sceneProgress,
    description: `${input.completedScenes} / ${input.totalScenes} シーンが完成しています。`,
    action: "generate_scenes",
  };
}

/**
 * Project status shown to users. Completed renders always win over stale jobs.
 * Every project screen must use this resolver rather than projects.status or a latest job directly.
 */
export function getProjectWorkflowStatus(source: ProjectWorkflowSource): ProjectWorkflow {
  const bodyScenes = source.scenes.filter((scene) => !isFixedOpeningPreset(scene.preset));
  const bodySceneIds = new Set(bodyScenes.map((scene) => scene.id));
  const bodyGenerations = source.generations.filter((generation) =>
    bodySceneIds.has(generation.sceneId),
  );
  const completedGenerationIds = new Set(
    bodyGenerations
      .filter((generation) => generation.status === "completed")
      .map((generation) => generation.id),
  );
  const completedScenes = bodyScenes.filter(
    (scene) => scene.selectedGenerationId && completedGenerationIds.has(scene.selectedGenerationId),
  ).length;

  return projectWorkflow({
    hasStoryboard: source.hasStoryboard,
    hasAnySceneGeneration: bodyGenerations.length > 0,
    totalScenes: bodyScenes.length,
    completedScenes,
    hasActiveSceneGeneration: bodyGenerations.some((generation) =>
      ["queued", "generating"].includes(generation.status),
    ),
    hasActiveRender: source.renders.some((render) =>
      ["queued", "rendering"].includes(render.status),
    ),
    hasCompletedRender: source.renders.some((render) => render.status === "completed"),
  });
}

export function workflowStatusClass(workflow: ProjectWorkflow) {
  if (workflow.phase === "COMPLETED") return "completed";
  if (workflow.phase === "DRAFT") return "draft";
  if (workflow.phase === "STORYBOARD_READY") return "storyboard";
  return "generating";
}

export function workflowIsProcessing(workflow: ProjectWorkflow) {
  return workflow.phase === "SCENES_GENERATING" || workflow.phase === "FINAL_RENDERING";
}

export function projectCardPrimaryAction(projectId: string, workflow: ProjectWorkflow) {
  const base = `/projects/${projectId}`;

  switch (workflow.action) {
    case "view_final":
      return {
        label: "完成動画を見る",
        href: `${base}/storyboard?section=completed#completed-video`,
      } as const;
    case "review_storyboard":
      return { label: "続きから作る", href: `${base}/storyboard` } as const;
    case "generate_scenes":
    case "wait_for_scenes":
      return { label: "続きから作る", href: `${base}/storyboard#generate-scenes` } as const;
    case "render_final":
    case "wait_for_render":
      return { label: "続きから作る", href: `${base}/storyboard#final-render` } as const;
    case "create_storyboard":
    default:
      // Storyboard generation stays an explicit action on the project detail page.
      return { label: "続きから作る", href: base } as const;
  }
}
