/* ============================================================================
   bibleref.js — reference parser / formatter / resolver
   No dependencies. Construct with a parsed index.json.

     const R = BibleRef(idx);
     R.parse("Rom 8:28-30; 12:1")   -> {ok:true, ref:[...], label:"Romans 8:28–30; 12:1"}
     R.format(ref)                  -> "Romans 8:28–30; 12:1"
     R.text(ref, getBook, 'kjv')    -> [{b,c,v,t,fallback}]
     R.key(ref)                     -> stable dedupe string

   SEGMENT SHAPE — three levels of specificity:
     {b:'rom'}                        whole book
     {b:'rom', c:8}                   whole chapter
     {b:'rom', c:8, v1:28, v2:30}     verse range (ALWAYS within one chapter)

   INVARIANT: a segment never spans chapters. "Gen 1:1-2:3" normalizes to two
   segments. This keeps rendering, validation and expansion trivial; format()
   re-collapses them for display.

   SUB-VERSE (option c) — optional on a verse segment:
     s, e   character offsets into the verse
     x      the excerpt text, stored as a fallback
     tr     translation the offsets were cut in
   Offsets are only trusted when tr matches the translation being rendered.
   Otherwise text() returns x and flags fallback:true.
============================================================================ */

function BibleRef(index){
  const BOOKS = index.books;
  const BY_ID = {};
  BOOKS.forEach((b,i)=>{ BY_ID[b.id] = b; b._ord = i; });

  // ── alias table ────────────────────────────────────────────────────────────
  // NOTE: roman/ordinal expansion is deliberately NOT done here. Doing it in
  // norm() silently rewrites "Isaiah" -> "1saiah" (leading i + letters), which
  // resolved Isa 53:5 to 1 Samuel. It is a fallback in lookupBook() instead.
  const norm = s => String(s||'')
    .toLowerCase().replace(/[.\u2019']/g,'').replace(/\s+/g,'');

  const ALIAS = {};
  const addAlias = (k,id)=>{ k = norm(k); if(k && !(k in ALIAS)) ALIAS[k] = id; };

  // Registered in priority order — first writer wins. Ids must go first or
  // Judges' generated "jud" prefix steals Jude's own canonical id.
  BOOKS.forEach(b=>addAlias(b.id, b.id));
  BOOKS.forEach(b=>addAlias(b.name, b.id));
  BOOKS.forEach(b=>(b.aliases||[]).forEach(a=>addAlias(a, b.id)));
  BOOKS.forEach(b=>addAlias(b.abbr, b.id));
  BOOKS.forEach(b=>{                    // generated prefixes, lowest priority
    const m = b.name.match(/^([123])\s+(.+)$/);
    if(m) for(let n=3;n<=m[2].length;n++) addAlias(m[1]+m[2].slice(0,n), b.id);
    else   for(let n=3;n<=b.name.length;n++) addAlias(b.name.slice(0,n), b.id);
  });

  function lookupBook(raw){
    const k = norm(raw);
    if(ALIAS[k]) return ALIAS[k];
    const r = k.replace(/^(i{1,3})(?=[a-z])/, m=>String(m.length))
               .replace(/^first/,'1').replace(/^second/,'2').replace(/^third/,'3');
    return (r!==k && ALIAS[r]) ? ALIAS[r] : null;
  }

  const lastCh = b => BY_ID[b] ? BY_ID[b].chapters : 0;
  const lastV  = (b,c) => (BY_ID[b] && BY_ID[b].verses[c-1]) || 0;

  // ── parse ──────────────────────────────────────────────────────────────────
  function parse(input){
    const src = String(input||'')
      .replace(/[\u2010-\u2015\u2212]/g,'-')   // all dash variants -> hyphen
      .replace(/[\u2236:]/g,':')
      .replace(/\s+/g,' ')
      .trim();
    if(!src) return {ok:false, ref:[], errors:['empty']};

    const out=[], errors=[];
    let curBook=null, curCh=null, hadVerses=false;

    for(let chunk of src.split(/\s*;\s*/)){
      if(!chunk.trim()) continue;

      // leading book name = everything up to the first digit that isn't a
      // book-initial numeral (1 John, 2 Cor, III Jn). The (?=[a-zA-Z]) is load
      // bearing: without it "10:9" in a continuation chunk parses its leading
      // "1" as the numeral of a book name and the reference silently truncates.
      const bm = chunk.match(/^\s*([123]\s*\.?\s*(?=[a-zA-Z]))?([a-zA-Z][a-zA-Z\s.]*)?/);
      let raw = ((bm && bm[1])||'') + ((bm && bm[2])||'');
      let rest = chunk.slice(raw.length).trim();

      if(raw.trim()){
        let id = lookupBook(raw);
        if(!id){ // trim trailing words: "Romans chapter" -> "Romans"
          const w = raw.trim().split(/\s+/);
          while(w.length>1 && !id){ w.pop(); id = lookupBook(w.join(' ')); }
        }
        if(!id){ errors.push('unknown book: '+raw.trim()); continue; }
        curBook = id; curCh = null; hadVerses = false;
      }
      if(!curBook){ errors.push('no book for: '+chunk.trim()); continue; }

      if(!rest){                                   // whole book
        out.push({b:curBook}); hadVerses=false; continue;
      }

      for(let part of rest.split(/\s*,\s*/)){
        part = part.trim(); if(!part) continue;
        const seg = parsePart(part, curBook, curCh, hadVerses, errors);
        if(!seg) continue;
        seg.forEach(s=>out.push(s));
        const last = seg[seg.length-1];
        curCh = last.c;
        hadVerses = last.v1 != null;
      }
    }
    const ref = normalize(out);
    const v = validate(ref);
    return {ok: v.ok && !errors.length, ref, errors: errors.concat(v.errors),
            label: format(ref)};
  }

  // one comma-delimited piece: "8", "8:28", "8:28-30", "8:28-9:5", "8-10", "30"
  function parsePart(p, book, curCh, hadVerses, errors){
    const rng = p.split('-');
    const A = num(rng[0]), B = rng.length>1 ? num(rng[1]) : null;
    if(!A){ errors.push('unparsable: '+p); return null; }

    // Obadiah, Philemon, 2-3 John, Jude have one chapter, so "Jude 3" is
    // verse 3 — not chapter 3, which would fail validation.
    const oneCh = lastCh(book) === 1;

    // resolve A into {c,v}
    let ac, av;
    if(A.hasColon){ ac = A.a; av = A.b; }
    else if(hadVerses && curCh!=null){ ac = curCh; av = A.a; }  // "8:28, 30"
    else if(oneCh){ ac = 1; av = A.a; }
    else { ac = A.a; av = null; }                                // whole chapter

    if(!B){
      return [av==null ? {b:book, c:ac} : {b:book, c:ac, v1:av, v2:av}];
    }

    let bc, bv;
    if(B.hasColon){ bc = B.a; bv = B.b; }
    else if(av==null){ bc = B.a; bv = null; }        // "8-10" chapter range
    else { bc = ac; bv = B.a; }                      // "8:28-30"

    // chapter range, no verses
    if(av==null && bv==null){
      const segs=[];
      for(let c=ac;c<=bc;c++) segs.push({b:book, c});
      return segs;
    }
    // verse range, possibly crossing chapters -> split per chapter
    if(av==null) av = 1;
    if(bv==null) bv = lastV(book,bc);
    if(bc===ac) return [{b:book, c:ac, v1:av, v2:bv}];
    const segs=[{b:book, c:ac, v1:av, v2:lastV(book,ac)}];
    for(let c=ac+1;c<bc;c++) segs.push({b:book, c});
    segs.push({b:book, c:bc, v1:1, v2:bv});
    return segs;
  }

  function num(s){
    const m = String(s).trim().match(/^(\d+)(?::(\d+))?$/);
    if(!m) return null;
    return {a:+m[1], b:m[2]!=null?+m[2]:null, hasColon:m[2]!=null};
  }

  // ── normalize: sort canonically, merge touching/overlapping ────────────────
  function normalize(ref){
    const segs = ref.filter(s=>s && BY_ID[s.b]).map(s=>({...s}));
    segs.sort((x,y)=>
      BY_ID[x.b]._ord - BY_ID[y.b]._ord ||
      (x.c||0) - (y.c||0) ||
      (x.v1||0) - (y.v1||0));
    const out=[];
    for(const s of segs){
      const p = out[out.length-1];
      // never merge sub-verse segments — they carry their own offsets/excerpt
      const plain = a => a.s==null && a.e==null;
      if(p && p.b===s.b && plain(p) && plain(s)){
        if(p.c==null) continue;                        // whole book absorbs all
        if(s.c==null){ out.length=0; out.push({b:s.b}); continue; }
        if(p.c===s.c){
          if(p.v1==null) continue;                     // whole chapter absorbs
          if(s.v1==null){ out[out.length-1]={b:s.b,c:s.c}; continue; }
          if(s.v1 <= p.v2+1){ p.v2 = Math.max(p.v2, s.v2); continue; }
        }
      }
      out.push(s);
    }
    return out;
  }

  // ── validate against the index ─────────────────────────────────────────────
  function validate(ref){
    const errors=[];
    ref.forEach(s=>{
      const b = BY_ID[s.b];
      if(!b){ errors.push('unknown book id: '+s.b); return; }
      if(s.c==null) return;
      if(s.c<1 || s.c>b.chapters){
        errors.push(`${b.name} has ${b.chapters} chapters (got ${s.c})`); return; }
      if(s.v1==null) return;
      const n = lastV(s.b, s.c);
      if(s.v1<1 || s.v1>n || s.v2<s.v1 || s.v2>n)
        errors.push(`${b.name} ${s.c} has ${n} verses (got ${s.v1}-${s.v2})`);
    });
    return {ok: !errors.length, errors};
  }

  // clamp out-of-range into something usable rather than rejecting
  function clamp(ref){
    return ref.map(s=>{
      const b = BY_ID[s.b]; if(!b) return null;
      const o = {...s};
      if(o.c!=null) o.c = Math.min(Math.max(1,o.c), b.chapters);
      if(o.v1!=null){
        const n = lastV(o.b,o.c);
        o.v1 = Math.min(Math.max(1,o.v1), n);
        o.v2 = Math.min(Math.max(o.v1,o.v2==null?o.v1:o.v2), n);
      }
      return o;
    }).filter(Boolean);
  }

  // ── format ─────────────────────────────────────────────────────────────────
  const DASH='\u2013';
  function format(ref, opt){
    opt = opt||{};
    const nameOf = b => opt.short ? BY_ID[b].abbr : BY_ID[b].name;
    const dash = opt.ascii ? '-' : DASH;
    const segs = ref.filter(s=>s && BY_ID[s.b]);
    if(!segs.length) return '';
    let out='', pb=null, pc=null, pHadV=false;

    for(let i=0;i<segs.length;i++){
      const s = segs[i];
      // collapse a chapter-spanning verse run back into "8:28–9:5"
      if(s.v1!=null && s.v2===lastV(s.b,s.c) && s.s==null){
        let j=i, endC=s.c, endV=s.v2;
        while(j+1<segs.length){
          const t=segs[j+1];
          if(t.b!==s.b || t.c!==endC+1 || t.s!=null) break;
          if(t.v1==null){ endC=t.c; endV=lastV(t.b,t.c); j++; continue; }
          if(t.v1!==1) break;
          endC=t.c; endV=t.v2; j++;
          if(t.v2!==lastV(t.b,t.c)) break;
        }
        if(j>i){
          out += sep(s,pb,pc,pHadV) + head(s,pb,pc,pHadV,nameOf)
               + s.v1 + dash + endC + ':' + endV;
          pb=s.b; pc=endC; pHadV=true; i=j; continue;
        }
      }
      out += sep(s,pb,pc,pHadV) + head(s,pb,pc,pHadV,nameOf);
      if(s.c!=null && s.v1!=null){
        out += s.v1 + (s.v2>s.v1 ? dash+s.v2 : '');
        if(s.s!=null) out += '\u2020';        // † marks a partial verse
      }
      pb=s.b; pc=s.c; pHadV = s.v1!=null;
    }
    return out;
  }
  function sep(s,pb,pc,pHadV){
    if(pb==null) return '';
    if(s.b!==pb) return '; ';
    if(s.c!==pc) return '; ';
    return ', ';
  }
  function head(s,pb,pc,pHadV,nameOf){
    let h='';
    if(s.b!==pb) h += nameOf(s.b) + (s.c!=null ? ' ' : '');
    if(s.c==null) return h;
    if(lastCh(s.b)===1 && s.v1!=null) return h;   // "Jude 3", never "Jude 1:3"
    if(s.b!==pb || s.c!==pc || !pHadV){
      h += s.c;
      if(s.v1!=null) h += ':';
    }
    return h;
  }

  // ── expand / count / key ───────────────────────────────────────────────────
  function expand(ref){
    const out=[];
    ref.forEach(s=>{
      const b=BY_ID[s.b]; if(!b) return;
      const chs = s.c==null ? range(1,b.chapters) : [s.c];
      chs.forEach(c=>{
        const v1 = (s.c!=null && s.v1!=null) ? s.v1 : 1;
        const v2 = (s.c!=null && s.v2!=null) ? s.v2 : lastV(s.b,c);
        for(let v=v1;v<=v2;v++) out.push({b:s.b,c,v,seg:s});
      });
    });
    return out;
  }
  const range=(a,b)=>{const r=[];for(let i=a;i<=b;i++)r.push(i);return r;};
  function count(ref){
    return ref.reduce((n,s)=>{
      const b=BY_ID[s.b]; if(!b) return n;
      if(s.c==null) return n + b.verses.reduce((a,c)=>a+c,0);
      if(s.v1==null) return n + lastV(s.b,s.c);
      return n + (s.v2-s.v1+1);
    },0);
  }
  function key(ref){
    return normalize(ref).map(s=>
      [s.b,s.c??'',s.v1??'',s.v2??'',s.s??'',s.e??''].join('.')
    ).join('|');
  }
  function compare(a,b){
    const x=a[0],y=b[0];
    if(!x||!y) return 0;
    return BY_ID[x.b]._ord-BY_ID[y.b]._ord || (x.c||0)-(y.c||0) || (x.v1||0)-(y.v1||0);
  }

  // ── text resolution — where option (c) lives ───────────────────────────────
  // getBook(id) -> book JSON (or null if not loaded yet)
  // tr          -> translation tag currently being rendered
  function text(ref, getBook, tr){
    return expand(ref).map(({b,c,v,seg})=>{
      const bk = getBook(b);
      if(!bk) return {b,c,v,t:null, pending:true};
      const full = (bk.ch[c-1]||[])[v-1] || '';
      // whole verse
      if(seg.s==null && seg.e==null)
        return {b,c,v,t:full, omitted:!full};
      // sub-verse cut in THIS translation -> offsets are trustworthy
      if(seg.tr===tr && full)
        return {b,c,v,t:full.slice(seg.s, seg.e), partial:true};
      // cut elsewhere (or verse absent here) -> fall back to stored excerpt
      return {b,c,v,t:seg.x||'', partial:true, fallback:true, cutIn:seg.tr};
    });
  }

  // build a sub-verse segment from a selection made while reading `tr`
  function cut(b,c,v,start,end,verseText,tr){
    return {b, c, v1:v, v2:v, s:start, e:end,
            x:verseText.slice(start,end), tr};
  }

  return {parse, format, normalize, validate, clamp, expand, count, key,
          compare, text, cut, lastCh, lastV, book:id=>BY_ID[id], books:BOOKS};
}

if(typeof module!=='undefined') module.exports = BibleRef;
