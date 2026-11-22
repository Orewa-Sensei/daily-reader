/* Live discovery + five-day reserve for The Daily Reader.
   Sources: Gutendex (Project Gutenberg metadata) and OpenAlex (open-access research).
   Only source metadata is generated here; no text is fabricated. */
(function(global){
'use strict';
const TYPES=['ESSAY','SHORT STORY','ARTICLE'];
const STORE='dailyReader.queue.v1';
const DAY=86400000;
const getSeen=history=>new Set((history||[]).map(h=>h.id||h.reading?.id).filter(Boolean));
const norm=s=>String(s||'').toLowerCase();
const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0};
const pick=(a,n,seed)=>{const out=a.slice(),r=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};for(let i=out.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out.slice(0,n)};
async function json(url){const r=await fetch(url,{headers:{Accept:'application/json'}});if(!r.ok)throw new Error('Source returned '+r.status);return r.json()}
function gutendexItem(b,type){
 const id='pg-'+b.id,author=(b.authors||[]).map(a=>a.name).filter(Boolean).join('; ')||'Author not recorded';
 const lang=(b.languages||[]).includes('hi')?'Hindi':'English';
 const subjects=(b.subjects||[]).slice(0,8);
 const textUrl=b.formats?.['text/plain; charset=utf-8']||b.formats?.['text/plain; charset=us-ascii']||b.formats?.['text/plain'];
 return {id,type,title:b.title,author,year:'Public-domain edition',minutes:type==='SHORT STORY'?12:15,
 summary:subjects.slice(0,3).join(' · ')||'A literary work selected from the Project Gutenberg catalogue.',
 source:'Project Gutenberg · eBook '+b.id,origin:'Catalogue metadata retrieved live from Project Gutenberg via Gutendex. Verify the edition record for publication and translation details.',
 url:'https://www.gutenberg.org/ebooks/'+b.id,textUrl:textUrl||null,externalOnly:!textUrl,
 sourceLanguage:lang,displayLanguage:lang,translationStatus:'original',hindiOriginal:lang==='Hindi',
 language:lang,region:'Unclassified · catalogue metadata only',tradition:'Unclassified · editorial classification pending',
 period:'Publication period not yet verified',form:type==='SHORT STORY'?'Short story':'Essay / literary nonfiction',
 genres:subjects.slice(0,4),themes:subjects.slice(0,5),perspectives:[],editorialScore:3.5,
 verified:true,sourceUrl:'https://www.gutenberg.org/ebooks/'+b.id,eligible:true,
 rightsStatus:'Project Gutenberg catalogue entry. Check territorial terms before reuse.',
 bio:'',bioUrl:'https://www.gutenberg.org/ebooks/'+b.id};
}
async function gutendex(type,seen){
 const terms=type==='ESSAY'?['essay','philosophy','literature']:['short stories','tales','folklore'];
 const lang='en';
 const results=await Promise.all(terms.map(t=>json('https://gutendex.com/books/?search='+encodeURIComponent(t)+'&languages='+lang)));
 const merged=new Map();
 results.forEach(x=>(x.results||[]).forEach(b=>{if(!merged.has(b.id)&&!seen.has('pg-'+b.id))merged.set(b.id,b)}));
 const arr=[...merged.values()].filter(b=>(b.formats||{})['text/plain; charset=utf-8']||(b.formats||{})['text/plain; charset=us-ascii']||(b.formats||{})['text/plain']);
 return pick(arr,24,hash(type+Date.now())).map(b=>gutendexItem(b,type));
}
async function hindiWorks(type,seen){
 if(type!=='SHORT STORY')return [];
 const d=await json('https://gutendex.com/books/?languages=hi&search='+encodeURIComponent('stories'));
 return (d.results||[]).filter(b=>!seen.has('pg-'+b.id)).slice(0,12).map(b=>gutendexItem(b,type));
}
async function openAccessArticles(seen){
 const queries=['literary criticism literature essay','folklore oral tradition cultural history','philosophy humanities culture'];
 const all=await Promise.all(queries.map(q=>json('https://api.openalex.org/works?search='+encodeURIComponent(q)+'&filter=type:article,open_access.is_oa:true&per-page=50&mailto=dailyreader@example.com')));
 const map=new Map();
 all.forEach(d=>(d.results||[]).forEach(w=>{
  const id='oa-'+w.id.split('/').pop();
  if(seen.has(id)||map.has(id)||!w.title||!w.primary_location?.landing_page_url)return;
  const authors=(w.authorships||[]).slice(0,3).map(a=>a.author?.display_name).filter(Boolean).join(', ');
  map.set(id,{id,type:'ARTICLE',title:w.title,author:authors||'Author not recorded',
   year:String(w.publication_year||'Publication year unavailable'),minutes:15,
   summary:(w.biblio?.volume?'Published in volume '+w.biblio.volume+'. ':'')+'Open-access scholarly article discovered through OpenAlex.',
   source:w.primary_location.source?.display_name||'OpenAlex · open-access record',
   origin:'Discovered live through OpenAlex. Follow the source link for the publisher or repository version.',
   url:w.primary_location.landing_page_url,externalOnly:true,
   sourceLanguage:'English',displayLanguage:'English',translationStatus:'original',
   language:'English',region:'International · scholarly publication',tradition:'Contemporary academic writing',
   period:String(w.publication_year||'Contemporary'),form:'Research article',genres:['research','humanities'],themes:(w.concepts||[]).slice(0,5).map(c=>c.display_name),
   perspectives:['researcher'],editorialScore:3.7,verified:true,sourceUrl:w.primary_location.landing_page_url,eligible:true,
   rightsStatus:'Open-access record; full-text licence must be checked at the source.',
   bio:'',bioUrl:w.primary_location.landing_page_url});
 }));
 return pick([...map.values()],30,hash('articles'+Date.now()));
}
function loadQueue(){try{return JSON.parse(localStorage.getItem(STORE)||'[]')}catch(e){return []}}
function saveQueue(q){try{localStorage.setItem(STORE,JSON.stringify(q.slice(0,5)))}catch(e){}}
async function discover(history,alreadyQueued){
 const seen=getSeen(history);(alreadyQueued||[]).forEach(x=>x.forEach(w=>seen.add(w.id)));
 const settled=await Promise.allSettled([
  gutendex('ESSAY',seen),
  gutendex('SHORT STORY',seen),
  hindiWorks('SHORT STORY',seen),
  openAccessArticles(seen)
 ]);
 const essays=settled[0].status==='fulfilled'?settled[0].value:[];
 const stories=(settled[1].status==='fulfilled'?settled[1].value:[]).concat(settled[2].status==='fulfilled'?settled[2].value:[]);
 const articles=settled[3].status==='fulfilled'?settled[3].value:[];
 const curated=(global.DAILY_READER_CATALOGUE||[]).filter(w=>w&&w.verified===true&&!seen.has(w.id));
 const pool={
  ESSAY:essays.concat(curated.filter(w=>w.type==='ESSAY')),
  'SHORT STORY':stories.concat(curated.filter(w=>w.type==='SHORT STORY')),
  ARTICLE:articles.concat(curated.filter(w=>w.type==='ARTICLE'))
 };
 const count=Math.min(5,...TYPES.map(t=>pool[t].length));
 const queue=[];
 for(let day=0;day<count;day++){
  const edition=[];
  for(const t of TYPES){
   const choices=pool[t].filter(w=>!edition.some(e=>e.id===w.id));
   const candidate=choices[day]||choices[0];
   if(candidate){edition.push(candidate);pool[t]=pool[t].filter(w=>w.id!==candidate.id)}
  }
  if(edition.length===3)queue.push(edition);
 }
 const diagnostics={source:'Gutendex + OpenAlex',essays:essays.length,stories:stories.length,articles:articles.length,daysPrepared:queue.length,live:true};
 return {queue,diagnostics};
}
global.DailyReaderDiscovery={discover,loadQueue,saveQueue};
})(window);
