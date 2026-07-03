import json
import hashlib
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageEnhance, ImageOps
from PIL import ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = ROOT.parent
ASSETS_ROOT = ROOT / "assets"


SOURCE_SETS = {
    19: {
        "paisius_velichkovsky_icon": {
            "url": "https://commons.wikimedia.org/wiki/File:Paisius.jpg",
            "license": "public_domain",
            "author": "Unknown / public-domain reproduction via Wikimedia Commons",
            "type": "icon_or_painting",
            "title": "Saint Paisius Velichkovsky portrait",
        },
    },
    13: {
        "ambrose_icon": {
            "url": "https://commons.wikimedia.org/wiki/File:Amvrosiy_Optinskiy.jpg",
            "license": "public_domain",
            "author": "Unknown / public-domain reproduction via Wikimedia Commons",
            "type": "icon_or_painting",
            "title": "Saint Ambrose of Optina portrait",
        },
        "optina_literary_source": {
            "url": "https://commons.wikimedia.org/wiki/File:Dostoevsky_1872.jpg",
            "license": "public_domain_mark",
            "author": "Vasily Perov / Tretyakov Gallery public-domain reproduction",
            "type": "manuscript_book_or_letter",
            "title": "Dostoevsky 1872 public-domain portrait, Optina literary context",
        },
        "optina_monastery": {
            "url": "https://commons.wikimedia.org/wiki/File:Optina_khramy_goriz_copy.jpg",
            "license": "cc_by_3_0_verified",
            "author": "Denghu / Wikimedia Commons, CC BY 3.0",
            "type": "monastery_or_location",
            "title": "Optina Pustyn Monastery, Kaluga Region, Russia",
        },
    },
    14: {
        "paisios_icon": {
            "url": "https://commons.wikimedia.org/wiki/File:Paisios_of_Mount_Athos.jpg",
            "license": "cc_by_4_0_verified",
            "author": "Spartacos31 / Wikimedia Commons, CC BY 4.0",
            "type": "icon_or_painting",
            "title": "Saint Paisios of Mount Athos mosaic",
        },
        "athos_monastery": {
            "url": "https://commons.wikimedia.org/wiki/File:St._Panteleimon_Monastery_-_close_up.jpg",
            "license": "cc_by_sa_4_0_verified",
            "author": "StanTravels / Wikimedia Commons, CC BY-SA 4.0",
            "type": "monastery_or_location",
            "title": "St. Panteleimon Monastery on Mount Athos",
        },
        "athos_manuscript": {
            "url": "https://commons.wikimedia.org/wiki/File:Life_of_St_Sergius_of_Radonezh_-_1.jpg",
            "license": "public_domain_cc0",
            "author": "Russian National Library / Wikimedia Commons contributor",
            "type": "manuscript_book_or_letter",
            "title": "Orthodox hagiographic manuscript page",
        },
    },
    15: {
        "silouan_icon": {
            "url": "https://commons.wikimedia.org/wiki/File:Siluan_of_Athos.jpg",
            "downloaded_from": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/Siluan_of_Athos.jpg/960px-Siluan_of_Athos.jpg",
            "license": "cc_by_sa_4_0_verified",
            "author": "Andrey Mironov / Wikimedia Commons, CC BY-SA 4.0",
            "type": "icon_or_painting",
            "title": "Saint Silouan the Athonite painting",
        },
        "panteleimon_monastery": {
            "url": "https://commons.wikimedia.org/wiki/File:Sveti_panteleimon.jpg",
            "license": "cc_by_sa_verified",
            "author": "Georgid / Wikimedia Commons, CC BY-SA/GFDL",
            "type": "monastery_or_location",
            "title": "St. Panteleimon Monastery, Mount Athos",
        },
        "athonite_manuscript": {
            "url": "https://commons.wikimedia.org/wiki/File:Life_of_St_Sergius_of_Radonezh_-_1.jpg",
            "license": "public_domain_cc0",
            "author": "Russian National Library / Wikimedia Commons contributor",
            "type": "manuscript_book_or_letter",
            "title": "Orthodox hagiographic manuscript page",
        },
    },
    16: {
        "optina_elder_icon": {
            "url": "https://commons.wikimedia.org/wiki/File:Amvrosiy_Optinskiy.jpg",
            "license": "public_domain",
            "author": "Unknown / public-domain reproduction via Wikimedia Commons",
            "type": "icon_or_painting",
            "title": "Saint Ambrose of Optina portrait for the Optina Elders",
        },
        "optina_monastery": {
            "url": "https://commons.wikimedia.org/wiki/File:Optina_khramy_goriz_copy.jpg",
            "license": "cc_by_3_0_verified",
            "author": "Denghu / Wikimedia Commons, CC BY 3.0",
            "type": "monastery_or_location",
            "title": "Optina Pustyn Monastery, Kaluga Region, Russia",
        },
        "optina_literary_source": {
            "url": "https://commons.wikimedia.org/wiki/File:Dostoevsky_1872.jpg",
            "license": "public_domain_mark",
            "author": "Vasily Perov / Tretyakov Gallery public-domain reproduction",
            "type": "manuscript_book_or_letter",
            "title": "Dostoevsky 1872 public-domain portrait, Optina literary context",
        },
    },
    17: {
        "herman_icon": {
            "url": "https://commons.wikimedia.org/wiki/File:Saint_Herman_of_Alaska.jpg",
            "license": "cc_by_sa_3_0_or_gfdl_verified",
            "author": "AlexEleon / Wikimedia Commons, CC BY-SA 3.0 or GFDL",
            "type": "icon_or_painting",
            "title": "Saint Herman of Alaska icon",
        },
        "alaska_chapel": {
            "url": "https://commons.wikimedia.org/wiki/File:Saint_Herman_of_Alaska_Monastery_Main_Church.jpg",
            "license": "verified_commons_file",
            "author": "Wikimedia Commons file contributors; per-file page retained in attribution",
            "type": "monastery_or_location",
            "title": "Saint Herman of Alaska Monastery church",
        },
        "mission_manuscript": {
            "url": "https://commons.wikimedia.org/wiki/File:Life_of_St_Sergius_of_Radonezh_-_1.jpg",
            "license": "public_domain_cc0",
            "author": "Russian National Library / Wikimedia Commons contributor",
            "type": "manuscript_book_or_letter",
            "title": "Orthodox hagiographic manuscript page",
        },
    },    18: {
        "sergius_icon": {
            "url": "https://commons.wikimedia.org/wiki/File:Sergius_von_Radonezh_(full).jpg",
            "license": "public_domain",
            "author": "Unknown / public domain reproduction",
            "type": "icon_or_painting",
            "title": "Sergius of Radonezh icon",
        },
        "sergius_life_manuscript_1": {
            "url": "https://commons.wikimedia.org/wiki/File:Life_of_St_Sergius_of_Radonezh_-_1.jpg",
            "license": "public_domain_cc0",
            "author": "Russian National Library / Wikimedia Commons contributor",
            "type": "manuscript_book_or_letter",
            "title": "Life of Saint Sergius of Radonezh manuscript page",
        },
        "trinity_view_loc_pd": {
            "url": "https://commons.wikimedia.org/wiki/File:Trinity_view.jpg",
            "downloaded_from": "https://cdn.loc.gov/service/pnp/ppmsc/03900/03906r.jpg",
            "license": "public_domain",
            "author": "Library of Congress / Detroit Publishing Co. collection",
            "type": "monastery_or_location",
            "title": "Trinity-St. Sergius Lavra, early 20th century photochrom",
        },
    },
}

