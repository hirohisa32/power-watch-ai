import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetDir = path.join(root, "assets", "gold-khanjar-preview");
const mastersDir = path.join(root, "artifacts", "gold-khanjar-quality-preview", "stylized-masters-v2");
const outputDir = path.join(root, "artifacts", "gold-khanjar-quality-preview", "sns-keyframes-v2");
const characterMaster = path.join(assetDir, "character-master-v1.png");
const layerABase = path.join(assetDir, "watch-lift-grip-plate-v4.png");
const watchMaster = path.join(mastersDir, "01-full-watch.png");
const W = 1080, H = 1920, WATCH_SIZE = 350, WATCH_LEFT = 365, WATCH_TOP = 580;

await mkdir(outputDir, { recursive: true });
const reactionOutput = path.join(outputDir, "reaction-safe-area-keyframe.png");
await buildReactionSafeArea(reactionOutput);

const base = await sharp(layerABase).resize(W, H, { fit: "cover" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const cleanedBase = removeBlankPlaceholder(base.data, W, H);
const gloveMask = buildGloveMask(base.data, W, H);
const gloveLayer = applyAlpha(base.data, gloveMask, W, H);

const extractedMaster = await extractWatchMaster(watchMaster);
let watchLayer = await sharp(extractedMaster).resize(WATCH_SIZE, WATCH_SIZE, { fit: "contain", kernel: "lanczos3" }).png().toBuffer();
const watchRaw = await sharp(watchLayer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (let y = 0; y < WATCH_SIZE; y++) for (let x = 0; x < WATCH_SIZE; x++) {
  const p = (y * WATCH_SIZE + x) * 4;
  const lum = 0.2126 * watchRaw.data[p] + 0.7152 * watchRaw.data[p + 1] + 0.0722 * watchRaw.data[p + 2];
  const dx = (x - 180) / 133, dy = (y - 196) / 133;
  const insideCase = dx * dx + dy * dy <= 1;
  if (!insideCase && lum < 112) watchRaw.data[p + 3] = 0;
  if ((x < 8 || x >= WATCH_SIZE - 8 || y < 8 || y >= WATCH_SIZE - 8) && lum < 170) watchRaw.data[p + 3] = 0;
}
for (let i = 0; i < WATCH_SIZE * WATCH_SIZE; i++) watchRaw.data[i * 4 + 3] = watchRaw.data[i * 4 + 3] >= 128 ? 255 : 0;
watchLayer = await sharp(watchRaw.data, { raw: { width: WATCH_SIZE, height: WATCH_SIZE, channels: 4 } }).png().toBuffer();
const watchMask = alphaChannel(watchRaw.data, WATCH_SIZE, WATCH_SIZE);
const shadowAlpha = await sharp(watchMask, { raw: { width: WATCH_SIZE, height: WATCH_SIZE, channels: 1 } }).blur(10).linear(0.36).raw().toBuffer();
const shadowRgba = Buffer.alloc(WATCH_SIZE * WATCH_SIZE * 4);
for (let i = 0; i < WATCH_SIZE * WATCH_SIZE; i++) shadowRgba[i * 4 + 3] = shadowAlpha[i];
const contactShadow = await buildContactShadow(gloveMask, watchMask);

const layerAPath = path.join(outputDir, "layer-a-background.png");
const layerBPath = path.join(outputDir, "layer-b-watch-master-locked.png");
const layerCPath = path.join(outputDir, "layer-c-glove-occlusion.png");
await sharp(cleanedBase, { raw: { width: W, height: H, channels: 4 } }).png().toFile(layerAPath);
await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: watchLayer, left: WATCH_LEFT, top: WATCH_TOP }]).png().toFile(layerBPath);
await sharp(gloveLayer, { raw: { width: W, height: H, channels: 4 } }).png().toFile(layerCPath);

const keyframePath = path.join(outputDir, "watch-lift-identity-locked-keyframe.png");
await sharp(cleanedBase, { raw: { width: W, height: H, channels: 4 } }).composite([
  { input: shadowRgba, raw: { width: WATCH_SIZE, height: WATCH_SIZE, channels: 4 }, left: WATCH_LEFT + 7, top: WATCH_TOP + 11 },
  { input: watchLayer, left: WATCH_LEFT, top: WATCH_TOP },
  { input: contactShadow.rgba, raw: { width: W, height: H, channels: 4 }, left: 0, top: 0 },
  { input: gloveLayer, raw: { width: W, height: H, channels: 4 }, left: 0, top: 0 },
]).png({ compressionLevel: 9 }).toFile(keyframePath);

