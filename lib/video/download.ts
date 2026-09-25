export async function downloadValidatedMp4(
  url: string,
  options: { timeoutMs: number; maxBytes: number },
) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("VIDEO_OUTPUT_URL_MUST_BE_HTTPS");
  const response = await fetch(parsed, { signal: AbortSignal.timeout(options.timeoutMs) });
  if (!response.ok) throw new Error(`VIDEO_DOWNLOAD_HTTP_${response.status}`);
  const contentType = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
  if (contentType !== "video/mp4")
    throw new Error(`VIDEO_CONTENT_TYPE_INVALID:${contentType || "missing"}`);
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > options.maxBytes) throw new Error("VIDEO_TOO_LARGE");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > options.maxBytes)
    throw new Error("VIDEO_SIZE_INVALID");
  return bytes;
}
