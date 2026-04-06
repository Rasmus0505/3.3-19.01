const j = require('./app/data/vocab/cefr_vocab_fixed.json');
const wm = j.words;
const problematic = ['the','you','it','is','are','have','be','do','can','will','go','get','a','an','as','at','by','for','if','in','of','on','or','so','to','up'];
console.log('Apostrophe-prefixed B2+/C1/C2 entries still in vocab:');
let count = 0;
problematic.forEach(w => {
  const key = "'" + w;
  const lvl = wm[key]?.level;
  if (lvl && lvl !== 'A1' && lvl !== 'A2') {
    console.log('  ' + key + ': ' + lvl);
    count++;
  }
});
console.log('Total problematic: ' + count);
console.log('Remaining vocab: ' + Object.keys(wm).length);

// Check the full impact of 'the (B2)
console.log('\nImpact of keeping \'the\' (B2):');
console.log('  If user says "the" with apostrophe prefix, gets B2 -> wrong');
console.log('  But stopwords are filtered out by _tokenize in analyzeSentence');
console.log('  So this only affects lookupCefrLevelForSurfaceForm / extractWordsAboveLevel');
