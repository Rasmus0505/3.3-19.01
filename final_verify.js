// final_verify.js - Comprehensive lookup chain verification after all cleanup
const j = require('./app/data/vocab/cefr_vocab_fixed.json');
const wordMap = new Map(Object.entries(j.words));
const level_order = ['A1','A2','B1','B2','C1','C2'];

// Extended normalize map (matching JS vocabAnalyzer.js)
const ALL_NORMALIZE = {
  'dont':'do','cant':'can','wont':'will','shant':'shall','im':'i','ive':'i','id':'i','ill':'i',
  'theyve':'they','theyll':'they','theyd':'they','weve':'we','well':'we','wed':'we',
  'youll':'you','youd':'you','its':'it','thats':'that','whats':'what','whos':'who',
  'wheres':'where','whens':'when','hows':'how','lets':'let',
  'didnt':'do','doesnt':'do','isnt':'is','wasnt':'be','arent':'be','werent':'be',
  'havent':'have','hasnt':'have','hadnt':'have','couldnt':'can','wouldnt':'will',
  'shouldnt':'shall','mustnt':'must','mightnt':'might','aint':'be',
  'shes':'she','hes':'he','youre':'you','theyre':'they','youve':'you',
  'gonna':'go','wanna':'want','gotta':'get','outta':'out','kinda':'kind',
  'sorta':'sort','lemme':'let','gimme':'give','dunno':'know',
  'shoulda':'should','coulda':'could','woulda':'would','musta':'must','ima':'i',
  'u':'you','ur':'your','r':'are','b':'be','c':'see','y':'why','n':'and',
  'rn':'right','yall':'you','lol':'laugh','lmao':'laugh','omg':'oh',
  'bruh':'brother','ik':'i','yolo':'you','v':'very','btw':'by','fyi':'for','asap':'as'
};

const suffixRules = [
  ['ies','y'],['es',''],['ed',''],['ing',''],['ly',''],
  ['ness',''],['ment',''],['tion','t'],['s','']
];

function lemmatize(w) {
  for (const [sf, repl] of suffixRules) {
    if (w.endsWith(sf) && w.length > sf.length + 2) {
      const base = w.slice(0, -sf.length) + repl;
      if (wordMap.has(base)) return base;
    }
  }
  return w;
}

