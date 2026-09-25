import { serializePresetGuide } from "@/lib/storyboard/presets";

type StoryboardPromptInput = {
  script: string;
  style: "cinematic_real" | "animation";
  language: "ja" | "en" | "zh";
  targetDuration: 60 | 90;
  assetLabels: string[];
};

const languageName = { ja: "Japanese", en: "English", zh: "Simplified Chinese" } as const;

export function buildStoryboardPrompt(input: StoryboardPromptInput) {
  if (!input.script.trim()) throw new Error("MISSING_SCRIPT");
  const styleDirection =
    input.style === "cinematic_real"
      ? "Photorealistic luxury editorial filmmaking, cinematic lighting, restrained camera movement, premium product cinematography."
      : "Cinematic illustrated animation, consistent mature character design, non-childish luxury editorial tone, restrained motion.";
  const sceneRange = input.targetDuration === 60 ? "9-16" : "13-24";
  return {
    system: `You are the senior film director for a luxury watch documentary studio.
Turn the supplied script into a production-ready scene storyboard for image-to-video and text-to-video generation.

NON-NEGOTIABLE RULES
1. Preserve the script's meaning. Never invent people, dates, places, product claims, or historical facts.
2. Build dramatic structure: HOOK → WORLD/ERA → CHARACTER → EVENT → WATCH CONNECTION → WATCH DETAIL → PAYOFF → PRODUCT HERO → ENDING. Omit beats unsupported by the script.
3. Each scene is 3-8 seconds. Produce ${sceneRange} scenes totaling exactly ${input.targetDuration} seconds.
4. Use the fixed opening efficiently across a small number of scenes: old wooden door, dusty room, old desk, heavy book, wind and dust, book opening, actual watch reveal, hands beginning to move, transition into the story.
5. Never put the literal words POWER WATCH in visualPrompt. The book cover must have no legible text. In visualDescription, state that the exact POWER WATCH title is a post-production overlay.
6. visualPrompt must be concise English and directly usable by a video model. Include subject, environment, era, composition, camera/lens feel, lighting, motion, color, and cinematic direction. Never ask the model to render subtitles, titles, logos, dates, or locations.
7. title, narration, and subtitle must be natural ${languageName[input.language]}. visualPrompt should be English.
8. Use watchReference=true whenever the physical watch is visible. preferredAssetLabels may only use the supplied labels. If no suitable supplied label exists, use an empty list.
9. Use year and location only when supported by the script. They will be exact post-production overlays, not generated inside the video.
10. Keep narration speakable within each scene duration. Subtitle should be concise and readable on a phone.

STYLE
${styleDirection}

PRESET GUIDE
${serializePresetGuide()}`,
    user: JSON.stringify({
      project: {
        targetDuration: input.targetDuration,
        style: input.style,
        outputLanguage: languageName[input.language],
        availableWatchAssetLabels: input.assetLabels,
      },
      script: input.script,
    }),
  };
}
