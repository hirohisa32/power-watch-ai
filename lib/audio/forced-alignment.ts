import "server-only";
import type { NarrationAlignmentData } from "./timing";

type ForcedAlignmentResponse = {
  characters: Array<{ text: string; start: number; end: number }>;
  words: Array<{ text: string; start: number; end: number; loss: number }>;
  loss: number;
};

export async function forceAlignNarration(input: {
  audio: Uint8Array;
  text: string;
  filename?: string;
}) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEYが設定されていません");
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(input.audio)], { type: "audio/mpeg" }),
    input.filename ?? "narration.mp3",
  );
  form.append("text", input.text);
  const response = await fetch("https://api.elevenlabs.io/v1/forced-alignment", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`ElevenLabs Forced Alignment失敗 (${response.status})`);
  const result = (await response.json()) as ForcedAlignmentResponse;
  if (!result.characters?.length) throw new Error("Forced Alignmentに文字Timingがありません");
  const alignment: NarrationAlignmentData = {
    characters: result.characters.map((item) => item.text),
    characterStartTimesSeconds: result.characters.map((item) => item.start),
    characterEndTimesSeconds: result.characters.map((item) => item.end),
    source: "provider",
    averageConfidence: lossToConfidence(result.loss),
    wordTimings: result.words.map((word) => ({
      text: word.text,
      startSeconds: word.start,
      endSeconds: word.end,
      confidence: lossToConfidence(word.loss),
    })),
  };
  return { alignment, loss: result.loss };
}

function lossToConfidence(loss: number) {
  return Number(Math.exp(-Math.max(0, loss)).toFixed(4));
}
