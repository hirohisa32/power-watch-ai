import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const TITLE = "ROLEX GOLD KHANJAR Ref.1665/0 — Client Demo";
const NARRATION =
  "1970年代、オマーンは新しい時代の入口に立っていました。国を率いたカーブース国王は、英国との結びつきの中で、功労者へ贈り物を届けます。その製作を託されたのが、英国王室とも縁の深い名門ジュエラー、アスプレイでした。選ばれたのはロレックス。文字盤には、オマーンの威信を象徴する金色のカンジャル。これは装飾ではありません。厚みある紋章、ASPREYの刻印、裏蓋内部のシリアル、そして500万番台の番号。今回の1665/0には、国家と英国、そして時計製造の歴史が交差した証が、残されています。GOLD KHANJAR。時を超え、物語を宿す一本です。";

if ([...NARRATION].length !== 271) throw new Error("Gold Khanjar narration must be 271 characters");

const root = process.cwd();
const assetsDir = path.join(root, "client-demo", "gold-khanjar", "assets");
const workDir = path.join(root, "artifacts", "gold-khanjar-production-static");
const require = createRequire(import.meta.url);
const ffmpeg = path.join(
  path.dirname(require.resolve("@ffmpeg-installer/win32-x64/package.json")),
  "ffmpeg.exe",
);

const imageDefinitions = [
  { file: "1.jpg", label: "Front Hero" },
  { file: "MG_1220.jpg", label: "Dial Gold Khanjar" },
  { file: "MG_1204.jpg", label: "Caseback ASPREY" },
  { file: "MG_1202.jpg", label: "Inside Caseback Serial 1665" },
  { file: "MG_1200.jpg", label: "Movement" },
  { file: "MG_1216.jpg", label: "Crown Profile" },
  { file: "MG_1212.jpg", label: "Bracelet Clasp" },
] as const;

const scenes = [
  {
    order: 6,
    preset: "CityEraEstablishing",
    title: "1970年代オマーン",
    subtitle: "1970s\nOMAN",
    year: "1970s",
    location: "OMAN",
    prompt:
      "1970s Muscat, Oman at dusk, authentic low whitewashed buildings between rugged mountains and the sea, warm dusty atmosphere, restrained archival documentary realism, sparse period vehicles far in the distance, no readable text, no logos, no emblems, no watches, no modern skyline",
    camera: "slow aerial-to-street push",
    shotType: "wide establishing shot",
    lighting: "late afternoon amber haze",
    motion: "dust in the air and subtle distant movement",
    colorMood: "sandstone, charcoal and muted amber",
    transition: "restrained dissolve",
  },
  {
    order: 7,
    preset: "HistoricalCharacter",
    title: "国家と権威",
    subtitle: "A NEW ERA",
    prompt:
      "1970s Omani palace interior, dignified Middle Eastern statesman seen from behind walking through a shadowed colonnade, historically appropriate white dishdasha and restrained turban, quiet authority, photorealistic historical documentary, no identifiable real person, no readable text, no logos, no royal crest, no watches",
    camera: "measured tracking shot from behind",
    shotType: "medium-wide silhouette",
    lighting: "warm window shafts through dust",
    motion: "slow deliberate walk and fabric movement",
    colorMood: "dark wood, limestone and subdued gold",
    transition: "dust dissolve",
  },
  {
    order: 8,
    preset: "HistoricalEvent",
    title: "オマーンと英国",
    subtitle: "OMAN × UNITED KINGDOM",
    prompt:
      "1970s diplomatic meeting room connecting Oman and Britain, two senior officials in period-correct attire exchanging a restrained greeting beside a mahogany table, cinematic historical documentary, faces natural and understated, no readable documents, no text, no logos, no emblems, no watches, no modern electronics",
    camera: "slow lateral dolly",
    shotType: "medium two-shot",
    lighting: "soft overcast window light and warm practicals",
    motion: "subtle handshake and respectful body language",
    colorMood: "mahogany, cream and deep green",
    transition: "motion matched cut",
  },
  {
    order: 9,
    preset: "HistoricalEvent",
    title: "功労者への贈答",
    subtitle: "A SPECIAL GIFT",
    prompt:
      "1970s ceremonial gift presentation in a refined Omani interior, gloved attendant placing a closed unbranded dark leather presentation box into the hands of a recipient, quiet state occasion, premium photorealistic documentary, no object visible inside the box, no readable text, no logos, no crest, no watch, anatomically correct hands",
    camera: "slow controlled push toward the exchange",
    shotType: "close medium detail",
    lighting: "single warm key with soft falloff",
    motion: "one careful handover only",
    colorMood: "black leather, walnut and restrained gold",
    transition: "subtle light transition",
  },
  {
    order: 10,
    preset: "HistoricalEvent",
    title: "英国の名門ジュエラー",
    subtitle: "ASPREY\nLONDON",
    prompt:
      "1970s luxury London jeweller interior inspired by Bond Street craftsmanship, mahogany display cabinetry, velvet trays, brass lamps, a master craftsperson preparing an unbranded presentation box, premium archival cinema, no readable shop sign, no text, no logos, no emblems, no watch product visible, no modern objects",
    camera: "slow dolly through foreground glass reflections",
    shotType: "wide-to-medium interior",
    lighting: "warm tungsten pools in a dark room",
    motion: "subtle craft movement and rack focus",
    colorMood: "burgundy, walnut, brass and black",
    transition: "restrained dissolve",
  },
  ...[
    [11, "ProductHero", "選ばれたロレックス", "ROLEX Ref.1665/0", "1.jpg", "slow diagonal dolly", "full product hero"],
    [12, "WatchMacro", "文字盤", "GOLD KHANJAR", "MG_1220.jpg", "macro push toward the dial", "dial macro"],
    [13, "ProductHero", "カンジャル", "THE EMBLEM", "MG_1220.jpg", "controlled crop toward the emblem", "emblem detail"],
    [14, "ProductHero", "裏蓋", "ASPREY", "MG_1204.jpg", "slow light sweep", "caseback macro"],
    [15, "ProductHero", "シリアル", "SERIAL / 1665", "MG_1202.jpg", "measured vertical drift", "engraving macro"],
    [16, "WatchMacro", "ムーブメント", "5,000,000 SERIES", "MG_1200.jpg", "subtle rack-focus simulation", "movement macro"],
    [17, "ProductHero", "ケースとリューズ", "CROWN / CASE", "MG_1216.jpg", "slow side-profile dolly", "case profile"],
    [18, "ProductHero", "ブレスレット", "BRACELET / CLASP", "MG_1212.jpg", "controlled pan across brushed steel", "clasp macro"],
    [19, "ProductHero", "最終商品カット", "GOLD KHANJAR", "1.jpg", "slow final hero push", "hero close-up"],
    [20, "Ending", "ブランドエンド", "", null, "minimal fade", "black ending"],
  ].map(([order, preset, title, subtitle, file, camera, shotType]) => ({
    order: order as number,
    preset: preset as string,
    title: title as string,
    subtitle: subtitle as string,
    file: file as string | null,
    prompt: file
      ? "Provided original product photograph only; preserve every product detail exactly."
      : "Pure black luxury brand ending with minimal motion and no product image.",
    camera: camera as string,
    shotType: shotType as string,
    lighting: file ? "controlled luxury studio light" : "black",
    motion: file ? "camera and light motion only" : "near stillness",
    colorMood: file ? "neutral steel, black and restrained gold" : "black",
    transition: order === 20 ? "fade to black" : "restrained dissolve",
  })),
] as Array<Record<string, unknown>>;