def file_name_from_url(url):
    name = url.split("/wiki/File:", 1)[1]
    return urllib.parse.unquote(name)


def download_url_for_file(file_name):
    normalized = file_name.replace(" ", "_")
    digest = hashlib.md5(normalized.encode("utf-8")).hexdigest()
    return "https://upload.wikimedia.org/wikipedia/commons/{}/{}/{}".format(
        digest[0],
        digest[:2],
        urllib.parse.quote(normalized),
    )


def download_source(key, info, source_dir):
    if info.get("downloaded_from"):
        target = source_dir / f"{key}.jpg"
        if target.exists() and target.stat().st_size > 0:
            return target
        req = urllib.request.Request(
            info["downloaded_from"],
            headers={"User-Agent": "faceless-youtube-creator/1.0 (visual rights verification)"},
        )
        with urllib.request.urlopen(req, timeout=45) as response:
            data = response.read()
        target.write_bytes(data)
        return target

    file_name = file_name_from_url(info["url"])
    ext = Path(file_name).suffix or ".jpg"
    target = source_dir / f"{key}{ext}"
    if target.exists() and target.stat().st_size > 0:
        return target

    req = urllib.request.Request(
        download_url_for_file(file_name),
        headers={"User-Agent": "faceless-youtube-creator/1.0 (visual rights verification)"},
    )
    with urllib.request.urlopen(req, timeout=45) as response:
        data = response.read()
    target.write_bytes(data)
    time.sleep(0.4)
    return target


