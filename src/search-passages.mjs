import {tokenize,parseQuery,matchRanges,escapeHtml} from './text.mjs';

// The positional index orders body paragraphs first, then independent footnotes
// (including nested notes). A missing token position separates each text unit.
export function* indexedUnits(version){
  let start=0;
  for(const kind of ['paragraphs','notes'])for(const [index,part] of version[kind].entries()){
    const words=tokenize(part.plain),end=start+words.length;
    yield {kind,index,part,words,start,end};
    start=end+1;
  }
}
export const unitShard=doc=>Math.floor(doc/128);

export function matchesTokens(tokens,groups){
  return groups.length>0&&groups.every(group=>group.phrase
    ?tokens.some((_,i)=>group.words.every((word,j)=>tokens[i+j]===word))
    :group.words.every(word=>tokens.includes(word)));
}

// Intersect component occurrences by source unit, never by document alone.
// ends contains the exclusive end position of every paragraph and note.
export function matchingUnits(groups,postings,doc,ends){
  if(!Array.isArray(ends))throw Error('Search paragraph boundaries could not be loaded.');
  const unitAt=position=>{
    let lo=0,hi=ends.length;
    while(lo<hi){const mid=(lo+hi)>>>1;if(ends[mid]<=position)lo=mid+1;else hi=mid;}
    return lo<ends.length?lo:-1;
  };
  const components=groups.flatMap(g=>g.phrase?[g.words]:g.words.map(word=>[word]));
  let shared;
  for(const words of components){
    const positions=words.map(word=>postings.get(word)?.get(doc)||[]);
    const following=positions.slice(1).map(list=>new Set(list)),units=new Set();
    for(const start of positions[0]){
      const unit=unitAt(start);
      if(unit<0||start+words.length>ends[unit])continue;
      if(following.every((list,i)=>list.has(start+i+1)))units.add(unit);
    }
    shared=shared===undefined?units:new Set([...shared].filter(unit=>units.has(unit)));
    if(!shared.size)return [];
  }
  return [...(shared||[])].sort((a,b)=>a-b);
}

export function matchingPassages(record,query,languages=['en','original']){
  const groups=parseQuery(query),matches=[];
  for(const language of languages)for(const unit of indexedUnits(record[language])){
    if(matchesTokens(unit.words,groups))matches.push({language,kind:unit.kind,index:unit.index,part:unit.part,
      id:unit.kind==='paragraphs'?`p-${language}-${unit.index+1}`:`note-${language}-${unit.part.number}`});
  }
  return matches;
}

// Cover every hit, merging overlapping context windows. No hit-count or length
// cap: the view reveals these excerpts in batches instead of discarding them.
export function passageExcerpts(text,query,context=65){
  const windows=[];
  for(const [a,b] of matchRanges(text,query)){
    let start=Math.max(0,a-context),end=Math.min(text.length,b+context);
    while(start>0&&/[\p{L}\p{N}\p{M}]/u.test(text[start-1]))start--;
    while(end<text.length&&/[\p{L}\p{N}\p{M}]/u.test(text[end]))end++;
    const last=windows.at(-1);
    if(last&&start<=last[1])last[1]=Math.max(last[1],end);else windows.push([start,end]);
  }
  return windows.map(([start,end])=>(start?'… ':'')+text.slice(start,end).trim()+(end<text.length?' …':''));
}

export function resultExcerpts(record,query,languages){
  return matchingPassages(record,query,languages).flatMap(({part,...match})=>
    passageExcerpts(part.plain,query).map(text=>({...match,text})));
}

export function excerptHtml(excerpt,query){
  const {language,kind,index,text}=excerpt;
  let html='',end=0;
  for(const [a,b] of matchRanges(text,query)){html+=escapeHtml(text.slice(end,a))+`<mark>${escapeHtml(text.slice(a,b))}</mark>`;end=b;}
  html+=escapeHtml(text.slice(end));
  return `<p class="result-passage"><span class="passage-label" dir="ltr">${language==='en'?'English':'Original'} · ${kind==='notes'?'Footnote':'Paragraph'} ${index+1}</span><span class="passage-text" dir="${language==='en'?'ltr':'rtl'}">${html}</span></p>`;
}
