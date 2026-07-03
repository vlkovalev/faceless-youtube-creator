"""
fix_plan_encoding.py
Fixes mojibake in visual_plan.json files (em-dashes stored as latin-1 sequences).
Run once: python3 automation/fix_plan_encoding.py
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def fix_mojibake(s):
    # UTF-8 bytes decoded as latin-1 produce these sequences
    replacements = [
        ('\xe2\x80\x94', '—'),  # em-dash
        ('\xe2\x80\x93', '–'),  # en-dash
        ('\xe2\x80\x99', '’'),  # right single quote
        ('\xe2\x80\x9c', '“'),  # left double quote
        ('\xe2\x80\x9d', '”'),  # right double quote
        ('\xe2\x80\xa6', '…'),  # ellipsis
    ]
    # Also handle already-mangled text representations
    text_replacements = [
        ('â\x80\x94',   '—'),
        ('â€"',          '—'),
        ("â\x80\x99",   '’'),
        ('â€™',          '’'),
        ('â\x80\x9c',   '“'),
        ('â€\x9c',      '“'),
        ('â\x80\x9d',   '”'),
        ('â€\x9d',      '”'),
    ]
    for bad, good in replacements + text_replacements:
        s = s.replace(bad, good)
    return s

videos = sys.argv[1:] or ['1', '2', '3', '4', '5']

for vid in videos:
    path = os.path.join(ROOT, 'assets', f'video_{vid}_assets', 'visual_plan.json')
    if not os.path.exists(path):
        continue
    raw = open(path, encoding='utf-8-sig').read()
    fixed = fix_mojibake(raw)
    try:
        obj = json.loads(fixed)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(obj, f, indent=2, ensure_ascii=False)
        total = sum(len(sc['beats']) for sc in obj['scenes'])
        print(f'Video {vid}: OK ({total} beats)')
    except json.JSONDecodeError as e:
        print(f'Video {vid}: FAILED after fix — {e}')
        # find the bad region
        for i in range(0, len(fixed), 2000):
            chunk = fixed[:i+2000]
            try:
                json.loads(chunk + ']}]}')
            except json.JSONDecodeError:
                print(f'  Error near char {i}–{i+2000}')
                print(f'  Context: {repr(fixed[max(0,e.pos-60):e.pos+60])}')
                break