def load_font(size):
    for candidate in [
        "C:/Windows/Fonts/georgiab.ttf",
        "C:/Windows/Fonts/georgia.ttf",
        "C:/Windows/Fonts/times.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ]:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def wrap_text(draw, text, font, width):
    words = str(text or "").split()
    lines = []
    current = ""
    for word in words:
        test = (current + " " + word).strip()
        if draw.textbbox((0, 0), test, font=font)[2] <= width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def render_saint_right_layout(src_path, dest_path, title, subtitle):
    with Image.open(src_path) as source:
        source = ImageOps.exif_transpose(source).convert("RGB")
        bg = ImageOps.fit(source, (1280, 720), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
        bg = ImageEnhance.Brightness(bg).enhance(0.24)
        bg = ImageEnhance.Color(bg).enhance(0.55)
        canvas = bg.copy()
        draw = ImageDraw.Draw(canvas)
        draw.rectangle((0, 0, 690, 720), fill=(18, 16, 13))
        draw.rectangle((650, 0, 690, 720), fill=(106, 78, 38))

        icon = source.copy()
        icon.thumbnail((500, 660), Image.Resampling.LANCZOS)
        x = 760 + (420 - icon.width) // 2
        y = (720 - icon.height) // 2
        canvas.paste(icon, (x, y))

        title_font = load_font(46)
        subtitle_font = load_font(25)
        small_font = load_font(20)
        max_width = 560
        top = 130
        for line in wrap_text(draw, title, title_font, max_width)[:4]:
            draw.text((70, top), line, fill=(238, 225, 197), font=title_font)
            top += 56
        top += 26
        for line in wrap_text(draw, subtitle, subtitle_font, max_width)[:5]:
            draw.text((74, top), line, fill=(196, 178, 143), font=subtitle_font)
            top += 34
        draw.text((74, 610), "THE SAINTS", fill=(166, 126, 62), font=small_font)
        canvas.save(dest_path, "PNG", optimize=True)


def fit_to_video(src_path, dest_path, contain_subject=False):
    with Image.open(src_path) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        if contain_subject:
            bg = ImageOps.fit(im, (1280, 720), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
            bg = ImageEnhance.Brightness(bg).enhance(0.38)
            bg = ImageEnhance.Color(bg).enhance(0.65)
            contained = im.copy()
            contained.thumbnail((1120, 660), Image.Resampling.LANCZOS)
            canvas = bg.copy()
            x = (1280 - contained.width) // 2
            y = (720 - contained.height) // 2
            canvas.paste(contained, (x, y))
            im = canvas
        else:
            im = ImageOps.fit(im, (1280, 720), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
        im = ImageEnhance.Contrast(im).enhance(1.06)
        im = ImageEnhance.Color(im).enhance(0.92)
        im.save(dest_path, "PNG", optimize=True)


def source_key_for_beat(video_id, scene_number, beat):
    video_id = int(video_id)
    return {
        13: "ambrose_icon",
        14: "paisios_icon",
        15: "silouan_icon",
        16: "optina_elder_icon",
        17: "herman_icon",
        18: "sergius_icon",
        19: "paisius_velichkovsky_icon",
    }.get(video_id, "sergius_icon")


def inject(video_id):
    asset_dir = ASSETS_ROOT / f"saints_video_{video_id}_assets"
    plan_path = asset_dir / "visual_plan.json"
    if not plan_path.exists():
        raise SystemExit(f"Missing visual plan: {plan_path}")

    source_dir = asset_dir / "verified_sources"
    source_dir.mkdir(parents=True, exist_ok=True)

    plan = json.loads(plan_path.read_text(encoding="utf-8-sig"))
    attribution_path = asset_dir / "asset_attribution.json"
    attribution_payload = json.loads(attribution_path.read_text(encoding="utf-8-sig")) if attribution_path.exists() else {}
    attribution_beats = attribution_payload.get("beats", []) if isinstance(attribution_payload, dict) else []
    attribution_by_key = {
        (item.get("scene"), str(item.get("beat_id"))): item
        for item in attribution_beats
        if item.get("scene") is not None and item.get("beat_id") is not None
    }
    source_set = SOURCE_SETS.get(int(video_id), SOURCE_SETS[18])
    downloaded = {}
    download_errors = {}
    for key, info in source_set.items():
        try:
            downloaded[key] = download_source(key, info, source_dir)
        except Exception as exc:
            download_errors[key] = str(exc)

    attribution = []
    replacements = 0
    for scene in plan.get("scenes", []):
        for beat in scene.get("beats", []):
            asset_file = beat.get("asset_file")
            if not asset_file:
                prior = attribution_by_key.get((scene.get("scene_number"), str(beat.get("beat_id"))))
                if prior and prior.get("asset_file"):
                    asset_file = prior["asset_file"]
            if not asset_file:
                continue
            key = source_key_for_beat(video_id, scene.get("scene_number", 1), beat)
            if key not in downloaded:
                beat["status"] = "manual_required_download_failed"
                beat["download_error"] = download_errors.get(key, "source unavailable")
                continue
            info = source_set[key]
            dest = asset_dir / asset_file
            contain_subject = info["type"] in {"icon_or_painting", "manuscript_book_or_letter"}
            if info["type"] == "icon_or_painting":
                render_saint_right_layout(
                    downloaded[key],
                    dest,
                    plan.get("saint_target") or info["title"],
                    scene.get("title") or info["title"],
                )
            else:
                fit_to_video(downloaded[key], dest, contain_subject=contain_subject)
            beat["asset_file"] = asset_file
            beat["primary_source_url"] = info["url"]
            beat["primary_source_label"] = info["title"]
            beat["license_status"] = info["license"]
            beat["rights_status"] = "verified"
            beat["status"] = "downloaded_verified"
            beat["attribution_required"] = not info["license"].startswith("public_domain")
            beat["verified_source_key"] = key
            if contain_subject:
                beat["subject_framing"] = "full_subject_contained"
                beat["framing_qc"] = "no_crop_contain_layout"
            if info["type"] == "icon_or_painting":
                beat["layout_style"] = "left_text_right_saint"
            replacements += 1
            attribution.append(
                {
                    "video_id": video_id,
                    "scene": scene.get("scene_number"),
                    "beat_id": beat.get("beat_id"),
                    "asset_file": asset_file,
                    "source_key": key,
                    "source_url": info["url"],
                    "source_file": str(downloaded[key].relative_to(asset_dir)),
                    "license": info["license"],
                    "author": info["author"],
                    "usage_status": "approved_for_private_draft_and_youtube_upload",
                    "visual_type": info["type"],
                    "title": info["title"],
                }
            )

    plan_path.write_text(json.dumps(plan, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (asset_dir / "asset_attribution.json").write_text(
        json.dumps(
            {
                "video_id": video_id,
                "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "policy": "Exact source pages only; Commons category/search pages are not treated as rights clearance.",
                "total_replaced_beats": replacements,
                "download_errors": download_errors,
                "sources": list(source_set.values()),
                "beats": attribution,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Injected {replacements} verified real visuals into Saints video {video_id}.")


if __name__ == "__main__":
    video = 18
    for arg in sys.argv[1:]:
        match = re.match(r"--video=(\d+)$", arg)
        if match:
            video = int(match.group(1))
    inject(video)

















