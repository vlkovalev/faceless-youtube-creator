#!/usr/bin/env python3
"""
generate_cinematic_created_variants.py

Creates denser created visuals that feel like illustrated documentary scenes
instead of repeated title cards. This keeps the clean generated style while
adding more image variety and avoiding low-quality archival replacements.
"""

import argparse
import json
import math
import os
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
W, H = 1920, 1080


PALETTES = [
    {"bg": (9, 10, 13), "ink": (236, 238, 241), "muted": (135, 142, 152), "line": (222, 44, 65), "gold": (235, 179, 58), "glass": (72, 180, 210)},
    {"bg": (10, 12, 16), "ink": (238, 238, 232), "muted": (130, 138, 150), "line": (58, 152, 220), "gold": (238, 198, 72), "glass": (105, 210, 180)},
    {"bg": (12, 10, 14), "ink": (240, 237, 232), "muted": (145, 132, 145), "line": (185, 70, 92), "gold": (232, 180, 76), "glass": (167, 116, 226)},
]


def font(size, bold=False):
    paths = [
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
    ]
    for path in paths:
        if os.path.exists(path):
            return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()


FONT_TINY = font(24)
FONT_SMALL = font(32)
FONT_LABEL = font(38, True)


def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def keywords(scene, beat):
    return f"{scene.get('title', '')} {beat.get('narration_excerpt', '')} {beat.get('visual', '')}".lower()


def add_texture(img, seed):
    draw = ImageDraw.Draw(img, "RGBA")
    for y in range(0, H, 54):
        alpha = 16 + ((y + seed) % 4) * 4
        draw.line((0, y, W, y), fill=(255, 255, 255, alpha), width=1)
    for x in range(-200, W + 200, 155):
        off = int(math.sin((x + seed * 13) / 170) * 55)
        draw.line((x + off, 0, x - 260 + off, H), fill=(255, 255, 255, 18), width=1)
    noise = Image.effect_noise((W, H), 18).convert("L")
    overlay = Image.new("RGBA", (W, H), (255, 255, 255, 14))
    overlay.putalpha(noise.point(lambda p: int(p / 255 * 14)))
    return Image.alpha_composite(img, overlay)


def vignette(draw):
    for i in range(24):
        a = int(i * 4.5)
        draw.rectangle((i * 18, i * 10, W - i * 18, H - i * 10), outline=(0, 0, 0, a), width=22)


