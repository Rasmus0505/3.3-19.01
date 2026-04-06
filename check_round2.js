const j=require('./app/data/vocab/cefr_vocab_fixed.json');
const tests=['the','but','you','it','is','are','have','be','do','can','will','go','get','want','say','the'];
tests.forEach(t=>{
  const key="'"+t;
  const lvl=j.words[key]?.level;
  console.log("'"+t+":",lvl||'NOT FOUND');
});
// Also: stopwords list
const stopwords=new Set(['the','be','to','of','and','a','in','that','have','i','it','for','not','on','with','he','as','you','do','at','this','but','his','by','from','they','we','say','her','she','or','an','will','my','one','all','would','there','their','what','so','up','out','if','about','who','get','which','go','me','when','make','can','like','time','no','just','him','know','take','people','into','year','your','good','some','could','them','see','other','than','then','now','look','only','come','its','over','think','also','back','after','use','two','how','our','work','first','well','way','even','new','want','because','any','these','give','day','most','us']);
console.log('\nStopword check:');
tests.forEach(t=>console.log(t,'is stopword?',stopwords.has(t)));
console.log('\nRemaining words:', Object.keys(j.words).length);
