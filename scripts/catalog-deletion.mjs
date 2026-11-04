// Plan the removal of one catalog item from everything built on it: subject
// quotations (through the review decisions), study-guide readings, curated
// selections and the study-guide catalogue baseline. Volume PDFs are untouched.
// What a rebuild changes beyond this plan (quotations matched again to other
// records) is reconciled by scripts/reconcile-study-guides.mjs when GitHub
// checks the pull request.
//
// Planning reads repository files through `read(relativePath)` (a Buffer, or
// null when absent) and `list(directory)`, and the published site through
// `site(name)` (parsed JSON, or null when absent). It returns the new contents
// (text or bytes) of every changed file; nothing is written here.
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {hasPublicMatch,isPublicSelection} from '../src/selection-policy.mjs';
import {groupSelections,groupedParagraphs} from '../src/subject-groups.mjs';
import {recordFilename} from '../src/record-file.mjs';
import {authorizedRanges,isAuthorizedParagraph} from '../src/translation-status.mjs';
import {studyGuideSelections,catalogueFingerprint} from './study-guide-catalogue.mjs';
import {formatSentenceParagraphs} from './sentence-paragraphs.mjs';
import {publicExtractArchive} from './public-extracts.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const keyOf=g=>g.source?'source:'+g.source:'selection:'+g.id;
// Keep each file's own line endings, as the study-guide editor does.
const jsonText=(original,data)=>(JSON.stringify(data,null,2)+'\n').replaceAll('\n',original.includes('\r\n')?'\r\n':'\n');

// The published site, or a local build, read as JSON. Absent files are null.
// Each file is downloaded once per publication (several items can share
// subjects) and parsed afresh for every caller, so no caller sees another's
// changes.
export function liveSite(base,fetcher=fetch){
  const downloads=new Map();
  const get=async name=>{
    const url=new URL(name,base),response=await fetcher(url,{cache:'no-store'});
    if(response.status===404)return null;
    if(!response.ok)throw Error(`${url} answered ${response.status}.`);
    return Buffer.from(await response.arrayBuffer());
  };
  const once=(name,load)=>{
    if(!downloads.has(name))downloads.set(name,load().catch(error=>{downloads.delete(name);throw error;}));
    return downloads.get(name);
  };
  const dataset=()=>once('stats.json',async()=>{
    const value=JSON.parse((await get('stats.json'))?.toString('utf8')||'{}').dataset;
    if(!/^collections\/[\w-]+\/$/.test(value||''))throw Error('The website did not report its current dataset.');
    return value;
  });
  return async name=>{
    const folder=await dataset(),bytes=await once(folder+name,()=>get(folder+name));
    return bytes&&JSON.parse(gunzipSync(bytes).toString('utf8'));
  };
}

// Read several site files at once (a few downloads in parallel), in order.
export async function siteFiles(site,names,parallel=6){
  const results=new Array(names.length);let next=0;
  await Promise.all(Array.from({length:Math.min(parallel,names.length)},async()=>{while(next<names.length){const i=next++;results[i]=await site(names[i]);}}));
  return results;
}

// A quotation belongs to the item when the subject shows it from the item's
// text, or when it cites only the item and is not shown from another record.
// Copies merged into it go with it, so a rebuild cannot bring them back.
export function removedSelections(id,selections){
  const removed=new Set();
  for(const s of selections){
    const shownFrom=hasPublicMatch(s)?s.candidates[0].source:null;
    const citesOnly=s.suppliedIds?.length>0&&s.suppliedIds.every(x=>x===id);
    if(shownFrom===id||(!shownFrom&&citesOnly)){removed.add(s.id);for(const d of s.duplicates||[])removed.add(d.id);}
  }
  return removed;
}

function guidePool(data,ids){
  const pool=studyGuideSelections(data.selections);
  if(!ids)return pool;
  const chosen=new Set(ids);
  return pool.filter(s=>chosen.has(s.id));
}
const label=x=>x.why.length>90?x.why.slice(0,89)+'…':x.why;