async function main() {
  const databaseUrl = required("DATABASE_URL");
  const adminEmail = required("ADMIN_EMAIL");
  const accountId = required("R2_ACCOUNT_ID");
  const bucket = required("R2_BUCKET_NAME");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    },
  });
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  await mkdir(workDir, { recursive: true });
  try {
    const [existing] = await sql`SELECT id, status FROM projects WHERE title = ${TITLE} LIMIT 1`;
    if (existing) {
      const [{ count }] = await sql`SELECT count(*)::int AS count FROM scenes WHERE project_id = ${existing.id}`;
      console.log(JSON.stringify({ projectId: existing.id, existing: true, status: existing.status, sceneCount: count }));
      return;
    }
    const [user] = await sql`SELECT id FROM users WHERE lower(email) = lower(${adminEmail}) LIMIT 1`;
    if (!user) throw new Error("Production admin user was not found");

    const projectId = randomUUID();
    const storyboardId = randomUUID();
    const uploadedAssets = new Map<string, { id: string; key: string; size: number }>();
    for (const definition of imageDefinitions) {
      const id = randomUUID();
      const source = path.join(assetsDir, definition.file);
      const bytes = await readFile(source);
      const key = `projects/${projectId}/source/${definition.file}`;
      await put(client, bucket, key, bytes, "image/jpeg");
      uploadedAssets.set(definition.file, { id, key, size: bytes.length });
    }

    const staticGenerations = new Map<number, { id: string; key: string }>();
    for (const scene of scenes.filter((item) => Number(item.order) >= 11)) {
      const order = Number(scene.order);
      const generationId = randomUUID();
      const output = path.join(workDir, `scene-${order}.mp4`);
      renderStaticScene(scene.file ? path.join(assetsDir, String(scene.file)) : null, output, order);
      const bytes = await readFile(output);
      const sceneId = deterministicSceneId(projectId, order);
      const key = `projects/${projectId}/scenes/${sceneId}/generations/${generationId}.mp4`;
      await put(client, bucket, key, bytes, "video/mp4");
      staticGenerations.set(order, { id: generationId, key });
    }

    await sql.begin(async (tx) => {
      await tx`INSERT INTO projects (id, user_id, title, script, style, language, target_duration, bgm_key, status)
        VALUES (${projectId}, ${user.id}, ${TITLE}, ${NARRATION}, 'cinematic_real', 'ja', 60, 'journey-begins-cinematic', 'storyboard')`;
      await tx`INSERT INTO storyboards (id, project_id, version, is_active, total_duration)
        VALUES (${storyboardId}, ${projectId}, 1, true, 60)`;
      for (const definition of imageDefinitions) {
        const asset = uploadedAssets.get(definition.file)!;
        await tx`INSERT INTO assets (id, project_id, type, label, object_key, mime_type, size_bytes)
          VALUES (${asset.id}, ${projectId}, 'watch_image', ${definition.label}, ${asset.key}, 'image/jpeg', ${asset.size})`;
      }
      for (const scene of scenes) {
        const order = Number(scene.order);
        const sceneId = deterministicSceneId(projectId, order);
        const staticGeneration = staticGenerations.get(order);
        await tx`INSERT INTO scenes (
          id, storyboard_id, project_id, "order", preset, title, duration, narration,
          narration_tone, dialogue, subtitle, visual_description, visual_prompt, camera,
          shot_type, lighting, motion, color_mood, transition, watch_reference,
          preferred_asset_labels, year, location, selected_generation_id
        ) VALUES (
          ${sceneId}, ${storyboardId}, ${projectId}, ${order}, ${String(scene.preset)},
          ${String(scene.title)}, 3, ${order === 6 ? NARRATION : ""}, 'documentary', '[]'::jsonb,
          ${String(scene.subtitle)}, ${String(scene.prompt)}, ${String(scene.prompt)},
          ${String(scene.camera)}, ${String(scene.shotType)}, ${String(scene.lighting)},
          ${String(scene.motion)}, ${String(scene.colorMood)}, ${String(scene.transition)},
          false, '[]'::jsonb, ${scene.year ? String(scene.year) : null},
          ${scene.location ? String(scene.location) : null}, ${staticGeneration?.id ?? null}
        )`;
        if (staticGeneration)
          await tx`INSERT INTO video_generations (
            id, project_id, scene_id, version, provider, model, status, prompt,
            reference_asset_ids, requested_duration, output_object_key,
            estimated_cost_credits, estimated_cost_usd, actual_cost_credits, actual_cost_usd,
            completed_at
          ) VALUES (
            ${staticGeneration.id}, ${projectId}, ${sceneId}, 1, 'internal', 'photo-motion-v1',
            'completed', ${String(scene.prompt)}, '[]'::jsonb, 3, ${staticGeneration.key},
            0, 0, 0, 0, now()
          )`;
      }
    });
    console.log(JSON.stringify({ projectId, storyboardId, existing: false, sceneCount: scenes.length }));
  } finally {
    await sql.end();
  }
}

