from __future__ import annotations

import argparse
import json
import math
import random
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSETS_DIR = ROOT / "assets"
WIDTH = 1280
HEIGHT = 720
RED = (244, 20, 24)
GOLD = (238, 184, 75)


def read_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8-sig"))


def font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "C:/Windows/Fonts/impact.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def tokenize(text: str) -> set[str]:
    stop = {
        "the", "a", "an", "and", "or", "to", "of", "in", "on", "that", "who", "how",
        "with", "for", "from", "world", "company", "corporate", "giant",
    }
    return {word for word in normalize(text).split() if len(word) > 2 and word not in stop}


def queue_entry(video: str | None) -> dict[str, Any]:
    if not video:
        return {}
    queue = read_json(ROOT / "metadata" / "queue.json", [])
    candidates = []
    target_files = {
        f"FINAL_VIDEO_{video}.mp4",
        f"FINAL_VIDEO_{video}_VISUAL_UPGRADE.mp4",
        f"FINAL_VIDEO_{video}_OMNI_FLASH.mp4",
    }
    for item in queue:
        filename = str(item.get("filename", ""))
        thumb = str(item.get("thumbnail_filename", ""))
        if filename in target_files or thumb == f"youtube_thumbnail_video_{video}.png":
            candidates.append(item)
    if not candidates:
        return {}
    candidates.sort(key=lambda item: (item.get("publish_at") is not None, item.get("source_path") is not None), reverse=True)
    return candidates[0]


def research_match(title: str) -> dict[str, Any]:
    research = read_json(ROOT / "metadata" / "audience_research_brief.json", [])
    title_tokens = tokenize(title)
    best = {}
    best_score = 0
    for item in research:
        score = len(title_tokens & tokenize(str(item.get("title", ""))))
        scandal = str(item.get("scandal", ""))
        score += len(title_tokens & tokenize(scandal))
        if score > best_score:
            best = item
            best_score = score
    return best if best_score >= 2 else {}


def extract_concept_text(concept: str, title: str) -> str:
    quoted = re.findall(r"['\"]([^'\"]{3,28})['\"]", concept)
    if quoted:
        return quoted[-1].upper()
    upper = title.upper()
    title_rules = [
        ("GOLD", "FAKE GOLD"),
        ("PATENT", "PATENTED"),
        ("SEED", "PATENTED"),
        ("TEFLON", "IN YOUR BLOOD"),
        ("CHEMICAL", "POISONED"),
        ("FORMULA", "TOXIC GREED"),
        ("ELECTRICITY", "THE CARTEL"),
        ("DIAMOND", "THEY FOOLED YOU"),
        ("SCAM", "FAKE GOLD"),
        ("PAIN", "HOOKED"),
    ]
    for key, value in title_rules:
        if key in upper:
            return value
    words = [w for w in re.sub(r"[^A-Z0-9 ]+", " ", upper).split() if len(w) > 3]
    return " ".join(words[:3]) or "CORPORATE LIES"


def wrap_lines(text: str, draw: ImageDraw.ImageDraw, typeface: ImageFont.ImageFont, max_width: int) -> list[str]:
    words = text.upper().split()
    lines: list[str] = []
    current = ""
    for word in words:
        test = f"{current} {word}".strip()
        box = draw.textbbox((0, 0), test, font=typeface, stroke_width=0)
        if box[2] - box[0] <= max_width or not current:
            current = test
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines[:4]


def fit_font(text: str, max_width: int, max_height: int) -> tuple[ImageFont.ImageFont, list[str]]:
    probe = Image.new("RGB", (WIDTH, HEIGHT))
    draw = ImageDraw.Draw(probe)
    for size in range(150, 58, -4):
        typeface = font(size, True)
        lines = wrap_lines(text, draw, typeface, max_width)
        line_h = int(size * 0.88)
        total_h = line_h * len(lines)
        widest = max((draw.textbbox((0, 0), line, font=typeface, stroke_width=5)[2] for line in lines), default=0)
        if total_h <= max_height and widest <= max_width:
            return typeface, lines
    typeface = font(60, True)
    return typeface, wrap_lines(text, draw, typeface, max_width)


