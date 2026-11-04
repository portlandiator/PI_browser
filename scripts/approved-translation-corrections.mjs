// Publishing a catalog correction also approves carrying that correction into
// existing quotations. Keep their identities and review status; renew the exact
// source text, UTF-16 offsets and version together. Imported extracts stay intact.
import {parseText} from '../src/text.mjs';
import {decode} from './item-store.mjs';
import {digest,prepareSource,locateRanges,validateConfirmedMatch,Matcher} from './subject-core.mjs';
import {revalidateItemQuotes} from './revalidate-item-quotes.mjs';
import {gunzipSync} from 'node:zlib';
import {recordFilename} from '../src/record-file.mjs';
import {siteFiles} from './catalog-deletion.mjs';
import {textSha,formatSentenceParagraphs,compactSentenceParagraphs} from './sentence-paragraphs.mjs';

// Ordered unchanged paragraphs anchor the textual edit.
// Frequent paragraphs are excluded as anchors for long texts (as in SequenceMatcher),
// but included when extending a run. Memory is bounded by the token arrays.
function matchingBlocks(a,b){
  const positions=new Map();
  b.forEach((word,i)=>{if(!positions.has(word))positions.set(word,[]);positions.get(word).push(i);});
  if(b.length>=200)for(const [word,at] of positions)if(at.length>Math.floor(b.length/100)+1)positions.delete(word);
  const queue=[[0,a.length,0,b.length]],blocks=[];
  while(queue.length){
    const [a0,a1,b0,b1]=queue.pop();let ai=a0,bi=b0,size=0,previous=new Map();
    for(let i=a0;i<a1;i++){
      const next=new Map();
      for(const j of positions.get(a[i])||[]){
        if(j<b0)continue;if(j>=b1)break;
        const n=(previous.get(j-1)||0)+1;next.set(j,n);
        if(n>size){ai=i-n+1;bi=j-n+1;size=n;}
      }
      previous=next;
    }
    while(ai>a0&&bi>b0&&a[ai-1]===b[bi-1]){ai--;bi--;size++;}
    while(ai+size<a1&&bi+size<b1&&a[ai+size]===b[bi+size])size++;
    if(!size)continue;
    blocks.push([ai,bi,size]);
    if(a0<ai&&b0<bi)queue.push([a0,ai,b0,bi]);
    if(ai+size<a1&&bi+size<b1)queue.push([ai+size,a1,bi+size,b1]);
  }
  return blocks.sort((x,y)=>x[0]-y[0]);
}

// Align edited paragraph blocks before choosing corrected context. Unchanged
// paragraphs are hard anchors; ordered word overlap resolves intervening edits
// and paragraph splits/joins. This prevents repeated words in a later paragraph
// from pulling a quotation out of its original context.
function paragraphEdits(old,next){
  const a=old.paragraphs.map(p=>p.plain),b=next.paragraphs.map(p=>p.plain),groups=[];
  const words=text=>text.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu)||[];
  const gap=(a0,a1,b0,b1)=>{
    const n=a1-a0,m=b1-b0;if(!n||!m)return;
    if(n===1||m===1){groups.push([a0,a1,b0,b1]);return;}
    const aa=a.slice(a0,a1).map(words),bb=b.slice(b0,b1).map(words);
    const counts=items=>{const map=new Map();for(const word of items)map.set(word,(map.get(word)||0)+1);return map;};
    const width=m+1,score=new Float64Array((n+1)*width).fill(-Infinity),steps=new Uint8Array(score.length);score[0]=0;
    const update=(i,j,value,step)=>{const at=i*width+j;if(value>score[at]){score[at]=value;steps[at]=step;}};
    for(let i=0;i<=n;i++)for(let j=0;j<=m;j++){
      const value=score[i*width+j];if(!Number.isFinite(value))continue;
      // Prefer a replacement over a deletion followed by an insertion on ties.
      for(const [left,right,step] of [[1,1,1],[1,2,2],[2,1,3]])if(i+left<=n&&j+right<=m){
        const x=aa.slice(i,i+left).flat(),y=bb.slice(j,j+right).flat(),cx=counts(x),cy=counts(y);
        let common=0;for(const [word,count] of cx)common+=Math.min(count,cy.get(word)||0);
        update(i+left,j+right,value+2*common-x.length-y.length-(left+right-2)*2,step);
      }
      if(i<n)update(i+1,j,value-aa[i].length-1,4);
      if(j<m)update(i,j+1,value-bb[j].length-1,5);
    }
    let i=n,j=m;
    while(i||j){
      const step=steps[i*width+j],left=step===3?2:step===5?0:1,right=step===2?2:step===4?0:1;
      if(left&&right)groups.push([a0+i-left,a0+i,b0+j-right,b0+j]);
      i-=left;j-=right;
    }
  };
  let i=0,j=0;
  for(const [ai,bi,size] of [...matchingBlocks(a,b),[a.length,b.length,0]]){
    gap(i,ai,j,bi);for(let k=0;k<size;k++)groups.push([ai+k,ai+k+1,bi+k,bi+k+1]);i=ai+size;j=bi+size;
  }
  const byParagraph=new Map();
  for(const [a0,a1,b0,b1] of groups){
    const ranges=locateRanges(next,next.starts[b0],next.starts[b1-1]+b[b1-1].length);
    for(let p=a0;p<a1;p++)byParagraph.set(p+1,()=>ranges);
  }
  return byParagraph;
}

