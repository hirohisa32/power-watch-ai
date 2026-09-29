export const OPENING_MASTER_KEY = "POWER_WATCH_OPENING_MASTER";
export const OPENING_MASTER_VERSION = 1;
export const OPENING_SEGMENT_SECONDS = 5;

const BASE =
  "Photorealistic live-action cinema, real physical set, historical archival luxury mood, dark warm low-key lighting, restrained natural motion, fine dust in air, no illustration, no cartoon, no fantasy game, no modern furniture, no magic, no visible text, no logos, vertical 9:16.";

export const OPENING_MASTER_PROMPTS = [
  `${BASE} A monumental centuries-old heavy wooden door fills the frame, deeply worn timber grain, scratches, oxidized iron hinges and hardware, accumulated dust. The door slowly opens inward with convincing weight. Beyond it is only a dim abandoned antiquarian library. Slow deliberate camera push, realistic exposure and optics.`,
  `${BASE} Inside a long-abandoned old library: tall shelves packed with many aged books, dust and cobweb traces, a heavy antique wooden desk at the center, one old desk lamp emitting a single faint amber pool of light. Camera glides quietly from the shelves toward the desk. The room feels genuinely old, silent and untouched for decades.`,
  `${BASE} Close approach to an extremely thick distressed leather-bound antique book lying alone on the old wooden desk beside the dim lamp. The cover is blank with absolutely no lettering. A sudden natural draft lifts accumulated dust into the warm light and the heavy book slowly opens by itself with believable page weight. End on the open book centered in frame.`,
] as const;

export function watchRevealPrompt() {
  return `${BASE} Preserve the exact supplied real vintage wristwatch: dial layout, Arabic numerals, red chronograph hand, subdials, PIERCE marking, case, crown, pushers, mesh bracelet, patina and scratches must not change. The real watch emerges subtly from an open antique book, then grows toward camera into an elegant dial macro. The red hand begins one precise mechanical movement near the end. No invented watch, no morphing, no extra text.`;
}

export const OPENING_NARRATION =
  "時を超え、語り継がれる物語。静寂の奥で眠っていた時が、いま動き始める。";

export function masterSegmentObjectKey(index: number) {
  return `brand/openings/power-watch-opening-master/v${OPENING_MASTER_VERSION}/segments/${String(index + 1).padStart(2, "0")}.mp4`;
}

export function openingWatchObjectKey(projectId: string, previewId: string) {
  return `projects/${projectId}/opening-previews/${previewId}/watch.mp4`;
}

export function openingNarrationObjectKey(projectId: string, previewId: string) {
  return `projects/${projectId}/opening-previews/${previewId}/narration.mp3`;
}

export function openingPreviewObjectKey(projectId: string, previewId: string) {
  return `projects/${projectId}/opening-previews/${previewId}.mp4`;
}
