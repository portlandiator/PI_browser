import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync,gunzipSync} from 'node:zlib';
import {parseCsv,parseText} from '../src/text.mjs';
import {digest,prepareSource,Matcher,hierarchyEdges,validateConfirmedMatch} from './subject-core.mjs';
import {relationKey} from '../src/subject-relations.mjs';
import {recordFilename} from '../src/record-file.mjs';
import {writeReviewIndex} from './build-passage-review.mjs';
import {parseSubjectSummary} from '../src/subject-summary.mjs';
import {readExtractInputs,mergeExtracts,writeExtractReview,matchExtract} from './extract-inputs.mjs';
import {isPublicSelection,hasPublicMatch,isVerifiedMatch} from '../src/selection-policy.mjs';
import {decodeSource} from './source-encoding.mjs';
import {codeFingerprint} from './deployment-cache.mjs';
import {trackedMatcher,reusableMatches,loadMatchCache,saveMatchCache} from './subject-match-cache.mjs';
const zip=(file,data)=>fs.writeFile(file,gzipSync(JSON.stringify(data),{level:9}));
export async function buildSubjects(root,out,dataset,{reuseMatches=false}={}){
  const snapshotBytes=await fs.readFile(path.join(root,'data/subjects-snapshot.json.gz'));
  const snapshot=JSON.parse(gunzipSync(snapshotBytes));
  const csv=await fs.readFile(path.join(root,'14-colors_and_hyperlinks.csv'),'utf8');
  const edits=JSON.parse(await fs.readFile(path.join(root,'data/subject-edits.json'),'utf8'));
  const sourceExceptions=JSON.parse(await fs.readFile(path.join(root,'data/subject-source-exceptions.json'),'utf8'));
  const seenSubjects=new Set(),duplicateSubjectUrls=[];
  const subjects=parseCsv(csv).map((row,i)=>{const categoryId=new URLSearchParams(new URL(row.hyperlink).hash.replace(/^#\??/,'')).get('category');if(!/^[a-f\d]{32}$/i.test(categoryId)||!/^#[a-f\d]{6}$/i.test(row.color))throw Error('Invalid subject CSV row '+(i+2));const duplicate=seenSubjects.has(categoryId),id=duplicate?categoryId+'-'+digest(row.subject).slice(0,8):categoryId;if(duplicate)duplicateSubjectUrls.push({row:i+2,categoryId,name:row.subject,id});seenSubjects.add(categoryId);if(!['http:','https:'].includes(new URL(row.hyperlink).protocol))throw Error('Subject links must use HTTP(S)');return {id,categoryId,name:row.subject,color:row.color,url:row.hyperlink,row:i+2};});
  const limit=Number(process.env.SUBJECT_LIMIT)||subjects.length,active=subjects.slice(0,limit);
  const report={format:1,snapshotVersion:digest(snapshotBytes),snapshotDate:snapshot.fetchedAt,coordinateSystem:'UTF-16 offsets in unmodified rendered English paragraph plain text; source archive retains original bytes and markup',subjects:subjects.length,processedSubjects:active.length,selections:0,notices:0,counts:{exact:0,normalized:0,approximate:0,ambiguous:0,unmatched:0,confirmed:0,rejected:0},encodingFallbacks:[],duplicateRanges:0,overlappingRanges:0,missingCategories:[],unusedMatchEdits:[]};
  report.duplicateSubjectUrls=duplicateSubjectUrls;report.splitSelectionBlocks=0;
  const decisions=JSON.parse(await fs.readFile(path.join(root,'data/extract-review-decisions.json'),'utf8'));
  const inputs=await readExtractInputs(root,subjects,decisions);
  report.extractImport=inputs.report;report.snapshotVersion=inputs.version;report.snapshotDate=null;
  report.selectionSource='Local Inventory and Evernote extract files; no website quotations';
  const sourceFiles=(await fs.readdir(path.join(root,'translated_texts - copy'))).filter(f=>f.endsWith('.txt')).sort(),sources=[];
  for(const file of sourceFiles){const bytes=await fs.readFile(path.join(root,'translated_texts - copy',file));const {text,fallback}=decodeSource(bytes);if(fallback)report.encodingFallbacks.push(file);sources.push(prepareSource(file.slice(0,-4),digest(bytes),parseText(text,'en').paragraphs));}
  // Matches of unchanged texts are reused from the previous build (subject-match-cache.mjs);
  // the collection-wide index is built only when something has to be matched again.
  const sourceMap=new Map(sources.map(s=>[s.id,s])),versions=new Map(sources.map(s=>[s.id,s.version]));
  const matchCode=await codeFingerprint(root,['scripts/build-subjects.mjs']);
  let index;
  const tracked=trackedMatcher(sourceMap,()=>{if(!index){console.log(`Subject matching: indexing ${sources.length} English sources`);index=new Matcher(sources);}return index;});
  const matcher=tracked.matcher,bySubject=new Map(),usedEdits=new Set(),used=new Map();
  let memo=new Map();
  const previous=reuseMatches?await loadMatchCache(out,matchCode):null;
  if(previous){
    const reusable=reusableMatches(previous,versions,sourceMap);memo=reusable.entries;
    console.log(`Subject matching: ${reusable.changed.size} changed English sources; reusing ${memo.size} of ${previous.entries.size} earlier matches`);
  }else console.log('Subject matching: matching every extract');
  let matched=0;
  for(const subject of active){
    const selections=[],notices=[];
    for(const selection of inputs.bySubject.get(subject.id)){
        const {id}=selection;
        const key=JSON.stringify([selection.excerpt,selection.suppliedIds,selection.outsideAuthor]);let entry=memo.get(key);if(!entry){entry=tracked.run(matcher=>matchExtract(selection,matcher));memo.set(key,entry);matched++;}
        used.set(key,entry);let match=structuredClone(entry.match);
        const hint=decisions.hints?.[id]; if(hint)match={status:'unmatched',candidates:hint.candidates.map(c=>validateConfirmedMatch(c,matcher.sources)),reason:hint.reason,referenceIds:hint.referenceIds};
        const reviewed=decisions.matches[id];
        if(reviewed){if(!['confirmed','approximate'].includes(reviewed.status))throw Error('Invalid extract review status '+id);const chosen=validateConfirmedMatch(reviewed.candidate,matcher.sources);match={status:reviewed.status,candidates:[chosen],review:reviewed.evidence};}

        const edit=edits.matches[id];if(edit){usedEdits.add(id);if(edit.status==='rejected')match={...match,status:'rejected'};else if(edit.status==='confirmed'){
          const chosen=validateConfirmedMatch(edit.candidate,matcher.sources);
          match={...match,status:'confirmed',candidates:[chosen],review:edit.note||''};
        }else throw Error('Invalid editorial status '+id);}
        report.selections++;report.counts[match.status]++;
        const s={...selection,...match};
        selections.push(s);
    }
    const merged=mergeExtracts(selections,inputs.report.duplicates);
    subject.selections=merged.filter(s=>s.status!=='rejected').length;subject.matched=merged.filter(s=>['exact','normalized','confirmed'].includes(s.status)).length;
    bySubject.set(subject.id,{subject,selections:merged,notices});console.log(`Matched ${bySubject.size}/${active.length}: ${subject.name} (${subject.matched}/${subject.selections})`);
  }
  console.log(`Subject matching: matched ${matched} extracts, reused ${used.size-matched}`);
  // A partial run (SUBJECT_LIMIT) must not replace the matches of the whole collection.
  if(limit===subjects.length)await saveMatchCache(out,matchCode,versions,used);
  report.sourceExceptions=sourceExceptions;
  report.unusedMatchEdits=Object.keys(edits.matches).filter(id=>!usedEdits.has(id));
  await writeExtractReview(root,bySubject,inputs.report);
  await writeSubjectOutputs({root,out,dataset,subjects,bySubject,report,edits,hierarchyHtml:snapshot.hierarchy,limit});
}
// Derive the shared passage registry and graph from the final, reviewable mappings.
// Keeping this separate also permits validation/correction of imported mappings
// without repeating corpus-wide candidate retrieval.
export async function writeSubjectOutputs({root,out,dataset,subjects,bySubject,report,edits,hierarchyHtml,limit=subjects.length,summaryLoader}){
  const base=path.join(out,dataset,'subjects');await fs.mkdir(base,{recursive:true});await fs.mkdir(path.join(base,'passages'),{recursive:true});
  const catalog=JSON.parse(gunzipSync(await fs.readFile(path.join(out,dataset,'catalog.json.gz'))));const metadata=new Map(catalog.map(r=>[r.id,r]));
  const passages=new Map(),verifiedSubjects=new Map();report.publicSelections=0;report.duplicateRanges=0;report.overlappingRanges=0;report.selections=0;
  for(const status of Object.keys(report.counts))report.counts[status]=0;
  for(const data of bySubject.values()){
    const subject=data.subject;subject.matched=0;
    for(const s of data.selections){
      s.catalogIds=s.suppliedIds.filter(id=>metadata.has(id));
      delete s.passage;delete s.otherSubjects;report.selections++;report.counts[s.status]++;
        if(hasPublicMatch(s)){
          const c=s.candidates[0],passageId=digest(JSON.stringify([c.source,c.version,c.ranges.map(r=>[r.paragraph,r.start,r.end])])).slice(0,24);s.passage=passageId;
          if(!passages.has(passageId))passages.set(passageId,{id:passageId,...c,subjects:[],selections:[]});else report.duplicateRanges++;
          if(isVerifiedMatch(s)){if(!verifiedSubjects.has(passageId))verifiedSubjects.set(passageId,new Set());verifiedSubjects.get(passageId).add(subject.id);}
          const p=passages.get(passageId);if(!p.subjects.includes(subject.id))p.subjects.push(subject.id);p.selections.push({id:s.id,subject:subject.id});
        }

      if(s.passage)subject.matched++;
    }
    subject.selections=data.selections.filter(isPublicSelection).length;report.publicSelections+=subject.selections;
  }
  const units=new Map(),sets=new Map(subjects.map(s=>[s.id,new Set()]));
  // Approximate references do not supply evidence for suggested subject relationships.
  const graphPassages=[...passages.values()].filter(p=>verifiedSubjects.has(p.id)).map(p=>({...p,subjects:[...verifiedSubjects.get(p.id)]}));
  for(const p of graphPassages)for(const r of p.ranges){const key=`${p.source}:${r.paragraph}`;if(!units.has(key))units.set(key,[]);units.get(key).push({passage:p,range:r});for(const s of p.subjects)sets.get(s)?.add(key);}
  const shared=new Map();for(const [unit,entries] of units){const pairs=new Set();for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){const a=entries[i],b=entries[j];if(a.passage.id!==b.passage.id&&Math.min(a.range.end,b.range.end)>Math.max(a.range.start,b.range.start)){report.overlappingRanges++;for(const s of a.passage.subjects)for(const t of b.passage.subjects)if(s!==t)pairs.add([s,t].sort().join(':'));}}for(const {passage} of entries)for(const s of passage.subjects)for(const t of passage.subjects)if(s<t)pairs.add(s+':'+t);for(const key of pairs)shared.set(key,(shared.get(key)||0)+1);}
  const hierarchy=hierarchyEdges(hierarchyHtml,subjects);const edges=[...hierarchy.edges];
  for(const [key,n] of shared){const [source,target]=key.split(':'),score=n/(sets.get(source).size+sets.get(target).size-n);if(n>=2)edges.push({source,target,type:'related',status:'suggested',score:Number(score.toFixed(5)),sharedParagraphs:n,provenance:'Overlapping accepted ranges; Jaccard over distinct selected source paragraphs'});}
  for(const edit of edits.relationships){if(!sets.has(edit.source)||!sets.has(edit.target)||edit.source===edit.target||!['broader','narrower','related'].includes(edit.type)||!['accepted','rejected'].includes(edit.status))throw Error('Invalid relationship edit');for(let i=edges.length-1;i>=0;i--)if(relationKey(edges[i])===relationKey(edit))edges.splice(i,1);edges.push({...edit,provenance:edit.note||'Editorial decision'});}
  for(const data of bySubject.values()){
    const sourceIds=new Set(data.selections.flatMap(s=>[...s.candidates.map(c=>c.source),...s.suppliedIds]));
    data.summary=summaryLoader?await summaryLoader(data):parseSubjectSummary(await fs.readFile(path.join(root,'subject-summaries',data.subject.name+'.md'),'utf8'),data.subject,subjects);
    data.sources=Object.fromEntries([...sourceIds].map(id=>[id,metadata.get(id)]));
    for(const s of data.selections)if(s.passage)s.otherSubjects=passages.get(s.passage).subjects;
    await zip(path.join(base,data.subject.id+'.json.gz'),data);
  }
  // The Catalog reader needs only a passage's version, ranges and subjects. One
  // file per source (named like its record) keeps the site small and avoids
  // publishing a separate file for each of the ~100,000 passages.
  const passageFiles=new Map();
  for(const p of passages.values()){
    const file=recordFilename(p.source);
    if(!passageFiles.has(file))passageFiles.set(file,{format:2,source:p.source,passages:{}});
    passageFiles.get(file).passages[p.id]={version:p.version,ranges:p.ranges.map(({paragraph,start,end})=>({paragraph,start,end})),subjects:p.subjects};
  }
  for(const [file,data] of passageFiles)await zip(path.join(base,'passages',file),data);
  for(const file of await fs.readdir(path.join(base,'passages')))if(!passageFiles.has(file))await fs.unlink(path.join(base,'passages',file));
  report.passages=passages.size;report.relationships={imported:edges.filter(e=>e.status==='imported').length,suggested:edges.filter(e=>e.status==='suggested').length,reviewed:edits.relationships.length};
  report.emptySubjects=subjects.filter(s=>!s.unavailable&&s.selections===0).map(s=>({id:s.id,name:s.name}));
  await zip(path.join(base,'index.json.gz'),{subjects,edges,report,hierarchy:hierarchy.nodes});
  await zip(path.join(base,'editorial-decisions.json.gz'),edits);
  await writeReviewIndex(base,subjects,bySubject);
  await fs.writeFile(path.join(base,'report.json'),JSON.stringify(report,null,2));
  await fs.writeFile(path.join(root,limit===subjects.length?'subject-import-report.json':'subject-prototype-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report.counts));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const root=process.cwd();const stats=JSON.parse(await fs.readFile('dist/stats.json','utf8'));await buildSubjects(root,path.join(root,'dist'),stats.dataset);}
