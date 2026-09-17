import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync,gunzipSync} from 'node:zlib';
import {parseCsv,parseText} from '../src/text.mjs';
import {digest,selectionBlocks,parseSelection,prepareSource,Matcher,hierarchyEdges,validateConfirmedMatch} from './subject-core.mjs';
import {relationKey} from '../src/subject-relations.mjs';
const zip=(file,data)=>fs.writeFile(file,gzipSync(JSON.stringify(data),{level:9}));
export async function buildSubjects(root,out,dataset){
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
  const sourceFiles=(await fs.readdir(path.join(root,'translated_texts - copy'))).filter(f=>f.endsWith('.txt')).sort(),sources=[];
  for(const file of sourceFiles){const bytes=await fs.readFile(path.join(root,'translated_texts - copy',file));let text;try{text=new TextDecoder('utf8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('windows-1252').decode(bytes);report.encodingFallbacks.push(file);}sources.push(prepareSource(file.slice(0,-4),digest(bytes),parseText(text,'en').paragraphs));}
  console.log(`Subject matching: indexing ${sources.length} English sources`);
  const matcher=new Matcher(sources),bySubject=new Map(),usedEdits=new Set(),memo=new Map();
  for(const subject of active){
    const input=snapshot.categories[subject.categoryId];if(!input){report.missingCategories.push(subject.id);if(!sourceExceptions[subject.categoryId])throw Error('Unexpected missing subject response: '+subject.name);subject.selections=0;subject.matched=0;subject.unavailable=sourceExceptions[subject.categoryId].reason;bySubject.set(subject.id,{subject,selections:[],notices:[],unavailable:subject.unavailable});continue;}
    const selections=[],notices=[];let ordinal=0;
    for(const [groupIndex,group] of JSON.parse(input.raw).entries())for(const [quoteIndex,quote] of group.quotes.entries()){
      for(const block of selectionBlocks(quote.text)){
        if(block.segment===1)report.splitSelectionBlocks++;
        const selection=parseSelection(block);ordinal++;
        if(selection.kind==='notice'){notices.push({...selection,quoteId:quote.id});report.notices++;continue;}
        const id=digest(`${subject.id}:${quote.id}:${quoteIndex}:${block.position}:${block.raw}`).slice(0,24);
        const provenance={subjectFilename:'14-colors_and_hyperlinks.csv',subjectRow:subject.row,subjectUrl:subject.url,snapshotVersion:report.snapshotVersion,quoteId:quote.id,quoteIndex,groupIndex,selectionParagraph:ordinal,blockPosition:block.position,segment:block.segment,sourceBlockRaw:block.parentRaw,work:quote.work||'',provis:quote.provis||'',originalCategories:quote.categories||[]};
        const key=JSON.stringify([selection.excerpt,selection.suppliedIds]);let match=memo.get(key);if(!match){match=matcher.match(selection);memo.set(key,match);}
        match=structuredClone(match);
        const edit=edits.matches[id];if(edit){usedEdits.add(id);if(edit.status==='rejected')match={...match,status:'rejected'};else if(edit.status==='confirmed'){
          const chosen=validateConfirmedMatch(edit.candidate,matcher.sources);
          match={...match,status:'confirmed',candidates:[chosen],review:edit.note||''};
        }else throw Error('Invalid editorial status '+id);}
        report.selections++;report.counts[match.status]++;
        const s={id,subject:subject.id,original:selection.text,raw:selection.raw,excerpt:selection.excerpt,suppliedIds:selection.suppliedIds,provenance,...match};
        selections.push(s);
      }
    }
    subject.selections=selections.length;subject.matched=selections.filter(s=>['exact','normalized','confirmed'].includes(s.status)).length;
    bySubject.set(subject.id,{subject,selections,notices});console.log(`Matched ${bySubject.size}/${active.length}: ${subject.name} (${subject.matched}/${subject.selections})`);
  }
  report.sourceExceptions=sourceExceptions;
  report.unusedMatchEdits=Object.keys(edits.matches).filter(id=>!usedEdits.has(id));
  await writeSubjectOutputs({root,out,dataset,subjects,bySubject,report,edits,hierarchyHtml:snapshot.hierarchy,limit});
}
// Derive the shared passage registry and graph from the final, reviewable mappings.
// Keeping this separate also permits validation/correction of imported mappings
// without repeating corpus-wide candidate retrieval.
export async function writeSubjectOutputs({root,out,dataset,subjects,bySubject,report,edits,hierarchyHtml,limit=subjects.length}){
  const base=path.join(out,dataset,'subjects');await fs.mkdir(base,{recursive:true});await fs.mkdir(path.join(base,'passages'),{recursive:true});
  const catalog=JSON.parse(gunzipSync(await fs.readFile(path.join(out,dataset,'catalog.json.gz'))));const metadata=new Map(catalog.map(r=>[r.id,r]));
  const passages=new Map();report.duplicateRanges=0;report.overlappingRanges=0;report.selections=0;
  for(const status of Object.keys(report.counts))report.counts[status]=0;
  for(const data of bySubject.values()){
    const subject=data.subject;subject.matched=0;
    for(const s of data.selections){
      delete s.passage;delete s.otherSubjects;report.selections++;report.counts[s.status]++;
        if(['exact','normalized','confirmed'].includes(s.status)){
          const c=s.candidates[0],passageId=digest(JSON.stringify([c.source,c.version,c.ranges.map(r=>[r.paragraph,r.start,r.end])])).slice(0,24);s.passage=passageId;
          if(!passages.has(passageId))passages.set(passageId,{id:passageId,...c,subjects:[],selections:[]});else report.duplicateRanges++;
          const p=passages.get(passageId);if(!p.subjects.includes(subject.id))p.subjects.push(subject.id);p.selections.push({id:s.id,subject:subject.id});
        }

      if(s.passage)subject.matched++;
    }
    subject.selections=data.selections.length;
  }
  const units=new Map(),sets=new Map(subjects.map(s=>[s.id,new Set()]));
  for(const p of passages.values())for(const r of p.ranges){const key=`${p.source}:${r.paragraph}`;if(!units.has(key))units.set(key,[]);units.get(key).push({passage:p,range:r});for(const s of p.subjects)sets.get(s)?.add(key);}
  const shared=new Map();for(const [unit,entries] of units){const pairs=new Set();for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){const a=entries[i],b=entries[j];if(a.passage.id!==b.passage.id&&Math.min(a.range.end,b.range.end)>Math.max(a.range.start,b.range.start)){report.overlappingRanges++;for(const s of a.passage.subjects)for(const t of b.passage.subjects)if(s!==t)pairs.add([s,t].sort().join(':'));}}for(const {passage} of entries)for(const s of passage.subjects)for(const t of passage.subjects)if(s<t)pairs.add(s+':'+t);for(const key of pairs)shared.set(key,(shared.get(key)||0)+1);}
  const hierarchy=hierarchyEdges(hierarchyHtml,subjects);const edges=[...hierarchy.edges];
  for(const [key,n] of shared){const [source,target]=key.split(':'),score=n/(sets.get(source).size+sets.get(target).size-n);if(n>=2)edges.push({source,target,type:'related',status:'suggested',score:Number(score.toFixed(5)),sharedParagraphs:n,provenance:'Overlapping accepted ranges; Jaccard over distinct selected source paragraphs'});}
  for(const edit of edits.relationships){if(!sets.has(edit.source)||!sets.has(edit.target)||edit.source===edit.target||!['broader','narrower','related'].includes(edit.type)||!['accepted','rejected'].includes(edit.status))throw Error('Invalid relationship edit');for(let i=edges.length-1;i>=0;i--)if(relationKey(edges[i])===relationKey(edit))edges.splice(i,1);edges.push({...edit,provenance:edit.note||'Editorial decision'});}
  for(const data of bySubject.values()){
    const sourceIds=new Set(data.selections.flatMap(s=>[...s.candidates.map(c=>c.source),...s.suppliedIds]));
    data.sources=Object.fromEntries([...sourceIds].map(id=>[id,metadata.get(id)]));
    for(const s of data.selections)if(s.passage)s.otherSubjects=passages.get(s.passage).subjects;
    await zip(path.join(base,data.subject.id+'.json.gz'),data);
  }
  for(const p of passages.values())await zip(path.join(base,'passages',p.id+'.json.gz'),p);
  for(const file of await fs.readdir(path.join(base,'passages')))if(/^[a-f\d]{24}\.json\.gz$/.test(file)&&!passages.has(file.slice(0,24)))await fs.unlink(path.join(base,'passages',file));
  report.passages=passages.size;report.relationships={imported:edges.filter(e=>e.status==='imported').length,suggested:edges.filter(e=>e.status==='suggested').length,reviewed:edits.relationships.length};
  report.emptySubjects=subjects.filter(s=>!s.unavailable&&s.selections===0).map(s=>({id:s.id,name:s.name}));
  await zip(path.join(base,'index.json.gz'),{subjects,edges,report,hierarchy:hierarchy.nodes});
  await fs.writeFile(path.join(base,'report.json'),JSON.stringify(report,null,2));
  await fs.writeFile(path.join(root,limit===subjects.length?'subject-import-report.json':'subject-prototype-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report.counts));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const root=process.cwd();const stats=JSON.parse(await fs.readFile('dist/stats.json','utf8'));await buildSubjects(root,path.join(root,'dist'),stats.dataset);}
