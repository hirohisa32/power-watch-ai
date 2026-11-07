export type ProjectWorkflowInput = {
  hasStoryboard: boolean;
  hasAnySceneGeneration: boolean;
  totalScenes: number;
  completedScenes: number;
  hasActiveSceneGeneration: boolean;
  hasActiveRender: boolean;
  hasCompletedRender: boolean;
};

export type ProjectWorkflow = {
  currentStep: 1 | 2 | 3 | 4 | 5 | 6;
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
  if (input.hasCompletedRender) return { currentStep: 6, action: "view_final" };
  if (input.hasActiveRender) return { currentStep: 5, action: "wait_for_render" };
  if (!input.hasStoryboard) return { currentStep: 3, action: "create_storyboard" };
  if (!input.hasAnySceneGeneration) return { currentStep: 3, action: "review_storyboard" };
  if (input.hasActiveSceneGeneration) return { currentStep: 4, action: "wait_for_scenes" };
  if (input.totalScenes > 0 && input.completedScenes >= input.totalScenes)
    return { currentStep: 5, action: "render_final" };
  return { currentStep: 4, action: "generate_scenes" };
}
