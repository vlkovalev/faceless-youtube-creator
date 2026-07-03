#!/usr/bin/env python3
"""
generate_created_beat_variants.py

Creates additional generated/created beat images for densified visual plans.
This is for cases where real archival images are low quality and the channel
should keep the cleaner generated visual style, but with more unique images.

Usage:
    python automation/generate_created_beat_variants.py --video 1
"""

import argparse
import json
import math
import os
import re
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
W, H = 1920, 1080


PALETTES = [
    {"bg": (8, 10, 14), "line": (215, 38, 61), "accent": (245, 158, 11), "dim": (120, 128, 140)},
    {"bg": (10, 13, 18), "line": (56, 189, 248), "accent": (250, 204, 21), "dim": (128, 140, 155)},
    {"bg": (12, 10, 16), "line": (168, 85, 247), "accent": (251, 113, 133), "dim": (134, 125, 150)},
    {"bg": (9, 13, 12), "line": (34, 197, 94), "accent": (234, 179, 8), "dim": (120, 140, 130)},
]


def load_font(size, bold=False):
    candidates = [
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
    ]
    for candidate in candidates:
        if os.path.exists(candidate):
            return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default()


FONT_LABEL = load_font(26)
FONT_SMALL = load_font(34)
FONT_BODY = load_font(44)
FONT_TITLE = load_font(76, bold=True)
FONT_HUGE = load_font(112, bold=True)