function stripContraction(w) {
  const m = w.match(/^(.+?)n't$/i);
  if (m) { const base = m[1].toLowerCase(); const sm = {'wont':'will','shant':'shall'}; return sm[base] || base; }
  const m2 = w.match(/^(.+?)'(s|d|m|re|ve|ll)$/i);
  if (m2) return m2[1].toLowerCase();
  return null;
}

function lookup(w) {
  const lower = w.toLowerCase();
  if (wordMap.has(lower)) return {step:'direct', level:wordMap.get(lower).level};
  const lemma = lemmatize(lower);
  if (lemma !== lower && wordMap.has(lemma)) return {step:'lemma:'+lemma, level:wordMap.get(lemma).level};
  const nonstandard = ALL_NORMALIZE[lower] || null;
  if (nonstandard !== null && nonstandard !== lower && wordMap.has(nonstandard)) {
    return {step:'norm:'+nonstandard, level:wordMap.get(nonstandard).level};
  }
  const stripped = stripContraction(lower);
  if (stripped !== null && stripped !== lower && wordMap.has(stripped)) {
    return {step:'strip:'+stripped, level:wordMap.get(stripped).level};
  }
  return {step:'not_found', level:'SUPER'};
}

// === Test cases ===
const testCases = [
  // Problematic ASR/speech errors (should be A1/A2 after fix)
  { word: 'im',    expected: 'A1', group: 'ASR errors' },
  { word: 'cant',  expected: 'A1', group: 'ASR errors' },
  { word: 'dont',  expected: 'A1', group: 'ASR errors' },
  { word: 'wont',  expected: 'A1', group: 'ASR errors' },
  { word: 'ive',   expected: 'A1', group: 'ASR errors' },
  { word: 'wed',   expected: 'A1', group: 'ASR errors' },
  { word: 'youd',  expected: 'A1', group: 'ASR errors' },
  { word: 'youll', expected: 'A1', group: 'ASR errors' },
  { word: 'youve', expected: 'A1', group: 'ASR errors' },
  { word: 'theyd', expected: 'A1', group: 'ASR errors' },
  { word: 'theyll',expected: 'A1', group: 'ASR errors' },
  { word: 'theyve',expected: 'A1', group: 'ASR errors' },
  { word: 'weve',  expected: 'A1', group: 'ASR errors' },
  { word: 'shes',  expected: 'A1', group: 'ASR errors' },
  { word: 'hes',   expected: 'A1', group: 'ASR errors' },
  { word: 'lets',  expected: 'A1', group: 'ASR errors' },
  { word: 'thats', expected: 'A1', group: 'ASR errors' },
  { word: 'whats', expected: 'A1', group: 'ASR errors' },
  { word: 'hows',  expected: 'A1', group: 'ASR errors' },
  { word: 'wheres',expected: 'A1', group: 'ASR errors' },
  { word: 'whos',  expected: 'A1', group: 'ASR errors' },
  { word: 'youre', expected: 'A1', group: 'ASR errors' },
  { word: 'theyre',expected: 'A1', group: 'ASR errors' },
  { word: 'isnt',  expected: 'A1', group: 'ASR errors' },
  { word: 'wasnt', expected: 'A1', group: 'ASR errors' },
  { word: 'arent', expected: 'A1', group: 'ASR errors' },
  { word: 'werent',expected: 'A1', group: 'ASR errors' },
  { word: 'didnt', expected: 'A1', group: 'ASR errors' },
  { word: 'doesnt',expected: 'A1', group: 'ASR errors' },
  { word: 'havent',expected: 'A1', group: 'ASR errors' },
  { word: 'couldnt',expected:'A1', group: 'ASR errors' },
  { word: 'wouldnt',expected:'A1', group: 'ASR errors' },
  { word: 'shouldnt',expected:'A2',group: 'ASR errors' },
  { word: 'aint',  expected: 'A1', group: 'ASR errors' },
  // Colloquial speech
  { word: 'ima',    expected: 'A1', group: 'Colloquial' },
  { word: 'gonna', expected: 'A1', group: 'Colloquial' },
  { word: 'wanna', expected: 'A1', group: 'Colloquial' },
  { word: 'gotta', expected: 'A1', group: 'Colloquial' },
  { word: 'kinda', expected: 'A1', group: 'Colloquial' },
  { word: 'sorta', expected: 'B1', group: 'Colloquial' },
  { word: 'outta', expected: 'A1', group: 'Colloquial' },
  { word: 'lemme', expected: 'A1', group: 'Colloquial' },
  { word: 'gimme', expected: 'A1', group: 'Colloquial' },
  { word: 'dunno', expected: 'A1', group: 'Colloquial' },
  { word: 'shoulda',expected: 'A1', group: 'Colloquial' },
  { word: 'coulda',expected: 'A1', group: 'Colloquial' },
  { word: 'woulda',expected: 'A1', group: 'Colloquial' },
  // Internet slang
  { word: 'u',     expected: 'A1', group: 'Internet' },
  { word: 'ur',    expected: 'A1', group: 'Internet' },
  { word: 'r',     expected: 'A1', group: 'Internet' },
  { word: 'yall',  expected: 'A1', group: 'Internet' },
  { word: 'omg',   expected: 'A1', group: 'Internet' },
  { word: 'lol',   expected: 'A1', group: 'Internet' },
  // Normal words (should stay correct)
  { word: 'say',   expected: 'A1', group: 'Normal' },
  { word: 'said',  expected: 'A1', group: 'Normal' },
  { word: 'i',     expected: 'A1', group: 'Normal' },
  { word: 'can',   expected: 'A1', group: 'Normal' },
  { word: 'do',    expected: 'A1', group: 'Normal' },
  { word: 'will',  expected: 'A1', group: 'Normal' },
  { word: 'be',    expected: 'A1', group: 'Normal' },
  { word: 'have',  expected: 'A1', group: 'Normal' },
  { word: 'we',    expected: 'A1', group: 'Normal' },
  { word: 'you',   expected: 'A1', group: 'Normal' },
  { word: 'it',    expected: 'A1', group: 'Normal' },
  { word: 'that',  expected: 'A1', group: 'Normal' },
  { word: 'what',  expected: 'A1', group: 'Normal' },
  { word: 'who',   expected: 'A1', group: 'Normal' },
  { word: 'where', expected: 'A1', group: 'Normal' },
  { word: 'how',   expected: 'A1', group: 'Normal' },
  { word: 'let',   expected: 'A1', group: 'Normal' },
  { word: 'go',   expected: 'A1', group: 'Normal' },
  { word: 'get',  expected: 'A1', group: 'Normal' },
  { word: 'want',  expected: 'A1', group: 'Normal' },
  { word: 'she',  expected: 'A1', group: 'Normal' },
  { word: 'he',   expected: 'A1', group: 'Normal' },
];

let passed = 0, failed = 0;
const failures = [];
for (const tc of testCases) {
  const r = lookup(tc.word);
  const ok = r.level === tc.expected;
  if (ok) passed++;
  else {
    failed++;
    failures.push({word: tc.word, expected: tc.expected, got: r.level, step: r.step});
  }
}

console.log('='.repeat(60));
console.log('FINAL VERIFICATION RESULTS');
console.log('='.repeat(60));
console.log(`Total: ${testCases.length} | PASS: ${passed} | FAIL: ${failed}`);
if (failures.length > 0) {
  console.log('\nFAILURES:');
  failures.forEach(f => {
    console.log(`  ${f.word.padEnd(12)} expected ${f.expected} got ${f.got} (via ${f.step})`);
  });
} else {
  console.log('\nAll tests PASSED!');
}
console.log(`\nVocab size: ${Object.keys(j.words).length} (was 50000, cleaned: ${50000 - Object.keys(j.words).length} removed)`);