const visibleMask = buildVisibleWatchMask(watchMask, gloveMask, contactShadow.alpha, WATCH_SIZE, WATCH_LEFT, WATCH_TOP, W, H);
const finalRaw = await sharp(keyframePath).ensureAlpha().raw().toBuffer();
const visibleIdentity = compareVisibleIdentity(finalRaw, watchRaw.data, visibleMask, WATCH_LEFT, WATCH_TOP, W, WATCH_SIZE);
const comparisonPath = path.join(outputDir, "watch-master-overlay-comparison.png");
await buildComparison(watchLayer, keyframePath, layerBPath, comparisonPath);
const criticalPath = path.join(outputDir, "identity-critical-zoom-comparison.png");
await buildCriticalComparison(watchLayer, keyframePath, criticalPath);

const metrics = {
  method: "identity-locked-composite",
  generatedAiUsedInFinalWatch: false,
  sourceMaster: "stylized-masters-v2/01-full-watch.png",
  sourceMasterSha256: createHash("sha256").update(await readFile(watchMaster)).digest("hex"),
  layers: { A: "character / white gloves / box / background", B: "approved Watch Master, opacity 100%, direct pixel composite", C: "foreground glove occlusion + localized contact shadow" },
  transform: { position: { left: WATCH_LEFT, top: WATCH_TOP }, uniformSizePx: WATCH_SIZE, rotationDegrees: 0, perspectiveWarp: false, morph: false, redraw: false },
  identityGate: { visibleIdentityPixelsCompared: visibleIdentity.compared, differentPixels: visibleIdentity.different, maxChannelDelta: visibleIdentity.maxDelta, pass: visibleIdentity.different === 0 },
  snsGate: { identity: visibleIdentity.different === 0 ? "pass" : "fail", opacity: "pass-100-percent", scale: "pass-candidate", grip: "human-review", contactShadow: "human-review", referenceQuality: "human-review", overall: "human-review-required" },
  video: { rendered: false, reason: "Human PASS is required before animation." },
};
await writeFile(path.join(outputDir, "quality-metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`);
console.log(JSON.stringify({ reactionOutput, keyframePath, comparisonPath, criticalPath, metrics }, null, 2));

async function buildReactionSafeArea(output) {
  const original = await sharp(characterMaster).resize(W, H, { fit: "cover" }).png().toBuffer();
  const background = await sharp(original).blur(24).modulate({ brightness: 0.82, saturation: 0.88 }).png().toBuffer();
  const foreground = await sharp(original).resize(1026, 1824, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let y = 0; y < 1824; y++) for (let x = 0; x < 1026; x++) {
    const edge = Math.min(x / 24, (1025 - x) / 24, y / 30, (1823 - y) / 30, 1);
    foreground.data[(y * 1026 + x) * 4 + 3] = Math.round(255 * Math.max(0, edge));
  }
  await sharp(background).composite([{ input: foreground.data, raw: { width: 1026, height: 1824, channels: 4 }, left: 27, top: 78 }]).png({ compressionLevel: 9 }).toFile(output);
}

function buildGloveMask(src, width, height) {
  const mask = new Float32Array(width * height);
  const leftThumb = [[355, 820], [535, 825], [535, 945], [455, 990], [350, 930]];
  const rightThumb = [[545, 825], [725, 820], [735, 930], [625, 990], [545, 945]];
  for (let y = 610; y < 1120; y++) for (let x = 0; x < width; x++) {
    if (x > 520 && x < 560) continue;
    const p = (y * width + x) * 4, r = src[p], g = src[p + 1], b = src[p + 2];
    const foregroundShape = x < 420 || x > 660 || pointInPolygon(x, y, leftThumb) || pointInPolygon(x, y, rightThumb);
    if (r > 150 && g > 112 && b > 78 && r - g > 10 && g - b > 10 && foregroundShape) mask[y * width + x] = 1;
  }
  return featherMask(dilate(mask, width, height, 1), width, height);
}

function removeBlankPlaceholder(src, width, height) {
  const out = Buffer.from(src), mask = new Float32Array(width * height);
  for (let y = 560; y < 990; y++) for (let x = 360; x < 720; x++) {
    const p = (y * width + x) * 4, r = src[p], g = src[p + 1], b = src[p + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) < 32 && r < 112) mask[y * width + x] = 1;
  }
  const soft = featherMask(dilate(mask, width, height, 2), width, height);
  for (let y = 560; y < 990; y++) for (let x = 360; x < 720; x++) {
    const a = soft[y * width + x]; if (!a) continue;
    const p = (y * width + x) * 4;
    const grain = (((x * 17 + y * 31) % 13) - 6) * 0.45;
    const shade = (y - 560) / 430;
    const fill = [48 - 8 * shade + grain, 9 - 2 * shade + grain * 0.25, 13 - 2 * shade + grain * 0.3];
    for (let c = 0; c < 3; c++) out[p + c] = Math.round(src[p + c] * (1 - a) + fill[c] * a);
  }
  return out;
}

function cleanPlaceholderTail(src, width, height) {
  const out = Buffer.from(src), mask = new Float32Array(width * height);
  for (let y = 870; y < 1025; y++) for (let x = 465; x < 625; x++) {
    const p = (y * width + x) * 4, r = src[p], g = src[p + 1], b = src[p + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) < 30 && r < 100) mask[y * width + x] = 1;
  }
  const soft = featherMask(dilate(mask, width, height, 2), width, height);
  for (let y = 865; y < 1030; y++) for (let x = 460; x < 630; x++) {
    const a = soft[y * width + x]; if (!a) continue;
    const p = (y * width + x) * 4, sampleY = Math.min(height - 1, y + 155), sp = (sampleY * width + x) * 4;
    for (let c = 0; c < 3; c++) out[p + c] = Math.round(src[p + c] * (1 - a) + src[sp + c] * a);
  }
  return out;
}

