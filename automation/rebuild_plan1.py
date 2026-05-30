"""
rebuild_plan1.py
Rebuilds video_1 visual_plan.json from scratch using the script data.
Avoids all encoding issues by generating clean ASCII-safe JSON.
Run: python3 automation/rebuild_plan1.py
"""
import json, os, re, sys

ROOT      = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT    = os.path.join(ROOT, 'scripts', 'video_1_data.js')
PLAN_PATH = os.path.join(ROOT, 'assets', 'video_1_assets', 'visual_plan.json')

WORDS_PER_SECOND = 2.2

SRC = {
    'WIKIMEDIA': 'wikimedia_commons',
    'LOC':       'library_of_congress',
    'ARCHIVE':   'internet_archive',
    'GENERATED': 'generated_graphic',
    'STOCK':     'stock_broll',
}

SOURCE_MAP = [
    (r'\b(1[0-9]{3}|18[0-9]{2}|19[0-9]{2}|20[0-9]{2}s?)\b',              SRC['WIKIMEDIA'], 'historical period photo'),
    (r'\b(map|globe|country|nation|africa|india|america|europe|russia)\b',  SRC['WIKIMEDIA'], 'map or geographic illustration'),
    (r'\b(CEO|executive|president|founder|chairman|heir|scientist)\b',      SRC['WIKIMEDIA'], 'executive portrait'),
    (r'\b(logo|brand|company|corporation|product)\b',                       SRC['WIKIMEDIA'], 'company or brand visual'),
    (r'\b(newspaper|headline|report|scandal|lawsuit|trial|congress)\b',     SRC['LOC'],       'newspaper or document scan'),
    (r'\b(advertisement|ad|campaign|poster|magazine|slogan)\b',             SRC['LOC'],       'vintage advertisement'),
    (r'\b(documentary|newsreel|footage|film|archive)\b',                    SRC['ARCHIVE'],   'archival film or newsreel'),
    (r'\b(chart|graph|statistic|percent|billion|million|market)\b',         SRC['GENERATED'], 'animated stat or chart graphic'),
    (r'\b(timeline|founded|years|decade|century|history)\b',                SRC['GENERATED'], 'timeline graphic'),
    (r'\b(factory|warehouse|office|boardroom|vault|mine|industrial)\b',     SRC['STOCK'],     'industrial or corporate b-roll'),
]

STOP = set('the a an and or but in on at to for of with was were is are had has have they their them this that these those not from into out up about which when where who how what would could should did do be been being by as its it if so yet only just'.split())

def load_script():
    raw = open(SCRIPT, encoding='utf-8-sig').read()
    m = re.search(r'window\.SCRIPTS\[\d+\]\s*=\s*(\{[\s\S]*\})\s*;?\s*$', raw)
    return json.loads(m.group(1))

def estimate_duration(vo):
    clean  = re.sub(r'<[^>]+>', '', vo)
    words  = len(clean.split())
    pauses = vo.count('<span class="pause">')
    return round(words / WORDS_PER_SECOND + pauses * 1.5)

