from __future__ import annotations

import json
import math
import random
import shutil
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSETS_DIR = ROOT / "assets" / "video_10_assets"
WIDTH = 1920
HEIGHT = 1080


SCENES = [
    {
        "title": "The Jungle Mirage",
        "palette": ((9, 24, 18), (17, 74, 52), (214, 159, 58)),
        "motif": "jungle_mine",
        "label": "EAST KALIMANTAN / BUSANG",
    },
    {
        "title": "The Penny Stock King",
        "palette": ((16, 18, 22), (43, 61, 68), (63, 145, 99)),
        "motif": "office_finance",
        "label": "CALGARY / PENNY STOCK",
    },
    {
        "title": "The Filipino Geologist",
        "palette": ((24, 23, 19), (92, 76, 54), (202, 174, 107)),
        "motif": "core_samples",
        "label": "DRILL CORES / FIRST RESULTS",
    },
    {
        "title": "Salting the Core",
        "palette": ((18, 13, 10), (82, 43, 26), (231, 182, 62)),
        "motif": "salting_core",
        "label": "THE GOLD DUST TRICK",
    },
    {
        "title": "The Gold Rush",
        "palette": ((7, 14, 22), (20, 75, 77), (43, 219, 130)),
        "motif": "trading_floor",
        "label": "BRE-X VALUATION: $6B",
    },
    {
        "title": "The Jungle Metropolis",
        "palette": ((13, 28, 20), (64, 71, 43), (234, 159, 59)),
        "motif": "mine_camp",
        "label": "A MINE CAMP BUILT ON FAITH",
    },
    {
        "title": "The Giants Circle",
        "palette": ((14, 18, 25), (49, 63, 81), (224, 151, 60)),
        "motif": "boardroom_mine",
        "label": "THE MINING GIANTS ARRIVE",
    },
    {
        "title": "The Due Diligence",
        "palette": ((10, 16, 18), (45, 80, 84), (196, 220, 213)),
        "motif": "lab_due_diligence",
        "label": "INDEPENDENT DRILLING",
    },
    {
        "title": "The Flight from Busang",
        "palette": ((6, 18, 14), (28, 74, 60), (202, 138, 48)),
        "motif": "helicopter_jungle",
        "label": "MARCH 19, 1997",
    },
    {
        "title": "The Truth Uncovered",
        "palette": ((19, 19, 22), (71, 68, 57), (218, 189, 89)),
        "motif": "assay_reveal",
        "label": "THE SAMPLES WERE SALTED",
    },
    {
        "title": "The Crash",
        "palette": ((13, 13, 18), (65, 28, 31), (231, 63, 54)),
        "motif": "market_crash",
        "label": "THE STOCK COLLAPSES",
    },
    {
        "title": "The Shadow of Busang",
        "palette": ((8, 20, 16), (43, 70, 50), (159, 123, 65)),
        "motif": "reclaimed_site",
        "label": "THE JUNGLE TAKES IT BACK",
    },
]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def gradient(palette: tuple[tuple[int, int, int], tuple[int, int, int], tuple[int, int, int]], seed: int) -> Image.Image:
    rng = random.Random(seed)
    base, mid, accent = palette
    low_w = 384
    low_h = 216
    img = Image.new("RGB", (low_w, low_h), base)
    px = img.load()
    cx = low_w * (0.38 + rng.random() * 0.24)
    cy = low_h * (0.35 + rng.random() * 0.22)
    for y in range(low_h):
        vertical = y / (low_h - 1)
        for x in range(low_w):
            radial = min(1.0, math.hypot((x - cx) / low_w, (y - cy) / low_h) * 2.2)
            t = min(1.0, vertical * 0.7 + radial * 0.38)
            color = tuple(lerp(mid[i], base[i], t) for i in range(3))
            glow = max(0.0, 1.0 - radial * 2.7) * 0.55
            color = tuple(min(255, lerp(color[i], accent[i], glow)) for i in range(3))
            px[x, y] = color
    return img.resize((WIDTH, HEIGHT), Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(0.4))


def add_grain_and_vignette(img: Image.Image, seed: int) -> Image.Image:
    random.seed(seed)
    grain = Image.effect_noise((WIDTH, HEIGHT), 26).convert("L")
    img = Image.blend(img, Image.merge("RGB", (grain, grain, grain)), 0.055)

    low_w = 384
    low_h = 216
    mask = Image.new("L", (low_w, low_h), 0)
    mp = mask.load()
    for y in range(low_h):
        for x in range(low_w):
            d = math.hypot((x - low_w / 2) / (low_w / 2), (y - low_h / 2) / (low_h / 2))
            mp[x, y] = max(0, min(210, int((d - 0.32) * 220)))
    mask = mask.resize((WIDTH, HEIGHT), Image.Resampling.BICUBIC)
    dark = Image.new("RGB", (WIDTH, HEIGHT), (0, 0, 0))
    return Image.composite(dark, img, mask)


