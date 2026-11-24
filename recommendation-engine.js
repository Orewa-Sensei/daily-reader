/* The Daily Reader — strict language gate and diversity-aware edition scoring. */
(function(global){
'use strict';
const TYPES=['ESSAY','SHORT STORY','ARTICLE'],DAY=86400000;
function hash(v){let h=2166136261;for(let i=0;i<v.length;i++){h^=v.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function rng(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}}
function list(v){return Array.isArray(v)?v.filter(Boolean):v?[v]:[]}
function overlap(a,b){const A=new Set(list(a));return list(b).filter(x=>A.has(x)).length}
function validLanguage(w){
 const original=String(w.sourceLanguage||'').trim().toLowerCase();
 const shown=String(w.displayLanguage||'').trim().toLowerCase();
 if(original==='hindi')return shown==='hindi'&&w.hindiOriginal===true;
 if(original==='english')return shown==='english'&&w.translationStatus==='original';
 if(!original||shown!=='english'||w.translationStatus!=='published-english-translation')return false;
 const credit=String(w.translationCredit||'').trim().toLowerCase();
 return !!credit&&credit.length>2&&!/(unknown|unidentified|not identified|various writers|not recorded|pending|tbc)/.test(credit);
}
function validWork(w){
 return !!(w&&w.id&&TYPES.includes(w.type)&&w.verified===true&&w.sourceUrl&&/^https?:\/\//i.test(w.sourceUrl)&&w.title&&w.author&&w.eligible!==false&&validLanguage(w));
}
function normalise(w){return {...w,language:w.language||w.displayLanguage||'unknown',region:w.region||'unclassified',tradition:w.tradition||'unclassified',period:w.period||'unclassified',genres:list(w.genres),themes:list(w.themes),perspectives:list(w.perspectives),authorKey:String(w.author||'').toLowerCase().trim()}}
function recentCounts(history,field,days,now){
 const counts={};for(const h of history||[]){const at=new Date(h.lastReadAt||h.readAt||h.seenAt||0).getTime();if(!at||now-at>days*DAY)continue;const x=h.reading||h;const values=field==='authorKey'?[String(x.author||'').toLowerCase().trim()]:list(x[field]);for(const v of values)if(v)counts[v]=(counts[v]||0)+1}return counts;
}
function score(w,selected,counts){
 const x=normalise(w);let s=0;
 s+=Math.max(0,4-(counts.authors[x.authorKey]||0)*2.1);
 s+=Math.max(0,5-(counts.languages[x.language]||0)*2.2);
 s+=Math.max(0,5-(counts.regions[x.region]||0)*1.8);
 s+=Math.max(0,5-(counts.traditions[x.tradition]||0)*1.8);
 s+=Math.max(0,3-(counts.periods[x.period]||0));
 for(const other of selected.map(normalise)){
  s+=x.language!==other.language?3:-1.5;
  s+=x.region!==other.region?2.5:-1.2;
  s+=x.tradition!==other.tradition?2:-1;
  s+=x.period!==other.period?1:-.35;
  if(!overlap(x.themes,other.themes))s+=.8;
  if(x.authorKey===other.authorKey)s-=8;
 }
 s+=Math.max(0,Math.min(5,Number(x.editorialScore)||3))*.55;
 if(counts.works[x.id])s-=30;
 return s;
}
function buildEdition(catalogue,history,options){
 const opts=options||{},now=opts.now||new Date(),key=now.getFullYear()+'-'+(now.getMonth()+1)+'-'+now.getDate();
 const random=rng(hash(key+'|'+(opts.refreshCount||0)+'|daily-reader'));
 const counts={authors:recentCounts(history,'authorKey',90,now),languages:recentCounts(history,'language',45,now),regions:recentCounts(history,'region',45,now),traditions:recentCounts(history,'tradition',60,now),periods:recentCounts(history,'period',45,now),works:recentCounts(history,'id',3650,now)};
 const candidates=(catalogue||[]).filter(validWork);
 const items=[];
 for(const type of TYPES){
  const pool=candidates.filter(w=>w.type===type&&!items.some(x=>x.id===w.id));
  const ranked=pool.map(w=>({w,s:score(w,items,counts)+(random()-.5)*2.2})).sort((a,b)=>b.s-a.s);
  const shortlist=ranked.slice(0,Math.min(8,ranked.length));
  const chosen=shortlist[Math.floor(random()*shortlist.length)];
  if(chosen)items.push(chosen.w);
 }
 return {dateKey:key,items,diagnostics:{eligibleCount:candidates.length,byType:Object.fromEntries(TYPES.map(t=>[t,candidates.filter(w=>w.type===t).length])),selection:'verified source + strict translation credit + history novelty + edition diversity'}};
}
global.DailyReaderEngine={buildEdition,normalise,validWork,validLanguage};
})(window);
