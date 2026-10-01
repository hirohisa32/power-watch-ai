from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ARTIFACT_DIR = ROOT / "artifacts" / "gold-khanjar-quality-preview" / "character-watch"
BASE_PATH = ARTIFACT_DIR / "character-watch-keyframe-placeholder.png"
MASTER_PATH = ROOT / "artifacts" / "gold-khanjar-quality-preview" / "stylized-masters-v2" / "01-full-watch.png"
KEYFRAME_PATH = ARTIFACT_DIR / "character-watch-keyframe-composited.png"
RAW_VIDEO_PATH = ARTIFACT_DIR / "character-watch-runway-raw.mp4"
FINAL_VIDEO_PATH = ARTIFACT_DIR / "character-watch-preview.mp4"
CONTACT_SHEET_PATH = ARTIFACT_DIR / "character-watch-contact-sheet.jpg"
FFMPEG = ROOT / "node_modules" / "@ffmpeg-installer" / "win32-x64" / "ffmpeg.exe"
FFPROBE = FFMPEG.with_name("ffprobe.exe")


def watch_layer(master: Image.Image) -> tuple[Image.Image, Image.Image]:
    rgb = master.convert("RGB")
    pixels = np.asarray(rgb)
    luminance = pixels[..., 0] * 0.2126 + pixels[..., 1] * 0.7152 + pixels[..., 2] * 0.0722
    foreground = Image.fromarray(np.where(luminance > 21, 255, 0).astype(np.uint8), "L")
    foreground = foreground.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9))

    # Flood-fill only border-connected black. Enclosed black dial areas remain part
    # of the watch; no generative segmentation or shape reconstruction is used.
    flooded = foreground.copy()
    for point in ((0, 0), (flooded.width - 1, 0), (0, flooded.height - 1), (flooded.width - 1, flooded.height - 1)):
        if flooded.getpixel(point) == 0:
            ImageDraw.floodfill(flooded, point, 128, thresh=0)
    alpha = Image.fromarray(np.where(np.asarray(flooded) == 128, 0, 255).astype(np.uint8), "L")
    alpha = alpha.filter(ImageFilter.GaussianBlur(1.2))
    bbox = alpha.getbbox()
    if not bbox:
        raise RuntimeError("Could not isolate the approved Stylized Watch Master")
    return rgb.crop(bbox), alpha.crop(bbox)


def glove_mask(frame: Image.Image) -> Image.Image:
    rgb = np.asarray(frame.convert("RGB")).astype(np.int16)
    high = rgb.max(axis=2)
    low = rgb.min(axis=2)
    neutral_bright = (high > 142) & ((high - low) < 72)
    height, width = neutral_bright.shape
    yy, xx = np.mgrid[0:height, 0:width]
    spatial = (yy > height * 0.43) & (yy < height * 0.79) & (
        (xx < width * 0.47) | (xx > width * 0.53)
    )
    mask = Image.fromarray(np.where(neutral_bright & spatial, 255, 0).astype(np.uint8), "L")
    return mask.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(4.2))


def composite_frame(
    frame: Image.Image,
    master_rgb: Image.Image,
    master_alpha: Image.Image,
    progress: float,
) -> Image.Image:
    width, height = frame.size
    scale = width / 941.0
    target_width = int(425 * scale * (1.0 + 0.018 * progress))
    ratio = target_width / master_rgb.width
    target_size = (target_width, max(1, int(master_rgb.height * ratio)))
    watch = master_rgb.resize(target_size, Image.Resampling.LANCZOS)
    alpha = master_alpha.resize(target_size, Image.Resampling.LANCZOS)

    center_x = int(width * 0.5)
    center_y = int(height * (0.548 - 0.018 * progress))
    x = center_x - target_size[0] // 2
    y = center_y - target_size[1] // 2

    result = frame.convert("RGB")
    shadow = Image.new("RGBA", result.size, (0, 0, 0, 0))
    shadow_alpha = Image.new("L", result.size, 0)
    shadow_alpha.paste(alpha, (x + int(5 * scale), y + int(15 * scale)))
    shadow_alpha = shadow_alpha.filter(ImageFilter.GaussianBlur(13 * scale))
    shadow.putalpha(shadow_alpha.point(lambda value: int(value * 0.46)))
    shadow.paste((12, 7, 4, 255), (0, 0, result.width, result.height), shadow.getchannel("A"))
    result = Image.alpha_composite(result.convert("RGBA"), shadow).convert("RGB")
    result.paste(watch, (x, y), alpha)

    # Restore the generated white gloves above the identity-safe watch layer so
    # fingers naturally occlude the case/bracelet instead of the watch floating.
    foreground = frame.convert("RGB")
    result.paste(foreground, (0, 0), glove_mask(frame))
    return result


