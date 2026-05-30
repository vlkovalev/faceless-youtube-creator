#!/usr/bin/env python3
"""
source_video1.py
Automatic asset sourcing for Video 1 (De Beers).
- wikimedia_commons beats: query Wikimedia API, download best image
- generated_graphic beats: render dark documentary title card with Pillow
- library_of_congress / stock_broll: mark as manual, print sourcing URL
Updates assets/video_1_assets/visual_plan.json with file paths and status.

Usage:
    python3 automation/source_video1.py
    python3 automation/source_video1.py --beat 1a      # single beat
    python3 automation/source_video1.py --dry-run      # plan only, no downloads
"""

import json, os, sys, time, textwrap, argparse, urllib.request, urllib.parse

ROOT   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAN   = os.path.join(ROOT, 'assets', 'video_1_assets', 'visual_plan.json')
OUTDIR = os.path.join(ROOT, 'assets', 'video_1_assets')

W, H = 1920, 1080   # output frame size

# ---------------------------------------------------------------------------
# Pillow graphic generator
# ---------------------------------------------------------------------------

def make_generated_graphic(beat, outpath):
    from PIL import Image, ImageDraw, ImageFont

    title  = beat.get('narration_excerpt', beat['search_query'])[:120]
    bid    = beat['beat_id']
    atype  = beat['asset_note']

    img  = Image.new('RGB', (W, H), color=(10, 11, 14))   # #0a0b0e brand bg
    draw = ImageDraw.Draw(img)

    # Vignette overlay (simple radial gradient approximation via ellipse)
    overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    odraw   = ImageDraw.Draw(overlay)
    for r in range(0, min(W, H) // 2, 8):
        alpha = int(120 * (r / (min(W, H) // 2)))
        odraw.ellipse(
            [W // 2 - r, H // 2 - r, W // 2 + r, H // 2 + r],
            outline=(0, 0, 0, alpha)
        )
    img = Image.alpha_composite(img.convert('RGBA'), overlay).convert('RGB')
    draw = ImageDraw.Draw(img)

    # Purple accent bar
    draw.rectangle([80, H // 2 - 4, 400, H // 2 + 4], fill=(124, 58, 237))

    # Beat label (top-left)
    draw.text((80, 60), f'BEAT {bid.upper()}  ·  {atype.upper()}',
              fill=(156, 163, 175), font=None)

    # Main text (wrapped)
    lines   = textwrap.wrap(title, width=52)
    y_start = H // 2 - len(lines) * 38 + 20
    for i, line in enumerate(lines[:5]):
        shade = (243, 244, 246) if i == 0 else (209, 213, 219)
        draw.text((80, y_start + i * 72), line, fill=shade, font=None)

    # Bottom amber accent
    draw.rectangle([0, H - 6, W, H], fill=(245, 158, 11))

    img.save(outpath, 'PNG', optimize=True)
    return outpath


# ---------------------------------------------------------------------------
# Wikimedia Commons downloader
# ---------------------------------------------------------------------------

WIKI_SEARCH = (
    'https://commons.wikimedia.org/w/api.php?action=query&list=search'
    '&srsearch={q}&srnamespace=6&srlimit=5&srprop=snippet&format=json'
)
WIKI_INFO = (
    'https://commons.wikimedia.org/w/api.php?action=query&titles={title}'
    '&prop=imageinfo&iiprop=url|mime|size&format=json'
)

HEADERS = {'User-Agent': 'CorporateShadowsSourcing/1.0 (faceless-yt-project)'}

def wiki_search(query):
    """Return list of (title, url, mime) for best Wikimedia matches."""
    url  = WIKI_SEARCH.format(q=urllib.parse.quote(query))
    req  = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.load(r)
    except Exception as e:
        print(f'    [wiki search error] {e}')
        return []

    hits = data.get('query', {}).get('search', [])
    results = []
    for hit in hits[:3]:
        title = hit['title']
        info_url = WIKI_INFO.format(title=urllib.parse.quote(title))
        req2 = urllib.request.Request(info_url, headers=HEADERS)
        try:
            with urllib.request.urlopen(req2, timeout=10) as r2:
                idata = json.load(r2)
            pages = idata.get('query', {}).get('pages', {})
            for page in pages.values():
                info = (page.get('imageinfo') or [{}])[0]
                mime = info.get('mime', '')
                img_url = info.get('url', '')
                if img_url and mime.startswith('image/') and 'svg' not in mime:
                    results.append({'title': title, 'url': img_url, 'mime': mime})
        except Exception:
            pass
        time.sleep(0.3)   # be polite to Wikimedia
    return results


def download_image(url, outpath):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as r:
        data = r.read()
    with open(outpath, 'wb') as f:
        f.write(data)
    return outpath


def wikimedia_beat(beat, outpath, dry_run=False):
    query = beat['search_query']
    print(f'    Wikimedia search: "{query}"')
    results = wiki_search(query)
    if not results:
        print(f'    No results — marking for manual sourcing')
        return None, 'no_results'
    best = results[0]
    ext  = 'jpg' if 'jpeg' in best['mime'] else 'png'
    outpath_final = outpath.rsplit('.', 1)[0] + '.' + ext
    print(f'    Found: {best["title"][:60]}')
    if dry_run:
        print(f'    [dry-run] would download to {os.path.basename(outpath_final)}')
        return outpath_final, 'dry_run'
    download_image(best['url'], outpath_final)
    print(f'    Saved: {os.path.basename(outpath_final)} ({os.path.getsize(outpath_final)//1024}kb)')
    return outpath_final, 'downloaded'


# ---------------------------------------------------------------------------
# Manual sourcing reporter
# ---------------------------------------------------------------------------

LOC_SEARCH = 'https://www.loc.gov/search/?q={q}'

def manual_beat_info(beat):
    src  = beat['asset_type']
    q    = urllib.parse.quote(beat['search_query'])
    if src == 'library_of_congress':
        return LOC_SEARCH.format(q=q)
    elif src == 'stock_broll':
        return f'https://www.storyblocks.com/video/search?term={q}'
    return beat.get('source_url') or 'manual search required'


# ---------------------------------------------------------------------------
# Main sourcing loop
# ---------------------------------------------------------------------------

def source_beat(beat, dry_run=False):
    bid    = beat['beat_id']
    atype  = beat['asset_type']
    base   = os.path.join(OUTDIR, f'beat_{bid}')

    if atype == 'generated_graphic':
        outpath = base + '.png'
        if not dry_run:
            make_generated_graphic(beat, outpath)
            print(f'    Generated: {os.path.basename(outpath)}')
        else:
            print(f'    [dry-run] would generate: {os.path.basename(outpath)}')
        return outpath, 'downloaded'

    elif atype == 'wikimedia_commons':
        outpath, status = wikimedia_beat(beat, base + '.jpg', dry_run)
        return outpath, status

    else:
        url = manual_beat_info(beat)
        print(f'    MANUAL ({atype}): {url}')
        return None, 'manual_required'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--beat',     help='Source a single beat by ID (e.g. 1a)')
    parser.add_argument('--dry-run',  action='store_true', help='Plan only, no writes')
    parser.add_argument('--scene',    type=int, help='Source all beats in a scene number')
    args = parser.parse_args()

    with open(PLAN) as f:
        plan = json.load(f)

    manual_queue = []
    sourced = skipped = errors = 0

    for scene in plan['scenes']:
        for beat in scene['beats']:
            bid = beat['beat_id']

            # filter by --beat or --scene if specified
            if args.beat and bid != args.beat:
                continue
            if args.scene and scene['scene_number'] != args.scene:
                continue
            if beat['status'] == 'downloaded' and not args.beat:
                print(f'  [{bid}] already downloaded — skipping')
                skipped += 1
                continue

            print(f'\n  [{bid}] {beat["asset_type"]} | {beat["duration_s"]}s | {beat["narration_excerpt"][:60]}...')

            try:
                fpath, status = source_beat(beat, dry_run=args.dry_run)
                beat['status']     = status
                beat['asset_file'] = os.path.basename(fpath) if fpath else None
                if status == 'manual_required':
                    manual_queue.append({'beat_id': bid, 'url': manual_beat_info(beat), 'query': beat['search_query']})
                else:
                    sourced += 1
            except Exception as e:
                print(f'    ERROR: {e}')
                beat['status'] = 'error'
                errors += 1

            time.sleep(0.1)

    # Write updated plan
    if not args.dry_run:
        with open(PLAN, 'w') as f:
            json.dump(plan, f, indent=2)
        print(f'\nPlan updated: {PLAN}')

    # Summary
    print(f'\n{"="*60}')
    print(f'Sourcing complete')
    print(f'  Sourced:  {sourced}')
    print(f'  Skipped (already done): {skipped}')
    print(f'  Manual required: {len(manual_queue)}')
    print(f'  Errors: {errors}')

    if manual_queue:
        print(f'\nManual sourcing queue ({len(manual_queue)} beats):')
        for item in manual_queue:
            print(f'  [{item["beat_id"]}] {item["query"]}')
            print(f'       {item["url"]}')

    print(f'\nNext: run editor_agent.js (beat-aware version) to rebuild Video 1')


if __name__ == '__main__':
    main()
