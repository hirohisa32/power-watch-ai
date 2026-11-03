import "server-only";
import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import {
  effectiveProductPhotoRole,
  automaticDetectedRole,
  inferProductPhotoRole,
  isProductPhotoRole,
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
  candidates: z
    .array(
      z.object({
        role: z.enum(DETECTABLE_WATCH_ROLES),
        confidence: z.number().min(0).max(1),
        featureGatePassed: z.boolean(),
        observedFeatures: z.array(z.string()).max(5),
        failedFeatures: z.array(z.string()).max(5),
      }),
    )
    .min(1)
    .max(3),
  reasons: z.array(z.string()).max(4),
});

export type WatchRoleSuggestion = z.infer<typeof responseSchema>["candidates"][number];

export type WatchRoleDetection = z.infer<typeof responseSchema> & {
  role: DetectedWatchRole;
  confidence: number;
  status: "SUGGESTION" | "HUMAN_REVIEW" | "AUTO_ADOPT_ELIGIBLE";
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
              text: `Analyze the visible pixels of this watch product photograph and return up to three ranked role suggestions. Ignore filenames and existing labels. Confidence is comparative evidence strength, not certainty; do not use high confidence when visual evidence is ambiguous.

Apply these mandatory visual feature gates:
- dial: the dial is the primary subject.
- dial_macro: dial detail fills most of the frame.
- movement_wide: the complete movement is visible.
- movement_detail: a cropped part of the mechanism is enlarged.
- side_case: the case profile/side is the primary subject.
- caseback: the exterior caseback is the primary subject.
- serial: the serial number itself is the primary subject and readable.
- wrist_shot: a human wrist wearing the watch is visible.
- full_watch: the complete watch is the primary subject.
- hero: a polished beauty composition presents the complete or substantially complete watch.
- clous_de_paris: the Clous de Paris texture is clearly visible and is the principal detail.
- crown: the crown is the principal subject.
- bracelet: the bracelet occupies the principal visual area.
- clasp: the clasp is the principal subject.
- hallmark: a hallmark is the principal readable detail.
- regulator: the regulator mechanism is visible and is the principal detail.
- engraving: an engraving other than a serial or hallmark is the principal readable detail.
- other: none of the named visual feature gates can be supported.

For every candidate report whether its gate passed and the features observed or missing. Exclude a role when its mandatory feature gate fails. Return distinct roles, ranked by confidence, with confidence values summing to at most 1.`,
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
  const candidates = response.output_parsed.candidates
    .filter(
      (candidate, index, values) =>
        candidate.featureGatePassed &&
        values.findIndex((value) => value.role === candidate.role) === index,
    )
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 3);
  if (!candidates.length) throw new Error("WATCH_ROLE_FEATURE_GATE_FAILED");
  const top = candidates[0];
  const second = candidates[1];
  const autoAdoptEligible =
    top.confidence >= 0.85 && (!second || top.confidence - second.confidence >= 0.2);
  return {
    candidates,
    reasons: response.output_parsed.reasons,
    role: top.role,
    confidence: top.confidence,
    status: autoAdoptEligible ? "AUTO_ADOPT_ELIGIBLE" : "HUMAN_REVIEW",
    model: response.model ?? model,
    requestId: requestId ?? null,
    analyzedAt: new Date().toISOString(),
  };
}

export function hasRoleMismatch(
  asset: ProductPhotoAssetCandidate & { detectionConfidence?: number | null },
) {
  if (!asset.detectedRole) return false;
  return inferProductPhotoRole(asset.humanLabel ?? asset.label) !== asset.detectedRole;
}

export function assignmentRole(asset: ProductPhotoAssetCandidate): ProductPhotoRole {
  return effectiveProductPhotoRole(asset);
}

export type DisplayRoleSuggestion = {
  role: DetectedWatchRole;
  confidence: number;
  featureGatePassed: boolean;
};

export function roleSuggestions(
  asset: ProductPhotoAssetCandidate & { detectionConfidence?: number | null },
): DisplayRoleSuggestion[] {
  const detection = asset.analysis?.roleDetection;
  const candidates =
    detection && typeof detection === "object"
      ? (detection as { candidates?: unknown }).candidates
      : null;
  if (Array.isArray(candidates)) {
    return candidates
      .flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        const value = candidate as Record<string, unknown>;
        const role = typeof value.role === "string" ? value.role : null;
        if (!role || !DETECTABLE_WATCH_ROLES.includes(role as DetectedWatchRole)) return [];
        if (typeof value.confidence !== "number") return [];
        return [
          {
            role: role as DetectedWatchRole,
            confidence: value.confidence,
            featureGatePassed: value.featureGatePassed === true,
          },
        ];
      })
      .filter((candidate) => candidate.featureGatePassed)
      .slice(0, 3);
  }
  if (
    asset.detectedRole &&
    DETECTABLE_WATCH_ROLES.includes(asset.detectedRole as DetectedWatchRole) &&
    typeof asset.detectionConfidence === "number"
  ) {
    return [
      {
        role: asset.detectedRole as DetectedWatchRole,
        confidence: asset.detectionConfidence,
        featureGatePassed: false,
      },
    ];
  }
  return [];
}

export function roleReviewStatus(asset: ProductPhotoAssetCandidate) {
  if (asset.humanLocked && isProductPhotoRole(asset.role)) return "HUMAN_LOCKED" as const;
  const hasHumanLabel =
    asset.humanLabel === undefined
      ? Boolean(asset.label.trim())
      : Boolean(asset.humanLabel?.trim());
  if (hasHumanLabel) return "HUMAN_REVIEW" as const;
  return automaticDetectedRole(asset)
    ? ("AUTO_ADOPT_ELIGIBLE" as const)
    : ("HUMAN_REVIEW" as const);
}