def draw_leaves(draw: ImageDraw.ImageDraw, rng: random.Random, opacity: int = 90) -> None:
    for _ in range(52):
        x = rng.randint(-160, WIDTH + 80)
        y = rng.randint(-80, HEIGHT + 40)
        length = rng.randint(120, 340)
        angle = rng.uniform(-1.4, 1.4)
        w = rng.randint(16, 40)
        color = (11, rng.randint(48, 93), rng.randint(35, 62), opacity)
        x2 = x + math.cos(angle) * length
        y2 = y + math.sin(angle) * length
        draw.line((x, y, x2, y2), fill=color, width=max(2, w // 5))
        for i in range(5):
            t = (i + 1) / 6
            bx = x + (x2 - x) * t
            by = y + (y2 - y) * t
            side = -1 if i % 2 else 1
            lx = bx + math.cos(angle + side * 1.05) * w * 3.8
            ly = by + math.sin(angle + side * 1.05) * w * 3.8
            draw.polygon([(bx, by), (lx, ly), (bx + math.cos(angle) * w * 2, by + math.sin(angle) * w * 2)], fill=color)


def draw_mine_pit(draw: ImageDraw.ImageDraw, cx: int, cy: int, scale: float, color=(156, 107, 55, 180)) -> None:
    for i in range(8):
        w = int((820 - i * 70) * scale)
        h = int((340 - i * 26) * scale)
        y = cy + int(i * 28 * scale)
        bbox = (cx - w // 2, y - h // 2, cx + w // 2, y + h // 2)
        shade = tuple(max(0, min(255, color[j] - i * 12)) for j in range(3)) + (color[3],)
        draw.arc(bbox, 8, 172, fill=shade, width=max(3, int(8 * scale)))
        draw.arc(bbox, 188, 352, fill=(30, 24, 19, 180), width=max(2, int(5 * scale)))


def draw_documents(draw: ImageDraw.ImageDraw, x: int, y: int, rng: random.Random, label: str = "ASSAY REPORT") -> None:
    for i in range(3):
        ox = x + i * 30
        oy = y - i * 18
        draw.rounded_rectangle((ox, oy, ox + 470, oy + 610), radius=10, fill=(215, 204, 178, 210), outline=(60, 49, 38, 180), width=3)
        draw.text((ox + 36, oy + 36), label, fill=(38, 34, 30, 210), font=font(32, True))
        for row in range(9):
            yy = oy + 110 + row * 45
            draw.line((ox + 40, yy, ox + 420 - rng.randint(0, 130), yy), fill=(77, 68, 59, 150), width=3)


def draw_scene_overlay(img: Image.Image, scene: dict, idx: int) -> None:
    rng = random.Random(idx * 421)
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    motif = scene["motif"]

    if motif == "jungle_mine":
        draw_leaves(draw, rng, 115)
        draw_mine_pit(draw, 1220, 650, 0.95)
        draw.rectangle((780, 530, 830, 735), fill=(34, 31, 26, 210))
        draw.line((705, 735, 805, 470, 905, 735), fill=(57, 43, 28, 210), width=10)
        draw.ellipse((1115, 610, 1205, 700), outline=(236, 173, 68, 170), width=5)
    elif motif == "office_finance":
        draw.rectangle((0, 690, WIDTH, HEIGHT), fill=(14, 12, 10, 170))
        draw.rounded_rectangle((325, 520, 1260, 780), radius=28, fill=(82, 54, 34, 210))
        draw_documents(draw, 760, 235, rng, "BRE-X MINERALS")
        draw.ellipse((340, 150, 520, 330), fill=(227, 166, 67, 150))
        draw.rectangle((425, 315, 445, 540), fill=(116, 91, 55, 220))
        for i in range(18):
            draw.line((1120, 300 + i * 22, 1520, 300 + i * 22), fill=(52, 205, 114, 105), width=3)
    elif motif == "core_samples":
        draw_leaves(draw, rng, 45)
        for tray in range(4):
            y = 330 + tray * 118
            draw.rounded_rectangle((410, y, 1540, y + 72), radius=12, fill=(85, 62, 42, 220), outline=(180, 138, 83, 130), width=3)
            for i in range(11):
                x = 445 + i * 96
                draw.rounded_rectangle((x, y + 14, x + 78, y + 56), radius=18, fill=(124 + rng.randint(-18, 18), 118 + rng.randint(-16, 16), 106 + rng.randint(-12, 12), 235))
    elif motif == "salting_core":
        draw.rounded_rectangle((470, 590, 1360, 830), radius=90, fill=(74, 62, 52, 220), outline=(218, 177, 94, 110), width=4)
        draw.ellipse((780, 520, 1160, 810), fill=(44, 39, 36, 235), outline=(214, 175, 86, 140), width=6)
        draw.ellipse((840, 580, 1100, 740), fill=(88, 83, 76, 230))
        draw.ellipse((690, 345, 895, 550), outline=(237, 191, 67, 240), width=34)
        draw.line((885, 455, 1170, 545), fill=(200, 200, 190, 220), width=12)
        for _ in range(160):
            x = rng.randint(965, 1125)
            y = rng.randint(545, 665)
            draw.ellipse((x, y, x + 5, y + 5), fill=(246, 201, 73, rng.randint(130, 255)))
    elif motif == "trading_floor":
        for i in range(17):
            x = 210 + i * 88
            top = rng.randint(300, 650)
            draw.rectangle((x, top, x + 42, 790), fill=(34, 184, 104, 115))
        for i in range(9):
            y = 230 + i * 74
            draw.line((240, y, 1640, y + rng.randint(-70, 70)), fill=(50, 246, 136, 110), width=5)
        draw.line((260, 785, 560, 620, 840, 470, 1140, 360, 1540, 260), fill=(69, 255, 157, 220), width=10)
    elif motif == "mine_camp":
        draw_leaves(draw, rng, 65)
        for i in range(6):
            x = 330 + i * 210
            draw.rectangle((x, 640 - i % 2 * 25, x + 160, 760), fill=(75, 65, 47, 220))
            draw.polygon([(x - 20, 640 - i % 2 * 25), (x + 80, 575 - i % 2 * 25), (x + 180, 640 - i % 2 * 25)], fill=(38, 34, 29, 230))
        draw_mine_pit(draw, 1100, 520, 0.7, (132, 94, 55, 150))
        draw.line((180, 810, 1740, 660), fill=(178, 122, 59, 140), width=24)
    elif motif == "boardroom_mine":
        draw.rectangle((0, 700, WIDTH, HEIGHT), fill=(12, 12, 14, 190))
        draw.rounded_rectangle((350, 575, 1570, 815), radius=42, fill=(45, 39, 34, 235))
        for i in range(7):
            x = 430 + i * 170
            draw.ellipse((x, 430, x + 100, 540), fill=(25, 23, 25, 240))
            draw.rectangle((x + 20, 535, x + 80, 650), fill=(24, 23, 25, 240))
        draw_mine_pit(draw, 1180, 330, 0.55, (181, 119, 58, 125))
    elif motif == "lab_due_diligence":
        draw_documents(draw, 290, 250, rng, "FREEPORT TESTS")
        for i in range(5):
            x = 850 + i * 120
            draw.rounded_rectangle((x, 550, x + 82, 820), radius=35, fill=(185, 205, 197, 105), outline=(218, 241, 234, 150), width=3)
            draw.rectangle((x + 18, 650, x + 64, 800), fill=(70, 101, 96, 145))
        draw.line((1170, 275, 1410, 515), fill=(220, 230, 225, 155), width=30)
        draw.ellipse((1340, 455, 1505, 620), outline=(220, 230, 225, 180), width=18)
    elif motif == "helicopter_jungle":
        draw_leaves(draw, rng, 100)
        draw.ellipse((650, 225, 1220, 370), fill=(12, 15, 15, 245))
        draw.rectangle((925, 332, 1270, 370), fill=(12, 15, 15, 245))
        draw.line((510, 195, 1390, 195), fill=(18, 21, 21, 235), width=12)
        draw.line((920, 370, 820, 470), fill=(18, 21, 21, 235), width=10)
        draw.line((1010, 370, 1120, 475), fill=(18, 21, 21, 235), width=10)
        draw.line((750, 480, 1190, 480), fill=(18, 21, 21, 235), width=10)
    elif motif == "assay_reveal":
        draw_documents(draw, 325, 255, rng, "ASSAY RESULTS")
        draw.rounded_rectangle((990, 450, 1550, 770), radius=28, fill=(42, 39, 35, 230), outline=(214, 185, 94, 170), width=4)
        for i in range(4):
            y = 500 + i * 55
            draw.line((1040, y, 1500, y), fill=(166, 144, 83, 140), width=4)
        for _ in range(95):
            x = rng.randint(1080, 1450)
            y = rng.randint(560, 720)
            draw.ellipse((x, y, x + 7, y + 7), fill=(238, 197, 75, rng.randint(130, 250)))
        draw.line((930, 835, 1560, 300), fill=(231, 52, 47, 170), width=14)
    elif motif == "market_crash":
        for i in range(12):
            x = 260 + i * 110
            draw.line((x, 240, x, 810), fill=(111, 41, 43, 100), width=3)
        points = [(270, 300), (520, 360), (710, 430), (920, 510), (1130, 690), (1440, 825), (1660, 850)]
        draw.line(points, fill=(239, 61, 54, 245), width=13)
        draw.polygon([(1638, 850), (1585, 812), (1600, 890)], fill=(239, 61, 54, 245))
        draw_documents(draw, 330, 370, rng, "BRE-X HALTED")
    elif motif == "reclaimed_site":
        draw_leaves(draw, rng, 125)
        draw.rectangle((690, 615, 1180, 740), fill=(66, 61, 48, 190))
        for i in range(7):
            x = 650 + i * 85
            draw.rectangle((x, 470 + rng.randint(-30, 30), x + 42, 760), fill=(56, 51, 40, 185))
        draw_mine_pit(draw, 1180, 520, 0.62, (106, 83, 52, 120))

    img.alpha_composite(overlay)


def add_title_treatment(img: Image.Image, scene: dict, idx: int) -> None:
    draw = ImageDraw.Draw(img, "RGBA")
    draw.rectangle((0, 0, WIDTH, HEIGHT), outline=(222, 169, 68, 35), width=18)
    draw.rectangle((90, 785, 1150, 980), fill=(0, 0, 0, 95))
    draw.text((122, 805), f"SCENE {idx:02d}", fill=(226, 172, 72, 225), font=font(34, True))
    draw.text((122, 856), scene["title"].upper(), fill=(238, 236, 224, 235), font=font(58, True))
    draw.text((124, 928), scene["label"], fill=(203, 204, 190, 185), font=font(30))
    draw.line((122, 910, 740, 910), fill=(226, 172, 72, 160), width=4)


def backup_existing_scene_images() -> None:
    backup_dir = ASSETS_DIR / f"card_visual_backup_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    backup_dir.mkdir(parents=True, exist_ok=True)
    for path in ASSETS_DIR.glob("scene_*_image.png"):
        shutil.copy2(path, backup_dir / path.name)


def main() -> None:
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    backup_existing_scene_images()
    attribution = []

    for idx, scene in enumerate(SCENES, start=1):
        img = gradient(scene["palette"], idx).convert("RGBA")
        draw_scene_overlay(img, scene, idx)
        img = add_grain_and_vignette(img.convert("RGB"), idx * 73).convert("RGBA")
        add_title_treatment(img, scene, idx)
        out = ASSETS_DIR / f"scene_{idx}_image.png"
        img.convert("RGB").save(out, "PNG", optimize=True)
        attribution.append({
            "scene_number": idx,
            "file": f"assets/video_10_assets/scene_{idx}_image.png",
            "title": scene["title"],
            "license": "Original production artwork generated locally for Corporate Shadows",
            "credit": "Corporate Shadows local cinematic visual builder",
            "replacement_reason": "Replaced abstract evidence-board/card visual with documentary-style scene plate",
        })
        print(f"[OK] scene_{idx}_image.png - {scene['title']}")

    manifest = {
        "video_id": 10,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "style": "cinematic_documentary_scene_plates",
        "replaces": "abstract beat/card visuals from failed VID-0010 QA pass",
        "scene_count": len(SCENES),
        "rules": [
            "No diagonal fallback placeholders",
            "No abstract evidence-board cards as primary final visuals",
            "Scene plates must visually match the narration beat and Corporate Shadows dark documentary style",
        ],
    }
    (ASSETS_DIR / "visual_quality_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (ASSETS_DIR / "asset_attribution.json").write_text(json.dumps(attribution, indent=2), encoding="utf-8")
    print(f"[OK] wrote {ASSETS_DIR / 'visual_quality_manifest.json'}")


if __name__ == "__main__":
    main()