def build_keyframe() -> None:
    base = Image.open(BASE_PATH).convert("RGB")
    master_rgb, master_alpha = watch_layer(Image.open(MASTER_PATH))
    result = composite_frame(base, master_rgb, master_alpha, 0.0)
    result.save(KEYFRAME_PATH, "PNG", optimize=True)


def build_video() -> None:
    if not RAW_VIDEO_PATH.exists():
        raise RuntimeError(f"Runway output is missing: {RAW_VIDEO_PATH}")
    if not FFMPEG.exists():
        raise RuntimeError(f"FFmpeg is missing: {FFMPEG}")

    frames_dir = ARTIFACT_DIR / ".frames"
    output_dir = ARTIFACT_DIR / ".frames-composited"
    if frames_dir.exists():
        shutil.rmtree(frames_dir)
    if output_dir.exists():
        shutil.rmtree(output_dir)
    frames_dir.mkdir(parents=True)
    output_dir.mkdir(parents=True)
    try:
        subprocess.run(
            [str(FFMPEG), "-y", "-i", str(RAW_VIDEO_PATH), str(frames_dir / "%05d.png")],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        frame_paths = sorted(frames_dir.glob("*.png"))
        if not frame_paths:
            raise RuntimeError("Runway preview contains no frames")
        master_rgb, master_alpha = watch_layer(Image.open(MASTER_PATH))
        for index, frame_path in enumerate(frame_paths):
            frame = Image.open(frame_path).convert("RGB")
            progress = index / max(len(frame_paths) - 1, 1)
            composited = composite_frame(frame, master_rgb, master_alpha, progress)
            composited.save(output_dir / frame_path.name, "PNG", optimize=False)
        subprocess.run(
            [
                str(FFMPEG), "-y", "-framerate", "24", "-i", str(output_dir / "%05d.png"),
                "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
                "-movflags", "+faststart", str(FINAL_VIDEO_PATH),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        selected = [0, len(frame_paths) // 4, len(frame_paths) // 2, (len(frame_paths) * 3) // 4, len(frame_paths) - 1]
        thumbs = [Image.open(output_dir / frame_paths[index].name).convert("RGB").resize((270, 480), Image.Resampling.LANCZOS) for index in selected]
        sheet = Image.new("RGB", (270 * len(thumbs), 480), (8, 8, 9))
        for index, thumb in enumerate(thumbs):
            sheet.paste(thumb, (index * 270, 0))
        sheet.save(CONTACT_SHEET_PATH, "JPEG", quality=92, subsampling=0)
    finally:
        if frames_dir.exists():
            shutil.rmtree(frames_dir)
        if output_dir.exists():
            shutil.rmtree(output_dir)


def main() -> None:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    build_keyframe()
    if RAW_VIDEO_PATH.exists():
        build_video()
    print(json.dumps({
        "keyframe": str(KEYFRAME_PATH),
        "video": str(FINAL_VIDEO_PATH) if FINAL_VIDEO_PATH.exists() else None,
        "contactSheet": str(CONTACT_SHEET_PATH) if CONTACT_SHEET_PATH.exists() else None,
        "identitySerial": "5082955",
        "identityMethod": "approved-master-overlay-with-source-derived-mask",
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
