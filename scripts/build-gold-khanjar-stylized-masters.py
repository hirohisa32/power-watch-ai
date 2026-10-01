from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "client-demo" / "gold-khanjar" / "assets"
OUTPUT_ROOT = ROOT / "artifacts" / "gold-khanjar-quality-preview"
MASTER_DIR = OUTPUT_ROOT / "stylized-masters-v2"
COMPARISON_DIR = OUTPUT_ROOT / "comparisons-v2"
CONTACT_SHEET = OUTPUT_ROOT / "stylized-masters-v2-contact-sheet.jpg"
SERIAL_DETAIL = OUTPUT_ROOT / "serial-identity-detail.jpg"

MASTERS = (
    ("01-full-watch", "1.jpg", "FULL WATCH"),
    ("02-dial-macro", "MG_1220.jpg", "DIAL / GOLD KHANJAR"),
    ("03-outer-caseback", "MG_1204.jpg", "OUTER CASEBACK / ASPREY"),
    ("04-inner-caseback-serial", "MG_1202.jpg", "INNER CASEBACK / SOURCE SERIAL CHECK / 1665"),
    ("05-movement", "MG_1200.jpg", "MOVEMENT"),
    ("06-side-crown", "MG_1216.jpg", "SIDE / CROWN"),
    ("07-bracelet-clasp", "MG_1212.jpg", "BRACELET / CLASP"),
)


def _font(size: int) -> ImageFont.ImageFont:
    candidates = (
        Path("C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/segoeui.ttf"),
    )
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def stylize_identity_safe(source: Image.Image, size: int = 1254) -> Image.Image:
    """Apply only geometry-preserving, pixel-local editorial treatment.

    No generative fill, perspective warp, inpainting, OCR replacement, or text redraw
    is performed. Engravings and serial shapes therefore remain source-derived.
    """

    original = source.convert("RGB").resize((size, size), Image.Resampling.LANCZOS)
    softly_denoised = original.filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.SMOOTH_MORE)
    # Flatten micro-photographic texture enough to read as an editorial painting,
    # while keeping all contours and engraved glyphs sourced from the original.
    base = Image.blend(original, softly_denoised, 0.76)

    # Restrained cinematic grade: warm highlights, cool blacks, compressed saturation.
    pixels = np.asarray(base).astype(np.float32) / 255.0
    luminance = pixels[..., 0] * 0.2126 + pixels[..., 1] * 0.7152 + pixels[..., 2] * 0.0722
    shadow = np.clip((0.46 - luminance) / 0.46, 0.0, 1.0)[..., None]
    highlight = np.clip((luminance - 0.42) / 0.58, 0.0, 1.0)[..., None]
    pixels = pixels * (1.0 - 0.06 * shadow)
    pixels[..., 2:3] *= 1.0 + 0.035 * shadow
    pixels[..., 0:1] *= 1.0 + 0.065 * highlight
    pixels[..., 1:2] *= 1.0 + 0.025 * highlight

    # Gentle tonal quantisation creates an editorial-illustration surface while
    # retaining fine engravings. Eight-bit source values are not replaced by AI.
    levels = 12.0
    quantized = np.round(np.clip(pixels, 0.0, 1.0) * (levels - 1.0)) / (levels - 1.0)
    pixels = pixels * 0.16 + quantized * 0.84

    # Ink-like line emphasis is derived from the same source geometry.
    gray = np.asarray(ImageOps.grayscale(original)).astype(np.float32) / 255.0
    gx = np.zeros_like(gray)
    gy = np.zeros_like(gray)
    gx[:, 1:-1] = gray[:, 2:] - gray[:, :-2]
    gy[1:-1, :] = gray[2:, :] - gray[:-2, :]
    edge = np.clip(np.sqrt(gx * gx + gy * gy) * 2.7, 0.0, 1.0)[..., None]
    pixels *= 1.0 - 0.36 * edge

    # Subtle directional light and vignette unify the seven masters.
    yy, xx = np.mgrid[0:size, 0:size]
    x = xx / max(size - 1, 1)
    y = yy / max(size - 1, 1)
    light = np.exp(-(((x - 0.34) / 0.52) ** 2 + ((y - 0.24) / 0.64) ** 2))
    vignette = np.clip(1.0 - 0.17 * ((x - 0.5) ** 2 + (y - 0.5) ** 2) / 0.5, 0.82, 1.0)
    pixels *= vignette[..., None]
    pixels[..., 0] += light * 0.025
    pixels[..., 1] += light * 0.012

    # Deterministic fine grain, intentionally below engraving stroke width.
    rng = np.random.default_rng(5082955)
    grain = rng.normal(0.0, 0.0055, (size, size, 1)).astype(np.float32)
    pixels = np.clip(pixels + grain, 0.0, 1.0)

    result = Image.fromarray(np.round(pixels * 255.0).astype(np.uint8), mode="RGB")
    result = ImageEnhance.Contrast(result).enhance(1.11)
    result = ImageEnhance.Color(result).enhance(0.78)
    return result.filter(ImageFilter.UnsharpMask(radius=1.05, percent=68, threshold=4))


