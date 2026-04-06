import json
try:
    with open('d:/3.3-19.01/app/data/vocab/cefr_vocab_fixed.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    print(f'JSON valid. Words count: {len(data.get("words", {}))}')
    print(f'peruse level: {data["words"].get("peruse", "NOT FOUND")}')
except Exception as e:
    print(f'JSON ERROR: {e}')
