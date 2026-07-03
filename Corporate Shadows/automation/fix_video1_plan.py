"""
fix_video1_plan.py  -- one-shot fix for video_1 visual_plan.json encoding
"""
import json, os

PLAN = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    'assets', 'video_1_assets', 'visual_plan.json')

data = open(PLAN, encoding='utf-8-sig').read()

# The source_priority strings contain real Unicode chars from mojibake:
# a-with-circumflex (U+00E2) + euro (U+20AC) + right-double-quote (U+201D)
# This sequence is the latin-1 interpretation of the UTF-8 em-dash bytes.
bad_emdash   = 'â€”'   # ae" -> —
bad_endash   = 'â€“'   # ae" -> –
bad_rsquote  = 'â€™'   # aeTM -> '

fixed = data
fixed = fixed.replace(bad_emdash,  ' - ')
fixed = fixed.replace(bad_endash,  ' - ')
fixed = fixed.replace(bad_rsquote, "'")

try:
    obj = json.loads(fixed)
except json.JSONDecodeError as e:
    print('Still fails after substitution:', e)
    print('Context:', repr(fixed[max(0, e.pos-60):e.pos+60]))
    raise

with open(PLAN, 'w', encoding='utf-8') as f:
    json.dump(obj, f, indent=2, ensure_ascii=False)

total_beats = sum(len(sc['beats']) for sc in obj['scenes'])
downloaded  = sum(1 for sc in obj['scenes'] for b in sc['beats'] if b['status'] == 'downloaded')
print(f'Video 1 plan fixed and saved. {total_beats} beats, {downloaded} downloaded.')
