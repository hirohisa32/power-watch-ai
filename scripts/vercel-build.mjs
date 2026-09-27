import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, parse, resolve } from "node:path";

const runner = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(args) {
  const result = spawnSync(runner, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function prepareFinalRenderAssets() {
  const require = createRequire(import.meta.url);
  const output = resolve(".vercel-build-assets");
  mkdirSync(output, { recursive: true });

  const ffmpegRoot = dirname(require.resolve("@ffmpeg-installer/linux-x64/package.json"));
  const ffmpegOutput = join(output, "ffmpeg");
  copyFileSync(join(ffmpegRoot, "ffmpeg"), ffmpegOutput);
  chmodSync(ffmpegOutput, 0o755);

  const fontRoot = packageRoot(require, "@noto-pdf-ts/fonts-jp");
  const fontFile = findFontFile(fontRoot);
  if (!fontFile) throw new Error("Noto Sans JP font file was not found");
  copyFileSync(fontFile, join(output, `NotoSansJP${extname(fontFile)}`));
}

function packageRoot(require, packageName) {
  let directory = dirname(require.resolve(packageName));
  const root = parse(directory).root;
  while (directory !== root) {
    if (existsSync(join(directory, "package.json"))) return directory;
    directory = dirname(directory);
  }
  throw new Error(`Package root was not found: ${packageName}`);
}

function findFontFile(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = findFontFile(target);
      if (nested) return nested;
    } else if ([".ttf", ".ttc", ".otf"].includes(extname(entry.name).toLowerCase())) {
      if (statSync(target).size > 100_000) return target;
    }
  }
  return null;
}

if (process.env.VERCEL_ENV === "production") {
  prepareFinalRenderAssets();
  run(["db:migrate"]);
  run(["db:seed"]);
}

run(["exec", "next", "build", "--webpack"]);
