import sharp from "sharp";

type Pixel = { r: number; g: number; b: number };

function isConnectedBlackBackground({ r, g, b }: Pixel) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max <= 34 && max - min <= 22;
}

export async function createConnectedBackgroundCutout(input: Uint8Array) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const enqueue = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (visited[index]) return;
    const offset = index * channels;
    if (!isConnectedBlackBackground({ r: data[offset], g: data[offset + 1], b: data[offset + 2] })) return;
    visited[index] = 1;
    queue[tail++] = index;
  };
  for (let x = 0; x < width; x += 1) { enqueue(x, 0); enqueue(x, height - 1); }
  for (let y = 0; y < height; y += 1) { enqueue(0, y); enqueue(width - 1, y); }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    enqueue(x - 1, y); enqueue(x + 1, y); enqueue(x, y - 1); enqueue(x, y + 1);
  }
  for (let index = 0; index < visited.length; index += 1)
    if (visited[index]) data[index * channels + 3] = 0;
  return new Uint8Array(await sharp(data, { raw: info }).png().toBuffer());
}
