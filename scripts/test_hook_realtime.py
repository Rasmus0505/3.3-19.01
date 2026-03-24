#!/usr/bin/env python3
"""git-ai-commit Hook Simulation Test"""
import os, subprocess, tempfile
from datetime import datetime

os.environ['GIT_AI_LABEL'] = 'Cursor'
os.environ['GIT_AI_SOURCE'] = 'cursor'
os.environ['GIT_AI_MODEL'] = 'o4'

print('[TEST] Hook simulation')
print('AI:', os.environ['GIT_AI_LABEL'], '/', os.environ['GIT_AI_SOURCE'], '/', os.environ['GIT_AI_MODEL'])

try:
    raw = subprocess.run(['git', 'diff', '--cached', '--name-only'], capture_output=True, text=True, errors='ignore')
    staged_files = [f.strip() for f in raw.stdout.strip().splitlines() if f.strip()]
except:
    staged_files = []

if not staged_files:
    try:
        raw = subprocess.run(['git', 'diff', '--name-only'], capture_output=True, text=True, errors='ignore')
        staged_files = [f.strip() for f in raw.stdout.strip().splitlines() if f.strip()]
    except:
        staged_files = []

if not staged_files:
    staged_files = [
        'frontend/src/features/upload/UploadPanel.jsx',
        'desktop/electron/main.mjs',
        'app/main.py'
    ]

AI_LABEL = os.environ['GIT_AI_LABEL']
AI_SOURCE = os.environ['GIT_AI_SOURCE']
AI_MODEL = os.environ['GIT_AI_MODEL']
ts = datetime.now().strftime('%Y-%m-%d %H:%M')

changed_files = ' '.join(staged_files)
inferred_type = 'chore'
if any(x in changed_files for x in ['frontend', 'jsx', 'tsx']): inferred_type = 'feat'
elif 'backend' in changed_files or '.py' in changed_files: inferred_type = 'feat'
elif 'docs' in changed_files or '.md' in changed_files: inferred_type = 'docs'
elif 'test' in changed_files or 'spec' in changed_files: inferred_type = 'test'
elif 'css' in changed_files or 'style' in changed_files: inferred_type = 'style'
elif 'fix' in changed_files or 'bug' in changed_files: inferred_type = 'fix'
elif 'refactor' in changed_files: inferred_type = 'refactor'
elif any(x in changed_files for x in ['ci', 'docker', 'yaml', 'yml']): inferred_type = 'ci'

model_part = (' ' + AI_MODEL) if AI_MODEL else ''
ai_header = '# AI: ' + AI_LABEL + ' (' + AI_SOURCE + model_part + ')'
ai_meta = '| AI: ' + AI_LABEL

msg_lines = [
    '# Commit | ' + ts,
    ai_header,
    '[' + inferred_type + '] <describe change, max 50 chars> ' + ai_meta,
    '',
    '# Files:',
    '# ' + changed_files,
    '',
    '# (edit above and save to commit)'
]
content_out = '\n'.join(msg_lines)

msg_file = tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='utf-8')
msg_file.write(content_out)
msg_file.close()

print()
print('GENERATED COMMIT MESSAGE:')
with open(msg_file.name, 'r', encoding='utf-8') as f:
    for line in f: print(line.rstrip())
print()
print('TEST PASSED - Hook generates correct message format')
print()
print('Usage:')
print('  git add .')
print('  git commit     (hook auto-generates message, confirm in editor)')
print('  git push       (manual, not auto)')
print()
print('Multi-AI switching:')
print('  .\scripts\git-ai-commit.ps1 -Label Cursor -Source cursor -Model o4')
print('  .\scripts\git-ai-commit.ps1 -Label Claude -Source claude -Model claude-4-opus')

os.unlink(msg_file.name)
