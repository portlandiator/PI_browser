// Study-guide display context only: never changes source records or selections.
import reviewedParagraphs from '../study-guides/sentence-paragraphs.json' with {type:'json'};
const segmenter=new Intl.Segmenter('en',{granularity:'sentence'});
const abbreviation=/(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Rev|St|Mt|No|Nos|Vol|vol|pp|p|cf|i\.e|e\.g)|\b[A-Z])\.$/u;
const opening=/^[\s\d.\-–—‘’“”"'([{]*[\p{Lu}\p{N}]/u;
const terminal=/[.!?][\s‘’“”"')\]}]*(?:\[\d+\][\s‘’“”"')\]}]*)*$/u;
// A quoted address following a colon is an introduction to the words that
// follow, even when the address itself has an exclamation mark.
const trailingAddress=/(?:^|[:\n]\s*)[“"‘']*(?:O\s+[^.!?;:\n]{1,100}|By God|My God(?:,\s*my God)?)![”"’']*$/u;
const answerOpening=/^[\s‘’“”"'([{]*(?:Answer(?:\s+by\s+[\p{L}‘’' -]{1,80}(?=:))?\s*[:.–—-]|A[.:]\s)/iu;

// Include the immediately preceding prompt, never an earlier question across
// an intervening answer or unrelated paragraph. A labeled prompt may contain
// several sentences, or a quotation without a question mark.
function precedingQuestionStart(text,start,spans){
 let answerStart=start;
 if(!answerOpening.test(text.slice(answerStart))){
  const prior=spans.findLast(s=>s.end<=start);
  if(!prior||!answerOpening.test(text.slice(prior.start,prior.end)))return start;
  answerStart=prior.start;
 }
 let end=answerStart;
 while(end>0&&/\s/u.test(text[end-1]))end--;
 if(!end)return start;
 const separator=text.lastIndexOf('\n\n',end);
 const from=separator<0?0:separator+2;
 // A catalogue answer often occupies its own paragraph immediately after a
 // labelled question.  Keep that prompt with the answer when it is complete;
 // this is the same explicit question-and-answer boundary used for inline
 // exchanges below, extended across one paragraph break.
 if(separator>=0){
  const previousSeparator=text.lastIndexOf('\n\n',separator-1);
  const previousFrom=previousSeparator<0?0:previousSeparator+2;
  const previous=text.slice(previousFrom,separator).trim();
  const labelledQuestion=/^[‘’“”"'[(]*(?:(?:\d+(?:st|nd|rd|th)?\s+)?Question|Q)\s*[:.–—-]/iu.test(previous);
  // Named answer headings are also commonly preceded by an unlabelled
  // question.  Treat a complete adjacent paragraph ending in a question mark
  // as that prompt, while refusing to cross another answer heading.
  const unlabelledQuestion=/\?[\s‘’“”"')\]}]*$/u.test(previous)
   && !answerOpening.test(previous);
  if(labelledQuestion||unlabelledQuestion)return previousFrom;
 }
 const prefix=text.slice(from,end);
 const labels=[...prefix.matchAll(/(?:^|[.!?][‘’“”"')\]]*\s+)([‘’“”"'[(]*(?:(?:\d+(?:st|nd|rd|th)?\s+)?Question|Answer(?:\s+by\s+[\p{L}‘’' -]{1,80}(?=:))?|Q|A)\s*[:.–—-])/giu)];
 const last=labels.at(-1);
 if(last){
  if(!/^[‘’“”"'[(]*(?:(?:\d+(?:st|nd|rd|th)?\s+)?Question|Q)\s*[:.–—-]/iu.test(last[1]))return start;
  return from+last.index+last[0].length-last[1].length;
 }
 if(!/\?[\s‘’“”"')\]}]*$/u.test(prefix))return start;
 // An unlabelled question in its own paragraph is a complete prompt. Within
 // an inline exchange use only the immediately preceding question sentence.
 if(/\n\s*\n/u.test(text.slice(end,start)))return from;
 const prior=spans.findLast(s=>s.end<=start&&s.start<end);
 return prior&&/\?[\s‘’“”"')\]}]*$/u.test(text.slice(prior.start,end))?prior.start:start;
}

export function sentenceSpans(text){
 const spans=[];
 for(const part of segmenter.segment(text)){
  let start=part.index,end=start+part.segment.length;
  while(start<end&&/\s/u.test(text[start]))start++;
  while(end>start&&/\s/u.test(text[end-1]))end--;
  if(start===end)continue;
  const previous=spans.at(-1);
  // ICU separates honorifics and initials, and treats paragraph breaks as
  // sentence breaks even when the sentence continues. Do not pull an isolated
  // heading/signature into the following paragraph merely for lacking a stop.
  const prior=previous?text.slice(previous.start,previous.end):'';
  const paragraphBreak=previous&&/\n\s*\n/u.test(text.slice(previous.end,start));
  // A new paragraph whose opening was explicitly omitted is not evidence
  // that the preceding completed sentence continues into that paragraph.
  const omittedOpening=paragraphBreak&&terminal.test(prior)&&/^\[\s*(?:\.{3}|…)\s*\]/u.test(text.slice(start,end));
  const continuation=!omittedOpening&&!opening.test(text.slice(start,end));
  const unfinished=!terminal.test(prior)&&(!paragraphBreak||continuation||/[,;:–—-]$/u.test(prior));
  // A numbered item within a sentence is not a full stop ("in three respects: 1.").
  const numberedItem=!paragraphBreak&&/(?:^|[,:;]\s+|\b(?:and|or)\s+)\d+\.$/u.test(prior);
  const unfinishedBracket=!paragraphBreak&&/\[[^\]]*$/u.test(prior)&&text.indexOf(']',previous.end)>=0;
  if(previous&&(abbreviation.test(prior)||numberedItem||unfinishedBracket||unfinished||continuation||trailingAddress.test(prior)))previous.end=end;
  else spans.push({start,end});
 }
 return spans;
}

export function boundaryConcerns(text){
 const t=text.trim(),issues=[];
 if(!t)return ['empty text'];
 // A supplied quotation may carry its attribution inside the text field.
 // Inspect the sentence before a final parenthetical note, retaining the
 // note verbatim in the displayed text. A fragment before it stays flagged.
 const body=t.replace(/\s+\([^()\n]{1,300}\)$/u,'');
 if(!opening.test(t))issues.push('opening may be a sentence fragment');
 if(!terminal.test(body))issues.push('ending lacks a sentence terminator');
 // A split citation can leave an abbreviation such as "[cf." at the edge.
 // Its period is not evidence that the supplied excerpt is complete.
 if(/\[[^\]]*$/u.test(t))issues.push('ending contains an unfinished bracketed note');
 if(trailingAddress.test(body))issues.push('ending is an address without its following statement');
 if(/^(?:\.{2,}|…)|(?:\.{2,}|…)[\s‘’“”"')\]}]*$/u.test(body))issues.push('boundary contains an omission');
 if(/(?:\.{3,}|…|\[\s*(?:\.\s*){3}\])/u.test(t))issues.push('supplied omission needs review');
 return issues;
}

export function completeSentenceParagraphs(record,selected,reviews=reviewedParagraphs.entries){
 const offsets=[];let text='';
 for(const p of record.en.paragraphs){offsets.push(text.length);text+=p.plain+'\n\n';}
 const spans=sentenceSpans(text),expanded=[];
 // A reviewed source can contain a full stop between a dependent clause and
 // its main clause. Keep that exact paragraph together, failing on any change
 // of source version or wording instead of guessing a general grammar rule.
 for(const entry of reviews.filter(e=>e.source===record.id)){
  const paragraph=record.en.paragraphs[entry.paragraph-1];
  if(record.enVersion!==entry.sourceVersion||paragraph?.plain!==entry.text)throw Error(`Stale reviewed sentence paragraph: ${record.id}:${entry.paragraph}`);
  const start=offsets[entry.paragraph-1];
  let end=start+paragraph.plain.length;
  // A reviewed bracketed passage may continue in the adjacent paragraph.
  // Require its exact wording too, rather than following an arbitrary later ].
  if(entry.continuation){
   const next=entry.continuation,following=record.en.paragraphs[next.paragraph-1];
   if(next.paragraph!==entry.paragraph+1||following?.plain!==next.text)throw Error(`Stale reviewed sentence continuation: ${record.id}:${next.paragraph}`);
   end=offsets[next.paragraph-1]+following.plain.length;
  }
  const first=spans.findIndex(s=>s.end>start&&s.start<end);
  let last=first;
  while(last+1<spans.length&&spans[last+1].start<end)last++;
  if(first<0)throw Error(`Missing reviewed sentence paragraph: ${record.id}:${entry.paragraph}`);
  spans.splice(first,last-first+1,{start:spans[first].start,end:spans[last].end});
 }
 for(const p of selected)for(const r of p.ranges){
  const start=offsets[p.number-1]+r.start,end=offsets[p.number-1]+r.end;
  const touched=spans.filter(s=>s.end>start&&s.start<end);
  if(!touched.length)throw Error(`No sentence context: ${record.id}:${p.number}`);
  // If the selection itself includes a heading, a speaker label, or the
  // beginning of a list, carry it through to the next sentence terminator.
  let last=spans.indexOf(touched.at(-1));
  while(last+1<spans.length&&!terminal.test(text.slice(spans[last].start,spans[last].end)))touched.push(spans[++last]);
  const sentenceStart=Math.min(start,touched[0].start);
  expanded.push({start:precedingQuestionStart(text,sentenceStart,spans),end:Math.max(end,touched.at(-1).end)});
 }
 const merged=[];
 for(const r of expanded.sort((a,b)=>a.start-b.start)){
  if(merged.length&&(r.start<=merged.at(-1).end||/^\s*$/u.test(text.slice(merged.at(-1).end,r.start))))merged.at(-1).end=Math.max(merged.at(-1).end,r.end);
  else merged.push({...r});
 }
 const paragraphs=[];
 for(const [i,p] of record.en.paragraphs.entries()){
  const ranges=merged.map(r=>({start:Math.max(0,r.start-offsets[i]),end:Math.min(p.plain.length,r.end-offsets[i])})).filter(r=>r.end>r.start);
  if(ranges.length)paragraphs.push({number:i+1,ranges});
 }
 const issues=merged.flatMap(r=>boundaryConcerns(text.slice(r.start,r.end)).map(issue=>({issue,text:text.slice(r.start,r.end)})));
 const changed=JSON.stringify(paragraphs)!==JSON.stringify(selected);
 return {paragraphs,changed,issues};
}

// Used only for reviewed, explicitly cited records. Matching does not change
// the imported selection's catalogue-link status or its supplied attribution.
export function locateSuppliedParagraphs(record,excerpt){
 const text=record.en.paragraphs.map(p=>p.plain).join('\n\n');
 const chunks=excerpt.split(/(?:\.{3,}|…)/u).map(t=>t.trim()).filter(Boolean);
 if(!chunks.length||chunks.some(c=>c.length<30))throw Error('Insufficient literal wording for sentence context');
 const matches=[];let previousEnd=0;
 for(const chunk of chunks){
  const start=text.indexOf(chunk);
  if(start<previousEnd||start<0||text.indexOf(chunk,start+1)!==-1)throw Error('Supplied wording is missing, ambiguous, or out of order');
  matches.push({start,end:start+chunk.length});previousEnd=start+chunk.length;
 }
 let offset=0;const paragraphs=[];
 for(const [i,p] of record.en.paragraphs.entries()){
  const ranges=matches.map(r=>({start:Math.max(0,r.start-offset),end:Math.min(p.plain.length,r.end-offset)})).filter(r=>r.end>r.start);
  if(ranges.length)paragraphs.push({number:i+1,ranges});
  offset+=p.plain.length+2;
 }
 return paragraphs;
}
