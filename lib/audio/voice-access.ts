import "server-only";
import { narrationConfig } from "./config";

export type ElevenLabsVoiceAccess = {
  voiceId: string;
  accessible: boolean;
  name?: string;
  status: number;
};

export async function checkElevenLabsVoiceAccess(voiceId: string): Promise<ElevenLabsVoiceAccess> {
  const config = narrationConfig();
  if (!config.apiKey) return { voiceId, accessible: false, status: 401 };
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`,
      {
        headers: { "xi-api-key": config.apiKey },
        cache: "no-store",
        signal: AbortSignal.timeout(config.timeoutMs),
      },
    );
    if (!response.ok) return { voiceId, accessible: false, status: response.status };
    const body = (await response.json()) as { name?: string };
    return { voiceId, accessible: true, name: body.name, status: response.status };
  } catch {
    return { voiceId, accessible: false, status: 0 };
  }
}