def split_beats(vo, target):
    clean = re.sub(r'<[^>]+>', ' ', vo)
    clean = re.sub(r'\s+', ' ', clean).strip()
    sents = re.findall(r'[^.!?]+[.!?]+', clean) or [clean]
    if len(sents) <= target:
        return [s.strip() for s in sents if s.strip()]
    size   = max(1, len(sents) // target)
    chunks = []
    for i in range(0, len(sents), size):
        chunk = ' '.join(sents[i:i+size]).strip()
        if chunk:
            chunks.append(chunk)
    return chunks[:target]

def recommend(text, title, prompt):
    combined = ' '.join([text, title, prompt or ''])
    for pattern, src, note in SOURCE_MAP:
        if re.search(pattern, combined, re.IGNORECASE):
            return src, note
    return SRC['GENERATED'], 'cinematic title card or mood graphic'

def build_query(text, src):
    words = re.sub(r'[^a-z0-9 ]', ' ', text.lower()).split()
    seen, unique = set(), []
    for w in words:
        if len(w) > 3 and w not in STOP and w not in seen:
            seen.add(w)
            unique.append(w)
    core = ' '.join(unique[:5])
    if src == SRC['WIKIMEDIA']: return core
    if src == SRC['LOC']:       return core
    if src == SRC['ARCHIVE']:   return core
    if src == SRC['GENERATED']: return core + ' -- dark corporate documentary style'
    if src == SRC['STOCK']:     return core + ' stock footage'
    return core

def build_url(query, src):
    q = query.replace(' -- dark corporate documentary style', '').replace(' stock footage', '').strip()
    from urllib.parse import quote
    enc = quote(q)
    if src == SRC['WIKIMEDIA']: return 'https://commons.wikimedia.org/w/index.php?search=' + enc + '&title=Special:MediaSearch&type=image'
    if src == SRC['LOC']:       return 'https://www.loc.gov/search/?q=' + enc
    if src == SRC['ARCHIVE']:   return 'https://archive.org/search?query=' + enc + '&mediatype=movies'
    if src == SRC['STOCK']:     return 'https://www.storyblocks.com/video/search?term=' + enc
    return None

def main():
    data   = load_script()
    scenes = data['scenes']
    run_t  = 0
    plan_scenes = []

    # Check existing plan for already-downloaded beats
    existing = {}
    if os.path.exists(PLAN_PATH):
        try:
            old_raw   = open(PLAN_PATH, 'rb').read()
            old_clean = old_raw.decode('utf-8', errors='replace').replace('\x00', '')
            old_plan  = json.loads(old_clean)
            for sc in old_plan.get('scenes', []):
                for b in sc.get('beats', []):
                    if b.get('status') == 'downloaded' and b.get('asset_file'):
                        existing[b['beat_id']] = {
                            'status':     'downloaded',
                            'asset_file': b['asset_file'],
                        }
            print(f'Preserved {len(existing)} existing downloaded beats')
        except Exception as e:
            print(f'Could not read existing plan (will rebuild clean): {e}')

    for scene in scenes:
        dur    = estimate_duration(scene['voiceover'])
        target = 2 if dur <= 20 else 3 if dur <= 35 else 4 if dur <= 50 else 5
        texts  = split_beats(scene['voiceover'], target)
        tc     = [len(t.split()) for t in texts]
        total  = max(1, sum(tc))
        cursor = run_t
        beats  = []

        for i, text in enumerate(texts):
            bid  = str(scene['scene_number']) + chr(97 + i)
            bdur = max(3, round(dur * tc[i] / total))
            src, note = recommend(text, scene['title'], scene.get('visual_prompt', ''))
            query     = build_query(text, src)
            url       = build_url(query, src)
            prev      = existing.get(bid, {})
            beat = {
                'beat_id':          bid,
                'start_s':          cursor,
                'duration_s':       bdur,
                'narration_excerpt': text[:120] + ('...' if len(text) > 120 else ''),
                'asset_type':       src,
                'asset_note':       note,
                'search_query':     query,
                'source_url':       url,
                'asset_file':       prev.get('asset_file'),
                'status':           prev.get('status', 'pending'),
                'fallback':         'scene_' + str(scene['scene_number']) + '_image.png',
            }
            beats.append(beat)
            cursor += bdur

        plan_scenes.append({
            'scene_number':      scene['scene_number'],
            'title':             scene['title'],
            'start_s':           run_t,
            'duration_s':        dur,
            'beat_count':        len(beats),
            'primary_asset_file':'scene_' + str(scene['scene_number']) + '_image.png',
            'visual_prompt':     scene.get('visual_prompt', ''),
            'beats':             beats,
        })
        run_t += dur

    total_beats = sum(len(sc['beats']) for sc in plan_scenes)
    downloaded  = sum(1 for sc in plan_scenes for b in sc['beats'] if b['status'] == 'downloaded')

    plan = {
        'video_id':                   1,
        'title':                      data['video']['title'],
        'niche':                      data['video']['niche'],
        'generated_at':               '2026-05-29T00:00:00Z',
        'estimated_total_duration_s': run_t,
        'script_duration_ok':         run_t >= 480,
        'total_beats':                total_beats,
        'source_priority': [
            '1. wikimedia_commons - free, public domain, best for historical',
            '2. library_of_congress - vintage ads, newspapers, portraits',
            '3. internet_archive - newsreels, documentary footage',
            '4. generated_graphic - charts, timelines, evidence boards',
            '5. stock_broll - Storyblocks for industrial/corporate b-roll',
        ],
        'scenes': plan_scenes,
    }

    with open(PLAN_PATH, 'w', encoding='utf-8') as f:
        json.dump(plan, f, indent=2, ensure_ascii=True)

    print(f'Rebuilt: {total_beats} beats, {downloaded} already downloaded, {run_t}s duration')
    print(f'Written: {PLAN_PATH}')

if __name__ == '__main__':
    main()
