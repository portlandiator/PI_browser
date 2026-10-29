import {correctDisplayHtml} from '../src/display-spelling.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {escapeHtml as esc} from '../src/text.mjs';
import {groupSelections, groupedParagraphs} from '../src/subject-groups.mjs';
import {recordFilename} from '../src/record-file.mjs';
import {passageCitation} from '../src/passage-citation.mjs';
import {graphNeighborhood} from '../src/global-graph-layout.mjs';
import {authorizedRanges,isAuthorizedParagraph} from '../src/translation-status.mjs';
import {completeSentenceParagraphs,boundaryConcerns,locateSuppliedParagraphs} from './study-guide-sentences.mjs';
import {studyGuideSelections,verifyCatalogueBaseline} from './study-guide-catalogue.mjs';
import {selectStudyGuideQuotations} from './study-guide-selection.mjs';
import {shortenParagraphs,shortenSupplied} from './study-guide-shortening.mjs';
import {subjectColorStyle} from '../src/subject-colors.mjs';
import {withSourceQuestion} from './study-guide-question-context.mjs';

// Generate against the same versioned records used by the subject reader. A
// changed quotation or subject membership must be reviewed before rebuilding.
export async function buildStudyGuides(root,out,datasetName,{output=path.join(out,'study-guides'),base='../'}={}){
const configDirectory=path.join(root,'study-guides');
const editorial=JSON.parse(await fs.readFile(path.join(configDirectory,'editorial.json'),'utf8'));
let catalogueBaseline;
try{catalogueBaseline=JSON.parse(await fs.readFile(path.join(configDirectory,'catalogue-baseline.json'),'utf8'));}
catch(error){if(error.code!=='ENOENT')throw error;}
let sentenceContext=[];
try{sentenceContext=JSON.parse(await fs.readFile(path.join(configDirectory,'sentence-context.json'),'utf8')).entries;}
catch(error){if(error.code!=='ENOENT')throw error;}
const batchNames=(await fs.readdir(configDirectory)).filter(name=>name.endsWith('-batch.json')).sort();
const batches=await Promise.all(batchNames.map(async name=>({name,...JSON.parse(await fs.readFile(path.join(configDirectory,name),'utf8'))})));
batches.sort((a,b)=>(a.batchNumber??0)-(b.batchNumber??0)||a.name.localeCompare(b.name));
const latestBatch=batches.at(-1);
let newest=new Set();
for(const batch of batches){
  editorial.subjects.push(...batch.subjects);
  if(batch===latestBatch)newest=new Set(batch.subjects.map(s=>s.id));
}
editorial.subjects.sort((a,b)=>Number(newest.has(b.id))-Number(newest.has(a.id)));
if(!/^collections\/[\w-]+\/$/.test(datasetName))throw Error('Invalid dataset');
editorial.dataset=datasetName;
if(new Set(editorial.subjects.map(s=>s.id)).size!==editorial.subjects.length||new Set(editorial.subjects.map(s=>s.slug)).size!==editorial.subjects.length)throw Error('Duplicate study guide');
await fs.mkdir(output,{recursive:true});
const dataset=path.join(out,datasetName);
// Records recur across many guides. Keep a bounded build-local cache so a
// collection-wide rebuild does not repeatedly decompress the same source.
const recordCache=new Map();let recordCacheBytes=0;
const read=async name=>{
  if(recordCache.has(name)){const hit=recordCache.get(name);recordCache.delete(name);recordCache.set(name,hit);return hit.value;}
  const bytes=gunzipSync(await fs.readFile(path.join(dataset,name))),value=JSON.parse(bytes);
  if(name.startsWith('data/')&&bytes.length<=64*1024*1024){
    recordCache.set(name,{value,bytes:bytes.length});recordCacheBytes+=bytes.length;
    while(recordCache.size>512||recordCacheBytes>64*1024*1024){const oldest=recordCache.keys().next().value;recordCacheBytes-=recordCache.get(oldest).bytes;recordCache.delete(oldest);}
  }
  return value;
};
const index=await read('subjects/index.json.gz');
const subjectMap=new Map(index.subjects.map(s=>[s.id,s]));
// Validate all authored subjects before replacing any previously built page.
const subjectData=new Map();
const selectedData=new Map();
for(const config of editorial.subjects){
  const data=await read(`subjects/${config.id}.json.gz`);
  verifyCatalogueBaseline(data,catalogueBaseline);
  subjectData.set(config.id,data);
  selectedData.set(config.id,await selectStudyGuideQuotations(data,config.selection,{
    readReview:name=>fs.readFile(path.join(configDirectory,name)),
    readRecord:id=>read('data/'+recordFilename(id))
  }));
}
const linkSubject=id=>base+'subjects.html?subject='+encodeURIComponent(id);
const digest=value=>createHash('sha256').update(value).digest('hex');
const sourceUrl=(id,subject,paragraph)=>`${base}?id=${encodeURIComponent(id)}&subject=${encodeURIComponent(subject)}#p-en-${paragraph}`;
const safeUrl=value=>{const url=new URL(value);if(!['https:','http:'].includes(url.protocol))throw Error('Unsafe link');return esc(url.href);};
const withReferences=(text,refs)=>text.split(/(\[\d+\])/).map(part=>{
  const match=/^\[(\d+)\]$/.exec(part);if(!match)return esc(part);
  const ref=refs[Number(match[1])-1];if(!ref)throw Error('Unknown reference');
  return `<sup><a href="${safeUrl(ref.url)}" aria-label="${esc(ref.label)}">${part}</a></sup>`;
}).join('');
// The masthead and About dialog are Catalog view's own, so every main view
// shares one header; links are rebased and Study guides is the current view.
const mainPage=await fs.readFile(path.join(root,'src/index.html'),'utf8');
const sitePart=pattern=>{const match=pattern.exec(mainPage);if(!match)throw Error('Catalog view masthead not found');return match[0].replaceAll('href="./',`href="${esc(base)}`);};
const studyGuidesLink=`<a href="${esc(base)}study-guides/index.html">Study guides</a>`;
const masthead=sitePart(/<header class="masthead">[\s\S]*?<\/header>/).replace(/ class="active" aria-current="page"/g,'');
if(!masthead.includes(studyGuidesLink))throw Error('Catalog view masthead has no Study guides link');
const header=masthead.replace(studyGuidesLink,'<a href="index.html" class="active" aria-current="page">Study guides</a>');
const about=sitePart(/<dialog id="about-dialog"[\s\S]*?<\/dialog>/).replace('<dialog id="about-dialog"',`<dialog id="about-dialog" data-stats="${esc(base)}about-stats.mjs"`);
// Follow the main page's saved light or dark choice, before styles paint.
const theme=`<script>(()=>{const root=document.documentElement,apply=value=>{root.dataset.theme=value==='dark'?'dark':'light';};let saved;try{saved=localStorage.getItem('pi-theme');}catch{}apply(saved);addEventListener('storage',event=>{if(event.key==='pi-theme')apply(event.newValue);});})();</script>`;
const document=(title,body,active,pdf=false)=>correctDisplayHtml(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#203a32"><title>${esc(title)}${pdf?' · Study guide':''} · Partial Inventory browser</title><link rel="icon" href="${esc(base)}favicon.svg">${theme}<link rel="stylesheet" href="pilot.css"><script src="site.js" defer></script>${pdf?'<script src="pilot-view.js" defer></script>':''}${active==='index'?'<script src="guide-index.js" defer></script>':''}</head><body${pdf?' class="pdf-view"':''}><a class="skip" href="#main">Skip to reading</a>${header}<main id="main"${active==='index'?' class="reading-room shore-banner"':''}>${body}</main><footer>Study guide sample · Introductions, sequence notes, and questions are editorial contributions.</footer>${about}</body></html>`);
const validation={format:1,dataset:editorial.dataset,editorialSha256:digest(JSON.stringify(editorial)),subjects:[]};
const exportData={format:1,dataset:editorial.dataset,subjects:[]};
// Subject view shows each guide's first reading beside the graph, as plain paragraphs.
const openings={};
const cards=[];
let thematicOrder=new Map();
try{thematicOrder=new Map(JSON.parse(await fs.readFile(path.join(root,'src/subject-order.json'),'utf8')).groups.flatMap(g=>g.subjects).map((name,i)=>[name,i]));}
catch(error){if(error.code!=='ENOENT')throw error;}
const boundaryReview=[];
for(const config of editorial.subjects){
  if(!/^[a-z]+$/.test(config.slug))throw Error('Invalid slug');
  if(config.introduction.includes('\n'))throw Error('Expected a single introductory paragraph');
  const data=subjectData.get(config.id);
  const selections=selectedData.get(config.id);
  const candidateCount=studyGuideSelections(data.selections).length;
  const groups=groupSelections(selections,data.sources);
  // An editor may omit a reading entry from the published guide; its quotations
  // stay in the reviewed selection, so coverage is still checked on every entry.
  const shownOrder=config.order.filter(x=>!x.omitted);
  if(config.order.some(x=>'omitted' in x&&x.omitted!==true))throw Error(`Invalid omitted reading: ${config.slug}`);
  if(!shownOrder.length)throw Error(`Every reading is omitted: ${config.slug}`);
  const key=g=>g.source?'source:'+g.source:'selection:'+g.id;
  const groupMap=new Map(groups.map(g=>[key(g),g]));
  if(config.order.length!==groups.length||new Set(config.order.map(x=>x.key)).size!==groups.length||config.order.some(x=>!groupMap.has(x.key)))throw Error(`Order does not cover every group exactly once: ${config.slug}`);
  // Count the quotations a reader sees after source grouping, the stricter limit.
  const maxQuestions=Math.min(6,Math.max(0,shownOrder.length-1));
  if(config.questions.length<Math.min(3,maxQuestions)||config.questions.length>maxQuestions)throw Error(`Questions must be fewer than quotations: ${config.slug}`);
  let reachedUnlinked=false;
  for(const g of config.order.map(x=>groupMap.get(x.key))){if(!g.source)reachedUnlinked=true;else if(reachedUnlinked)throw Error('Unlinked quotations must follow linked groups');}
  // Authorized wording is never omitted: not a linked passage whose chosen
  // quotation is authorized, nor a supplied quotation reviewed as mandatory.
  const omittedIds=[];
  let review;
  for(const x of config.order.filter(x=>x.omitted)){
    const g=groupMap.get(x.key),label=`${config.slug} reading ${config.order.indexOf(x)+1}`;
    if(g.source){
      const record=await read('data/'+recordFilename(g.source));
      const authorization=authorizedRanges(record.metadata?.Authorized);
      if(groupedParagraphs(g).some(p=>isAuthorizedParagraph(authorization,p.number)))throw Error(`Omitted reading has authorized wording: ${label}`);
    }else if(config.selection){
      review??=JSON.parse(await fs.readFile(path.join(configDirectory,config.selection.review),'utf8'));
      if(g.selections.some(s=>(review.importedAuthorityReview||[]).some(r=>r.id===s.id&&r.mandatoryAuthorized===true)))throw Error(`Omitted reading has authorized wording: ${label}`);
    }
    omittedIds.push(...g.selections.map(s=>s.id));
  }
  const ordered=shownOrder.map(x=>groupMap.get(x.key));
  const shownSelections=ordered.reduce((n,g)=>n+g.selections.length,0);
  // The PDF view hides source context, so its pages are published without it.
  const rendered=[],printed=[],compiled=[];
  let paragraphCount=0,rangeCount=0;
  for(const [position,g] of ordered.entries()){
    let quote='',context='',citation='',note='',opening=[],openingSource='';
    const entry={position:position+1,key:key(g),selectionIds:g.selections.map(s=>s.id),source:g.source,paragraphs:[]};
    const shortened=shownOrder[position].shortened,label=`${config.slug} reading ${position+1}`;
    const restoration=sentenceContext.find(x=>x.slug===config.slug&&x.key===key(g));
    if(g.source||restoration){
      const record=await read('data/'+recordFilename(g.source||restoration.source));
      if(record.id!==(g.source||restoration.source))throw Error('Record identity mismatch');
      for(const s of g.source?g.selections:[]){
        const candidate=s.candidates[0];
        if(candidate.version!==record.enVersion)throw Error(`Stale source ${g.source}`);
        for(const range of candidate.ranges){
          const actual=record.en.paragraphs[range.paragraph-1]?.plain.slice(range.start,range.end);
          if(actual!==range.text)throw Error(`Quotation mismatch ${g.source}:${range.paragraph}`);
          rangeCount++;
        }
      }
      const supplied=g.selections[0];
      const reviewedReference=restoration?.referenceBasis==='published-approximate-reference'&&supplied.status==='approximate'&&supplied.candidates?.[0]?.source===record.id&&supplied.candidates[0].version===record.enVersion&&supplied.candidates[0].ranges?.length>0;
      if(restoration&&(restoration.sourceVersion!==record.enVersion||restoration.suppliedSha256!==digest(supplied.original)||!((supplied.suppliedIds||[]).includes(record.id)||reviewedReference)))throw Error(`Stale or uncited sentence context: ${config.slug}`);
      const selected=g.source?groupedParagraphs(g):locateSuppliedParagraphs(record,supplied.excerpt||supplied.original);
      const editorApproved=g.source&&g.selections.every(s=>s.preserveBoundaries===true);
      const sentences=editorApproved?{paragraphs:selected,changed:false,issues:[]}:completeSentenceParagraphs(record,selected);
      if(editorApproved)entry.editorApprovedBoundaries=true;
      if(shownOrder[position].sourceQuestion){
        sentences.paragraphs=withSourceQuestion(record,sentences.paragraphs,shownOrder[position].sourceQuestion,label);
        sentences.changed=true;entry.sourceQuestionAdded=true;
      }
      const authorization=authorizedRanges(record.metadata?.Authorized);
      const paragraphs=shortened?shortenParagraphs(record,sentences.paragraphs,shortened,label):sentences.paragraphs;
      // A shortened passage keeps authorized wording when its chosen quotation has any.
      if(shortened&&selected.some(p=>isAuthorizedParagraph(authorization,p.number))&&!paragraphs.some(p=>isAuthorizedParagraph(authorization,p.number)))throw Error(`Shortened passage omits its authorized wording: ${label}`);
      entry.selectedParagraphs=selected;
      entry.sentenceContextExpanded=sentences.changed;
      entry.boundaryIssues=shortened?paragraphs.flatMap(p=>p.ranges.map(r=>record.en.paragraphs[p.number-1].plain.slice(r.start,r.end))).flatMap(t=>boundaryConcerns(t).map(issue=>({issue,text:t}))):sentences.issues;
      if(shortened)entry.shortened=true;
      if(entry.boundaryIssues.length){
        boundaryReview.push({slug:config.slug,title:config.displayTitle,position:position+1,key:key(g),source:record.id,issues:entry.boundaryIssues,kind:'source wording'});
        note='<p class="meta">The available source contains an omission or incomplete wording; sentence boundaries need review.</p>';
      }
      citation=passageCitation(record,sourceUrl(record.id,config.id,paragraphs[0].number));
      const contexts=[];
      for(const [i,p] of paragraphs.entries()){
        const plain=record.en.paragraphs[p.number-1].plain;
        const parts=p.ranges.map(r=>plain.slice(r.start,r.end));
        const gap=i&&(p.gap||p.number>paragraphs[i-1].number+1)?'… ':'';
        const authorized=isAuthorizedParagraph(authorization,p.number);
        quote+=`<p${authorized?' class="authorized"':''}>${gap}${parts.map(esc).join(' … ')}</p>`;
        opening.push(gap+parts.join(' … '));openingSource=record.id;
        entry.paragraphs.push({number:p.number,ranges:p.ranges,text:parts.join(' … '),authorized});
        paragraphCount++;
      }
      // Source context shows every paragraph of the full passage, marking the kept wording.
      for(const [i,p] of sentences.paragraphs.entries()){
        const plain=record.en.paragraphs[p.number-1].plain;
        const marked=paragraphs.find(x=>x.number===p.number)?.ranges||[];
        const gap=i&&p.number>sentences.paragraphs[i-1].number+1?'… ':'';
        const authorized=isAuthorizedParagraph(authorization,p.number);
        let highlighted='',end=0;
        for(const r of marked){highlighted+=esc(plain.slice(end,r.start))+'<mark>'+esc(plain.slice(r.start,r.end))+'</mark>';end=r.end;}
        highlighted+=esc(plain.slice(end));
        const original=record.paired?record.original.paragraphs[p.number-1]?.plain:null;
        contexts.push(`<div class="context-pair"><div><span class="meta">English · paragraph ${p.number}</span><p${authorized?' class="authorized"':''}>${gap}${highlighted}</p></div>${original?`<div><span class="meta">Original · paragraph ${p.number}</span><p dir="rtl">${gap}${esc(original)}</p></div>`:''}</div>`);
      }
      const hasOriginal=record.original?.paragraphs?.length>0;
      const alignment=record.paired?'Parallel paragraphs follow the source’s matching paragraph counts; this is positional pairing.':hasOriginal?'English and original paragraph counts differ. Read the independent language columns in the full catalogue record.':'Original text unavailable for this record.';
      context=`<details class="context"><summary>Read source context</summary><p class="meta">${esc(alignment)} Translation authorization in catalogue: ${esc(record.metadata?.Authorized||'not declared')}.</p>${contexts.join('')}<a href="${esc(sourceUrl(record.id,config.id,paragraphs[0].number))}">Open full catalogue record ↗</a></details>`;
      entry.sourceVersion=record.enVersion;
      entry.sourceMetadata=record.metadata;
      if(restoration){
        entry.excerpt=supplied.excerpt;entry.original=supplied.original;entry.reference=supplied.reference;
        entry.sentenceContextSource=record.id;
        citation=`<span class="passage-citation">${esc(supplied.reference||record.id)}</span>`;
        note+=`<p class="meta">Sentence context restored from ${reviewedReference?'the reviewed catalogue reference':'the explicitly cited record'} ${esc(record.id)}. Every supplied quotation segment matches this text; the catalogue-match status remains unchanged.</p>`;
        context+=`<details class="context"><summary>Read supplied wording and reference</summary><p>${esc(supplied.original||supplied.excerpt)}</p></details>`;
        if(supplied.status==='approximate'){
          const candidate=supplied.candidates[0],matched=await read('data/'+recordFilename(candidate.source));
          if(matched.enVersion!==candidate.version||candidate.ranges.some(r=>matched.en.paragraphs[r.paragraph-1]?.plain.slice(r.start,r.end)!==r.text))throw Error(`Stale approximate reference ${supplied.id}`);
          entry.catalogueReference={source:matched.id,version:matched.enVersion,status:'approximate',ranges:candidate.ranges};
          note+=`<p class="meta">Catalogue reference: <a href="${esc(sourceUrl(matched.id,config.id,candidate.ranges[0].paragraph))}">${esc(matched.id)}</a> · passage alignment is approximate.</p>`;
        }
      }
    }else{
      const s=g.selections[0];
      const wording=s.excerpt||s.original||'';
      opening=[shortened?shortenSupplied(wording,shortened,label).join(' … '):wording];openingSource=(s.status==='approximate'&&s.candidates?.[0]?.source)||s.suppliedIds?.[0]||'';
      quote=`<p>${opening.map(esc).join('')}</p>`;
      if(shortened)entry.shortened=true;
      citation=`<span class="passage-citation">${esc(s.reference||(s.suppliedIds||[]).join(', ')||'Source reference not supplied')}</span>`;
      const approximate=s.status==='approximate'?s.candidates?.[0]:null;
      if(approximate){
        const record=await read('data/'+recordFilename(approximate.source));
        if(record.enVersion!==approximate.version||approximate.ranges.some(r=>record.en.paragraphs[r.paragraph-1]?.plain.slice(r.start,r.end)!==r.text))throw Error(`Stale approximate reference ${s.id}`);
        note=`<p class="meta">Catalogue reference: <a href="${esc(sourceUrl(record.id,config.id,approximate.ranges[0].paragraph))}">${esc(record.id)}</a> · passage alignment is approximate; supplied wording retained.</p>`;
        entry.catalogueReference={source:record.id,version:record.enVersion,status:'approximate',ranges:approximate.ranges};
      }else note='<p class="meta">Supplied quotation · catalogue passage not verified</p>';
      context=`<details class="context"><summary>Read supplied wording and reference</summary><p>${esc(s.original||s.excerpt)}</p><p class="meta">This entry retains the supplied wording and attribution.${approximate?' The catalogue reference is approximate and is not substituted for the quotation.':' No verified passage mapping is available in the reviewed collection.'}</p></details>`;
      entry.excerpt=s.excerpt;entry.original=s.original;entry.reference=s.reference;
      entry.boundaryIssues=shortened?shortenSupplied(wording,shortened,label).flatMap(boundaryConcerns):boundaryConcerns(wording);
      if(entry.boundaryIssues.length){
        boundaryReview.push({slug:config.slug,title:config.displayTitle,position:position+1,key:key(g),issues:entry.boundaryIssues,excerpt:s.excerpt||s.original,reference:s.reference,kind:'supplied quotation'});
        note+='<p class="meta">Sentence boundary needs source review; the supplied wording is retained.</p>';
      }
    }
    const unlinkedStart=!g.source&&(position===0||ordered[position-1].source)?'<p class="section-label">Further quotations · supplied wording and references</p>':'';
    const article=details=>`${unlinkedStart}<article class="quotation" id="reading-${position+1}"><span class="sequence" aria-label="Reading position ${position+1}">${String(position+1).padStart(2,'0')}</span><div class="quote-body"><blockquote>${quote}</blockquote><div class="citation">${citation}</div>${note}${details}</div></article>`;
    if(position===0)openings[config.id]={paragraphs:opening,source:openingSource};
    rendered.push(article(context));printed.push(article(''));
    compiled.push(entry);
  }
  const represented=[...compiled.flatMap(x=>x.selectionIds),...omittedIds];
  if(represented.length!==selections.length||new Set(represented).size!==selections.length)throw Error('Selection coverage mismatch');
  // Keep the reviewed editorial evidence, but derive navigation from the same
  // public one-hop graph as Subject view, including neighbors without a guide.
  for(const neighbor of config.neighbors){
    const subject=subjectMap.get(neighbor.id);if(!subject)throw Error('Unknown neighbor');
    const neighborData=await read(`subjects/${neighbor.id}.json.gz`);
    if(!neighbor.evidence.length)throw Error(`Missing neighboring evidence for ${config.slug}`);
    for(const evidence of neighbor.evidence)if(!neighborData.selections.some(s=>s.id===evidence))throw Error('Missing neighboring evidence');
  }
  const connectedSubjects=graphNeighborhood(index.subjects,index.edges,config.id,1,false).nodes.filter(s=>s.id!==config.id);
  const neighbors=connectedSubjects.map(subject=>{
    const pilot=editorial.subjects.find(s=>s.id===subject.id);
    const invitation=config.neighbors.find(n=>n.id===subject.id)?.invitation;
    return `<li><a href="${esc(pilot?pilot.slug+'-pdf.html':linkSubject(subject.id))}">${esc(subject.name)}</a>${invitation?`<p>${esc(invitation)}</p>`:''}</li>`;
  });
  const references=config.references.map(r=>`<li><a href="${safeUrl(r.url)}">${esc(r.label)}</a><p>${esc(r.note)}</p></li>`).join('');
  const counts=`${config.selection?`${shownSelections} chosen quotations from ${candidateCount}`:`${shownSelections} selection${shownSelections===1?'':'s'}`} · ${ordered.length} reading ${ordered.length===1?'entry':'entries'}`;
  const heading=`<h1>${esc(config.displayTitle)}</h1><p class="guide-subtitle">${esc(data.subject.name)}</p><p class="meta compilation-count">${counts} · <a href="${esc(linkSubject(config.id))}">Current subject view ↗</a></p>`;
  const sequenceNotes=`<details class="editorial"><summary>About this reading sequence</summary><p>${esc(config.arc)}</p><p>${config.selection?`This guide contains ${shownSelections} chosen quotations from the ${candidateCount} public selections, including every verified authorized translation. The complete original compilation remains available in Subject view.`:omittedIds.length?'Some public selections are left out of this guide by the editor; the complete compilation remains available in Subject view.':'All currently public selections are retained.'} Editor-selected word boundaries are retained. Other linked selections expand to their surrounding sentences in the same source; overlapping sentences appear once. Long passages may be shortened to the sentences that carry their central idea; the wording is unchanged, and the source context shows the full passage. Ellipses mark separated ranges. Distinct records and unlinked quotations remain distinct. Expand a linked passage for its paragraph context. Incomplete source wording and unresolved supplied excerpts are flagged for review. Blue quotation text follows existing catalogue authorization markings.</p><ol>${shownOrder.map(x=>`<li>${esc(x.why)}</li>`).join('')}</ol></details>`;
  const introduction=`<section class="introduction" aria-label="Editorial introduction"><p>${withReferences(config.introduction,config.references)}</p></section>`;
  const exploration=`<section class="exploration">${neighbors.length?`<h2>Continue exploring</h2><ul class="connected-subjects">${neighbors.join('')}</ul>`:''}${references?`<aside class="comparative"><h3>Comparative reading</h3><ul>${references}</ul></aside>`:''}</section>`;
  const questions=config.questions.length?`<section id="questions" class="questions"><p class="eyebrow">For thought and discussion</p><h2>Questions to carry forward</h2><ol>${config.questions.map(q=>`<li>${esc(q)}</li>`).join('')}</ol></section>`:'';
  const controls=`<div class="reading-heading"><h2>Selected passages</h2></div><div class="view-controls"><a class="action" href="${esc(linkSubject(config.id)+'&print=1')}" target="_blank" rel="noopener">Open as PDF</a><a class="action" href="${config.slug}-pdf.html">Try a study guide</a><span class="meta">The introduction and discussion questions appear only in the study guide’s PDF view.</span></div>`;
  const body=`<p class="eyebrow">Editorial pilot · ${config.selection?'selected compilation':'complete sample'}</p>${heading}${controls}${rendered.join('')}${sequenceNotes}`;
  const pdfControls=`<div class="reading-heading"><h2>Selected passages</h2></div><div class="view-controls"><button class="action" id="print-compilation" disabled>Print / Save as PDF</button><a href="${esc(linkSubject(config.id))}">Back to subject</a>${questions?'<a href="#questions">Questions for reflection ↓</a>':''}<span id="print-status" class="meta" role="status">Preparing fonts…</span></div>`;
  const pdfBody=`${heading}<p class="pdf-label">Editorial introduction</p>${introduction}${pdfControls}${printed.join('')}${exploration}${questions}`;
  if(body.includes(config.introduction)||config.questions.some(q=>body.includes(esc(q))))throw Error('Editorial content leaked into regular view');
  await fs.writeFile(path.join(output,config.slug+'.html'),document(config.displayTitle,body,config.slug));
  await fs.writeFile(path.join(output,config.slug+'-pdf.html'),document(config.displayTitle,pdfBody,config.slug,true));
  const result={id:config.id,name:data.subject.name,selections:shownSelections,readingEntries:ordered.length,omittedEntries:config.order.length-ordered.length,questions:config.questions.length,comparativeReadings:config.references.length,editorialContent:'PDF view only',linkedParagraphs:paragraphCount,validatedRanges:rangeCount,unlinkedEntries:ordered.filter(g=>!g.source).length,sourceSelectionsSha256:digest(JSON.stringify(data.selections)),candidateSelections:candidateCount,coverage:config.selection?'every chosen selection exactly once; full catalogue preserved':'every public selection exactly once',sourceText:'all linked ranges equal their versioned source text'};
  validation.subjects.push(result);
  result.sentenceContextExpanded=compiled.filter(x=>x.sentenceContextExpanded).length;
  result.boundaryReviewEntries=compiled.filter(x=>x.boundaryIssues?.length).length;
  result.connectedSubjects=connectedSubjects.map(s=>s.id);
  exportData.subjects.push({...config,order:shownOrder,omitted:config.order.filter(x=>x.omitted).map(x=>({key:x.key,selectionIds:groupMap.get(x.key).selections.map(s=>s.id)})),sourceName:data.subject.name,connectedSubjects:result.connectedSubjects,compiled});
  // One row per guide; centrality is the subject's number of public graph connections.
  // The total is named only when the guide leaves some of the subject's quotations out.
  const quotations=`${shownSelections===candidateCount?shownSelections:`${shownSelections} out of ${candidateCount}`} quotation${candidateCount===1?'':'s'}`;
  // Thematic follows Subject view's subject order; a subject missing from it sorts last.
  const thematic=thematicOrder.has(data.subject.name)?thematicOrder.get(data.subject.name):thematicOrder.size;
  cards.push({title:config.displayTitle,centrality:connectedSubjects.length,quotations:shownSelections,html:`<li data-title="${esc(config.displayTitle)}" data-quotations="${shownSelections}" data-total="${candidateCount}" data-centrality="${connectedSubjects.length}" data-thematic="${thematic}" style="${subjectColorStyle(subjectMap.get(config.id))}"><a href="${config.slug}-pdf.html" title="${connectedSubjects.length} connected subject${connectedSubjects.length===1?'':'s'}"><span class="guide-title">${esc(config.displayTitle)}</span><span class="guide-count">${quotations}</span></a></li>`});
}
await fs.mkdir(path.join(output,'fonts'),{recursive:true});
for(const font of ['eb-garamond.ttf','eb-garamond-italic.ttf','scheherazade-new.ttf','EB-Garamond-OFL.txt','Scheherazade-New-OFL.txt'])await fs.copyFile(path.join(out,'fonts',font),path.join(output,'fonts',font));
// Guide titles take their subject's colour, using the same day and night shades as Subject view.
const subjectShades=(await fs.readFile(path.join(root,'src/theme.css'),'utf8')).match(/^:root(?:\[data-theme=dark\])?\{--subject-[^\n]*$/gm);
if(subjectShades?.length!==2)throw Error('Subject colour shades not found in theme.css');
await fs.writeFile(path.join(output,'pilot.css'),`${(await fs.readFile(path.join(root,'scripts/compilation-pilot.css'),'utf8')).replaceAll('url(../',`url(${base}`)}\n${subjectShades.join('\n')}\n`);
await fs.copyFile(path.join(root,'scripts/compilation-pilot-view.js'),path.join(output,'pilot-view.js'));
await fs.copyFile(path.join(root,'scripts/compilation-guide-index.js'),path.join(output,'guide-index.js'));
await fs.copyFile(path.join(root,'scripts/compilation-guide-site.js'),path.join(output,'site.js'));
const collator=new Intl.Collator('en',{sensitivity:'base',ignorePunctuation:true});
await fs.writeFile(path.join(output,'index.html'),document('Ways into deeper reading',`<p class="eyebrow">${editorial.subjects.length} sample study guides</p><h1 class="overview-title">Ways into deeper reading</h1><p class="lead">Passages curated for thematic exploration.</p><div class="guide-list-heading"><h2>Study guides</h2><label class="sort-control" for="guide-sort">Sort by<select id="guide-sort"><option value="centrality" selected>Graph centrality</option><option value="thematic">Thematic</option><option value="alphabetical">Alphabetical</option><option value="quotations">Number of quotations</option></select></label></div><ol class="guide-list" id="guide-list">${cards.sort((a,b)=>b.centrality-a.centrality||collator.compare(a.title,b.title)).map(card=>card.html).join('')}</ol>`,'index'));
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify({format:1,dataset:datasetName,subjects:Object.fromEntries(editorial.subjects.map(s=>[s.id,`${s.slug}-pdf.html`]))})+'\n');
// One small file per subject, so Subject view loads only the quotation it shows.
await fs.rm(path.join(output,'openings'),{recursive:true,force:true});
await fs.mkdir(path.join(output,'openings'));
for(const [id,opening] of Object.entries(openings))await fs.writeFile(path.join(output,'openings',id+'.json'),JSON.stringify({format:1,dataset:datasetName,...opening})+'\n');
await fs.writeFile(path.join(output,'compiled.json'),JSON.stringify(exportData,null,2)+'\n');
await fs.writeFile(path.join(output,'validation.json'),JSON.stringify(validation,null,2)+'\n');
const edgeFlags=boundaryReview.filter(r=>r.issues.some(i=>(typeof i==='string'?i:i.issue)!=='supplied omission needs review'));
const internalOnly=boundaryReview.filter(r=>!edgeFlags.includes(r));
await fs.writeFile(path.join(output,'sentence-review.json'),JSON.stringify({format:1,dataset:datasetName,guides:exportData.subjects.length,entriesChecked:exportData.subjects.reduce((n,s)=>n+s.compiled.length,0),expandedEntries:validation.subjects.reduce((n,s)=>n+s.sentenceContextExpanded,0),boundaryFlags:edgeFlags.length,internalOmissionOnly:internalOnly.length,review:boundaryReview},null,2)+'\n');
const reviewCards=rows=>rows.map(r=>`<article class="sample"><h3><a href="${r.slug}-pdf.html#reading-${r.position}">${esc(r.title)} · reading ${r.position}</a></h3><p class="meta">${esc(r.source||r.reference||'Reference not supplied')}</p><p>${esc(r.excerpt||r.issues.map(i=>i.text).join('\n'))}</p><p class="meta">${esc([...new Set(r.issues.map(i=>typeof i==='string'?i:i.issue))].join('; '))}</p></article>`).join('');
await fs.writeFile(path.join(output,'sentence-review.html'),document('Sentence boundary review',`<h1>Sentence boundary review</h1><p>Automated checks cover all ${exportData.subjects.length} guides. Linked quotations use surrounding sentences from their versioned sources. There are ${edgeFlags.length} entries with a possible boundary problem or an omission at an edge, and ${internalOnly.length} further entries with internal omissions only. These are review flags, not a count of confirmed errors. Original selections and references remain intact; missing source wording has not been invented.</p><h2>Boundaries requiring source review · ${edgeFlags.length}</h2>${reviewCards(edgeFlags)}<h2>Internal omissions only · ${internalOnly.length}</h2>${reviewCards(internalOnly)}`,'review'));
return validation;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'dist');
  const {dataset}=JSON.parse(await fs.readFile(path.join(out,'stats.json'),'utf8'));
  const validation=await buildStudyGuides(root,out,dataset);
  await buildStudyGuides(root,out,dataset,{output:path.join(root,'reports/subject-compilation-pilot'),base:'http://127.0.0.1:4173/PI_browser/'});
  console.log(JSON.stringify(validation,null,2));
}