// Bring one guide in line with its subject's new quotations. Readings that lost
// every quotation are removed; a group that is new keeps the place and status of
// the reading its quotations came from, otherwise it is added as left out (or
// shown, when it has authorized wording, which may not be left out). Returns
// guide null when nothing remains to read.
export function reconcileGuide(guide,before,after,{item,cause=`catalog item ${item} was deleted`,review=null,authorized=()=>false,authority=new Map()}={}){
  guide=structuredClone(guide);review=review&&structuredClone(review);
  const notes=[],oldIds=guide.selection?.ids;
  const beforePool=studyGuideSelections(before.selections),afterPool=studyGuideSelections(after.selections);
  const beforeIds=new Set(beforePool.map(s=>s.id)),afterIds=new Set(afterPool.map(s=>s.id));
  if(guide.selection){
    if(!review)throw Error(`The curated selection review for ${guide.slug} is missing.`);
    const chosen=new Set(oldIds),gone=beforePool.filter(s=>!afterIds.has(s.id)).map(s=>s.id);
    for(const s of afterPool.filter(s=>!beforeIds.has(s.id))){
      if(!s.passage||(authorized({source:s.candidates[0].source,selections:[s]})&&!authority.has(s.id)))throw Error(`The catalog change (${cause}) gives “${guide.displayTitle}” a new candidate quotation (${s.id}) that needs an editorial decision. Nothing was published.`);
      review.omitted.push({id:s.id,source:s.candidates[0].source,reason:`Became a candidate when ${cause}; not yet reviewed for this guide.`});
      notes.push('New candidate quotation left out: '+s.id);
    }
    const lostMandatory=review.selected.filter(s=>!afterIds.has(s.id)&&s.mandatoryAuthorized===true).length;
    review.selected=review.selected.filter(s=>afterIds.has(s.id));
    // A corrected record keeps its chosen quotations; their review names the new version.
    const afterById=new Map(afterPool.map(s=>[s.id,s]));
    for(const entry of review.selected){
      const candidate=afterById.get(entry.id).candidates?.[0];
      if(entry.sourceVersion&&candidate?.source===entry.source&&candidate.version&&candidate.version!==entry.sourceVersion){
        entry.sourceVersion=candidate.version;
        if(entry.authorityEvidence?.sourceVersion)entry.authorityEvidence.sourceVersion=candidate.version;
        notes.push(`Chosen quotation ${entry.id} now cites the corrected text of ${entry.source}.`);
      }
      const current=authority.get(entry.id);
      if(current){Object.assign(entry,current);entry.mandatoryAuthorized=current.authorizedParagraphs.length>0;if(entry.authorityEvidence)Object.assign(entry.authorityEvidence,{sourceVersion:current.sourceVersion,paragraphs:current.authorizedParagraphs});}
    }
    review.omitted=review.omitted.filter(s=>afterIds.has(s.id));
    review.importedAuthorityReview=(review.importedAuthorityReview||[]).filter(s=>afterIds.has(s.id));
    const goneChosen=gone.filter(id=>chosen.has(id)).length;
    if(gone.length)notes.push(`${gone.length} candidate quotation${gone.length===1?'':'s'} removed from the curated selection (${goneChosen?goneChosen+' of them chosen for the guide':'none of them chosen for the guide'}).`);
    // Recorded once, even when the guide is reconciled again after a rebuild.
    const recorded=new Set((review.removedWithCatalogItems||[]).map(x=>x.id));
    if(gone.some(id=>!recorded.has(id)))review.removedWithCatalogItems=[...(review.removedWithCatalogItems||[]),...gone.filter(id=>!recorded.has(id)).map(id=>({id,item,chosen:chosen.has(id)}))];
    review.candidateCount=afterPool.length;review.selectedCount=review.selected.length;
    review.mandatoryAuthorizedCount-=lostMandatory;
    review.candidateFingerprint=catalogueFingerprint(after.selections);
    guide.selection.ids=oldIds.filter(id=>afterIds.has(id));
    if(authority.size){
      const imported=new Set((review.importedAuthorityReview||[]).filter(s=>s.mandatoryAuthorized).map(s=>s.id));
      const mandatory=new Set(afterPool.filter(s=>authority.get(s.id)?.authorizedParagraphs.length||imported.has(s.id)).map(s=>s.id));
      for(const id of mandatory){
        if(guide.selection.ids.includes(id))continue;
        // Preserve the fixed-size curated selection. Its last optional choice
        // yields to wording the corrected catalog now marks as authorized.
        const replace=[...review.selected].reverse().find(s=>!mandatory.has(s.id));
        if(!replace)throw Error(`Authorized quotation overflow in ${guide.slug}.`);
        review.selected=review.selected.filter(s=>s.id!==replace.id);
        review.omitted=review.omitted.filter(s=>s.id!==id);
        review.omitted.push({id:replace.id,source:replace.source,reason:`Replaced by mandatory authorized quotation ${id} after ${cause}; the fixed-size selection is retained.`});
        const current=authority.get(id);
        review.selected.push({id,...current,mandatoryAuthorized:true,reason:`Included with the approved catalog correction: its wording is now marked authorized after ${cause}.`,authorityEvidence:{kind:'catalogue_authorized_paragraphs',sourceVersion:current.sourceVersion,paragraphs:current.authorizedParagraphs}});
        guide.selection.ids=guide.selection.ids.filter(x=>x!==replace.id);guide.selection.ids.push(id);
        notes.push(`Authorized quotation ${id} included; optional quotation ${replace.id} moved out to retain the selection limit.`);
      }
      review.mandatoryAuthorizedCount=mandatory.size;
    }
  }
  const groups=groupSelections(guidePool(after,guide.selection?.ids),after.sources);
  const oldGroups=groupSelections(guidePool(before,oldIds),before.sources);
  const byKey=new Map(groups.map(g=>[keyOf(g),g])),oldEntries=new Map(guide.order.map(x=>[x.key,x])),entryOf=new Map();
  for(const g of oldGroups){const x=oldEntries.get(keyOf(g));if(x)for(const s of g.selections)entryOf.set(s.id,x);}
  const order=guide.order.filter(x=>byKey.has(x.key)),kept=new Set(order.map(x=>x.key)),moved=new Set();
  for(const entry of order){
    const group=byKey.get(entry.key);
    if(entry.omitted&&authorized(group)){delete entry.omitted;notes.push(`Reading ${group.source} is now shown because the corrected catalog marks its wording authorized.`);}
    if(!entry.shortened||!group?.source)continue;
    const previous=oldGroups.find(g=>keyOf(g)===entry.key);
    const oldVersions=new Set(previous?.selections.map(s=>s.candidates?.[0]?.version));
    if(group.selections.some(s=>s.candidates?.[0]?.correction&&!oldVersions.has(s.candidates[0].version))){
      delete entry.shortened;
      notes.push(`Reading ${group.source} now uses the corrected complete selected sentences; its old literal shortening was removed.`);
    }
  }
  for(const g of groups){
    const key=keyOf(g);if(kept.has(key))continue;
    const previous=g.selections.map(s=>entryOf.get(s.id)).find(Boolean);
    const entry={key,why:previous?.why||`Added when ${cause}.`};
    if(!authorized(g)&&(previous?previous.omitted:true))entry.omitted=true;
    // Linked readings come before unlinked ones.
    order.splice(g.source?order.findLastIndex(x=>x.key.startsWith('source:'))+1:order.length,0,entry);
    if(previous&&!kept.has(previous.key)){moved.add(previous.key);notes.push(`Reading now linked to ${g.source||'no record'}: ${label(previous)}`);}
    else notes.push(`${entry.omitted?'Reading added, left out':'Reading added'}: ${key}`);
  }
  for(const x of guide.order)if(!byKey.has(x.key)&&!moved.has(x.key))notes.push('Reading removed: '+label(x));
  if(!order.length)return {guide:null,review,notes:['Guide removed: none of its quotations remain.']};
  if(order.every(x=>x.omitted))throw Error(`Every reading left in “${guide.displayTitle}” is marked “Leave out”. Put one back with Edit-Study-Guide, then delete the item again. Nothing was published.`);
  const shown=order.filter(x=>!x.omitted).length,limit=Math.min(6,Math.max(0,shown-1));
  if(guide.questions.length>limit){notes.push(`Discussion questions reduced from ${guide.questions.length} to ${limit} (the last ${guide.questions.length-limit} removed).`);guide.questions=guide.questions.slice(0,limit);}
  guide.order=order;
  return {guide,review,notes};
}

