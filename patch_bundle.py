import shutil, os

bundle_path = 'd:/3.3-19.01/frontend/dist/assets/vocabAnalyzer-CpjHvwYd.js'
backup_path = bundle_path + '.bak'

# Backup first
shutil.copy2(bundle_path, backup_path)
print(f"Backed up to {backup_path}")

with open(bundle_path, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

original = content

# Patch 1: Inject console.log before step1 (direct wordMap lookup)
# Old: this.wordMap.has(e)){const t=this.wordMap.get(e);return{word:e,level:t.level,rank:t.rank,isUnknown:!1}}
old_step1 = 'this.wordMap.has(e)){const t=this.wordMap.get(e);return{word:e,level:t.level,rank:t.rank,isUnknown:!1}}'
new_step1 = 'console.log("[CEFR-STUB] word="+e+" step1="+this.wordMap.has(e)),this.wordMap.has(e)){const t=this.wordMap.get(e);return{word:e,level:t.level,rank:t.rank,isUnknown:!1}}'
if old_step1 in content:
    content = content.replace(old_step1, new_step1, 1)
    print("Patched step1 (direct lookup)")
else:
    print("ERROR: step1 pattern not found!")
    print("Around 4450:", repr(content[4450:4550]))

# Patch 2: Inject console.log for lemmatization result
# Old: const n=this._lemmatize(e);if(n!==e&&this.wordMap.has(n)){
old_lemma = 'const n=this._lemmatize(e);if(n!==e&&this.wordMap.has(n)){'
new_lemma = 'const n=this._lemmatize(e);console.log("[CEFR-STUB] word="+e+" lemma="+n+" lemma_in_map="+this.wordMap.has(n)),n!==e&&this.wordMap.has(n)){'
if old_lemma in content:
    content = content.replace(old_lemma, new_lemma, 1)
    print("Patched lemma")
else:
    print("ERROR: lemma pattern not found!")

# Patch 3: Inject console.log for stripContraction result
# Old: const s=this._stripContraction(e);if(s!==null&&s!==e&&this.wordMap.has(s)){
old_strip = 'const s=this._stripContraction(e);if(s!==null&&s!==e&&this.wordMap.has(s)){'
new_strip = 'const s=this._stripContraction(e);console.log("[CEFR-STUB] word="+e+" strip="+s+" strip_in_map="+(s!==null&&s!==e&&this.wordMap.has(s))),s!==null&&s!==e&&this.wordMap.has(s)){'
if old_strip in content:
    content = content.replace(old_strip, new_strip, 1)
    print("Patched stripContraction")
else:
    print("ERROR: stripContraction pattern not found!")

# Patch 4: Inject console.log before return null
# Old: return null}_tokenize
old_return = 'return null}_tokenize'
new_return = 'console.log("[CEFR-STUB] word="+e+" -> NOT FOUND, returning null"),return null}_tokenize'
if old_return in content:
    content = content.replace(old_return, new_return, 1)
    print("Patched return null")
else:
    print("ERROR: return null pattern not found!")

with open(bundle_path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"\nOriginal size: {len(original)}")
print(f"New size: {len(content)}")
print(f"Diff: {len(content) - len(original)} bytes")
print("\nPatch complete! Now hard-reload the page (Ctrl+Shift+R) and open DevTools Console.")
print("Filter by: [CEFR-STUB]")
