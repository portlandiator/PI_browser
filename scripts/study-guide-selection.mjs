import {createHash} from 'node:crypto';
import {studyGuideSelections,catalogueFingerprint} from './study-guide-catalogue.mjs';
import {authorizedRanges,isAuthorizedParagraph} from '../src/translation-status.mjs';

// Full coverage remains the default. A curated guide binds its explicit IDs to
// the pre-analysis editorial review and independently checks source authority.
export async function selectStudyGuideQuotations(data,selection,{readReview,readRecord}={}){
 const pool=studyGuideSelections(data.selections);
 if(selection===undefined)return pool;
 const fail=message=>{throw Error(`Invalid study-guide selection: ${message}`);};
 // The catalogue's Authorized field changed under a reviewed choice. The pull
 // request check renews the review from the rebuilt records (reconcile-study-guides.mjs).
 const authority=message=>{throw Object.assign(Error(`Invalid study-guide selection: ${message}`),{code:'STUDY_GUIDE_AUTHORITY_CHANGED'});};
 if(!selection||!/^selections\/[a-z]+\.json$/.test(selection.review||''))fail('unsafe review path');
 const raw=await readReview(selection.review);
 if(createHash('sha256').update(raw).digest('hex')!==selection.sha256)fail('review hash mismatch');
 const review=JSON.parse(raw),ids=selection.ids;
 if(review.subject!==data.subject.id||review.candidateFingerprint!==catalogueFingerprint(data.selections))fail('candidate pool changed');
 if(review.status!=='finalized_before_analysis'||review.selectionBeforeAnalysis!==true||review.target!==300)fail('review not finalized before analysis');
 // Quotations deleted with their catalog item leave the reviewed choice short
 // rather than inviting an unreviewed replacement.
 const removed=review.removedWithCatalogItems||[];
 if(!Array.isArray(removed)||removed.some(r=>!r||typeof r.id!=='string'||typeof r.chosen!=='boolean'||pool.some(s=>s.id===r.id)))fail('removed quotations');
 const expected=Math.min(300,pool.length+removed.length)-removed.filter(r=>r.chosen).length,all=new Map(pool.map(s=>[s.id,s]));
 if(all.size!==pool.length)fail('duplicate candidate IDs');
 if(!Array.isArray(ids)||new Set(ids).size!==ids.length)fail('duplicate or missing IDs');
 if(ids.some(id=>!all.has(id)))fail('unknown ID');
 if(ids.length!==expected||review.selectedCount!==expected||review.candidateCount!==pool.length)fail('quotation count');
 const chosen=new Set(ids),selected=new Map((review.selected||[]).map(s=>[s.id,s]));
 if(selected.size!==expected||review.selected.length!==expected||ids.some(id=>!selected.has(id)))fail('allowlist differs from review');
 const partition=[...review.selected,...(review.omitted||[])].map(s=>s.id);
 if(partition.length!==pool.length||new Set(partition).size!==pool.length||partition.some(id=>!all.has(id)))fail('selected/omitted partition');
 const imports=new Map((review.importedAuthorityReview||[]).map(s=>[s.id,s])),records=new Map();
 const mandatory=[];
 for(const s of pool){
  let authorized=[],record;
  if(s.passage){
   const c=s.candidates[0];
   if(!records.has(c.source))records.set(c.source,await readRecord(c.source));
   record=records.get(c.source);
   if(record.id!==c.source||record.enVersion!==c.version)fail(`stale source ${c.source}`);
   for(const range of c.ranges)if(record.en.paragraphs[range.paragraph-1]?.plain.slice(range.start,range.end)!==range.text)fail(`stale quotation ${s.id}`);
   const authority=authorizedRanges(record.metadata?.Authorized);
   authorized=[...new Set(c.ranges.filter(r=>isAuthorizedParagraph(authority,r.paragraph)).map(r=>r.paragraph))].sort((a,b)=>a-b);
  }else{
   const evidence=imports.get(s.id);
   if(!evidence?.finding||!evidence?.url||!evidence?.authorization)fail(`unreviewed imported authority ${s.id}`);
   if(evidence.mandatoryAuthorized===true)mandatory.push(s.id);
  }
  if(authorized.length)mandatory.push(s.id);
  if(chosen.has(s.id)){
   const entry=selected.get(s.id);
   if(!entry.reason?.trim())fail(`missing reason ${s.id}`);
   if(record&&(entry.source!==record.id||entry.sourceVersion!==record.enVersion||JSON.stringify(entry.authorizedParagraphs)!==JSON.stringify(authorized)))authority(`source authority evidence changed ${s.id}`);
  }
 }
 if(mandatory.length>300)fail('authorized quotation overflow');
 if(mandatory.some(id=>!chosen.has(id)))authority('missing mandatory authorized quotation');
 if(review.mandatoryAuthorizedCount!==mandatory.length)authority('authorized count mismatch');
 return pool.filter(s=>chosen.has(s.id));
}