// Authorized wording in a linked group, read from the item records of a build.
export function authorizedGroups(readRecord){
  const records=new Map();
  const record=async source=>{if(!records.has(source))records.set(source,await readRecord(source));return records.get(source);};
  const authorized=async g=>{
    if(!g.source)return false;
    const source=await record(g.source),authorization=authorizedRanges(source?.metadata?.Authorized);
    return groupedParagraphs(g).some(p=>isAuthorizedParagraph(authorization,p.number));
  };
  authorized.selection=async s=>{
    if(!s.passage)return null;
    const c=s.candidates[0],source=await record(c.source),authorization=authorizedRanges(source?.metadata?.Authorized);
    return {source:c.source,sourceVersion:c.version,authorizedParagraphs:[...new Set(c.ranges.filter(r=>isAuthorizedParagraph(authorization,r.paragraph)).map(r=>r.paragraph))].sort((a,b)=>a-b)};
  };
  return authorized;
}

// Apply new subject data to every study-guide file. `subjects` maps a subject
// ID to {before, after}; `evidenceGone(subjectId, selectionId)` tells whether
// a neighbor's evidence quotation no longer exists.
export async function updateGuides({read,list,item,cause=`catalog item ${item} was deleted`,subjects,evidenceGone,authorized=async()=>false,removedSources=[item]}){
  const changes=new Map(),guides=[],text=async name=>(await read(name))?.toString('utf8');
  const baselineText=await text('study-guides/catalogue-baseline.json'),baseline=baselineText&&JSON.parse(baselineText);
  for(const [id,{after}] of subjects)if(baseline?.subjects[id]){
    baseline.subjects[id]={fingerprint:catalogueFingerprint(after.selections),publicSelections:after.selections.filter(isPublicSelection).length};
  }
  if(baseline&&subjects.size){baseline.verifiedAt=new Date().toISOString();changes.set('study-guides/catalogue-baseline.json',jsonText(baselineText,baseline));}
  const removedReadings=[],removedGuides=new Set();
  const names=(await list('study-guides')).filter(name=>name==='editorial.json'||name.endsWith('-batch.json')).sort();
  for(const name of names){
    const file='study-guides/'+name,original=await text(file),data=JSON.parse(original);let changed=false;
    const next=[];
    for(const guide of data.subjects){
      const notes=[];let updated=guide;
      const subject=subjects.get(guide.id);
      if(subject){
        const reviewFile=guide.selection&&'study-guides/'+guide.selection.review,reviewText=reviewFile&&await text(reviewFile);
        // Authorized wording is looked up before reconciling, which is synchronous.
        const flags=new Map();
        for(const g of groupSelections(studyGuideSelections(subject.after.selections),subject.after.sources))flags.set(keyOf(g),await authorized(g));
        const authority=new Map();
        if(guide.selection&&authorized.selection)for(const s of studyGuideSelections(subject.after.selections)){const evidence=await authorized.selection(s);if(evidence)authority.set(s.id,evidence);}
        const result=reconcileGuide(guide,subject.before,subject.after,{item,cause,review:reviewText&&JSON.parse(reviewText),authorized:g=>flags.get(keyOf(g))??false,authority});
        notes.push(...result.notes);updated=result.guide;
        for(const x of guide.order)if(!updated?.order.some(y=>y.key===x.key))removedReadings.push({slug:guide.slug,key:x.key});
        if(updated&&reviewFile&&JSON.stringify(result.review)!==JSON.stringify(JSON.parse(reviewText))){
          const output=jsonText(reviewText,result.review);changes.set(reviewFile,output);updated.selection.sha256=sha(Buffer.from(output,'utf8'));
        }
        if(!updated)removedGuides.add(guide.slug);
      }
      if(updated){
        const neighbors=updated.neighbors.map(n=>({...n,evidence:n.evidence.filter(e=>!evidenceGone(n.id,e))}));
        for(const [i,n] of neighbors.entries())if(n.evidence.length!==updated.neighbors[i].evidence.length&&!n.evidence.length)notes.push(`Invitation to a neighboring subject removed (its evidence quotations were deleted): ${n.invitation}`);
        if(JSON.stringify(neighbors)!==JSON.stringify(updated.neighbors)){updated=updated===guide?structuredClone(guide):updated;updated.neighbors=neighbors.filter(n=>n.evidence.length);}
        next.push(updated);
      }
      if(updated!==guide)changed=true;
      if(notes.length)guides.push({slug:guide.slug,title:guide.displayTitle,notes});
    }
    if(changed)changes.set(file,jsonText(original,{...data,subjects:next}));
  }
  const contextText=await text('study-guides/sentence-context.json');
  const deletedSources=new Set(removedSources);
  if(contextText){
    const context=JSON.parse(contextText);
    const entries=context.entries.filter(x=>!deletedSources.has(x.source)&&!removedGuides.has(x.slug)&&!removedReadings.some(r=>r.slug===x.slug&&r.key===x.key));
    if(entries.length!==context.entries.length)changes.set('study-guides/sentence-context.json',jsonText(contextText,{...context,entries}));
  }
  const paragraphsText=await text('study-guides/sentence-paragraphs.json');
  if(paragraphsText){
    const paragraphs=JSON.parse(paragraphsText);
    let changed=false;
    for(const source of deletedSources)if(paragraphs.sources&&Object.hasOwn(paragraphs.sources,source)){delete paragraphs.sources[source];changed=true;}
    if(changed)changes.set('study-guides/sentence-paragraphs.json',formatSentenceParagraphs(paragraphs).replaceAll('\n',paragraphsText.includes('\r\n')?'\r\n':'\n'));
  }
  return {changes,guides};
}

