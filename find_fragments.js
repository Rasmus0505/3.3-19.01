// find_fragments.js
const j = require('./app/data/vocab/cefr_vocab_fixed.json');
const keys = Object.keys(j.words);

// Find apostrophe-prefixed fragments at SUPER/C1/C2 level
const fragments = keys.filter(k =>
  k.startsWith("'") &&
  (j.words[k].level === 'SUPER' || j.words[k].level === 'C1' || j.words[k].level === 'C2')
);
console.log('Apostrophe-prefixed fragments (SUPER/C1/C2):');
fragments.sort().forEach(k => console.log('  ' + k + ' : ' + j.words[k].level));
console.log('Total: ' + fragments.length);

// Also find SUPER entries that look like speech noise (single chars, broken words)
const noiseWords = keys.filter(k => {
  if (j.words[k].level !== 'SUPER') return false;
  if (k.length <= 3) return true;  // very short SUPER words
  // Broken/incomplete-looking fragments
  if (/\-\-/.test(k)) return true; // hyphen fragments
  if (/^[a-z]+\-[a-z]+\-/.test(k)) return true;
  return false;
});
console.log('\nNoise SUPER entries:');
noiseWords.sort().forEach(k => console.log('  ' + k + ' : ' + j.words[k].level));

// Find words that are likely lemmatization artifacts
// e.g. 'wher' (where - 'e' from 's' stripping)
const lemArtifacts = keys.filter(k => {
  if (j.words[k].level !== 'SUPER') return false;
  // very short 4-5 char SUPER words that could be base forms
  if (k.length >= 4 && k.length <= 6) {
    // Check if a longer form + suffix exists
    const candidates = [k + 's', k + 'ed', k + 'ing', k + 'es'];
    for (const cand of candidates) {
      if (keys.includes(cand)) {
        const candLevel = j.words[cand].level;
        if (candLevel === 'A1' || candLevel === 'A2' || candLevel === 'B1') {
          return true; // k is likely a wrongly-lemmatized base
        }
      }
    }
  }
  return false;
});
console.log('\nPossible lemmatization artifacts (SUPER word with valid B1- derived form):');
lemArtifacts.sort().forEach(k => console.log('  ' + k + ' : ' + j.words[k].level));
