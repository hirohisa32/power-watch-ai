export function buildAudioRecord(input: {
  projectId: string;
  storyboardId: string;
  provider: string;
  model: string;
  voiceId: string;
  language: "ja" | "en" | "zh";
  script: string;
}) {
  return {
    ...input,
    characterCount: [...input.script].length,
  };
}
