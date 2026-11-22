/* The Daily Reader — diversity-aware edition selector.
   The selector ranks complete 3-work editions, not isolated cards.
   It deliberately contains no difficulty/level model. */
(function(global){
  'use strict';
  const TYPES=['ESSAY','SHORT STORY','ARTICLE'];
  const DAY_MS=86400000;
  function hash(value){let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
  function rng(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}}
  function list(v){return Array.isArray(v)?v.filter(Boolean):v?[v]:[]}
  function overlap(a,b){const A=new Set(list(a));return list(b).filter(x=>A.has(x)).length}
  function recentCounts(history,field,days,now){
    const counts={};for(const h of history||[]){const at=new Date(h.lastReadAt||h.readAt||0).getTime();if(!at||now-at>days*DAY_MS)continue;const x=h.reading||h;for(const v of list(x[field]))counts[v]=(counts[v]||0)+1}return counts;
  }
  function normalise(work){
    return {...work,language:work.language||'unknown',region:work.region||'unclassified',tradition:work.tradition||'unclassified',period:work.period||'unclassified',form:work.form||work.type,genres:list(work.genres),themes:list(work.themes),perspectives:list(work.perspectives),authorKey:(work.author||'').toLowerCase().trim()};
  }
  function scoreCandidate(work,selected,history,opts){
    const w=normalise(work), now=opts.now, used=selected.map(normalise);
    const c=opts.counts;
    let score=0;
    // Novelty: reward authors, languages and traditions not recently encountered.
    score+=Math.max(0,4-(c.authors[w.authorKey]||0)*2.1);
    score+=Math.max(0,5-(c.languages[w.language]||0)*2.2);
    score+=Math.max(0,5-(c.regions[w.region]||0)*1.8);
    score+=Math.max(0,5-(c.traditions[w.tradition]||0)*1.8);
    score+=Math.max(0,3-(c.periods[w.period]||0)*1.0);
    // Within-edition complementarity: prefer a different literary world across the three slots.
    for(const other of used){
      score+=w.language!==other.language?3.0: -1.5;
      score+=w.region!==other.region?2.5: -1.2;
      score+=w.tradition!==other.tradition?2.0: -1.0;
      score+=w.period!==other.period?1.0: -0.35;
      score+=overlap(w.themes,other.themes)===0?0.8:0;
      score-=overlap(w.authorKey,other.authorKey)*8;
    }
    // Small editorial quality signal; never a substitute for source verification.
    score+=Math.max(0,Math.min(5,Number(w.editorialScore)||3))*0.55;
    // Avoid repeatedly showing a just-seen item.
    score-=Math.max(0,14-(c.works[w.id]||0)*0+ (c.works[w.id]?14:0));
    return score;
  }
  function buildEdition(catalogue,history,options){
    const opts=options||{},now=opts.now||new Date(),key=now.getFullYear()+'-'+(now.getMonth()+1)+'-'+now.getDate();
    const refresh=opts.refreshCount||0,seed=hash(key+'|'+refresh+'|daily-reader-editorial');
    const random=rng(seed),counts={
      authors:recentCounts(history,'authorKey',90,now),
      languages:recentCounts(history,'language',45,now),
      regions:recentCounts(history,'region',45,now),
      traditions:recentCounts(history,'tradition',60,now),
      periods:recentCounts(history,'period',45,now),
      works:recentCounts(history,'id',30,now)
    };
    const candidates=catalogue.filter(x=>x&&x.id&&x.verified===true&&x.sourceUrl&&x.author&&TYPES.includes(x.type)&&x.eligible!==false);
    const edition=[];
    for(const type of TYPES){
      const pool=candidates.filter(x=>x.type===type&&!edition.some(y=>y.id===x.id));
      if(!pool.length)continue;
      const ranked=pool.map(work=>({work,score:scoreCandidate(work,edition,history,{now,counts})+(random()-0.5)*2.2}));
      ranked.sort((a,b)=>b.score-a.score);
      const shortlist=ranked.slice(0,Math.min(8,ranked.length));
      const pick=shortlist[Math.floor(random()*shortlist.length)]||ranked[0];
      if(pick)edition.push(pick.work);
    }
    return {dateKey:key,items:edition,diagnostics:{eligibleCount:candidates.length,byType:Object.fromEntries(TYPES.map(t=>[t,candidates.filter(x=>x.type===t).length])),selection:'verified-catalogue / recent-history novelty / within-edition diversity / seeded serendipity'}};
  }
  global.DailyReaderEngine={buildEdition,normalise};
})(window);
