import {
  GOLD_KHANJAR_NARRATION,
  GOLD_KHANJAR_TITLE,
} from "./gold-khanjar";
import {
  GOLD_KHANJAR_QUARTER_MODEL,
  GOLD_KHANJAR_QUARTER_PREFIX,
  GOLD_KHANJAR_QUARTER_VOICE,
} from "./gold-khanjar-quarter-test";

export const GOLD_KHANJAR_FULL_PREFIX = "projects/gold-khanjar-full/v1";
export const GOLD_KHANJAR_FULL_VOICE = GOLD_KHANJAR_QUARTER_VOICE;
export const GOLD_KHANJAR_FULL_MODEL = GOLD_KHANJAR_QUARTER_MODEL;
export const GOLD_KHANJAR_FULL_SCRIPT = GOLD_KHANJAR_NARRATION;
export const GOLD_KHANJAR_FULL_TITLE = GOLD_KHANJAR_TITLE;
export const GOLD_KHANJAR_FULL_BODY_DURATION = 45;
export const GOLD_KHANJAR_APPROVED_BGM_KEY = "journey-begins-cinematic";
export const GOLD_KHANJAR_NARRATION_SUBTITLES_ENABLED = false;
export const GOLD_KHANJAR_ENDING_TRANSITION_SECONDS = 1.2;

export const GOLD_KHANJAR_STORY_SCENES = {
  "01-oman-entry": {
    source: "approved-quarter" as const,
    sourceKey: `${GOLD_KHANJAR_QUARTER_PREFIX}/scenes/01-oman-entry.mp4`,
  },
  "02-char-01-letter": {
    source: "approved-quarter" as const,
    sourceKey: `${GOLD_KHANJAR_QUARTER_PREFIX}/scenes/02-char-01-letter.mp4`,
  },
  "03-uk-asprey": {
    source: "approved-quarter" as const,
    sourceKey: `${GOLD_KHANJAR_QUARTER_PREFIX}/scenes/03-uk-asprey.mp4`,
  },
  "04-char-02-asprey": {
    source: "runway" as const,
    image: "04-asprey-london.png",
    prompt:
      "Preserve the exact CHAR_02 British master jeweller from the reference: same mature face, hair, age, tailored period clothing, build, palette and warm lighting. Silent acting only, closed mouth. One action: he studies the sealed commission beside a dark presentation box, with one subtle breath and a small eye movement. Slow camera drift, warm lamp light and restrained dust. Premium cinematic editorial illustration, mature luxury documentary animation, elegant linework, controlled painterly shading. No morphing, lip sync, extra people, readable text, logos, watches, modern objects, photorealism, cheap anime, cartoon or fantasy.",
  },
  "05-char-02-gift": {
    source: "runway" as const,
    image: "05-gift-preparation.png",
    prompt:
      "Preserve CHAR_02 exactly from the reference: same face, hair, age, tailored clothing, build, palette and lighting. Silent acting with closed mouth. One action only: his white-gloved hands place a closed unbranded presentation box onto a burgundy velvet surface. Keep the face mostly in three-quarter shadow and hands anatomically stable. Gentle lateral camera move, soft lamp reflection and dust. Premium cinematic editorial illustration matching the approved Gold Khanjar test. No morphing, lip sync, readable text, logo, emblem, watch, modern object, photorealism, cheap anime, cartoon or fantasy.",
  },
  "06-char-01-receives": {
    source: "runway" as const,
    image: "06-gift-reception.png",
    prompt:
      "Preserve approved CHAR_01 exactly: same dignified Omani face, beard, turban, clothing, age, build, palette and warm lighting. Silent acting only, closed mouth. One action: he receives a closed dark presentation box with both hands and lowers his eyes toward it. Keep the box closed and unbranded; no watch visible. Subtle breathing, one natural blink, restrained camera push and warm atmospheric light. Premium cinematic editorial illustration matching the approved test. No morphing, lip sync, extra people, text, logos, emblems, watch, photorealism, cheap anime, cartoon or fantasy.",
  },
  "07-char-01-reaction": {
    source: "runway" as const,
    image: "07-character-reaction.png",
    prompt:
      "Preserve approved CHAR_01 exactly: same face, beard, turban, clothing, age, build, palette and lighting. Silent reaction only with mouth fully closed. One action: his eyes lower toward the unseen gift and hold in quiet recognition, with a single blink and minimal breathing. Hands and watch remain outside frame. Slow subtle camera dolly, warm light falloff and fine film grain. Premium cinematic editorial illustration matching the approved Gold Khanjar test. No morphing, lip sync, head turn, extra person, text, logo, watch, photorealism, cheap anime, cartoon or fantasy.",
  },
} as const;

export type GoldKhanjarStorySceneId = keyof typeof GOLD_KHANJAR_STORY_SCENES;

// Human review: retain only face-stable, story-critical scenes so the final
// edit has nine meaning units instead of twelve short cuts.
export const GOLD_KHANJAR_REFINED_STORY_SCENES: GoldKhanjarStorySceneId[] = [
  "01-oman-entry",
  "02-char-01-letter",
  "03-uk-asprey",
  "06-char-01-receives",
];

export const GOLD_KHANJAR_PRODUCT_SCENES = [
  { id: "08-dial-khanjar", file: "MG_1220.jpg", title: "GOLD KHANJAR", subtitle: "金色のカンジャル", preset: "WatchMacro" },
  { id: "09-caseback-asprey", file: "MG_1204.jpg", title: "ASPREY", subtitle: "ASPREYの刻印", preset: "ProductHero" },
  { id: "10-serial-reference", file: "MG_1202.jpg", title: "SERIAL / 1665", subtitle: "500万番台のシリアル、1665/0", preset: "ProductHero" },
  { id: "11-movement", file: "MG_1200.jpg", title: "THE MOVEMENT", subtitle: "時計製造の歴史", preset: "WatchMacro" },
  { id: "12-final-hero", file: "1.jpg", title: "GOLD KHANJAR", subtitle: "時を超え、物語を宿す一本", preset: "ProductHero" },
] as const;

