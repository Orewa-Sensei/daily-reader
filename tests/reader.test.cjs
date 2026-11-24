const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const engineSource = fs.readFileSync('recommendation-engine.js','utf8');
const discoverySource = fs.readFileSync('discovery.js','utf8');
const catalogueSource = fs.readFileSync('catalogue.js','utf8');
function engineContext(){
 const context={window:{},Date,Math};
 vm.runInNewContext(engineSource,context);
 return context.window.DailyReaderEngine;
}
function work(id,type,extra={}){
 return {id,type,title:'Work '+id,author:'Author '+id,sourceUrl:'https://example.org/'+id,verified:true,
  sourceLanguage:'English',displayLanguage:'English',translationStatus:'original',
  region:'Region '+id,tradition:'Tradition '+id,period:'Modern',language:'English',
  ...extra};
}
test('language gate accepts English originals and only Hindi originals in Hindi',()=>{
 const e=engineContext();
 assert.equal(e.validWork(work('en','ESSAY')),true);
 assert.equal(e.validWork(work('hi','SHORT STORY',{sourceLanguage:'Hindi',displayLanguage:'Hindi',translationStatus:'original',hindiOriginal:true})),true);
 assert.equal(e.validWork(work('hi-bad','SHORT STORY',{sourceLanguage:'Hindi',displayLanguage:'English',translationStatus:'published-english-translation'})),false);
 assert.equal(e.validWork(work('bn-bad','SHORT STORY',{sourceLanguage:'Bengali',displayLanguage:'Bengali',translationStatus:'original'})),false);
 assert.equal(e.validWork(work('bn-no-credit','SHORT STORY',{sourceLanguage:'Bengali',displayLanguage:'English',translationStatus:'published-english-translation'})),false);
 assert.equal(e.validWork(work('bn-good','SHORT STORY',{sourceLanguage:'Bengali',displayLanguage:'English',translationStatus:'published-english-translation',translationCredit:'A named translator'})),true);
});
test('edition selector returns only verified distinct slot types',()=>{
 const e=engineContext();
 const catalogue=[work('e','ESSAY'),work('s','SHORT STORY'),work('a','ARTICLE'),work('bad','ARTICLE',{sourceLanguage:'German',displayLanguage:'English',translationStatus:'published-english-translation',translationCredit:'Unknown'})];
 const result=e.buildEdition(catalogue,[],{now:new Date('2026-11-24T12:00:00Z'),refreshCount:0});
 assert.deepEqual(Array.from(result.items,x=>x.type),['ESSAY','SHORT STORY','ARTICLE']);
 assert.equal(new Set(result.items.map(x=>x.id)).size,3);
 assert.equal(result.diagnostics.eligibleCount,3);
});
test('five-day queue has five unique complete editions',()=>{
 const context={window:{DailyReaderEngine:engineContext()},localStorage:{getItem(){return null},setItem(){}},AbortController,setTimeout,clearTimeout,fetch:async()=>({ok:true,json:async()=>({results:[]})})};
 vm.runInNewContext(discoverySource,context);
 const d=context.window.DailyReaderDiscovery;
 const pools={ESSAY:Array.from({length:5},(_,i)=>work('e'+i,'ESSAY')),
  'SHORT STORY':Array.from({length:5},(_,i)=>work('s'+i,'SHORT STORY')),
  ARTICLE:Array.from({length:5},(_,i)=>work('a'+i,'ARTICLE'))};
 const q=d.buildQueue(pools,5);
 assert.equal(q.length,5);
 assert.ok(q.every(day=>day.length===3&&new Set(day.map(x=>x.id)).size===3));
 assert.equal(new Set(q.flat().map(x=>x.id)).size,15);
});
test('live discovery excludes read and reserved entries and rejects unknown-language authors',async()=>{
 const staticWorks=[
  ...Array.from({length:5},(_,i)=>work('e'+i,'ESSAY')),
  ...Array.from({length:5},(_,i)=>work('s'+i,'SHORT STORY')),
  ...Array.from({length:5},(_,i)=>work('a'+i,'ARTICLE'))
 ];
 const engine=engineContext();
 const fetch=async url=>{
  if(url.includes('gutendex')){
   const story=url.includes('short')||url.includes('tales')||url.includes('fables');
   const book={id:999,title:story?'Short stories':'Essays',authors:[{name:story?'Munro, H. H.':'Bacon, Francis'}],
    subjects:[story?'Short stories':'Essays'],formats:{'text/plain; charset=utf-8':'https://example.org/text.txt'}};
   return {ok:true,json:async()=>({results:[book,{id:1000,title:'Translated tales',authors:[{name:'Unknown, Author'}],subjects:['Tales'],formats:{'text/plain':'https://example.org/translated.txt'} }]})};
  }
  return {ok:true,json:async()=>({results:[]})};
 };
 const context={window:{DailyReaderEngine:engine,DAILY_READER_STATIC:staticWorks,DAILY_READER_CATALOGUE:[]},
  localStorage:{getItem(){return null},setItem(){}},AbortController,setTimeout,clearTimeout,fetch};
 vm.runInNewContext(discoverySource,context);
 const d=context.window.DailyReaderDiscovery;
 const result=await d.discover([{id:'e0'}],[[staticWorks[5]]]);
 assert.ok(result.queue.length>0);
 const ids=result.queue.flat().map(x=>x.id);
 assert.ok(!ids.includes('e0'));
 assert.ok(!ids.includes('s0'));
 assert.ok(!ids.includes('pg-1000'));
 assert.equal(new Set(ids).size,ids.length);
});

test('reserve validator removes malformed and cross-day duplicate works',()=>{
 const engine=engineContext();
 const context={window:{DailyReaderEngine:engine},localStorage:{getItem(){return null},setItem(){}},AbortController,setTimeout,clearTimeout,fetch:async()=>({ok:true,json:async()=>({results:[]})})};
 vm.runInNewContext(discoverySource,context);
 const d=context.window.DailyReaderDiscovery;
 const first=[work('e1','ESSAY'),work('s1','SHORT STORY'),work('a1','ARTICLE')];
 const duplicate=[work('e1','ESSAY'),work('s2','SHORT STORY'),work('a2','ARTICLE')];
 const malformed=[work('e3','SHORT STORY'),work('s3','ESSAY'),work('a3','ARTICLE')];
 const clean=d.cleanQueue([first,duplicate,malformed]);
 assert.equal(clean.length,1);
 assert.deepEqual(Array.from(clean[0],x=>x.id),['e1','s1','a1']);
});

test('curated translations require an identifiable published translator',()=>{
 const e=engineContext(),window={};
 vm.runInNewContext(catalogueSource,{window});
 const items=window.DAILY_READER_CATALOGUE.map(w=>({...w,verified:true,sourceUrl:w.url}));
 const eligible=items.filter(w=>e.validWork(w));
 assert.ok(eligible.some(w=>w.id==='essay-tolstoy-art'));
 assert.ok(eligible.some(w=>w.id==='story-chekhov-misery'));
 assert.ok(eligible.some(w=>w.id==='story-akutagawa-spider-thread'));
 assert.ok(eligible.some(w=>w.id==='story-guleri-usne-kaha-tha'&&w.displayLanguage==='Hindi'&&w.hindiOriginal===true));
 assert.ok(!eligible.some(w=>w.id==='story-tagore-postmaster'));
});