export function approvedTranslation(id,before,after){
  const source=bytes=>prepareSource(id,digest(bytes),parseText(decode(bytes),'en').paragraphs);
  const old=source(before),next=source(after),sources=new Map([[id,next]]),matcher=new Matcher([next]);
  let editMap;
  function candidate(value,excerpt=''){
    if(value.source!==id)return structuredClone(value);
    if(value.version===next.version)return validateConfirmedMatch(value,sources);
    validateConfirmedMatch(value,new Map([[id,old]]));
    try{return revalidateItemQuotes(value,id,before,after,{oldVersion:old.version,nextVersion:next.version,oldParagraphs:old.paragraphs,nextParagraphs:next.paragraphs}).decisions;}catch{}
    // Prefer the supplied quotation when all of its explicit fragments occur
    // uniquely and in order in the corrected source. No fuzzy match is accepted.
    const fragments=excerpt.split(/\.{3,}|…|\[\s*(?:\.\s*){3}\]/).map(s=>s.trim()).filter(Boolean);
    let ranges=[],end=-1,scope='supplied-quotation';
    for(const fragment of fragments){
      const match=matcher.match({excerpt:fragment,suppliedIds:[id]});
      if(!['exact','normalized'].includes(match.status)){ranges=[];break;}
      const found=match.candidates[0].ranges,first=found[0],last=found.at(-1);
      if(next.starts[first.paragraph-1]+first.start<end){ranges=[];break;}
      ranges.push(...found);end=next.starts[last.paragraph-1]+last.end;
    }
    if(!ranges.length){
      // A rewritten translation may have no word-for-word equivalent of the
      // old fragment. Retain the complete corrected paragraph context rather
      // than inventing precise word boundaries inside the new wording.
      scope='complete-corrected-paragraphs';
      editMap??=paragraphEdits(old,next);
      for(const r of value.ranges){
        ranges.push(...(editMap.get(r.paragraph)?.(r)||[]));
      }
    }
    // A wholly removed quotation is removed from public compilations too.
    if(!ranges.length)return null;
    ranges.sort((a,b)=>a.paragraph-b.paragraph||a.start-b.start);
    const merged=[];
    for(const r of ranges){const last=merged.at(-1);if(last&&last.paragraph===r.paragraph&&r.start<=last.end){last.end=Math.max(last.end,r.end);last.text=next.paragraphs[r.paragraph-1].plain.slice(last.start,last.end);}else merged.push({...r});}
    return validateConfirmedMatch({...value,version:next.version,ranges:merged,correction:{fromVersion:old.version,scope,approval:'Catalog correction approved for propagation to existing quotations.'}},sources);
  }
  return {old,next,candidate};
}

export function correctDecisionFile(data,correction,extracts=new Map()){
  const result=structuredClone(data),removed=new Set();let updated=0;
  for(const field of ['matches','hints'])for(const [id,decision] of Object.entries(result[field]||{})){
    if(decision.candidate?.source===correction.old.id){
      const next=correction.candidate(decision.candidate,extracts.get(id)?.excerpt);
      if(JSON.stringify(next)!==JSON.stringify(decision.candidate))updated++;
      if(next)decision.candidate=next;
      else{delete result[field][id];removed.add(id);}
    }
    if(decision.candidates)decision.candidates=decision.candidates.map(c=>c.source===correction.old.id?correction.candidate(c):c).filter(Boolean);
  }
  return {data:result,updated,removed};
}

