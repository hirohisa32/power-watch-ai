import { ElevenLabsNarrationProvider } from "../lib/audio/elevenlabs";

async function main() {
  if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_DEFAULT_VOICE_ID) {
    console.log(
      "ELEVENLABS_API_KEY / ELEVENLABS_DEFAULT_VOICE_ID が未設定のためスキップしました",
    );
    return;
  }
  const text = "時間は、受け継がれていく。";
  const result = await new ElevenLabsNarrationProvider().generate({
    text,
    speed: 1,
    voiceId: process.env.ELEVENLABS_DEFAULT_VOICE_ID,
  });
  console.log(
    JSON.stringify({ bytes: result.bytes.length, characterCost: result.characterCost, ok: true }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "ElevenLabs integration test failed");
  process.exitCode = 1;
});
