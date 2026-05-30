"""Inspect raw bytes around the JSON error in video_1 visual_plan.json"""
import os

PLAN = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    'assets', 'video_1_assets', 'visual_plan.json')

raw = open(PLAN, 'rb').read()
pos = 33389
chunk = raw[pos-80:pos+120]
print('Raw bytes around pos', pos)
print(chunk)
print()
print('Hex:')
for i, b in enumerate(chunk):
    print(f'{b:02x}', end=' ')
    if (i+1) % 16 == 0:
        print()
print()

# Find all non-standard bytes (outside normal JSON range)
import re
for m in re.finditer(rb'[\x80-\xff]', raw):
    p = m.start()
    print(f'Non-ASCII byte 0x{m.group()[0]:02x} at pos {p}: {raw[p-30:p+30]}')
    if p > 40000:
        break