function applyAlpha(src, mask, width, height) {
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    out[i * 4] = src[i * 4]; out[i * 4 + 1] = src[i * 4 + 1]; out[i * 4 + 2] = src[i * 4 + 2]; out[i * 4 + 3] = Math.round(255 * mask[i]);
  }
  return out;
}

async function extractWatchMaster(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const seed = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const x = i % width, y = Math.floor(i / width), p = i * 4;
    const lum = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
    const nx = (x - width * 0.515) / (width * 0.26), ny = (y - height * 0.47) / (height * 0.26);
    if (lum > 110 || nx * nx + ny * ny <= 1) seed[i] = 1;
  }
  const connected = dilate(seed, width, height, 4);
  let minX = width, minY = height, maxX = 0, maxY = 0;
  for (let i = 0; i < width * height; i++) {
    const x = i % width, y = Math.floor(i / width), p = i * 4;
    const lum = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
    const a = (seed[i] || (connected[i] && lum > 38)) ? 255 : 0;
    data[p + 3] = a;
    if (a) { const x = i % width, y = Math.floor(i / width); minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  }
  return sharp(data, { raw: { width, height, channels: 4 } }).extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }).png().toBuffer();
}

function alphaChannel(rgba, width, height) { const out = Buffer.alloc(width * height); for (let i = 0; i < width * height; i++) out[i] = rgba[i * 4 + 3]; return out; }

function buildVisibleWatchMask(watchAlpha, gloveMask, contactShadowAlpha, size, left, top, width, height) {
  const out = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const gx = left + x, gy = top + y; if (gx < 0 || gy < 0 || gx >= width || gy >= height) continue;
    if (watchAlpha[y * size + x] === 255 && gloveMask[gy * width + gx] === 0 && contactShadowAlpha[gy * width + gx] === 0) out[y * size + x] = 1;
  }
  return out;
}

async function buildContactShadow(gloveMask, watchMask) {
  const local = Buffer.alloc(W * H);
  for (let y = 0; y < WATCH_SIZE; y++) for (let x = 0; x < WATCH_SIZE; x++) {
    const gx = WATCH_LEFT + x, gy = WATCH_TOP + y, gi = gy * W + gx;
    if (watchMask[y * WATCH_SIZE + x] && gloveMask[gi] > 0) local[gi] = Math.round(255 * gloveMask[gi]);
  }
  const blurred = await sharp(local, { raw: { width: W, height: H, channels: 1 } }).blur(4.5).raw().toBuffer();
  const rgba = Buffer.alloc(W * H * 4), alpha = new Uint8Array(W * H);
  for (let y = WATCH_TOP - 8; y < WATCH_TOP + WATCH_SIZE + 8; y++) for (let x = WATCH_LEFT - 8; x < WATCH_LEFT + WATCH_SIZE + 8; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const i = y * W + x, wx = x - WATCH_LEFT, wy = y - WATCH_TOP;
    const onWatch = wx >= 0 && wy >= 0 && wx < WATCH_SIZE && wy < WATCH_SIZE && watchMask[wy * WATCH_SIZE + wx] > 0;
    if (!onWatch || gloveMask[i] > 0.03) continue;
    const ring = Math.max(0, blurred[i] - local[i]);
    const a = ring > 9 ? Math.min(88, Math.round(ring * 0.48)) : 0;
    alpha[i] = a;
    rgba[i * 4] = 18; rgba[i * 4 + 1] = 8; rgba[i * 4 + 2] = 5; rgba[i * 4 + 3] = a;
  }
  return { rgba, alpha };
}