def crop_cover(img: Image.Image, width: int, height: int) -> Image.Image:
    img = img.convert("RGB")
    scale = max(width / img.width, height / img.height)
    resized = img.resize((math.ceil(img.width * scale), math.ceil(img.height * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - width) // 2
    top = (resized.height - height) // 2
    return resized.crop((left, top, left + width, top + height))


def pick_source_image(video: str | None, explicit: str | None) -> Path | None:
    if explicit:
        path = Path(explicit)
        if not path.is_absolute():
            path = ROOT / path
        return path if path.exists() else None
    return None


def base_background(seed: int, concept: str, source: Path | None) -> Image.Image:
    if source:
        img = crop_cover(Image.open(source), WIDTH, HEIGHT)
        img = img.filter(ImageFilter.GaussianBlur(1.4))
        img = ImageEnhance.Contrast(img).enhance(1.18)
        img = ImageEnhance.Color(img).enhance(0.86)
        return img

    rng = random.Random(seed)
    concept_upper = concept.upper()
    if "GOLD" in concept_upper or "MINE" in concept_upper:
        palette = ((7, 12, 10), (32, 80, 55), (219, 160, 56))
    elif "SEED" in concept_upper or "PATENT" in concept_upper:
        palette = ((9, 16, 12), (35, 86, 48), (120, 176, 70))
    elif "POISON" in concept_upper or "TOXIC" in concept_upper or "BLOOD" in concept_upper:
        palette = ((9, 10, 11), (27, 64, 58), (39, 210, 119))
    else:
        palette = ((8, 9, 12), (44, 48, 55), (196, 42, 45))
    low = Image.new("RGB", (320, 180), palette[0])
    px = low.load()
    cx = rng.randint(105, 215)
    cy = rng.randint(45, 120)
    for y in range(180):
        for x in range(320):
            d = min(1, math.hypot((x - cx) / 320, (y - cy) / 180) * 2.4)
            v = y / 180
            mix = min(1, d * 0.75 + v * 0.45)
            color = tuple(int(palette[1][i] * (1 - mix) + palette[0][i] * mix) for i in range(3))
            glow = max(0, 1 - d * 2.6)
            color = tuple(min(255, int(color[i] * (1 - glow * 0.45) + palette[2][i] * glow * 0.45)) for i in range(3))
            px[x, y] = color
    return low.resize((WIDTH, HEIGHT), Image.Resampling.BICUBIC)


def add_finish(img: Image.Image, seed: int) -> Image.Image:
    rng = random.Random(seed)
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rectangle((0, 0, WIDTH, HEIGHT), fill=(0, 0, 0, 72))
    for _ in range(26):
        x = rng.randint(-80, WIDTH + 80)
        y = rng.randint(-80, HEIGHT + 80)
        length = rng.randint(60, 220)
        a = rng.uniform(-0.9, 0.9)
        draw.line((x, y, x + math.cos(a) * length, y + math.sin(a) * length), fill=(255, 255, 255, rng.randint(4, 11)), width=rng.randint(1, 2))

    vignette = Image.new("L", (WIDTH, HEIGHT), 0)
    vp = vignette.load()
    for y in range(HEIGHT):
        for x in range(WIDTH):
            d = math.hypot((x - WIDTH / 2) / (WIDTH / 2), (y - HEIGHT / 2) / (HEIGHT / 2))
            vp[x, y] = max(0, min(210, int((d - 0.42) * 255)))
    dark = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 220))
    overlay = Image.composite(dark, overlay, vignette)
    return Image.alpha_composite(img.convert("RGBA"), overlay)


def draw_object(canvas: Image.Image, concept: str, seed: int) -> None:
    draw = ImageDraw.Draw(canvas, "RGBA")
    c = concept.upper()
    if "GOLD" in c or "MINE" in c:
        draw_mine(draw)
    elif "SEED" in c or "PATENT" in c or "SPROUT" in c:
        draw_locked_sprout(draw)
    elif "BLOOD" in c or "PAN" in c or "TEFLON" in c:
        draw_pan(draw)
    elif "FORMULA" in c or "BOTTLE" in c:
        draw_bottle(draw)
    elif "CARTEL" in c or "ELECTRICITY" in c:
        draw_bulb(draw)
    else:
        draw_documents(draw, seed)