def diamond(draw, cx, cy, size, fill, outline):
    top = (cx, cy - size)
    right = (cx + size, cy)
    bottom = (cx, cy + size)
    left = (cx - size, cy)
    draw.polygon([top, right, bottom, left], fill=fill, outline=outline)
    draw.line((left, top, right, left, bottom, top), fill=outline, width=max(2, size // 14))


def draw_jewelry_counter(draw, p, seed):
    draw.rectangle((0, 735, W, H), fill=(18, 20, 24, 245))
    draw.rounded_rectangle((180, 535, 1680, 880), radius=26, fill=(22, 27, 32, 245), outline=(*p["glass"], 165), width=5)
    draw.rectangle((230, 590, 1630, 820), fill=(150, 210, 230, 42))
    for i in range(8):
        x = 330 + i * 150
        y = 690 + int(math.sin(i + seed) * 24)
        diamond(draw, x, y, 34 + (i % 3) * 8, (255, 255, 255, 45), (*p["gold"], 210))
    draw.ellipse((1260, 260, 1520, 520), outline=(*p["gold"], 190), width=18)
    diamond(draw, 1390, 240, 58, (255, 255, 255, 58), (*p["ink"], 210))


def draw_ad_agency(draw, p, seed):
    draw.rectangle((0, 670, W, H), fill=(26, 23, 20, 245))
    draw.rounded_rectangle((260, 250, 1060, 815), radius=12, fill=(218, 211, 193, 235), outline=(28, 28, 28, 220), width=4)
    for i, txt in enumerate(["A DIAMOND", "IS FOREVER", "STATUS", "ROMANCE"]):
        y = 315 + i * 88
        draw.rectangle((330, y, 820 - i * 38, y + 20), fill=(*p["line"], 205))
        draw.text((330, y + 28), txt, font=FONT_SMALL, fill=(34, 34, 34, 230))
    draw.line((1010, 300, 560, 710), fill=(*p["line"], 200), width=8)
    for i in range(4):
        x = 1190 + i * 105
        draw.rounded_rectangle((x, 390 + i * 25, x + 180, 620 + i * 25), radius=8, fill=(230, 225, 207, 230), outline=(*p["muted"], 170), width=3)
        draw.rectangle((x + 24, 430 + i * 25, x + 140, 445 + i * 25), fill=(*p["line"], 160))


def draw_mine_supply(draw, p, seed):
    draw.polygon([(0, 790), (360, 490), (820, 820), (1180, 470), (W, 780), (W, H), (0, H)], fill=(30, 32, 35, 245))
    for i in range(18):
        x = 130 + i * 92
        y = 690 + ((i * 37 + seed) % 140)
        diamond(draw, x, y, 18 + (i % 4) * 6, (255, 255, 255, 35), (*p["gold"], 185))
    draw.rounded_rectangle((1160, 160, 1700, 590), radius=18, fill=(20, 24, 28, 230), outline=(*p["line"], 150), width=5)
    for i in range(6):
        draw.line((1210, 230 + i * 52, 1610 - i * 32, 230 + i * 52), fill=(*p["muted"], 145), width=8)
    draw.line((1080, 350, 1320, 350), fill=(*p["gold"], 210), width=8)


def draw_hollywood(draw, p, seed):
    draw.rectangle((0, 720, W, H), fill=(18, 18, 22, 255))
    for x in [260, 520, 1420, 1660]:
        draw.polygon([(x, 210), (x + 130, 210), (x + 250, 760), (x - 120, 760)], fill=(*p["gold"], 32))
        draw.ellipse((x - 18, 178, x + 150, 245), fill=(245, 218, 140, 110))
    draw.ellipse((835, 300, 1015, 480), fill=(12, 13, 15, 255), outline=(*p["line"], 120), width=5)
    draw.polygon([(925, 480), (760, 850), (1110, 850)], fill=(14, 15, 18, 255), outline=(*p["line"], 95))
    for i in range(9):
        diamond(draw, 925 + int(math.sin(i) * 95), 375 + i * 38, 14, (255, 255, 255, 40), (*p["gold"], 180))


def draw_lab(draw, p, seed):
    draw.rectangle((0, 700, W, H), fill=(18, 22, 25, 255))
    draw.rounded_rectangle((680, 190, 1240, 800), radius=34, fill=(17, 24, 29, 250), outline=(*p["glass"], 175), width=7)
    draw.ellipse((790, 300, 1130, 640), outline=(*p["glass"], 180), width=8)
    diamond(draw, 960, 470, 95, (255, 255, 255, 50), (*p["ink"], 215))
    for i in range(7):
        draw.line((330, 315 + i * 58, 660, 315 + i * 58), fill=(*p["glass"], 110), width=4)
        draw.line((1260, 315 + i * 58, 1600, 315 + i * 58), fill=(*p["line"], 100), width=4)


def draw_evidence_wall(draw, p, seed):
    for i in range(10):
        x = 240 + (i % 5) * 285
        y = 180 + (i // 5) * 300
        draw.rounded_rectangle((x, y, x + 210, y + 165), radius=9, fill=(225, 219, 201, 230), outline=(28, 28, 28, 210), width=3)
        draw.rectangle((x + 22, y + 34, x + 172, y + 48), fill=(*p["line"], 180))
        for r in range(4):
            draw.rectangle((x + 22, y + 74 + r * 24, x + 175 - r * 18, y + 84 + r * 24), fill=(50, 50, 50, 120))
        if i:
            px = 240 + ((i - 1) % 5) * 285 + 210
            py = 180 + ((i - 1) // 5) * 300 + 82
            draw.line((px, py, x, y + 82), fill=(*p["gold"], 135), width=4)
    draw.ellipse((770, 375, 1160, 765), outline=(*p["line"], 190), width=7)


def draw_newspaper(draw, p, seed):
    draw.rounded_rectangle((300, 160, 1300, 850), radius=10, fill=(226, 220, 202, 238), outline=(24, 24, 24, 220), width=5)
    draw.text((380, 235), "MARKET MYTH", font=font(84, True), fill=(30, 30, 30, 230))
    draw.rectangle((385, 345, 900, 368), fill=(*p["line"], 190))
    for col in range(3):
        x = 385 + col * 270
        for r in range(10):
            draw.rectangle((x, 430 + r * 35, x + 210 - (r % 3) * 45, 442 + r * 35), fill=(42, 42, 42, 130))
    diamond(draw, 1480, 500, 135, (255, 255, 255, 45), (*p["gold"], 190))


def draw_scene(draw, p, seed, text):
    if any(k in text for k in ["jewelry", "ring", "engagement", "woman", "american man", "young american"]):
        draw_jewelry_counter(draw, p, seed)
    elif any(k in text for k in ["agency", "advertising", "copywriter", "slogan", "magazines", "campaign"]):
        draw_ad_agency(draw, p, seed)
    elif any(k in text for k in ["mine", "stones", "supply", "deposits", "cartel", "price collapse"]):
        draw_mine_supply(draw, p, seed)
    elif any(k in text for k in ["movie", "hollywood", "actress", "feature diamonds"]):
        draw_hollywood(draw, p, seed)
    elif any(k in text for k in ["lab", "grown", "chemically", "scientists"]):
        draw_lab(draw, p, seed)
    elif any(k in text for k in ["document", "evidence", "corporate", "de beers", "powerful"]):
        draw_evidence_wall(draw, p, seed)
    else:
        draw_newspaper(draw, p, seed)


def label_text(draw, p, beat_id, text):
    words = clean(text).split()
    label = " ".join(words[:5]).upper()
    if len(label) > 38:
        label = label[:36] + "..."
    draw.rectangle((92, 84, 560, 90), fill=(*p["line"], 220))
    draw.text((92, 108), f"BEAT {beat_id.upper()}", font=FONT_TINY, fill=(*p["muted"], 235))
    draw.rounded_rectangle((90, 825, 910, 945), radius=12, fill=(4, 5, 7, 205), outline=(*p["line"], 125), width=3)
    draw.text((124, 856), label, font=FONT_LABEL, fill=(*p["ink"], 245))
    draw.text((126, 910), "CORPORATE SHADOWS", font=FONT_TINY, fill=(*p["muted"], 230))


def make_image(video, scene, beat, output):
    beat_id = str(beat.get("beat_id", ""))
    seed = sum(ord(c) for c in beat_id) + int(scene.get("scene_number", 0)) * 31
    p = PALETTES[seed % len(PALETTES)]
    img = Image.new("RGBA", (W, H), (*p["bg"], 255))
    draw = ImageDraw.Draw(img, "RGBA")
    text = keywords(scene, beat)
    draw_scene(draw, p, seed, text)
    vignette(draw)
    label_text(draw, p, beat_id, beat.get("narration_excerpt", ""))
    img = add_texture(img, seed).convert("RGB")
    img = img.filter(ImageFilter.UnsharpMask(radius=1.2, percent=105, threshold=3))
    img.save(output, "PNG", optimize=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", type=int, required=True)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    assets_dir = ROOT / "assets" / f"video_{args.video}_assets"
    plan_path = assets_dir / "visual_plan.json"
    plan = json.loads(plan_path.read_text(encoding="utf-8-sig"))
    count = 0

    for scene in plan.get("scenes", []):
        for beat in scene.get("beats", []):
            beat_id = str(beat.get("beat_id", ""))
            out_file = assets_dir / f"beat_{beat_id}.png"
            if out_file.exists() and not args.force:
                continue
            make_image(args.video, scene, beat, out_file)
            beat["asset_file"] = f"assets/video_{args.video}_assets/beat_{beat_id}.png"
            beat["status"] = "downloaded"
            beat["selected_source_title"] = "Original cinematic created visual"
            beat["selected_source_license"] = "Original generated production graphic"
            count += 1

    plan_path.write_text(json.dumps(plan, indent=2), encoding="utf-8")
    print(f"Generated {count} cinematic created visuals for video {args.video}")


if __name__ == "__main__":
    main()