function renderStaticScene(source: string | null, output: string, order: number) {
  const common = [
    "-r", "24", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", output,
  ];
  const args = source
    ? [
        "-y", "-loop", "1", "-framerate", "24", "-t", "3", "-i", source,
        "-filter_complex",
        `[0:v]split=2[bg0][fg0];[bg0]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=48,eq=brightness=-0.48:saturation=0.35[bg];[fg0]scale=1320:1320,zoompan=z='1+0.045*(on/71)':x='iw/2-(iw/zoom/2)+${order % 2 ? "12" : "-12"}*(on/71)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1080:fps=24,eq=contrast=1.04:saturation=0.98[fg];[bg][fg]overlay=0:420,vignette=PI/5,fade=t=in:st=0:d=0.15,fade=t=out:st=2.82:d=0.18,format=yuv420p[v]`,
        "-map", "[v]", "-t", "3", ...common,
      ]
    : [
        "-y", "-f", "lavfi", "-i", "color=c=black:s=1080x1920:r=24:d=3",
        "-vf", "noise=alls=1.2:allf=t+u,fade=t=in:st=0:d=0.5,format=yuv420p",
        "-t", "3", ...common,
      ];
  const result = spawnSync(ffmpeg, args, { encoding: "utf8", windowsHide: true, timeout: 180_000 });
  if (result.status !== 0) throw new Error(`Static scene ${order} failed: ${(result.stderr || "").slice(-1200)}`);
}

async function put(client: S3Client, bucket: string, key: string, body: Uint8Array, type: string) {
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: type }));
}

function deterministicSceneId(projectId: string, order: number) {
  const hex = projectId.replaceAll("-", "");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${String(order).padStart(3, "0").slice(-3)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