def draw_mine(draw: ImageDraw.ImageDraw) -> None:
    cx, cy = 360, 445
    for i in range(8):
        w = 600 - i * 46
        h = 230 - i * 17
        y = cy + i * 25
        draw.arc((cx - w // 2, y - h // 2, cx + w // 2, y + h // 2), 190, 352, fill=(20, 16, 12, 230), width=15)
        draw.arc((cx - w // 2, y - h // 2, cx + w // 2, y + h // 2), 10, 172, fill=(210, 142, 49, 170), width=10)
    for r in range(165, 15, -18):
        alpha = int(110 * (r / 165))
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(255, 190, 55, alpha), width=7)
    for i in range(80):
        x = 285 + (i * 37) % 210
        y = 330 + (i * 53) % 170
        draw.ellipse((x, y, x + 7, y + 7), fill=(255, 211, 72, 190))


def draw_locked_sprout(draw: ImageDraw.ImageDraw) -> None:
    draw.rounded_rectangle((205, 230, 500, 570), radius=38, fill=(36, 35, 31, 235), outline=(147, 111, 68, 240), width=12)
    draw.arc((255, 105, 450, 330), 180, 360, fill=(147, 111, 68, 240), width=22)
    draw.line((353, 555, 353, 295), fill=(62, 213, 92, 240), width=18)
    draw.ellipse((270, 305, 360, 390), fill=(70, 219, 102, 225))
    draw.ellipse((350, 255, 470, 350), fill=(77, 240, 117, 220))
    draw.line((200, 585, 520, 585), fill=(120, 88, 54, 230), width=16)


def draw_pan(draw: ImageDraw.ImageDraw) -> None:
    draw.ellipse((170, 275, 560, 575), fill=(24, 24, 24, 245), outline=(218, 218, 205, 150), width=12)
    draw.ellipse((235, 330, 495, 520), fill=(8, 9, 8, 255), outline=(74, 80, 72, 180), width=8)
    draw.rounded_rectangle((490, 405, 760, 465), radius=22, fill=(32, 31, 29, 245), outline=(190, 190, 176, 120), width=6)
    for i in range(7):
        x = 330 + i * 24
        draw.line((x, 490, x + 40, 655), fill=(18, 18, 17, 230), width=15)
        draw.ellipse((x + 22, 640, x + 70, 692), fill=(3, 3, 3, 245))


def draw_bottle(draw: ImageDraw.ImageDraw) -> None:
    draw.rounded_rectangle((305, 225, 520, 600), radius=58, fill=(218, 236, 232, 130), outline=(245, 255, 255, 180), width=8)
    draw.rounded_rectangle((350, 150, 475, 260), radius=28, fill=(215, 236, 232, 120), outline=(245, 255, 255, 170), width=7)
    draw.rounded_rectangle((330, 220, 500, 285), radius=20, fill=(26, 105, 155, 220))
    draw.rectangle((330, 388, 500, 595), fill=(31, 25, 17, 210))
    for i in range(18):
        x = 335 + (i * 31) % 155
        y = 405 + (i * 47) % 160
        draw.ellipse((x, y, x + 8, y + 8), fill=(0, 0, 0, 170))


def draw_bulb(draw: ImageDraw.ImageDraw) -> None:
    draw.line((410, 20, 410, 230), fill=(48, 41, 31, 240), width=10)
    draw.ellipse((260, 185, 560, 505), fill=(250, 168, 47, 58), outline=(255, 210, 125, 210), width=10)
    draw.rectangle((342, 485, 478, 565), fill=(82, 68, 48, 245))
    draw.text((365, 265), "$", fill=(255, 198, 61, 245), font=font(168, True), stroke_width=3, stroke_fill=(40, 26, 8, 245))


def draw_documents(draw: ImageDraw.ImageDraw, seed: int) -> None:
    rng = random.Random(seed)
    for i in range(3):
        x = 200 + i * 45
        y = 170 + i * 35
        draw.rounded_rectangle((x, y, x + 350, y + 430), radius=14, fill=(218, 205, 172, 220), outline=(58, 43, 30, 180), width=4)
        draw.text((x + 28, y + 28), "CONFIDENTIAL", fill=(45, 35, 28, 230), font=font(34, True))
        for row in range(8):
            yy = y + 100 + row * 38
            draw.line((x + 30, yy, x + 305 - rng.randint(0, 100), yy), fill=(70, 56, 42, 160), width=4)
    draw.line((185, 590, 625, 185), fill=(RED[0], RED[1], RED[2], 190), width=18)


def draw_text(canvas: Image.Image, text: str, side: str) -> None:
    draw = ImageDraw.Draw(canvas, "RGBA")
    max_width = 600 if side == "right" else 660
    max_height = 490
    typeface, lines = fit_font(text, max_width, max_height)
    line_h = int(typeface.size * 0.88) if hasattr(typeface, "size") else 72
    block_h = line_h * len(lines)
    x = 625 if side == "right" else 58
    if side == "right":
        x = WIDTH - max_width - 52
    y = (HEIGHT - block_h) // 2 + 8

    for glow, alpha in [(22, 62), (14, 95), (7, 170)]:
        glow_layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow_layer)
        yy = y
        for line in lines:
            gd.text((x, yy), line, font=typeface, fill=(RED[0], RED[1], RED[2], alpha), stroke_width=5, stroke_fill=(RED[0], RED[1], RED[2], alpha))
            yy += line_h
        canvas.alpha_composite(glow_layer.filter(ImageFilter.GaussianBlur(glow)))

    yy = y
    for line in lines:
        draw.text((x, yy), line, font=typeface, fill=(10, 8, 8, 245), stroke_width=8, stroke_fill=(RED[0], RED[1], RED[2], 235))
        draw.text((x + 3, yy + 3), line, font=typeface, fill=(0, 0, 0, 245), stroke_width=2, stroke_fill=(0, 0, 0, 210))
        draw.text((x, yy), line, font=typeface, fill=(18, 4, 4, 252), stroke_width=1, stroke_fill=(255, 86, 86, 190))
        yy += line_h


def render_thumbnail(args: argparse.Namespace) -> dict[str, Any]:
    entry = queue_entry(args.video)
    title = args.title or entry.get("title") or f"Corporate Shadows Video {args.video or ''}".strip()
    research = research_match(title)
    concept = args.concept or research.get("thumbnail_concept") or title
    text = args.text or extract_concept_text(concept, title)
    source = pick_source_image(args.video, args.source)
    seed = args.seed or abs(hash(f"{title}|{concept}|{text}")) % 100000
    side = args.text_side
    if side == "auto":
        side = "right"

    img = base_background(seed, concept, source)
    img = add_finish(img, seed)
    draw_object(img, concept, seed)
    draw_text(img, text, side)

    border = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    bd = ImageDraw.Draw(border)
    bd.rectangle((0, 0, WIDTH - 1, HEIGHT - 1), outline=(0, 0, 0, 190), width=12)
    bd.rectangle((12, 12, WIDTH - 13, HEIGHT - 13), outline=(255, 36, 38, 70), width=3)
    img = Image.alpha_composite(img, border).convert("RGB")

    output = Path(args.output) if args.output else ASSETS_DIR / (entry.get("thumbnail_filename") or f"youtube_thumbnail_video_{args.video}.png")
    if not output.is_absolute():
        output = ROOT / output
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists() and not args.overwrite:
        raise SystemExit(f"Refusing to overwrite existing thumbnail without --overwrite: {output}")
    img.save(output, "PNG", optimize=True)

    jpg_path = None
    if args.jpg:
        jpg_path = output.with_suffix(".jpg")
        img.resize((1280, 720), Image.Resampling.LANCZOS).save(jpg_path, "JPEG", quality=88, optimize=True)

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "video": args.video,
        "title": title,
        "concept": concept,
        "text": text,
        "style": "corporate_shadows_red_neon_dark_object",
        "source_image": str(source) if source else None,
        "output": str(output),
        "jpg_output": str(jpg_path) if jpg_path else None,
    }
    report_path = output.with_suffix(".thumbnail_report.json")
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate Corporate Shadows thumbnails in the existing assets-folder style.")
    parser.add_argument("--video", "-v", help="Numeric video id, e.g. 10")
    parser.add_argument("--title", help="Override title metadata")
    parser.add_argument("--concept", help="Override thumbnail concept")
    parser.add_argument("--text", help="Override big thumbnail text")
    parser.add_argument("--source", help="Optional source image path to use as the cinematic background")
    parser.add_argument("--output", help="Output PNG path. Defaults to queue thumbnail_filename in assets/")
    parser.add_argument("--text-side", choices=["auto", "left", "right"], default="auto")
    parser.add_argument("--seed", type=int, help="Deterministic style seed")
    parser.add_argument("--jpg", action="store_true", help="Also write a compressed JPG beside the PNG")
    parser.add_argument("--overwrite", action="store_true", help="Allow replacing an existing thumbnail")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.video and not args.output:
        raise SystemExit("Provide --video or --output.")
    report = render_thumbnail(args)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