def comparison(original: Image.Image, master: Image.Image, title: str) -> Image.Image:
    width = 1800
    margin = 54
    label_height = 100
    panel = (width - margin * 3) // 2
    canvas = Image.new("RGB", (width, panel + label_height + margin * 2), (12, 12, 13))
    draw = ImageDraw.Draw(canvas)
    title_font = _font(34)
    label_font = _font(25)
    draw.text((margin, 24), title, fill=(235, 226, 207), font=title_font)
    draw.text((margin, 70), "SOURCE / IDENTITY MASTER", fill=(164, 164, 164), font=label_font)
    draw.text((margin * 2 + panel, 70), "STYLIZED / IDENTITY-SAFE", fill=(205, 166, 103), font=label_font)
    left = original.convert("RGB").resize((panel, panel), Image.Resampling.LANCZOS)
    right = master.convert("RGB").resize((panel, panel), Image.Resampling.LANCZOS)
    canvas.paste(left, (margin, label_height + margin))
    canvas.paste(right, (margin * 2 + panel, label_height + margin))
    return canvas


def main() -> None:
    MASTER_DIR.mkdir(parents=True, exist_ok=True)
    COMPARISON_DIR.mkdir(parents=True, exist_ok=True)
    comparisons: list[Image.Image] = []

    for slug, filename, label in MASTERS:
        original = Image.open(SOURCE_DIR / filename).convert("RGB")
        master = stylize_identity_safe(original)
        master_path = MASTER_DIR / f"{slug}.png"
        master.save(master_path, format="PNG", optimize=True)

        compare = comparison(original, master, label)
        compare.save(COMPARISON_DIR / f"{slug}-comparison.jpg", quality=93, subsampling=0)
        comparisons.append(compare.resize((900, 727), Image.Resampling.LANCZOS))

    rows = []
    for index in range(0, len(comparisons), 2):
        row = Image.new("RGB", (1800, 727), (8, 8, 9))
        row.paste(comparisons[index], (0, 0))
        if index + 1 < len(comparisons):
            row.paste(comparisons[index + 1], (900, 0))
        rows.append(row)

    sheet = Image.new("RGB", (1800, 727 * len(rows)), (8, 8, 9))
    for index, row in enumerate(rows):
        sheet.paste(row, (0, index * 727))
    sheet.save(CONTACT_SHEET, quality=92, subsampling=0)

    serial_source = Image.open(SOURCE_DIR / "MG_1202.jpg").convert("RGB")
    serial_master = Image.open(MASTER_DIR / "04-inner-caseback-serial.png").convert("RGB")
    source_crop = serial_source.crop((300, 330, 650, 610)).resize((840, 672), Image.Resampling.LANCZOS)
    master_crop = serial_master.crop((418, 460, 906, 850)).resize((840, 672), Image.Resampling.LANCZOS)
    serial_canvas = Image.new("RGB", (1800, 820), (10, 10, 11))
    serial_draw = ImageDraw.Draw(serial_canvas)
    serial_draw.text((54, 24), "SERIAL IDENTITY DETAIL — SOURCE PIXELS ARE AUTHORITATIVE", fill=(235, 226, 207), font=_font(32))
    serial_draw.text((54, 78), "SOURCE", fill=(164, 164, 164), font=_font(24))
    serial_draw.text((960, 78), "STYLIZED / NO GLYPH REDRAW", fill=(205, 166, 103), font=_font(24))
    serial_canvas.paste(source_crop, (54, 126))
    serial_canvas.paste(master_crop, (960, 126))
    serial_canvas.save(SERIAL_DETAIL, quality=95, subsampling=0)

    print(f"masters={MASTER_DIR}")
    print(f"comparisons={COMPARISON_DIR}")
    print(f"contact_sheet={CONTACT_SHEET}")
    print(f"serial_detail={SERIAL_DETAIL}")


if __name__ == "__main__":
    main()
