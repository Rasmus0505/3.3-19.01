import json, os

path = 'd:/3.3-19.01/app/data/vocab/cefr_vocab_fixed.json'
size = os.path.getsize(path)
print(f'File size: {size:,} bytes')

with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)

words = data.get('words', {})
print(f'Word entries: {len(words)}')

for w in ['peruse', 'loathe', 'eschew', 'the', 'read', 'perusing']:
    info = words.get(w, 'NOT FOUND')
    print(f'  {w}: {info}')

print(f'First 3 keys: {list(words.keys())[:3]}')
