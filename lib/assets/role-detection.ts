import "server-only";
import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import {
  effectiveProductPhotoRole,
  inferProductPhotoRole,
  type ProductPhotoAssetCandidate,
  type ProductPhotoRole,
} from "@/lib/storyboard/product-photo-planner";

export const DETECTABLE_WATCH_ROLES = [
  "full_watch",
  "wrist_shot",
  "dial",
  "dial_macro",
  "clous_de_paris",
  "side_case",
  "crown",
  "bracelet",
  "clasp",
  "caseback",
  "hallmark",
  "serial",
  "movement_wide",
  "movement_detail",
  "regulator",
  "engraving",
  "hero",
  "other",
] as const;

export type DetectedWatchRole = (typeof DETECTABLE_WATCH_ROLES)[number];

export const WATCH_ROLE_LABELS: Record<DetectedWatchRole, string> = {
  full_watch: "Full Watch",
  wrist_shot: "Wrist Shot",
  dial: "Dial",
  dial_macro: "Dial Macro",
  clous_de_paris: "Clous de Paris",
  side_case: "Side Case",
  crown: "Crown",
  bracelet: "Bracelet",
  clasp: "Clasp",
  caseback: "Caseback",
  hallmark: "Hallmark",
  serial: "Serial",
  movement_wide: "Movement Wide",
  movement_detail: "Movement Detail",
  regulator: "Regulator",
  engraving: "Engraving",
  hero: "Hero",
  other: "Other",
};

const responseSchema = z.object({
  role: z.enum(DETECTABLE_WATCH_ROLES),
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()).max(4),
});

export type WatchRoleDetection = z.infer<typeof responseSchema> & {
  model: string;
  requestId: string | null;
  analyzedAt: string;
};

export async function detectWatchPhotoRole(input: {
  bytes: Uint8Array;
  mimeType: string;
}): Promise<WatchRoleDetection> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  const model = process.env.OPENAI_ASSET_ANALYSIS_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-6-sol";
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 90_000, maxRetries: 1 });
  const dataUrl = `data:${input.mimeType};base64,${Buffer.from(input.bytes).toString("base64")}`;
  const { data: response, request_id: requestId } = await client.responses
    .parse({
      model,
      store: false,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Classify the primary visible subject of this watch product photograph. Choose exactly one role. Use dial_macro for an extreme close-up of the dial; clous_de_paris only when that texture is the principal subject; hallmark, serial, regulator, engraving, crown or clasp only when that detail is clearly the principal subject. Use hero for a polished beauty composition and full_watch for a neutral full-watch view. Judge pixels only and ignore filenames or labels.",
            },
            { type: "input_image", image_url: dataUrl, detail: "high" },
          ],
        },
      ],
      text: { format: zodTextFormat(responseSchema, "watch_photo_role") },
      max_output_tokens: 500,
    })
    .withResponse();
  if (!response.output_parsed) throw new Error("WATCH_ROLE_RESPONSE_EMPTY");
  return {
    ...response.output_parsed,
    model: response.model ?? model,
    requestId: requestId ?? null,
    analyzedAt: new Date().toISOString(),
  };
}

export function hasRoleMismatch(
  asset: ProductPhotoAssetCandidate & { detectionConfidence?: number | null },
) {
  if (!asset.detectedRole || (asset.detectionConfidence ?? 0) < 0.7) return false;
  return inferProductPhotoRole(asset.humanLabel ?? asset.label) !== asset.detectedRole;
}

export function assignmentRole(asset: ProductPhotoAssetCandidate): ProductPhotoRole {
  return effectiveProductPhotoRole(asset);
}