export async function planTranslationCorrection({id,before,after,read,list,site}){
  const correction=approvedTranslation(id,before,after),changes=new Map();
  const json=async name=>{const bytes=await read(name);return bytes?JSON.parse(bytes.toString('utf8')):null;};
  const save=(name,value)=>changes.set(name,JSON.stringify(value,null,2)+'\n');
  const archive=await read('data/subject-extracts-public.json.gz');
  const extracts=new Map((archive?JSON.parse(gunzipSync(archive)).selections:[]).map(s=>[s.id,s]));
  const edits=await json('data/subject-edits.json')||{format:1,matches:{},relationships:[]};
  const reviewed=await json('data/extract-review-decisions.json')||{matches:{}};
  const removed=new Set();let quotations=0;
  for(const [name,data] of [['data/extract-review-decisions.json',reviewed],['data/subject-edits.json',edits]]){
    const result=correctDecisionFile(data,correction,extracts);
    for(const selection of result.removed)removed.add(selection);
    quotations+=result.updated;
    if(JSON.stringify(data)!==JSON.stringify(result.data))save(name,result.data);
    Object.assign(data,result.data);
  }
  // Freeze existing automatic matches onto the corrected source as approved
  // decisions too, so a rebuild cannot drop a quotation just because it changed.
  const passages=await site('subjects/passages/'+recordFilename(id)),subjects=new Set();
  for(const p of Object.values(passages?.passages||{}))for(const subject of p.subjects)subjects.add(subject);
  const compilations=await siteFiles(site,[...subjects].map(subject=>'subjects/'+subject+'.json.gz'));
  for(const [index,subject] of [...subjects].entries()){
    const data=compilations[index];
    if(!data)throw Error(`Missing published subject ${subject} while propagating ${id}.`);
    for(const s of data.selections){
      if(!['exact','normalized','confirmed'].includes(s.status)||s.candidates?.[0]?.source!==id)continue;
      for(const selection of [s,...(s.duplicates||[])]){
        if(edits.matches?.[selection.id]||reviewed.matches?.[selection.id]||removed.has(selection.id))continue;
        const candidate=correction.candidate(s.candidates[0],extracts.get(selection.id)?.excerpt);
        if(candidate){edits.matches[selection.id]={status:'confirmed',candidate,note:'Existing quotation carried forward with the approved catalog translation correction.'};quotations++;}
        else removed.add(selection.id);
      }
    }
  }
  for(const selection of removed)edits.matches[selection]={status:'rejected',note:`Its quoted wording was removed by the approved correction of ${id}.`};
  const originalEdits=await json('data/subject-edits.json');
  if(JSON.stringify(edits)!==JSON.stringify(originalEdits))save('data/subject-edits.json',edits);
  // Reviewed sentence context follows the same textual edit, including split
  // paragraphs. Keep the existing reasons and renew their source fingerprints.
  const sentenceFile='study-guides/sentence-paragraphs.json',sentences=await json(sentenceFile);
  if(sentences&&(sentences.sources?.[id]||sentences.entries?.some(e=>e.source===id))){
    const compact=sentences.entries?.length?compactSentenceParagraphs(sentences):structuredClone(sentences),old=compact.sources[id],rows=new Map();
    const paragraph=n=>correction.candidate({source:id,version:old.version,ranges:[{paragraph:n,start:0,end:correction.old.paragraphs[n-1].plain.length,text:correction.old.paragraphs[n-1].plain}]})?.ranges.map(r=>r.paragraph)||[];
    for(const [n,,reason,continuation] of old.paragraphs){
      const mapped=paragraph(n),next=continuation?paragraph(continuation[0])[0]:null;
      mapped.forEach((p,i)=>{const row=[p,textSha(correction.next.paragraphs[p-1].plain),reason],following=mapped[i+1]??next;if(following&&following>p)row.push([following,textSha(correction.next.paragraphs[following-1].plain)]);rows.set(p,row);});
    }
    compact.sources[id]={version:correction.next.version,paragraphs:[...rows.values()].sort((a,b)=>a[0]-b[0])};
    changes.set(sentenceFile,formatSentenceParagraphs(compact));
  }
  const contextFile='study-guides/sentence-context.json',context=await json(contextFile);
  if(context?.entries.some(e=>e.source===id)){
    for(const e of context.entries)if(e.source===id)e.sourceVersion=correction.next.version;
    save(contextFile,context);
  }
  // Study-guide baselines, curated reviews and literal shortenings are renewed
  // by the PR's reconciliation step against the complete rebuilt subjects.
  return {changes,quotations,subjects:[...subjects],version:correction.next.version};
}