def clean_text(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def short_title(text):
    text = clean_text(text)
    text = re.sub(r"^[. ]+", "", text)
    words = [w.strip(",;:") for w in text.split()]
    keep = []
    for word in words:
        if len(" ".join(keep + [word])) > 42:
            break
        keep.append(word)
    return " ".join(keep).upper() or "THE ILLUSION"


def subtitle(text):
    text = clean_text(text)
    words = text.split()
    return " ".join(words[0:10])


def draw_wrapped(draw, text, xy, font, fill, width, spacing=12):
    lines = []
    for para in text.split("\n"):
        lines.extend(textwrap.wrap(para, width=width) or [""])
    x, y = xy
    for line in lines:
        draw.text((x, y), line, font=font, fill=fill)
        y += font.size + spacing
    return y


def add_noise(img, opacity=18):
    noise = Image.effect_noise((W, H), 26).convert("L")
    color = Image.new("RGBA", (W, H), (255, 255, 255, opacity))
    alpha = noise.point(lambda p: int((p / 255) * opacity))
    color.putalpha(alpha)
    return Image.alpha_composite(img.convert("RGBA"), color)


def draw_grid(draw, palette, seed):
    for x in range(-200, W + 200, 140):
        offset = int(math.sin((x + seed * 19) / 180) * 80)
        draw.line((x + offset, 0, x - 240 + offset, H), fill=(*palette["dim"], 42), width=2)
    for y in range(120, H, 150):
        draw.line((0, y, W, y + int(math.sin(seed + y) * 12)), fill=(*palette["dim"], 28), width=1)


def draw_document_stack(draw, palette, seed):
    base_x = 1120 + (seed % 4) * 18
    base_y = 185 + (seed % 5) * 10
    for i in range(5):
        x = base_x + i * 32
        y = base_y + i * 40
        draw.rounded_rectangle((x, y, x + 500, y + 650), radius=8, fill=(230, 224, 210, 230), outline=(*palette["line"], 130), width=3)
        draw.rectangle((x + 36, y + 50, x + 350, y + 64), fill=(45, 45, 45, 190))
        for row in range(8):
            yy = y + 120 + row * 46
            draw.rectangle((x + 36, yy, x + 420 - row * 15, yy + 9), fill=(72, 72, 72, 120))
    draw.line((base_x - 50, base_y + 580, base_x + 520, base_y + 120), fill=(*palette["line"], 180), width=5)


def draw_diamond_field(draw, palette, seed):
    cx, cy = 1330, 500
    for i in range(26):
        angle = (i / 26) * math.tau
        radius = 90 + (i % 7) * 34
        x = cx + math.cos(angle + seed) * radius
        y = cy + math.sin(angle * 1.4 + seed) * radius
        size = 18 + (i % 4) * 8
        points = [(x, y - size), (x + size, y), (x, y + size), (x - size, y)]
        draw.polygon(points, outline=(*palette["accent"], 180), fill=(255, 255, 255, 28))
    draw.ellipse((cx - 210, cy - 210, cx + 210, cy + 210), outline=(*palette["line"], 150), width=4)


def draw_evidence_board(draw, palette, seed):
    for i in range(7):
        x = 980 + (i % 3) * 235 + (seed % 3) * 10
        y = 165 + (i // 3) * 245
        draw.rounded_rectangle((x, y, x + 180, y + 135), radius=6, fill=(230, 225, 210, 220), outline=(30, 30, 30, 200), width=2)
        draw.rectangle((x + 18, y + 24, x + 150, y + 34), fill=(40, 40, 40, 150))
        draw.rectangle((x + 18, y + 60, x + 120, y + 70), fill=(*palette["line"], 150))
        if i:
            draw.line((x - 120, y + 60, x, y + 60), fill=(*palette["accent"], 150), width=3)
    draw.ellipse((1260, 470, 1510, 720), outline=(*palette["line"], 180), width=5)


def draw_silhouette(draw, palette, seed):
    x = 1320
    y = 220
    draw.ellipse((x, y, x + 150, y + 150), fill=(18, 20, 24, 245), outline=(*palette["line"], 90), width=3)
    draw.rounded_rectangle((x - 70, y + 150, x + 220, y + 620), radius=60, fill=(12, 14, 18, 245), outline=(*palette["line"], 75), width=3)
    for i in range(6):
        yy = y + 230 + i * 55
        draw.line((x - 250, yy, x - 20, yy + (seed % 4) * 8), fill=(*palette["accent"], 80), width=2)


def motif(draw, palette, seed, beat_text, scene_title):
    combined = f"{scene_title} {beat_text}".lower()
    if any(k in combined for k in ["letter", "agency", "document", "advertising", "campaign", "slogan"]):
        draw_document_stack(draw, palette, seed)
    elif any(k in combined for k in ["mine", "diamond", "stone", "carat", "ring"]):
        draw_diamond_field(draw, palette, seed)
    elif any(k in combined for k in ["cartel", "control", "price", "monopoly", "supply"]):
        draw_evidence_board(draw, palette, seed)
    else:
        draw_silhouette(draw, palette, seed)


def make_image(video_id, scene, beat, out_path):
    seed = sum(ord(c) for c in str(beat.get("beat_id", ""))) + int(scene.get("scene_number", 0)) * 17
    palette = PALETTES[seed % len(PALETTES)]
    img = Image.new("RGBA", (W, H), (*palette["bg"], 255))
    draw = ImageDraw.Draw(img, "RGBA")

    # Subtle vignette and grid
    for r in range(0, 900, 18):
        alpha = int(80 * (r / 900))
        draw.ellipse((W // 2 - r, H // 2 - r, W // 2 + r, H // 2 + r), outline=(0, 0, 0, alpha), width=18)
    draw_grid(draw, palette, seed)

    beat_id = str(beat.get("beat_id", "")).upper()
    text = clean_text(beat.get("narration_excerpt", ""))
    title = short_title(text)
    sub = subtitle(text)

    motif(draw, palette, seed, text, scene.get("title", ""))

    safe_x = 210

    # Header
    draw.rectangle((safe_x, 70, safe_x + 520, 76), fill=(*palette["line"], 220))
    draw.text((safe_x, 92), f"VIDEO {video_id}  /  BEAT {beat_id}", font=FONT_LABEL, fill=(170, 178, 190, 255))

    # Main title block
    title_font = FONT_TITLE if len(title) <= 30 else FONT_BODY
    wrapped_width = 20 if len(title) <= 30 else 34
    y = draw_wrapped(draw, title, (safe_x, 325), title_font, (246, 247, 249, 255), wrapped_width, spacing=12)
    draw.text((safe_x + 4, y + 14), sub, font=FONT_SMALL, fill=(185, 190, 198, 235))

    # Footer bars
    draw.rectangle((0, H - 74, W, H - 68), fill=(*palette["accent"], 230))
    draw.text((safe_x, H - 54), "CORPORATE SHADOWS", font=FONT_LABEL, fill=(172, 178, 190, 220))
    draw.rectangle((safe_x, H - 92, safe_x + 300, H - 88), fill=(*palette["line"], 200))

    img = add_noise(img, opacity=16).convert("RGB")
    img = img.filter(ImageFilter.UnsharpMask(radius=1.4, percent=110, threshold=3))
    img.save(out_path, "PNG", optimize=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", type=int, required=True)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    assets_dir = ROOT / "assets" / f"video_{args.video}_assets"
    plan_path = assets_dir / "visual_plan.json"
    plan = json.loads(plan_path.read_text(encoding="utf-8-sig"))
    created = 0

    for scene in plan.get("scenes", []):
        for beat in scene.get("beats", []):
            beat_id = str(beat.get("beat_id"))
            out_file = assets_dir / f"beat_{beat_id}.png"
            if out_file.exists() and not args.force:
                continue
            make_image(args.video, scene, beat, out_file)
            beat["asset_file"] = f"assets/video_{args.video}_assets/beat_{beat_id}.png"
            beat["status"] = "downloaded"
            beat["selected_source_title"] = "Generated created beat variant"
            beat["selected_source_license"] = "Original generated production graphic"
            created += 1

    plan_path.write_text(json.dumps(plan, indent=2), encoding="utf-8")
    print(f"Generated {created} created beat variants for video {args.video}")


if __name__ == "__main__":
    main()
