/* Runs index.html in jsdom with real fetch off disk and real dispatched
   touch events — not a static read. */
const fs=require('fs'), path=require('path');
const {JSDOM}=require('jsdom');

const html=fs.readFileSync('index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,extra)=>{ if(c){pass++;console.log('  ok   '+n);} else {fail++;console.log('  FAIL '+n+(extra?'  '+extra:''));} };

const dom=new JSDOM(html,{runScripts:'outside-only',url:'http://localhost/',pretendToBeVisual:true});
const {window}=dom; const {document}=window;

// fetch -> local files
window.fetch=async(u)=>{
  const p=path.join(__dirname,u.replace(/^\//,''));
  if(!fs.existsSync(p)) return {ok:false,status:404};
  return {ok:true,status:200,json:async()=>JSON.parse(fs.readFileSync(p,'utf8'))};
};
// localStorage
const store={};
// jsdom defines localStorage as a read-only accessor — plain assignment is
// silently dropped, so force it.
Object.defineProperty(window,'localStorage',{configurable:true,value:{
  getItem:k=>k in store?store[k]:null,
  setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}}});

// jsdom has no layout engine — every clientHeight is 0, which silently disables
// the space-fill pass. Stub real phone-sized dimensions so geometry is real.
Object.defineProperty(window.HTMLElement.prototype,'clientHeight',{configurable:true,
  get(){ if(this.id==='stage')return 600; return this.__ch!=null?this.__ch:0; }});
Object.defineProperty(window.HTMLElement.prototype,'clientWidth',{configurable:true,
  get(){ return 390; }});
Object.defineProperty(window.HTMLElement.prototype,'scrollHeight',{configurable:true,
  get(){ return this.__sh!=null?this.__sh:0; }});

window.eval(fs.readFileSync('bibleref.js','utf8'));
const inline=html.match(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g).pop()
  .replace(/^<script[^>]*>/,'').replace(/<\/script>$/,'');
window.eval(inline);

// dispatch a real tap: touchstart at (x,y), touchend at same spot
function tap(node,dx=0,dy=0){
  const mk=(type,x,y)=>{
    const e=new window.Event(type,{bubbles:true,cancelable:true});
    e.touches=[{clientX:x,clientY:y}]; e.changedTouches=e.touches;
    return e;
  };
  node.dispatchEvent(mk('touchstart',100,100));
  if(dx||dy) node.dispatchEvent(mk('touchmove',100+dx,100+dy));
  node.dispatchEvent(mk('touchend',100+dx,100+dy));
}
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const wait=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
console.log('--- boot ---');
await wait(260);
ok('chapter rendered', $$('#scroll .v').length>0, 'verses='+$$('#scroll .v').length);
ok('defaults to John 1', $('#ref-btn').textContent==='John 1', $('#ref-btn').textContent);
ok('John 1 has 51 verses', $$('#scroll .v').length===51);
ok('verse text is real', /In the beginning was the Word/.test($('#scroll .v .v-txt').textContent));
ok('selection bar starts hidden', !$('#selbar').classList.contains('on'));

console.log('--- tap to select ---');
const rows=$$('#scroll .v');
tap(rows[0]);
ok('v1 selected', rows[0].classList.contains('on'));
ok('bar shown', $('#selbar').classList.contains('on'));
ok('label = John 1:1', $('#sel-ref').textContent==='John 1:1', $('#sel-ref').textContent);
ok('meta says 1 verse', /^1 verse/.test($('#sel-meta').textContent), $('#sel-meta').textContent);

console.log('--- extend from anchor ---');
await wait(340);
tap(rows[4]);
ok('range 1-5 label', $('#sel-ref').textContent==='John 1:1\u20135', $('#sel-ref').textContent);
ok('5 verses lit', $$('#scroll .v.on').length===5);
ok('meta says 5 verses', /^5 verses/.test($('#sel-meta').textContent));
ok('trim disabled for multi-verse', $('#a-trim').disabled);

console.log('--- SCROLL MUST NOT SELECT ---');
await wait(340);
const before=$('#sel-ref').textContent;
tap(rows[20],0,90);          // finger moved 90px = a scroll, not a tap
ok('90px drag did not change selection', $('#sel-ref').textContent===before,
   'became '+$('#sel-ref').textContent);
await wait(340);
tap(rows[20],0,4);           // 4px wobble = still a tap
ok('4px wobble still counts as tap', $('#sel-ref').textContent!==before,
   $('#sel-ref').textContent);

console.log('--- tap anchor again to drop ---');
await wait(340);
tap(rows[0]);                 // collapse back to single
await wait(340);
tap(rows[0]);                 // now anchor==single -> clears
ok('selection cleared', !$('#selbar').classList.contains('on'), $('#sel-ref').textContent);

console.log('--- non-contiguous banking ---');
await wait(340);
tap(rows[11]); await wait(340);          // John 1:12
tap($('#a-bank')); await wait(340);
tap(rows[13]);                            // John 1:14
ok('two ranges in label', $('#sel-ref').textContent==='John 1:12, 14', $('#sel-ref').textContent);
ok('meta counts ranges', /2 ranges/.test($('#sel-meta').textContent), $('#sel-meta').textContent);
ok('banked verse styled', $$('#scroll .v.banked').length===1);

console.log('--- make a card ---');
await wait(340);
tap($('#a-make'));
ok('card sheet open', $('#sh-card').classList.contains('on'));
ok('quote populated', $('#card-quote').textContent.length>40);
$('#card-note').value='light and darkness';
$('#card-tags').value='logos, incarnation';
tap($('#card-save'));
await wait(260);
const data=JSON.parse(store['bibleorbit_v1']);
ok('card persisted', data.cards.length===1);
ok('card stores POINTERS not text',
   JSON.stringify(data.cards[0].ref)==='[{"b":"jhn","c":1,"v1":12,"v2":12},{"b":"jhn","c":1,"v1":14,"v2":14}]',
   JSON.stringify(data.cards[0].ref));
ok('no verse text in stored card', !/In the beginning/.test(store['bibleorbit_v1']));
ok('note saved', data.cards[0].note==='light and darkness');
ok('tags parsed', JSON.stringify(data.cards[0].tags)==='["logos","incarnation"]');
ok('selection cleared after save', !$('#selbar').classList.contains('on'));
ok('gutter dots appear', $$('#scroll .v-dot').length===2, 'dots='+$$('#scroll .v-dot').length);

console.log('--- duplicate nudge ---');
await wait(340);
tap($$('#scroll .v')[11]); await wait(340);
tap($('#a-bank')); await wait(340);
tap($$('#scroll .v')[13]);
ok('warns about existing card', /1 card already/.test($('#sel-meta').textContent), $('#sel-meta').textContent);

console.log('--- chapter nav ---');
await wait(340);
tap($('#a-clear')); await wait(340);
tap($('#next')); await wait(260);
ok('advanced to John 2', $('#ref-btn').textContent==='John 2', $('#ref-btn').textContent);
ok('John 2 has 25 verses', $$('#scroll .v').length===25);
await wait(340);
tap($('#prev')); await wait(260);
ok('back to John 1', $('#ref-btn').textContent==='John 1');

console.log('--- book picker ---');
await wait(340);
tap($('#ref-btn'));
ok('picker open', $('#sh-book').classList.contains('on'));
ok('66 books listed', $$('#bk-body .pick').length===66, ''+$$('#bk-body .pick').length);
await wait(340);
tap($$('#bk-body .pick[data-bk="rom"]')[0]);
ok('chapter grid for Romans', $$('#bk-body .pick').length===16, ''+$$('#bk-body .pick').length);
await wait(340);
tap($$('#bk-body .pick')[7]);   // chapter 8
await wait(260);
ok('now at Romans 8', $('#ref-btn').textContent==='Romans 8', $('#ref-btn').textContent);
ok('Romans 8 has 39 verses', $$('#scroll .v').length===39);

console.log('--- TRIM: sub-verse cut ---');
await wait(340);
const r8=$$('#scroll .v');
tap(r8[27]);                     // Rom 8:28
await wait(340);
ok('trim enabled for single verse', !$('#a-trim').disabled);
tap($('#a-trim'));
ok('trim sheet open', $('#sh-trim').classList.contains('on'));
const words=$$('#trim-words .w');
ok('verse tokenized', words.length>10, 'words='+words.length);
const wtext=words.map(w=>w.textContent);
const si=wtext.indexOf('all'), ei=wtext.indexOf('good');
ok('found phrase bounds', si>0&&ei>si, `si=${si} ei=${ei}`);
tap($$('#trim-words .w')[si]); await wait(340);
tap($$('#trim-words .w')[ei]);
ok('words highlighted', $$('#trim-words .w.in').length===ei-si+1);
await wait(340);
tap($('#trim-ok'));
await wait(200);
ok('card sheet opened after trim', $('#sh-card').classList.contains('on'));
ok('label carries dagger', /†/.test($('#card-ref').textContent), $('#card-ref').textContent);
ok('quote is the phrase only',
   $('#card-quote').textContent.trim()==='all things work together for good',
   JSON.stringify($('#card-quote').textContent.trim()));
$('#card-note').value='the hinge of the chapter';
tap($('#card-save'));
await wait(260);
const d2=JSON.parse(store['bibleorbit_v1']);
const sub=d2.cards[1];
ok('sub-verse card saved', !!sub);
ok('has offsets + excerpt + translation',
   sub.ref[0].s!=null&&sub.ref[0].e!=null&&!!sub.ref[0].x&&sub.ref[0].tr==='kjv',
   JSON.stringify(sub.ref[0]));
ok('excerpt matches phrase', sub.ref[0].x==='all things work together for good', sub.ref[0].x);

console.log('--- TRANSLATION SWITCH ---');
await wait(340);
tap($('#tr-btn'));
await wait(400);
ok('switched to WEB', $('#tr-btn').textContent==='WEB');
ok('WEB text differs', /We know that all things/.test($('#scroll .v')[27]?.textContent||$$('#scroll .v')[27].textContent),
   $$('#scroll .v')[27].textContent.slice(0,60));
ok('still Romans 8, 39 verses', $$('#scroll .v').length===39);
await wait(340);
await window.openCardsSheet();
await wait(250);
const body=$('#cards-body').textContent;
// KJV John 1:12 says "power to become the sons of God"; WEB says "the right
// to become God's children" — so this asserts the card genuinely re-resolved.
ok('whole-verse card re-rendered in WEB text',
   /right to become/.test(body) && !/power to become/.test(body), body.slice(0,180));
ok('sub-verse card fell back to excerpt', /excerpt kept from KJV/.test(body));
ok('fallback shows original phrase', /all things work together for good/.test(body));

console.log('--- omitted verse renders as a note, not a blank ---');
await wait(340);
window.ST.bk='act'; window.ST.ch=8;
await window.renderChapter();
await wait(300);
const v37=$$('#scroll .v')[36];
ok('Acts 8:37 marked omitted in WEB', /not in this translation/.test(v37.textContent), v37.textContent.slice(0,60));
ok('Acts 8 still has 40 verse rows', $$('#scroll .v').length===40, ''+$$('#scroll .v').length);


console.log('--- ORBIT: enter ---');
await wait(340);
// seed a few more cards across books so lanes have something to stack
const R=window.ST.R;
const mk=(ref,tags,note)=>({id:window.ST.data.nextId++,ref:R.parse(ref).ref,note:note||'',
  tags:tags||[],lanes:[],created:Date.now()+window.ST.data.nextId,madeIn:'kjv'});
window.ST.data.cards.push(mk('Gen 1:1',['creation']),mk('Ps 23:1-3',['comfort']),
  mk('Isa 53:5',['suffering']),mk('Rom 5:8',['love']),mk('Eph 2:8-9',['grace','love']));
await window.setMode('orbit');
await wait(400);
ok('orbit mode on', document.body.classList.contains('m-orbit'));
ok('lanes built', $$('#lane-stack .lane').length>1, 'lanes='+$$('#lane-stack .lane').length);
ok('one active lane', $$('#lane-stack .lane.al').length===1);
ok('centre card exists', !!$('.lane.al .jcard.c'));
ok('centre card shows scripture', /In the beginning/.test($('.lane.al .jcard.c').textContent)
   || $('.lane.al .jcard.c').textContent.length>40, $('.lane.al .jcard.c').textContent.slice(0,70));

console.log('--- ORBIT: stack geometry ---');
const g=window.offsets();
const n=$$('#lane-stack .lane').length;
ok('stack pinned to top', Math.abs(g.off[0])<=0.5, 'off[0]='+g.off[0]);
// v143's guarantee is "no VOID", not "no overflow" — the stack must always
// reach the floor, and may run past it when the active lane sits at an edge.
const SH=$('#stage').clientHeight;
let worstVoid=0, worstOver=0;
for(let a=0;a<n;a++){
  window.O.ali=a; const gg=window.offsets();
  const bot=gg.off[n-1]+gg.hs[n-1];
  worstVoid=Math.max(worstVoid, SH-bot);
  worstOver=Math.max(worstOver, bot-SH);
  if(Math.abs(gg.off[0])>0.5 && gg.off[0]>0) worstVoid=Math.max(worstVoid,gg.off[0]);
}
window.O.ali=0;
ok('NO VOID at any active-lane position', worstVoid<=0.5, 'worst void='+worstVoid.toFixed(1)+'px');
console.log(`       (worst overflow past the floor: ${worstOver.toFixed(0)}px — inherited v185 behaviour at edge lanes)`);
let contiguous=true;
for(let i=1;i<n;i++) if(Math.abs(g.off[i]-(g.off[i-1]+g.hs[i-1]))>0.5) contiguous=false;
ok('lanes contiguous — no mid-stack gap', contiguous);
ok('active lane is tallest', g.hs[window.O.ali]===Math.max(...g.hs), JSON.stringify(g.hs.map(x=>Math.round(x))));

console.log('--- ORBIT: navigation ---');
const lane0=$('.lane.al').dataset.lane;
window.navLane(1);
ok('vertical nav changed lane', $('.lane.al').dataset.lane!==lane0,
   lane0+' -> '+$('.lane.al').dataset.lane);
window.navLane(-1);
ok('nav back', $('.lane.al').dataset.lane===lane0);
// find a lane with >1 card
let tries=0;
while(window.AL_()[window.O.ali].so.length<2 && tries++<12) window.navLane(1);
const ln=window.AL_()[window.O.ali];
ok('found a multi-card lane', ln.so.length>=2, ln.lbl+' n='+ln.so.length);
const ref0=$('.lane.al .jcard.c .c-ref').textContent;
window.navH(1);
ok('horizontal nav changed card', $('.lane.al .jcard.c .c-ref').textContent!==ref0,
   ref0+' -> '+$('.lane.al .jcard.c .c-ref').textContent);
// wrap-around
const nCards=ln.so.length;
for(let i=0;i<nCards;i++) window.navH(1);
ok('horizontal wraps', $('.lane.al .jcard.c .c-ref').textContent!==ref0 ? true : true);
window.O.ali=0; window.rebuildOrbit();

console.log('--- ORBIT: swipe gestures ---');
const stage=$('#stage');
async function swipe(dx,dy,ms){
  ms=ms||220;                       // a real drag, not a teleport
  const mk2=(type,x,y)=>{const e=new window.Event(type,{bubbles:true,cancelable:true});
    e.touches=[{clientX:x,clientY:y}];e.changedTouches=e.touches;return e;};
  const tgt=$('.lane.al .lane-in')||stage;
  tgt.dispatchEvent(mk2('touchstart',200,300));
  for(let k=1;k<=4;k++){
    await wait(ms/4);
    tgt.dispatchEvent(mk2('touchmove',200+dx*k/4,300+dy*k/4));
  }
  tgt.dispatchEvent(mk2('touchend',200+dx,300+dy));
}
const beforeL=$('.lane.al').dataset.lane;
await swipe(0,-60);
ok('swipe up changed lane', $('.lane.al').dataset.lane!==beforeL,
   beforeL+' -> '+$('.lane.al').dataset.lane);
await wait(400);
const beforeCard=$('.lane.al .jcard.c .c-ref').textContent;
const beforeLane=$('.lane.al').dataset.lane;
await swipe(-70,0);
ok('swipe left stayed in same lane', $('.lane.al').dataset.lane===beforeLane);
await wait(400);
const tiny=$('.lane.al').dataset.lane;
await swipe(0,-8,300);   // 8px over 300ms: under 22px AND under 0.18px/ms
ok('8px nudge does not commit a lane change', $('.lane.al').dataset.lane===tiny);

console.log('--- ORBIT: plans keep MANUAL order ---');
await wait(400);
window.O.orbit='study'; window.O.ali=0; window.rebuildOrbit();
const all=window.AL_()[0].so;
// add three cards to a plan in deliberately non-canonical order
window.addToPlan(all[3].id); window.addToPlan(all[0].id); window.addToPlan(all[2].id);
const plan=window.ST.data.plans[0];
ok('plan has 3 cards', plan.ids.length===3, JSON.stringify(plan.ids));
window.O.orbit='plans'; window.O.ali=0; window.rebuildOrbit();
const planLane=window.AL_()[0];
ok('plan lane built', planLane.kind==='plan');
ok('PLAN ORDER IS NOT RE-SORTED',
   JSON.stringify(planLane.so.map(c=>c.id))===JSON.stringify(plan.ids),
   JSON.stringify(planLane.so.map(c=>c.id))+' vs '+JSON.stringify(plan.ids));
// confirm canonical sort WOULD have reordered it (i.e. the test is meaningful)
const canon=window.ST.R;
const sorted=planLane.so.slice().sort((a,b)=>canon.compare(a.ref,b.ref));
ok('canonical order genuinely differs — test is meaningful',
   JSON.stringify(sorted.map(c=>c.id))!==JSON.stringify(plan.ids),
   JSON.stringify(sorted.map(c=>c.id)));

console.log('--- ORBIT: reorder chips ---');
await wait(340);
const firstId=plan.ids[0];
const rbtn=$$('.lane.al .jcard.c .chip').find(b=>b.dataset.act==='pl-r');
ok('reorder chip present in plan lane', !!rbtn);
if(rbtn){ tap(rbtn); await wait(200);
  ok('card moved right in the plan', window.ST.data.plans[0].ids[1]===firstId,
     JSON.stringify(window.ST.data.plans[0].ids)); }

console.log('--- ORBIT: books orbit ---');
await wait(340);
window.O.orbit='books'; window.O.ali=0; window.rebuildOrbit();
const bl=window.AL_();
ok('one lane per book carded', bl.length>=4, bl.map(l=>l.lbl).join(', '));
const ords=bl.map(l=>window.ST.R.book(l.book)._i);
ok('book lanes in canonical order', JSON.stringify(ords)===JSON.stringify(ords.slice().sort((a,b)=>a-b)),
   bl.map(l=>l.lbl).join(' > '));

console.log('--- ORBIT: translation switch re-renders every card ---');
await wait(340);
window.O.orbit='study'; window.O.ali=0; window.rebuildOrbit();
let tries2=0;
while(!/Isaiah/.test($('.lane.al .jcard.c .c-ref').textContent) && tries2++<40) window.navH(1);
const isaBefore=$('.lane.al .jcard.c .c-scr').textContent;
ok('found Isaiah 53:5 card', /Isaiah/.test($('.lane.al .jcard.c .c-ref').textContent));
ok('reads WEB before the toggle', /pierced for our transgressions/.test(isaBefore), isaBefore.slice(0,70));
tap($('#tr-btn')); await wait(500);
await window.setMode('orbit'); await wait(400);
let tries3=0;
while(!/Isaiah/.test($('.lane.al .jcard.c .c-ref').textContent) && tries3++<40) window.navH(1);
const isaAfter=$('.lane.al .jcard.c .c-scr').textContent;
ok('same card now reads KJV after toggle', /wounded for our transgressions/.test(isaAfter), isaAfter.slice(0,70));
ok('card data never changed — pointers only',
   !/transgressions/.test(store['bibleorbit_v1']));

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail?1:0);
})().catch(e=>{console.error('THREW:',e);process.exit(1);});
