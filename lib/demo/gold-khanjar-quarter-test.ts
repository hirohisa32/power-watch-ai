export const GOLD_KHANJAR_QUARTER_PREFIX = "projects/gold-khanjar-quarter-test/v1";
export const GOLD_KHANJAR_QUARTER_VOICE = "CeKhvpl894bEZDsRgdlL";
export const GOLD_KHANJAR_QUARTER_MODEL = "eleven_v4";
export const GOLD_KHANJAR_QUARTER_DURATION = 14.4;
export const GOLD_KHANJAR_QUARTER_SCRIPT =
  "1970年代、オマーンは新しい時代を迎えていました。特別な時計の製作を託されたのは、英国の名門アスプレイでした。";

export const GOLD_KHANJAR_QUARTER_SCENES = {
  "01-oman-entry": {
    image: "01-story-entry-oman.png",
    prompt:
      "A restrained premium editorial illustration comes alive: 1970s Oman at warm dusk, archival coastal architecture and distant mountains. Slow forward camera drift, subtle cloth and dust motion, mature cinematic illustrated animation, elegant linework, controlled painterly shading, luxury documentary tone. No photorealism, cheap anime, cartoon, fantasy, text, logo, modern object, watch or speaking person.",
  },
  "02-char-01-letter": {
    image: "02-qaboos-letter.png",
    prompt:
      "Preserve the exact same dignified Omani man from the reference as CHAR_01: same face, age, beard, turban, clothing, build, palette and warm lighting. Silent acting only. His closed mouth never moves; he lowers only his eyes toward the sealed letter with one natural blink and subtle breathing. Hands remain still. Slow camera push and gentle dust in lamp light. Premium cinematic editorial illustration, mature luxury documentary animation. No morphing, lip sync, photorealism, extra people, text, logo or watch.",
  },
  "03-uk-asprey": {
    image: "03-oman-uk.png",
    prompt:
      "Preserve CHAR_01 exactly and preserve the British jeweller from the reference. Silent period diplomacy in an illustrated 1970s interior. One action only: the sealed letter slides a few centimeters across the table toward the British jeweller while both men watch with closed mouths. Subtle lateral camera drift and warm lamp movement. Premium cinematic editorial illustration, sophisticated painterly shading, coherent luxury documentary style. No morphing, lip sync, extra people, readable text, logos, watches or modern objects.",
  },
} as const;

export type GoldKhanjarQuarterSceneId = keyof typeof GOLD_KHANJAR_QUARTER_SCENES;
