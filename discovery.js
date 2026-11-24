/* Live source adapters and a five-day offline reserve.
   Discovery metadata is never treated as editorial verification of a translation. */
(function(global){
'use strict';
const TYPES=['ESSAY','SHORT STORY','ARTICLE'],QUEUE_KEY='dailyReader.queue.v2',MAX_DAYS=5;
const norm=s=>String(s||'').normalize('NFKD').toLowerCase();
const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0};
function shuffle(items,seed){const a=items.slice();let x=seed>>>0;for(let i=a.length-1;i>0;i--){x=(Math.imul(x,1664525)+1013904223)>>>0;const j=x%(i+1);[a[i],a[j]]=[a[j],a[i]]}return a}
async function requestJSON(url){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{const r=await fetch(url,{headers:{Accept:'application/json'},signal:controller.signal});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json()}
 finally{clearTimeout(timer)}
}
const ENGLISH_AUTHOR_ALLOWLIST=[
 'francis bacon','bacon, francis','jane austen','austen, jane','charles lamb','lamb, charles',
 'william hazlitt','hazlitt, william','joseph addison','addison, joseph','richard steele','steele, richard',
 'charles dickens','dickens, charles','oscar wilde','wilde, oscar','edgar allan poe','poe, edgar allan',
 'mark twain','twain, mark','virginia woolf','woolf, virginia','h h munro','munro, h h',
 'saki','rudyard kipling','kipling, rudyard','g k chesterton','chesterton, g k','lewis carroll',
 'carroll, lewis','j m barrie','barrie, j m','jerome k jerome','jerome, jerome k',
 'thomas hardy','hardy, thomas','elizabeth gaskell','gaskell, elizabeth','george eliot','eliot, george',
 'r l stevenson','stevenson, robert louis','joseph conrad','conrad, joseph','e m forster',
 'forster, e m','bernard shaw','shaw, bernard','william makepeace thackeray','thackeray, william makepeace',
 'ralph waldo emerson','emerson, ralph waldo','henry david thoreau','thoreau, henry david','john ruskin','ruskin, john',
 'thomas babington macaulay','macaulay, thomas babington','washington irving','irving, washington','nathaniel hawthorne','hawthorne, nathaniel',
 'ambrose bierce','bierce, ambrose','kate chopin','chopin, kate','mary shelley','shelley, mary','herman melville','melville, herman',
 'walt whitman','whitman, walt','andrew lang','lang, andrew','oliver wendell holmes','holmes, oliver wendell','john galtworthy','galsworthy, john'
];
function authorKey(value){return norm(value).replace(/[^a-z0-9]+/g,' ').trim()}
function knownEnglishAuthor(authors){
 const names=(authors||[]).map(a=>authorKey(a.name));
 return names.some(n=>ENGLISH_AUTHOR_ALLOWLIST.some(a=>{const k=authorKey(a);return n===k||n.includes(k)||k.includes(n)&&n.length>5}));
}
function textFormat(formats){
 return formats?.['text/plain; charset=utf-8']||formats?.['text/plain; charset=us-ascii']||formats?.['text/plain; charset=iso-8859-1']||formats?.['text/plain']||null;
}
function classifyGutenberg(book,type){
 const meta=norm([book.title,...(book.subjects||[]),...(book.bookshelves||[])].join(' '));
 if(type==='ESSAY'&&!/(essay|essays|literary criticism|aesthetics)/.test(meta))return false;
 if(type==='SHORT STORY'&&!/(short stor|tales|fables|folklore|legends)/.test(meta))return false;
 return true;
}
function gutenbergWork(b,type){
 const authors=(b.authors||[]).map(a=>a.name).filter(Boolean);
 const author=authors.join('; ');
 const subjects=(b.subjects||[]).slice(0,8);
 return {
  id:'pg-'+b.id,type,title:b.title,author,year:'',minutes:type==='SHORT STORY'?12:15,
  summary:'Public-domain literary text discovered from the Project Gutenberg catalogue.',
  source:'Project Gutenberg · eBook '+b.id,origin:'English-language original by an author in the app’s verified English-language author list. Bibliographic details are available in the source record.',
  url:'https://www.gutenberg.org/ebooks/'+b.id,textUrl:textFormat(b.formats),externalOnly:false,
  sourceLanguage:'English',displayLanguage:'English',translationStatus:'original',language:'English',
  region:'Not yet classified',tradition:'English-language literature · editorial classification pending',
  period:'Publication period not verified',form:type==='ESSAY'?'Essay':'Short story',genres:subjects.slice(0,4),themes:subjects.slice(0,5),
  perspectives:[],editorialScore:3.4,verified:true,sourceUrl:'https://www.gutenberg.org/ebooks/'+b.id,eligible:true,
  rightsStatus:'Project Gutenberg edition; confirm applicable territorial terms.',bio:'',bioUrl:'https://www.gutenberg.org/ebooks/'+b.id
 };
}
async function gutenbergSearch(type,seen){
 const terms=type==='ESSAY'?['essays','literary criticism','aesthetics']:['short stories','tales','fables'];
 const pages=await Promise.allSettled(terms.map(term=>requestJSON('https://gutendex.com/books/?languages=en&search='+encodeURIComponent(term))));
 const map=new Map();
 const ingest=page=>{for(const b of page?.results||[]){
  const id='pg-'+b.id;
  if(seen.has(id)||map.has(id)||!knownEnglishAuthor(b.authors)||!textFormat(b.formats)||!classifyGutenberg(b,type))continue;
  map.set(id,gutenbergWork(b,type));
 }};
 for(const p of pages)if(p.status==='fulfilled')ingest(p.value);
 if(map.size<12){
  const next=pages.filter(p=>p.status==='fulfilled'&&p.value.next).map(p=>p.value.next);
  const more=await Promise.allSettled(next.map(url=>requestJSON(url)));
  for(const p of more)if(p.status==='fulfilled')ingest(p.value);
 }
 return shuffle([...map.values()],hash(type+Date.now()));
}
async function openAlexSearch(seen){
 const terms=['literature literary criticism essays','folklore oral tradition mythology','philosophy ethics cultural history'];
 const pages=await Promise.allSettled(terms.map(term=>requestJSON('https://api.openalex.org/works?search='+encodeURIComponent(term)+'&filter=type:article,open_access.is_oa:true,language:en&per-page=50&select=id,title,authorships,publication_year,language,open_access,primary_location,primary_topic,topics,abstract_inverted_index')));
 const map=new Map();
 for(const p of pages)if(p.status==='fulfilled')for(const w of p.value.results||[]){
  const id='oa-'+String(w.id||'').split('/').pop(),title=String(w.title||''),topic=norm([title,...(w.topics||[]).map(t=>t.display_name),w.primary_topic?.display_name,w.primary_topic?.subfield?.display_name].join(' '));
  if(!id||id==='oa-'||seen.has(id)||map.has(id)||w.language!=='en'||!w.open_access?.is_oa||!w.primary_location?.landing_page_url)continue;
  if(!/(literatur|literary|folklore|oral tradition|myth|philosoph|ethic|culture|anthropolog|language|humanit|religion|narrative|poetry|fiction|translation|history|art)/.test(topic))continue;
  const authors=(w.authorships||[]).slice(0,4).map(a=>a.author?.display_name).filter(Boolean);
  if(!authors.length)continue;
  map.set(id,{
   id,type:'ARTICLE',title,author:authors.join(', '),year:String(w.publication_year||'Year not recorded'),minutes:15,
   summary:'Open-access humanities article discovered from scholarly publication metadata.',
   source:w.primary_location.source?.display_name||'OpenAlex indexed source',
   origin:'Discovered live through OpenAlex. This record identifies an English-language open-access article; the source page provides the full text and licence details.',
   url:w.primary_location.landing_page_url,externalOnly:true,
   sourceLanguage:'English',displayLanguage:'English',translationStatus:'original',language:'English',
   region:'Not yet classified',tradition:'Contemporary humanities scholarship',period:String(w.publication_year||'Contemporary'),
   form:'Research article',genres:['humanities research'],themes:(w.topics||[]).slice(0,5).map(t=>t.display_name).filter(Boolean),
   perspectives:['researcher'],editorialScore:3.6,verified:true,sourceUrl:w.primary_location.landing_page_url,eligible:true,
   rightsStatus:'Open-access status is recorded by OpenAlex; check the source-specific licence before downloading or reproducing.',bio:'',bioUrl:w.primary_location.landing_page_url
  });
 }
 return shuffle([...map.values()],hash('openalex'+Date.now()));
}
function fingerprint(work){
 return norm(String(work?.title||'')+'|'+String(work?.author||'')).replace(/[^a-z0-9]+/g,' ').trim();
}
function seenIds(history,occupied){
 const ids=new Set(),fingerprints=new Set();
 for(const h of history||[]){
  const x=h.reading||h,id=h.id||x.id;
  if(id)ids.add(id);
  const fp=fingerprint(x);if(fp&&fp!=='|')fingerprints.add(fp);
 }
 for(const group of occupied||[])for(const w of group||[])if(w?.id){ids.add(w.id);const fp=fingerprint(w);if(fp)fingerprints.add(fp)}
 ids.fingerprints=fingerprints;
 return ids;
}
function uniquePool(items,seen,type){
 const map=new Map(),fingerprints=seen.fingerprints||new Set();
 for(const w of items||[]){
  if(!w||w.type!==type||!w.id||seen.has(w.id)||map.has(w.id))continue;
  if(!global.DailyReaderEngine?.validWork(w))continue;
  const fp=fingerprint(w);if(!fp||fingerprints.has(fp))continue;
  fingerprints.add(fp);map.set(w.id,w);
 }
 return [...map.values()];
}
function buildQueue(pools,limit=MAX_DAYS){
 const lists={};for(const t of TYPES)lists[t]=pools[t].slice();
 const queue=[];
 for(let day=0;day<limit;day++){
  if(TYPES.some(t=>!lists[t].length))break;
  const edition=TYPES.map(t=>lists[t].shift());
  if(new Set(edition.map(w=>w.id)).size===3)queue.push(edition);
 }
 return queue;
}
async function discover(history,occupied){
 const seen=seenIds(history,occupied);
 const results=await Promise.allSettled([
  gutenbergSearch('ESSAY',seen),gutenbergSearch('SHORT STORY',seen),openAlexSearch(seen)
 ]);
 const essays=results[0].status==='fulfilled'?results[0].value:[];
 const stories=results[1].status==='fulfilled'?results[1].value:[];
 const articles=results[2].status==='fulfilled'?results[2].value:[];
 const curated=[...(global.DAILY_READER_CATALOGUE||[]),...(global.DAILY_READER_STATIC||[])];
 const pools={
  ESSAY:uniquePool(essays.concat(curated),seen,'ESSAY'),
  'SHORT STORY':uniquePool(stories.concat(curated),seen,'SHORT STORY'),
  ARTICLE:uniquePool(articles.concat(curated),seen,'ARTICLE')
 };
 const queue=buildQueue(pools,MAX_DAYS);
 return {queue,diagnostics:{sources:{gutendex:results.slice(0,2).filter(x=>x.status==='fulfilled').length,openalex:results[2].status==='fulfilled'?1:0},candidateCounts:Object.fromEntries(TYPES.map(t=>[t,pools[t].length])),daysPrepared:queue.length,offlineTarget:MAX_DAYS,live:true}};
}
function validEdition(day){
 return Array.isArray(day)&&day.length===3&&day[0]?.type==='ESSAY'&&day[1]?.type==='SHORT STORY'&&day[2]?.type==='ARTICLE'&&new Set(day.map(w=>w?.id)).size===3&&day.every(w=>global.DailyReaderEngine?.validWork(w));
}
function cleanQueue(queue){
 const used=new Set(),out=[];
 for(const day of queue||[]){
  if(!validEdition(day)||day.some(w=>used.has(w.id)))continue;
  day.forEach(w=>used.add(w.id));out.push(day);
  if(out.length===MAX_DAYS)break;
 }
 return out;
}
function loadQueue(){try{return cleanQueue(JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]'))}catch(e){return []}}
function saveQueue(q){try{localStorage.setItem(QUEUE_KEY,JSON.stringify(cleanQueue(q)));return true}catch(e){return false}}
function openDb(){
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open('daily-reader-content-v2',1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('works'))req.result.createObjectStore('works',{keyPath:'id'})};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
}
async function getCachedText(id){
 let db;try{db=await openDb();return await new Promise((resolve,reject)=>{const r=db.transaction('works','readonly').objectStore('works').get(id);r.onsuccess=()=>resolve(r.result?.text||null);r.onerror=()=>reject(r.error)})}
 catch(e){return null}finally{db?.close()}
}
async function cacheText(work){
 if(!work?.id)return false;
 const isGutenberg=String(work.source||'').includes('Project Gutenberg')&&/gutenberg\.org\/ebooks\/(\d+)/.test(work.url||'');
 if(work.externalOnly&&!isGutenberg)return false;
 if(work.text)return true;
 if(!work.textUrl&&isGutenberg){
  const match=String(work.url).match(/ebooks\/(\d+)/);
  try{
   const metadata=await requestJSON('https://gutendex.com/books/'+match[1]);
   work.textUrl=textFormat(metadata.formats);
   if(work.textUrl)work.externalOnly=false;
  }catch(e){return false}
 }
 if(!work.textUrl)return false;
 const cached=await getCachedText(work.id);if(cached){work.text=cached;work.externalOnly=false;return true}
 let db;
 try{
  db=await openDb();
  const response=await fetch(work.textUrl);if(!response.ok)throw new Error('Text source returned '+response.status);
  const raw=await response.text();
  const clean=raw.replace(/^[\s\S]*?\*{3}\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[\s\S]*?\*{3}\s*/i,'').replace(/\*{3}\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[\s\S]*$/i,'').trim();
  if(clean.length<500)throw new Error('Text source did not return a complete readable work');
  await new Promise((resolve,reject)=>{const tx=db.transaction('works','readwrite');tx.objectStore('works').put({id:work.id,text:clean,savedAt:Date.now(),sourceUrl:work.url});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
  work.text=clean;work.externalOnly=false;return true;
 }catch(e){work.externalOnly=true;work.cacheError=String(e);return false}
 finally{db?.close()}
}
global.DailyReaderDiscovery={discover,loadQueue,saveQueue,cacheText,getCachedText,seenIds,buildQueue,cleanQueue};
})(window);
