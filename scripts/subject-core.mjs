import {createHash} from 'node:crypto';
import {normalize} from '../src/text.mjs';
export const digest=value=>createHash('sha256').update(value).digest('hex');
export function decodeHtml(s){return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(whole,key)=>{if(key[0]==='#'){const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):whole;}return ({nbsp:' ',amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",lsquo:'‘',rsquo:'’',ldquo:'“',rdquo:'”',ndash:'–',mdash:'—',hellip:'…',aacute:'á',iacute:'í',uacute:'ú',eacute:'é',oacute:'ó'})[key.toLowerCase()]??whole;});}
export const htmlText=s=>decodeHtml(s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,''));
export function selectionBlocks(html){
  // Keep the complete response as provenance; block-level boundaries, never sentences.
  return html.replace(/<br\s*\/?\s*>/gi,'\n').split(/<\/?(?:div|p|blockquote|h[1-6])\b[^>]*>/gi).flatMap((raw,index)=>{
    const block={raw,position:index+1,text:htmlText(raw).trim()};
    const anchors=[...raw.matchAll(/<a\b[^>]*href\s*=\s*["']https?:\/\/bahai-library\.com\/inventory\/[^"']+["'][^>]*>[\s\S]*?<\/a>/gi)];
    // Two observed blocks concatenate complete, separately cited excerpts without
    // a DIV boundary. Split only when substantial prose precedes every citation.
    let start=0;const pieces=anchors.map((a,i)=>{const end=i===anchors.length-1?raw.length:a.index+a[0].length;const piece=raw.slice(start,end),prose=htmlText(raw.slice(start,a.index));start=end;return {piece,prose};});
    if(anchors.length>1&&pieces.every(p=>tokens(p.prose).length>=5))return pieces.map((p,i)=>({raw:p.piece,text:htmlText(p.piece).trim(),position:index+1,segment:i+1,parentRaw:raw}));
    return [block];
  }).filter(b=>b.text);
}
export function parseSelection(block){
  const linkedIds=[...block.raw.matchAll(/https?:\/\/bahai-library\.com\/inventory\/([^\s"'<>?#]+)/gi)].map(m=>{try{return decodeURIComponent(m[1]);}catch{return m[1];}});
  const ids=[...new Set(linkedIds.length?linkedIds:[...block.text.matchAll(/\b(?:AB|BH|BB)[A-Z]?\d{4,5}(?:[a-z]|\s*\(\d+\))?\b/gi)].map(m=>m[0]))];
  const notice=/^=+$/.test(block.text)||/^The AI-selected and/i.test(block.text);
  // A terminal inventory link and its following citation are not excerpt wording.
  const anchor=/<a\b[^>]*href\s*=\s*["']https?:\/\/(?:bahai-library\.com\/inventory\/|reference\.bahai\.org\/|www\.bahai\.org\/)[^"']+["'][^>]*>/i.exec(block.raw);
  let excerpt=anchor?htmlText(block.raw.slice(0,anchor.index)).trim():block.text;
  if(!anchor&&ids.length===1)excerpt=excerpt.replace(new RegExp('\\s*'+ids[0].replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*$','i'),'').trim();
  return {...block,excerpt,suppliedIds:ids,kind:notice?'notice':'selection'};
}
export function tokens(text){return [...text.matchAll(/[\p{L}\p{N}\p{M}]+/gu)].map(m=>({word:normalize(m[0]),start:m.index,end:m.index+m[0].length}));}
export function prepareSource(id,version,paragraphs){
  const starts=[];let text='';for(const p of paragraphs){starts.push(text.length);text+=p.plain+'\n\n';}
  return {id,version,paragraphs,starts,text};
}
export function mappedTokens(text){const spans=tokens(text);let normalized='',offsets=[];for(const t of spans){if(normalized)normalized+=' ';offsets.push(normalized.length);normalized+=t.word;}return {spans,offsets,normalized};}
export function locateRanges(source,start,end){return source.paragraphs.flatMap((p,i)=>{const a=Math.max(0,start-source.starts[i]),b=Math.min(p.plain.length,end-source.starts[i]);return b>a?[{paragraph:i+1,paragraphId:`${source.id}@${source.version}:en:${i+1}`,start:a,end:b,text:p.plain.slice(a,b)}]:[];});}
export function validateConfirmedMatch(candidate,sources){
  if(!candidate||!sources.has(candidate.source))throw Error('Invalid confirmed source');
  const source=sources.get(candidate.source);
  if(candidate.version!==source.version)throw Error('Stale source version in confirmed mapping');
  if(!Array.isArray(candidate.ranges)||!candidate.ranges.length)throw Error('Empty confirmed ranges');
  const ranges=candidate.ranges.map(r=>{const p=source.paragraphs[r.paragraph-1];if(!Number.isInteger(r.paragraph)||!p||!Number.isInteger(r.start)||!Number.isInteger(r.end)||r.start<0||r.end<=r.start||r.end>p.plain.length||r.text!==p.plain.slice(r.start,r.end))throw Error('Invalid confirmed range');return {...r,paragraphId:`${source.id}@${source.version}:en:${r.paragraph}`};});
  return {...candidate,ranges};
}
function occurrences(text,needle){const hits=[];if(!needle)return hits;let i=0;while((i=text.indexOf(needle,i))>=0){hits.push(i);i++;}return hits;}
export class Matcher {
  constructor(sources){this.sources=new Map(sources.map(s=>[s.id,s]));this.postings=new Map();this.cache=new Map();for(const s of sources){for(const w of new Set(tokens(s.text).map(t=>t.word))){if(!this.postings.has(w))this.postings.set(w,[]);this.postings.get(w).push(s.id);}}}
  mapped(source){if(this.cache.has(source.id)){const m=this.cache.get(source.id);this.cache.delete(source.id);this.cache.set(source.id,m);return m;}const m=mappedTokens(source.text);m.sourceLength=source.text.length;this.cache.set(source.id,m);if(this.cache.size>100){const evict=[...this.cache].find(([,value])=>value.sourceLength<20000);if(evict)this.cache.delete(evict[0]);}return m;}
  match(selection){
    const query=selection.excerpt,words=tokens(query).map(t=>t.word),needle=words.join(' '),supplied=selection.suppliedIds||[];
    if(!words.length)return {status:'unmatched',candidates:[],reason:'No excerpt words'};
    const rare=[...new Set(words)].map(w=>[w,this.postings.get(w)||[]]).sort((a,b)=>a[1].length-b[1].length);
    let ids=supplied.length?supplied.filter(id=>this.sources.has(id)):rare[0][1].filter(id=>rare.slice(1,3).every(([,list])=>list.includes(id)));
    let candidates=[];
    for(const id of ids){const source=this.sources.get(id),m=this.mapped(source);for(const pos of occurrences(m.normalized,needle)){
      if((pos>0&&m.normalized[pos-1]!==' ')||(pos+needle.length<m.normalized.length&&m.normalized[pos+needle.length]!==' '))continue;
      let low=0,high=m.offsets.length-1;while(low<high){const mid=(low+high)>>1;if(m.offsets[mid]<pos)low=mid+1;else high=mid;}
      let start=m.spans[low].start,end=m.spans[low+words.length-1].end;
      const querySpans=tokens(query),rawStart=start-querySpans[0].start,rawEnd=end+query.length-querySpans.at(-1).end;
      const exact=rawStart>=0&&source.text.slice(rawStart,rawEnd)===query;
      if(exact){start=rawStart;end=rawEnd;}
      candidates.push({source:id,version:source.version,ranges:locateRanges(source,start,end),method:exact?'exact':'normalized',score:1,evidence:`${words.length} consecutive normalized words`});
    }}
    if(candidates.length)return {status:candidates.length===1&&words.length>=5?candidates[0].method:'ambiguous',candidates,reason:words.length<5?'Short excerpt requires confirmation':candidates.length>1?'Repeated wording has multiple locations':undefined};
    // Approximate locations are proposals only. Rare-word source retrieval is bounded
    // and the bound is reported, never represented as exhaustive identification.
    let candidateSourcesTruncated=false;
    if(!supplied.length){const scores=new Map();for(const [,list] of rare.filter(([,l])=>l.length).slice(0,8))for(const id of list)scores.set(id,(scores.get(id)||0)+1);const ranked=[...scores].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));candidateSourcesTruncated=ranked.length>12;ids=ranked.slice(0,12).map(x=>x[0]);}
    const fragments=query.split(/\.{3,}|…|\[\s*(?:\.\s*){3}\]/).map(s=>tokens(s).map(t=>t.word).join(' ')).filter(Boolean);
    for(const id of ids){const source=this.sources.get(id),m=this.mapped(source);
      if(fragments.length>1){let cursor=0,segments=[];for(const f of fragments){const pos=m.normalized.indexOf(f,cursor);if(pos<0){segments=[];break;}const first=m.offsets.indexOf(pos),count=f.split(' ').length;if(first<0){segments=[];break;}segments.push(...locateRanges(source,m.spans[first].start,m.spans[first+count-1].end));cursor=pos+f.length;}if(segments.length)candidates.push({source:id,version:source.version,ranges:segments,method:'approximate',score:1,evidence:'Ordered exact fragments separated by omission marks; gaps require review'});}
      const sought=new Set(words),ranked=[];
      m.paragraphTokens??=source.paragraphs.map(p=>tokens(p.plain));
      m.paragraphTokens.forEach((ps,i)=>{const width=Math.max(12,Math.ceil(words.length*1.6)),counts=new Map();let best,matched=0;
        const adjust=(word,delta)=>{if(!sought.has(word))return;matched+=delta;const n=(counts.get(word)||0)+delta;if(n)counts.set(word,n);else counts.delete(word);};
        for(let end=0;end<ps.length;end++){adjust(ps[end].word,1);if(end>=width)adjust(ps[end-width].word,-1);const score=counts.size/sought.size;if(score>=.55&&matched>=4&&(!best||score>best.score))best={i,score,first:Math.max(0,end-width+1),last:end};}
        if(best){while(!sought.has(ps[best.first].word))best.first++;while(!sought.has(ps[best.last].word))best.last--;ranked.push({i,score:best.score,start:ps[best.first].start,end:ps[best.last].end});}});
      for(const hit of ranked.sort((a,b)=>b.score-a.score).slice(0,3))candidates.push({source:id,version:source.version,ranges:locateRanges(source,source.starts[hit.i]+hit.start,source.starts[hit.i]+hit.end),method:'approximate',score:Number(hit.score.toFixed(4)),evidence:'Distinct excerpt-word coverage within one paragraph; proposed range needs editorial correction'});
    }
    candidates.sort((a,b)=>b.score-a.score||a.source.localeCompare(b.source));
    return {status:candidates.length?'approximate':'unmatched',candidates:candidates.slice(0,8),candidateSourcesTruncated,candidateLocationsTruncated:candidates.length>8,reason:supplied.some(id=>!this.sources.has(id))?'Supplied source ID unavailable':undefined};
  }
}
export function hierarchyEdges(html,subjects){
  const known=new Set(subjects.map(s=>s.id)),stack=[],nodes=[],edges=[];let current;
  for(const m of html.matchAll(/<li\b[^>]*\bid="([^"]+)"[^>]*>|<\/li>|<a\b[^>]*>([\s\S]*?)<\/a>/gi)){
    if(m[1]){current={id:m[1],parent:stack.at(-1)?.id};nodes.push(current);stack.push(current);}
    else if(m[0].toLowerCase()==='</li>'){stack.pop();current=stack.at(-1);}
    else if(current){current.name=htmlText(m[2].replace(/<span\b[^>]*>[\s\S]*?<\/span>/gi,'')).trim();if(known.has(current.id)&&known.has(current.parent))edges.push({source:current.id,target:current.parent,type:'broader',status:'imported',provenance:'Loom outline'});}
  }
  for(const n of nodes){const match=/^\[see also (.+)\]$/i.exec(n.name||'');if(!match||!known.has(n.parent))continue;const targets=nodes.filter(t=>t.name?.toLowerCase()===match[1].toLowerCase()&&known.has(t.id));if(targets.length===1)edges.push({source:n.parent,target:targets[0].id,type:'related',status:'imported',provenance:'Loom see also'});}
  return {edges,nodes};
}
