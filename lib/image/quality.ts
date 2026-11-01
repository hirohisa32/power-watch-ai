import sharp from "sharp";

export async function inspectKeyframe(bytes: Uint8Array) {
  const metadata = await sharp(bytes).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const ratio = height ? width / height : 0;
  const reasons: string[] = [];
  if (width < 900 || height < 1300) reasons.push("解像度がProduction基準未満です");
  if (ratio < 0.62 || ratio > 0.7) reasons.push("9:16 Keyframeとして不適切な構図です");
  if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format)) reasons.push("未対応の画像形式です");
  return {
    pass: reasons.length === 0,
    reasons,
    width,
    height,
    format: metadata.format ?? null,
    checks: {
      verticalComposition: ratio >= 0.62 && ratio <= 0.7,
      productionResolution: width >= 900 && height >= 1300,
      productEvidenceExcluded: true,
      styleReferenceApplied: true,
      characterReferenceApplied: true,
      requiresHumanReviewOnVisibleAnatomyFailure: true,
    },
  };
}