function compareVisibleIdentity(finalRgba, watchRgba, visible, left, top, width, size) {
  let compared = 0, different = 0, maxDelta = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x; if (!visible[i]) continue;
    const fp = ((top + y) * width + left + x) * 4, wp = i * 4; compared++;
    for (let c = 0; c < 3; c++) { const d = Math.abs(finalRgba[fp + c] - watchRgba[wp + c]); maxDelta = Math.max(maxDelta, d); if (d) { different++; break; } }
  }
  return { compared, different, maxDelta };
}

async function buildComparison(watch, keyframe, lockedLayer, output) {
  const panelW = 540, panelH = 960;
  const masterPanel = await sharp({ create: { width: panelW, height: panelH, channels: 3, background: "#16100f" } }).composite([{ input: await sharp(watch).resize(440, 440, { fit: "contain" }).png().toBuffer(), left: 50, top: 250 }]).png().toBuffer();
  const finalPanel = await sharp(keyframe).resize(panelW, panelH).png().toBuffer();
  const overlay = await sharp(keyframe).resize(panelW, panelH).composite([{ input: await sharp(lockedLayer).resize(panelW, panelH).png().toBuffer(), blend: "over", opacity: 0.5 }]).png().toBuffer();
  const labels = Buffer.from(`<svg width="1620" height="960"><style>.t{font:700 28px sans-serif;fill:white;paint-order:stroke;stroke:#000;stroke-width:5}</style><text class="t" x="24" y="50">APPROVED MASTER</text><text class="t" x="564" y="50">FINAL KEYFRAME</text><text class="t" x="1104" y="50">50% LOCKED OVERLAY</text></svg>`);
  await sharp({ create: { width: 1620, height: 960, channels: 3, background: "#0d0a09" } }).composite([{ input: masterPanel, left: 0, top: 0 }, { input: finalPanel, left: 540, top: 0 }, { input: overlay, left: 1080, top: 0 }, { input: labels, left: 0, top: 0 }]).jpeg({ quality: 94 }).toFile(output);
}

async function buildCriticalComparison(watch, keyframe, output) {
  const watchBuf = await sharp(watch).resize(600, 600, { fit: "contain" }).png().toBuffer();
  const finalCrop = await sharp(keyframe).extract({ left: WATCH_LEFT - 60, top: WATCH_TOP - 60, width: 510, height: 510 }).resize(600, 600).png().toBuffer();
  const svg = Buffer.from(`<svg width="1200" height="760"><style>.h{font:700 28px sans-serif;fill:white}.s{font:500 21px sans-serif;fill:#d7b46a}</style><text class="h" x="28" y="48">MASTER — Dial / Khanjar / Hands / Bezel</text><text class="h" x="628" y="48">FINAL — locked master pixels</text><text class="s" x="28" y="730">Visible identity pixels: exact match required; glove-occluded pixels excluded</text></svg>`);
  await sharp({ create: { width: 1200, height: 760, channels: 3, background: "#100c0b" } }).composite([{ input: watchBuf, left: 0, top: 80 }, { input: finalCrop, left: 600, top: 80 }, { input: svg, left: 0, top: 0 }]).jpeg({ quality: 96 }).toFile(output);
}

function dilate(mask, width, height, radius) {
  const out = new Float32Array(mask.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let v = 0; for (let dy = -radius; dy <= radius && !v; dy++) for (let dx = -radius; dx <= radius; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < width && yy < height && mask[yy * width + xx]) { v = 1; break; } }
    out[y * width + x] = v;
  }
  return out;
}

function featherMask(mask, width, height) {
  const out = new Float32Array(mask.length);
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) { let sum = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += mask[(y + dy) * width + x + dx]; out[y * width + x] = sum / 9; }
  return out;
}

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
