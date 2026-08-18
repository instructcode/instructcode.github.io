const BibleRef = require('./bibleref.js');
const idx = require('./bible/kjv/index.json');
const R = BibleRef(idx);

let pass=0, fail=0;
function t(input, expected){
  const r = R.parse(input);
  const got = r.label;
  const ok = got === expected && r.ok;
  if(ok) pass++; else { fail++;
    console.log(`  FAIL  "${input}"\n        want: ${expected}\n        got : ${got}${r.errors.length?'  ERR:'+r.errors.join(','):''}`); }
}
function terr(input){
  const r = R.parse(input);
  if(!r.ok) pass++; else { fail++; console.log(`  FAIL  "${input}" should have errored, got ${r.label}`); }
}

console.log('--- basic ---');
t('Rom 8:28',            'Romans 8:28');
t('Romans 8:28',         'Romans 8:28');
t('romans 8:28',         'Romans 8:28');
t('ROM 8:28',            'Romans 8:28');
t('rm 8:28',             'Romans 8:28');
t('Rom8:28',             'Romans 8:28');
t('Jn 3:16',             'John 3:16');
t('John 3:16',           'John 3:16');
t('Ps 23',               'Psalms 23');
t('Psalm 23:1',          'Psalms 23:1');
t('Jude',                'Jude');
t('Jude 3',              'Jude 3');

console.log('--- numbered books ---');
t('1 Cor 13:4',          '1 Corinthians 13:4');
t('1Cor 13:4',           '1 Corinthians 13:4');
t('1 Corinthians 13:4',  '1 Corinthians 13:4');
t('I Corinthians 13:4',  '1 Corinthians 13:4');
t('II Tim 3:16',         '2 Timothy 3:16');
t('III John 4',          '3 John 4');
t('1 Sam 17:45',         '1 Samuel 17:45');
t('2 Kgs 2:11',          '2 Kings 2:11');
t('1 Th 5:17',           '1 Thessalonians 5:17');

console.log('--- multiword ---');
t('Song of Solomon 2:1', 'Song of Solomon 2:1');
t('Song 2:1',            'Song of Solomon 2:1');
t('SoS 2:1',             'Song of Solomon 2:1');

console.log('--- ranges ---');
t('Rom 8:28-30',         'Romans 8:28\u201330');
t('Rom 8:28\u201330',    'Romans 8:28\u201330');   // en dash input
t('Rom 8:28 - 30',       'Romans 8:28\u201330');
t('Gen 1:1-2:3',         'Genesis 1:1\u20132:3');  // cross-chapter collapse
t('Gen 1-3',             'Genesis 1; 2; 3');       // whole chapters
t('Rom 8',               'Romans 8');

console.log('--- lists & chapter carry ---');
t('Rom 3:23; 6:23',              'Romans 3:23; 6:23');
t('Rom 3:23; 6:23; 10:9',        'Romans 3:23; 6:23; 10:9');
t('Rom 8:28, 30',                'Romans 8:28, 30');
t('Rom 8:28, 30, 32',            'Romans 8:28, 30, 32');
t('Rom 3:23; Jn 3:16',           'John 3:16; Romans 3:23');
t('Jn 3:16; Rom 3:23',           'John 3:16; Romans 3:23');  // canonical resort

console.log('--- normalize / merge ---');
t('Rom 8:28; 8:29',      'Romans 8:28\u201329');  // adjacent merge
t('Rom 8:28-30; 8:29',   'Romans 8:28\u201330');  // overlap absorb
t('Rom 8:28; Rom 8',     'Romans 8');             // chapter absorbs verse

console.log('--- errors ---');
terr('Rom 99:1');
terr('Rom 8:99');
terr('Hezekiah 3:1');
terr('');

console.log('--- count & key ---');
const a = R.parse('Rom 3:23; 6:23; 10:9').ref;
console.log('  count Romans Road:', R.count(a), '(want 3)');
console.log('  count Genesis 1  :', R.count(R.parse('Gen 1').ref), '(want 31)');
console.log('  count Jude       :', R.count(R.parse('Jude').ref), '(want 25)');
console.log('  key              :', R.key(a));
console.log('  key stable       :', R.key(R.parse('Rom 10:9; 3:23; 6:23').ref) === R.key(a));

console.log('--- short form ---');
console.log('  ', R.format(a, {short:true}));
console.log('  ', R.format(R.parse('Gen 1:1-2:3').ref, {short:true, ascii:true}));

console.log('--- round trip: format -> parse -> format ---');
let rt=0, rtf=0;
['Rom 8:28','Gen 1:1\u20132:3','Romans 3:23; 6:23; 10:9','1 Corinthians 13:4\u20138',
 'Psalms 23','Song of Solomon 2:1','3 John 4','Rom 8:28, 30, 32','Genesis 1; 2; 3']
 .forEach(s=>{
   const one = R.parse(s).label;
   const two = R.parse(one).label;
   if(one===two) rt++; else { rtf++; console.log(`  FAIL rt "${s}": ${one} -> ${two}`); }
 });
console.log(`  round trips stable: ${rt}, broken: ${rtf}`);

console.log('--- text resolution + sub-verse fallback ---');
const kjvRom = require('./bible/kjv/rom.json');
const webRom = require('./bible/web/rom.json');
const getK = id => id==='rom' ? kjvRom : null;
const getW = id => id==='rom' ? webRom : null;

const whole = R.parse('Rom 8:28').ref;
console.log('  whole  :', R.text(whole, getK, 'kjv')[0].t.slice(0,60));

// cut "all things work together for good" out of the KJV verse
const kjvText = kjvRom.ch[7][27];
const st = kjvText.indexOf('all things');
const en = kjvText.indexOf('good') + 4;
const seg = R.cut('rom',8,28,st,en,kjvText,'kjv');
console.log('  cut in kjv, read in kjv:');
const inKjv = R.text([seg], getK, 'kjv')[0];
console.log('     ', JSON.stringify(inKjv.t), 'partial:', !!inKjv.partial, 'fallback:', !!inKjv.fallback);
console.log('  same card, read in web (offsets invalid -> excerpt fallback):');
const inWeb = R.text([seg], getW, 'web')[0];
console.log('     ', JSON.stringify(inWeb.t), 'fallback:', !!inWeb.fallback, 'cutIn:', inWeb.cutIn);
console.log('  label shows dagger:', R.format([seg]));

console.log('--- omitted verse (WEB Acts 8:37) ---');
const webAct = require('./bible/web/act.json');
const kjvAct = require('./bible/kjv/act.json');
const a837 = R.parse('Acts 8:37').ref;
console.log('  kjv:', JSON.stringify(R.text(a837, ()=>kjvAct,'kjv')[0].t.slice(0,50)));
const w837 = R.text(a837, ()=>webAct,'web')[0];
console.log('  web:', JSON.stringify(w837.t), 'omitted flag:', !!w837.omitted);

console.log('--- pending (book not loaded) ---');
console.log('  ', JSON.stringify(R.text(R.parse('Isa 53:5').ref, ()=>null, 'kjv')[0]));

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
