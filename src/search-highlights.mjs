import {tokenize,matchRanges,escapeHtml} from './text.mjs';

// Presentation only: these standalone function words still participate in
// retrieval and exact phrases. Do not strip attached Arabic articles/prefixes.
const stopWords=new Set(tokenize(`
  a an the and or but of to in on at by for from with as is are was were be been
  being it its this that these those i we you he she they me us him her them
  my our your his their not no if then than so
  و یا در از به با برای بر تا را که این آن یک است هست بود باشد می
  ال في من على إلى عن مع إن أن هذا هذه ذلك تلك هو هي هم هن نحن أنت أنتم
  كان كانت يكون لا ما لم لن قد كل أم أو ثم
`));

export function searchHighlightRanges(text,query){
  const matches=matchRanges(text,query),ranges=[];
  let cursor=0;
  for(const token of text.matchAll(/[\p{L}\p{N}\p{M}]+/gu)){
    const start=token.index,end=start+token[0].length;
    while(cursor<matches.length&&matches[cursor][1]<=start)cursor++;
    if(!matches[cursor]||matches[cursor][0]>=end)continue;
    const words=tokenize(token[0]);
    if(words.some(word=>!stopWords.has(word)))ranges.push([start,end]);
  }
  return ranges;
}

export function searchHighlightHtml(text,query){
  let html='',end=0;
  for(const [a,b] of searchHighlightRanges(text,query)){
    html+=escapeHtml(text.slice(end,a))+`<mark>${escapeHtml(text.slice(a,b))}</mark>`;end=b;
  }
  return html+escapeHtml(text.slice(end));
}