// Everything the deletion changes, from the repository files and the site.
export async function planDeletion({id,read,list,site}){
  const text=async name=>{const bytes=await read(name);if(!bytes)throw Error(`The repository has no ${name}.`);return bytes.toString('utf8');};
  const [record,passages]=await Promise.all([site('data/'+recordFilename(id)),site('subjects/passages/'+recordFilename(id))]);
  const archive=JSON.parse(gunzipSync(await read(publicExtractArchive)));
  const decisionsText=await text('data/extract-review-decisions.json'),editsText=await text('data/subject-edits.json');
  const decisions=JSON.parse(decisionsText),edits=JSON.parse(editsText);
  // Subjects that can hold a quotation from the item: those with a published
  // passage from it, and those with a quotation citing it or reviewed onto it.
  const subjectOf=new Map(archive.selections.map(s=>[s.id,s.subject])),candidates=new Set();
  const onItem=value=>JSON.stringify(value).includes('"source":'+JSON.stringify(id));
  for(const s of archive.selections)if(s.suppliedIds?.includes(id))candidates.add(s.subject);
  for(const entries of [decisions.matches,decisions.hints,edits.matches])for(const [selection,value] of Object.entries(entries||{}))if(subjectOf.has(selection)&&onItem(value))candidates.add(subjectOf.get(selection));
  for(const p of Object.values(passages?.passages||{}))for(const subject of p.subjects)candidates.add(subject);
  const baseline=JSON.parse((await read('study-guides/catalogue-baseline.json'))?.toString('utf8')||'null');
  const subjects=new Map(),removed=new Set(),summary=[];
  const subjectIds=[...candidates].sort(),compilations=await siteFiles(site,subjectIds.map(subjectId=>`subjects/${subjectId}.json.gz`));
  for(const [index,subjectId] of subjectIds.entries()){
    const before=compilations[index];
    if(!before)throw Error(`The website has no compilation for subject ${subjectId}.`);
    const expected=baseline?.subjects[subjectId]?.fingerprint;
    if(expected&&catalogueFingerprint(before.selections)!==expected)throw Error(`The published quotations for “${before.subject.name}” differ from the reviewed study-guide baseline. Publish or resolve that change before deleting an item. Nothing was changed.`);
    const gone=new Set([...removedSelections(id,before.selections)].filter(x=>subjectOf.has(x)));
    // A quotation kept for another record loses its suggested candidates from this item.
    const hinted=s=>decisions.hints?.[s.id]&&s.candidates?.some(c=>c.source===id);
    const kept=before.selections.filter(s=>!gone.has(s.id));
    if(!gone.size&&!kept.some(hinted))continue;
    const after={...before,selections:kept.map(s=>hinted(s)?{...s,candidates:s.candidates.filter(c=>c.source!==id)}:s)};
    subjects.set(subjectId,{before,after});
    for(const x of gone)removed.add(x);
    const shown=before.selections.filter(s=>gone.has(s.id)&&isPublicSelection(s)).length;
    summary.push({id:subjectId,name:before.subject.name,quotations:shown,removed:before.selections.filter(s=>gone.has(s.id)).length});
  }
  const changes=new Map();
  // The public archive physically omits deleted quotations (as archive-extracts
  // does), and their IDs are excluded before matching, so a rebuild cannot
  // restore them.
  if(removed.size){
    archive.selections=archive.selections.filter(s=>!removed.has(s.id));
    archive.report.deletedSelections=[...new Set([...(archive.report.deletedSelections||[]),...removed])];
    changes.set(publicExtractArchive,gzipSync(JSON.stringify(archive),{level:9}));
  }
  const decisionsBefore=JSON.stringify(decisions),deleted=new Set(decisions.deletedIds||[]);
  if(removed.size)decisions.deletedIds=[...(decisions.deletedIds||[]),...[...removed].filter(x=>!deleted.has(x)).sort()];
  for(const x of removed)for(const field of ['matches','notes','hints'])if(decisions[field])delete decisions[field][x];
  for(const hint of Object.values(decisions.hints||{}))if(hint.candidates?.some(c=>c.source===id)){hint.candidates=hint.candidates.filter(c=>c.source!==id);hint.referenceIds=(hint.referenceIds||[]).filter(x=>x!==id);}
  if(JSON.stringify(decisions)!==decisionsBefore)changes.set('data/extract-review-decisions.json',jsonText(decisionsText,decisions));
  let editsChanged=false;
  for(const x of removed)if(edits.matches&&Object.hasOwn(edits.matches,x)){delete edits.matches[x];editsChanged=true;}
  if(editsChanged)changes.set('data/subject-edits.json',jsonText(editsText,edits));
  const reviewText=(await read('data/subject-review-candidates.json'))?.toString('utf8');
  if(reviewText){
    const review=JSON.parse(reviewText);let reviewChanged=false;
    for(const [selection,list] of Object.entries(review.selections||{})){
      if(removed.has(selection)){delete review.selections[selection];reviewChanged=true;continue;}
      const kept=list.filter(c=>c.source!==id);if(kept.length!==list.length){review.selections[selection]=kept;reviewChanged=true;}
    }
    if(reviewChanged)changes.set('data/subject-review-candidates.json',jsonText(reviewText,review));
  }
  const guides=await updateGuides({read,list,item:id,subjects,evidenceGone:(_,selection)=>removed.has(selection)});
  for(const [name,value] of guides.changes)changes.set(name,value);
  return {id,published:Boolean(record),title:record?.title||'',subjects:summary,quotations:removed.size,removedIds:[...removed].sort(),guides:guides.guides,changes};
}
