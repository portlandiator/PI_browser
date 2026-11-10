import {subjectColorStyle} from './subject-colors.mjs';
import {escapeHtml as esc} from './text.mjs';
import {loadCompressed} from './data.mjs';
import {recordFilename} from './record-file.mjs';
import {emptyDraft,validateDraft,mergeDrafts} from './relationship-review-core.mjs';
import {pendingStatuses,reviewStatus,inQueue,validateMatchEdits,confirmedCandidate,paragraphCandidate,reviewKeyAction,additionId,additionExcerpt} from './passage-review-core.mjs';

const $=id=>document.getElementById(id),storageKey='pi-subject-edits';
let base,index,summaries,ids,published,local=emptyDraft(),ordered=[],active='',selectionId='',currentData,currentSelection,undo,ready=false,epoch=0;
const subjectCache=new Map(),recordCache=new Map();
let draftCache,draftLocal,draftPublished;
const message=(text,error=false)=>{$('review-message').textContent=text;$('review-message').className=error?'review-error':'';};
const validate=d=>validateMatchEdits(validateDraft(d,ids));
const readLocal=()=>{const text=localStorage.getItem(storageKey);return text?validate(JSON.parse(text)):emptyDraft();};
const draft=()=>{if(draftLocal!==local||draftPublished!==published){draftCache=mergeDrafts(published,local);draftLocal=local;draftPublished=published;}return draftCache;};
const queueFilter=()=>$('review-queue').value;
const items=id=>summaries.get(id)?.items||[];
const available=id=>items(id).filter(s=>inQueue(s,draft(),queueFilter()));
const label=s=>`<span class="subject-label" style="${subjectColorStyle(s)};color:var(--subject-color);background:var(--subject-bg)">${esc(s.name)}</span>`;
function cached(cache,key,loader,limit){if(!cache.has(key)){const promise=loader().catch(e=>{if(cache.get(key)===promise)cache.delete(key);throw e;});cache.set(key,promise);if(cache.size>limit)cache.delete(cache.keys().next().value);}return cache.get(key);}
const subjectData=id=>cached(subjectCache,id,()=>loadCompressed(new URL(`subjects/${id}.json.gz`,base)),2);
const record=id=>cached(recordCache,id,()=>loadCompressed(new URL(`data/${recordFilename(id)}`,base)),8);
function updateUrl(push=false){const p=new URLSearchParams();if(active)p.set('subject',active);if(selectionId)p.set('selection',selectionId);for(const [key,id] of [['q','review-search'],['order','review-order'],['status','review-queue']]){const value=$(id).value;if(value&&value!=='thematic'&&value!=='pending')p.set(key,value);}history[push?'pushState':'replaceState']({},'',location.pathname+'?'+p);}
// A source passage chooser: it loads a record, checks a candidate against it,
// shows the paragraphs with their highlights, and lets the editor narrow the
// ranges. The selection editor and the "Add a passage" section each have one;
// `ready(ok)` enables the button that saves what is shown.
function passagePicker({evidence,json,ready,saveHint}){
  const p={candidate:null,record:null,epoch:0};
  const box=()=>$(evidence);
  p.reset=()=>{p.epoch++;p.candidate=null;p.record=null;ready(false);};
  p.load=async value=>{
    const token=++p.epoch;p.candidate=null;p.record=null;ready(false);if($(json))$(json).value=value?JSON.stringify(value,null,2):'';
    if(!value){box().textContent='No candidate is available. Look up a source below or search the catalog.';return;}
    box().textContent='Loading source context…';
    try{const r=await record(value.source);if(token!==p.epoch)return;const validated=confirmedCandidate(value,r);p.candidate={...value,ranges:validated.ranges};p.record=r;p.render();ready(true);}
    catch(e){if(token===p.epoch){box().textContent=e.message+' Choose another candidate or load a source below.';message(e.message,true);}}
  };
  p.lookup=async(id,first,last)=>{
    const token=++p.epoch;p.candidate=null;p.record=null;ready(false);box().textContent='Loading source context…';
    try{if(!id||id.includes('/')||id.includes('\\'))throw Error('Enter a filename ID, not a path.');const r=await record(id);if(token!==p.epoch)return;await p.load(paragraphCandidate(r,first,last));}
    catch(error){if(token===p.epoch){box().textContent=error.message;message(error.message,true);}}
  };
  p.render=()=>{
    const r=p.record,c=p.candidate,paragraphNumbers=[...new Set(c.ranges.map(x=>x.paragraph))];
    const highlight=(text,ranges)=>{let html='',start=0;for(const range of ranges){html+=esc(text.slice(start,range.start))+`<mark>${esc(text.slice(range.start,range.end))}</mark>`;start=range.end;}return html+esc(text.slice(start));};
    if($(json))$(json).value=JSON.stringify(c,null,2);
    box().innerHTML=`<p><a href="./?id=${encodeURIComponent(r.id)}#p-en-${paragraphNumbers[0]}" target="_blank" rel="noopener">${esc(r.id)} · open full bilingual text ↗</a></p>${c.evidence?`<p class="review-help">${esc(c.evidence)}</p>`:''}${paragraphNumbers.map(n=>{const paragraph=r.en.paragraphs[n-1],ranges=c.ranges.filter(x=>x.paragraph===n);return `<div class="range-caption">Paragraph ${n}</div><div class="source-paragraph" data-plain="${n}">${highlight(paragraph.plain,ranges)}</div><button type="button" data-use-selection="${n}">Use selected text in paragraph ${n}</button>${ranges.map(range=>{const i=c.ranges.indexOf(range);return `<div class="range-controls"><label>Start character<input data-start="${i}" type="number" min="0" max="${paragraph.plain.length}" value="${range.start}"></label><label>End character<input data-end="${i}" type="number" min="1" max="${paragraph.plain.length}" value="${range.end}"></label><button type="button" data-update-range="${i}">Update range</button></div>`;}).join('')}`;}).join('')}<details><summary>Surrounding context</summary>${[...new Set(paragraphNumbers.flatMap(n=>[n-1,n+1]))].filter(n=>n>0&&n<=r.en.paragraphs.length&&!paragraphNumbers.includes(n)).map(n=>`<div class="passage-context"><div class="range-caption">Paragraph ${n}</div><p class="source-paragraph">${esc(r.en.paragraphs[n-1].plain)}</p></div>`).join('')||'<p>No additional adjacent paragraphs.</p>'}</details>`;
    for(const button of box().querySelectorAll('[data-update-range]'))button.onclick=()=>{try{const i=Number(button.dataset.updateRange),next=structuredClone(p.candidate);next.ranges[i].start=Number(box().querySelector(`[data-start="${i}"]`).value);next.ranges[i].end=Number(box().querySelector(`[data-end="${i}"]`).value);p.candidate=confirmedCandidate(next,p.record);p.render();message('Range updated. '+saveHint);}catch(e){message(e.message,true);}};
    for(const button of box().querySelectorAll('[data-use-selection]')){button.onmousedown=e=>e.preventDefault();button.onclick=()=>{try{const n=Number(button.dataset.useSelection),block=box().querySelector(`[data-plain="${n}"]`),selection=window.getSelection();if(!selection.rangeCount||selection.isCollapsed)throw Error('Select wording within this source paragraph first.');const range=selection.getRangeAt(0);if(!block.contains(range.startContainer)||!block.contains(range.endContainer))throw Error('Select wording within a single paragraph.');const prefix=range.cloneRange();prefix.selectNodeContents(block);prefix.setEnd(range.startContainer,range.startOffset);const start=prefix.toString().length,end=start+range.toString().length;p.candidate=confirmedCandidate({...p.candidate,ranges:[...p.candidate.ranges.filter(r=>r.paragraph!==n),{paragraph:n,start,end}].sort((a,b)=>a.paragraph-b.paragraph||a.start-b.start)},p.record);p.render();message('Selected wording applied. '+saveHint);}catch(e){message(e.message,true);}};}
  };
  return p;
}
const enable=(id,ok)=>{const button=$(id);if(button)button.disabled=!ok;};
const main=passagePicker({evidence:'source-evidence',json:'mapping-json',ready:ok=>enable('confirm-next',ok),saveHint:'Confirm to save this mapping.'});
const adder=passagePicker({evidence:'add-evidence',ready:ok=>enable('add-passage',ok),saveHint:'Add the passage to save it.'});
function renderDirectory(){
  const d=draft(),query=$('review-search').value.toLowerCase();
  const sorted=$('review-order').value==='alphabetical'?[...index.subjects].sort((a,b)=>a.name.localeCompare(b.name)):ordered;
  const shown=sorted.filter(s=>s.name.toLowerCase().includes(query)&&available(s.id).length);
  $('review-directory-count').textContent=`${shown.length} subjects in this queue`;
  $('review-subjects').innerHTML=shown.map(s=>`<a href="?subject=${s.id}" data-subject="${s.id}" ${s.id===active?'aria-current="true"':''}>${label(s)}<small>${available(s.id).length.toLocaleString()} selections</small></a>`).join('')||'<p>No subjects match these filters.</p>';
  let pending=0,decided=0;for(const s of summaries.values())for(const item of s.items){if(pendingStatuses.includes(reviewStatus(item,d)))pending++;else decided++;}
  $('review-progress').textContent=`${pending.toLocaleString()} need review · ${decided.toLocaleString()} decided · ${Object.keys(local.matches).length.toLocaleString()} passage decisions and ${Object.keys(local.additions).length.toLocaleString()} added passages in local draft`;
  $('export-preview').value=JSON.stringify(d,null,2);$('undo-change').disabled=!undo;
}
function queue(){const query=$('selection-search')?.value.toLowerCase()||'',included=new Set(items(active).map(s=>s.id));return (currentData?.selections||[]).filter(s=>included.has(s.id)&&inQueue(s,draft(),queueFilter())&&(!query||`${s.excerpt} ${s.suppliedIds.join(' ')} ${s.candidates.map(c=>c.source).join(' ')}`.toLowerCase().includes(query)));}
function fillSelectionList(){const rows=queue();$('selection-picker').innerHTML=rows.map((s,i)=>`<option value="${s.id}">${i+1}. ${esc(s.suppliedIds[0]||s.candidates[0]?.source||'No source')} · ${esc(reviewStatus(s,draft()))} · ${esc(s.excerpt.slice(0,75))}</option>`).join('');$('selection-picker').value=selectionId;return rows;}
async function openSubject(id,chosen='',push=true){
  const token=++epoch;main.reset();adder.reset();active=id;selectionId=chosen;currentSelection=null;currentData=null;updateUrl(push);renderDirectory();$('review-content').innerHTML='<p role="status">Loading selections…</p>';
  try{
    const data=await subjectData(id);if(token!==epoch)return;currentData=data;
    $('review-content').innerHTML=`<h2 class="passage-title" tabindex="-1">${label(index.subjects.find(s=>s.id===id))}</h2><label class="passage-selection-find" for="selection-search">Find within this subject<input id="selection-search" type="search" placeholder="Quotation words or source ID…"></label><div class="passage-controls"><label for="selection-picker">Quotation<select id="selection-picker"></select></label></div><div class="review-navigation"><button id="previous-passage">← Previous</button><span id="queue-position"></span><button id="next-passage">Next →</button><button id="next-subject">Next subject needing review →</button></div><div id="passage-editor"></div><details id="passage-add" class="passage-add"><summary>Add a passage to this subject</summary><p class="review-help">Quote a passage the imported extracts do not include. Load the source paragraphs, highlight the wording in a paragraph and choose “Use selected text” (complete sentences read best in the study guides), then add it. Added passages stay in this browser until you export the decisions and publish them with Publish-Editorial-Decisions.cmd.</p><form id="add-lookup"><div class="passage-controls"><label>Filename ID<input id="add-source" placeholder="e.g. BH00002" required></label><label>First paragraph<input id="add-first" type="number" min="1" value="1" required></label><label>Last paragraph<input id="add-last" type="number" min="1" value="1" required></label><button>Load passage</button></div></form><div id="add-evidence" role="status">Load a source to choose the passage.</div><label class="passage-note">Editorial note<textarea id="add-note" maxlength="4000" placeholder="Why this passage belongs under this subject…"></textarea></label><div class="passage-actions"><button id="add-passage" type="button" class="primary" disabled>Add passage to this subject</button></div><div id="add-list"></div></details>`;
    $('selection-search').oninput=()=>{const rows=fillSelectionList();showSelection(rows.some(s=>s.id===selectionId)?selectionId:rows[0]?.id,false);};
    $('selection-picker').onchange=e=>showSelection(e.target.value,true);
    $('previous-passage').onclick=()=>step(-1);$('next-passage').onclick=()=>step(1);$('next-subject').onclick=nextSubject;
    $('add-lookup').onsubmit=e=>{e.preventDefault();adder.lookup($('add-source').value.trim().replace(/\.txt$/i,''),Number($('add-first').value),Number($('add-last').value));};
    $('add-passage').onclick=addPassage;
    prunePublished(Object.keys(local.additions).filter(x=>local.additions[x].subject===id&&data.selections.some(s=>s.id===x)));
    renderAdditions();
    const rows=fillSelectionList();await showSelection(rows.some(s=>s.id===chosen)?chosen:rows[0]?.id,false);
  }catch(e){if(token===epoch){$('review-content').innerHTML='<p class="review-error">Could not load this subject.</p><button id="retry-subject">Retry</button>';$('retry-subject').onclick=()=>openSubject(id,chosen,false);message(e.message,true);}}
}
function step(delta){const rows=queue(),n=rows.findIndex(s=>s.id===selectionId);if(rows[n+delta])showSelection(rows[n+delta].id,true);}
async function nextSubject(){const n=ordered.findIndex(s=>s.id===active);const next=[...ordered.slice(n+1),...ordered.slice(0,n+1)].find(s=>available(s.id).length);if(next)await openSubject(next.id);else{await showSelection('',false);message('This review queue is complete. Export your decisions.');}}
async function showSelection(id,push=false){
  main.reset();selectionId=id||'';const rows=fillSelectionList(),position=rows.findIndex(s=>s.id===id);currentSelection=rows[position];updateUrl(push);
  $('previous-passage').disabled=position<=0;$('next-passage').disabled=position<0||position>=rows.length-1;$('queue-position').textContent=rows.length?`${position+1} of ${rows.length}`:'0 selections';
  if(!currentSelection){$('passage-editor').innerHTML='<div class="passage-empty"><h3>No selections in this queue.</h3><p>Choose another status, clear the text search, or continue to the next subject.</p></div>';return;}
  const s=currentSelection,decision=draft().matches[s.id];
  const candidates=s.candidates.map((c,i)=>`<option value="${i}">${i+1}. ${esc(c.source)} · ¶${[...new Set(c.ranges.map(r=>r.paragraph))].join(', ')} · ${esc(c.method||'candidate')}${Number.isFinite(c.score)?` · ${Math.round(c.score*100)}% match score`:''}</option>`).join('');
  $('passage-editor').innerHTML=`<p class="passage-queue-position">${esc(reviewStatus(s,draft()))}${local.matches[s.id]?' · local draft':''} · ${esc(s.provenance.sourceCollection||'Source collection')} · selection ${s.provenance.selectionParagraph}</p><div class="passage-comparison"><article class="passage-panel"><h3>Imported quotation</h3><blockquote>${esc(s.excerpt)}</blockquote><p class="passage-citation">Supplied source: ${esc(s.suppliedIds.join(', ')||'none')}</p><p>${esc(s.reason||'Compare wording and context before confirming.')}</p>${s.candidateSourcesTruncated||s.candidateLocationsTruncated?'<p class="review-help">Candidate search was limited; other matches may exist.</p>':''}<details class="passage-provenance"><summary>Source and provenance</summary><p>${esc(s.original)}</p><p>${esc(s.provenance.sourceFilename||s.provenance.subjectFilename)} · block ${s.provenance.selectionParagraph} · line ${s.provenance.sourceLine||'—'}</p><a href="./subjects.html?subject=${encodeURIComponent(active)}&review=1&status=all#selection-${s.id}" target="_blank" rel="noopener">Open in Subject view ↗</a></details><a href="./?q=${encodeURIComponent(s.excerpt.slice(0,240))}" target="_blank" rel="noopener">Search the catalog ↗</a></article><section class="passage-panel"><h3>Source passage</h3><label for="candidate-picker">Candidate<select id="candidate-picker">${decision?.status==='confirmed'?'<option value="draft">Saved mapping</option>':''}${candidates||'<option value="">No proposed candidates</option>'}</select></label><p class="review-help">Match scores measure textual matching, not probability or verified alignment.</p><div id="source-evidence" role="status"></div><details class="passage-manual" ${!s.candidates.length?'open':''}><summary>Find a different source passage</summary><form id="source-lookup"><div class="passage-controls"><label>Filename ID<input id="source-id" value="${esc(s.suppliedIds[0]||s.candidates[0]?.source||'')}" placeholder="e.g. BH00002" required></label><label>First paragraph<input id="source-first" type="number" min="1" value="1" required></label><label>Last paragraph<input id="source-last" type="number" min="1" value="1" required></label><button>Load passage</button></div></form><p class="review-help">Load a paragraph or a range of up to 50 paragraphs. Highlight wording in a paragraph and choose “Use selected text” to narrow it.</p></details></section></div><label class="passage-note">Editorial note<textarea id="decision-note" maxlength="4000" placeholder="Reason, translation differences, or supporting evidence…">${esc(decision?.note||'')}</textarea></label><div class="passage-actions"><button id="confirm-next" class="primary" aria-keyshortcuts="Alt+C" title="Keyboard shortcut: Alt+C" disabled>Confirm mapping & next</button><button id="reject-next" aria-keyshortcuts="Alt+R" title="Keyboard shortcut: Alt+R">Reject mapping & next</button><button id="skip-next">Skip for now →</button><button id="restore-decision" ${local.matches[s.id]?'':'disabled'}>Restore published version</button></div><details class="passage-mapping"><summary>Advanced range editor</summary><p class="review-help">Offsets are zero-based, end-exclusive positions in the displayed English text. Source versions and ranges are checked before saving.</p><label for="mapping-json">Mapping JSON</label><textarea id="mapping-json" spellcheck="false"></textarea><button id="apply-json">Preview edited mapping</button></details>`;
  $('candidate-picker').onchange=()=>{const value=$('candidate-picker').value;main.load(value==='draft'?decision.candidate:s.candidates[Number(value)]);};
  $('source-lookup').onsubmit=e=>{e.preventDefault();main.lookup($('source-id').value.trim().replace(/\.txt$/i,''),Number($('source-first').value),Number($('source-last').value));};
  $('apply-json').onclick=async()=>{try{await main.load(JSON.parse($('mapping-json').value));}catch(e){message(e.message,true);}};
  $('confirm-next').onclick=()=>decide('confirmed');$('reject-next').onclick=()=>decide('rejected');$('skip-next').onclick=()=>{if(position+1<rows.length)step(1);else nextSubject();};
  $('restore-decision').onclick=()=>save(d=>{delete d.matches[s.id];return d;},false);
  await main.load(decision?.status==='confirmed'?decision.candidate:s.candidates[0]);
}
async function decide(status){
  try{const s=currentSelection;if(!s)return;const edit={status,note:$('decision-note').value};if(status==='confirmed')edit.candidate=confirmedCandidate(main.candidate,main.record);await save(d=>{d.matches[s.id]=edit;return d;},true);}
  catch(e){message('Not saved: '+e.message,true);}
}
// The ranges a subject shows for a selection, with the local draft applied.
function shownLocation(s){
  const decision=draft().matches[s.id];
  if(decision?.status==='rejected')return null;
  const c=decision?.status==='confirmed'?decision.candidate:['exact','normalized','confirmed'].includes(s.status)?s.candidates[0]:null;
  return c?JSON.stringify([c.source,c.ranges.map(r=>[r.paragraph,r.start,r.end])]):null;
}
async function addPassage(){
  try{
    if(!adder.candidate||!currentData)throw Error('Load a source passage first.');
    const candidate=confirmedCandidate(adder.candidate,adder.record),subject=active,id=await additionId(subject,candidate);
    const where=JSON.stringify([candidate.source,candidate.ranges.map(r=>[r.paragraph,r.start,r.end])]);
    const same=currentData.selections.find(s=>s.id===id||shownLocation(s)===where);
    if(same)throw Error(same.id===id?'This passage is already published in this subject.':`This subject already quotes this passage (selection ${same.id}).`);
    const note=$('add-note').value.trim();
    await save(d=>{d.additions[id]={subject,candidate,addedAt:new Date().toISOString(),...note&&{note}};return d;},false,{focus:'add-passage'});
    $('add-note').value='';
    message('Passage added to the local draft. Export decisions, then publish them with Publish-Editorial-Decisions.cmd.');
  }catch(e){message('Not added: '+e.message,true);}
}
function renderAdditions(){
  const box=$('add-list');if(!box||!currentData)return;
  const entries=Object.entries(draft().additions).filter(([,a])=>a.subject===active);
  box.innerHTML=entries.length?'<h3>Passages added to this subject</h3>'+entries.map(([id,a])=>{const excerpt=additionExcerpt(a.candidate),state=currentData.selections.some(s=>s.id===id)||published.matches[id]?'published':'waiting to be exported and published';return `<div class="passage-addition"><p class="passage-citation"><strong>${esc(a.candidate.source)}</strong> · ¶${esc([...new Set(a.candidate.ranges.map(r=>r.paragraph))].join(', '))} · ${state}</p><blockquote>${esc(excerpt.length>240?excerpt.slice(0,239)+'…':excerpt)}</blockquote>${a.note?`<p>${esc(a.note)}</p>`:''}<button type="button" data-remove-addition="${id}">Remove from the local draft</button></div>`;}).join(''):'<p class="review-help">No passages have been added to this subject in this browser.</p>';
  for(const button of box.querySelectorAll('[data-remove-addition]'))button.onclick=()=>save(d=>{delete d.additions[button.dataset.removeAddition];return d;},false,{focus:''});
}
// Added passages that are published now leave the local draft quietly.
function prunePublished(done){
  if(!done.length)return;
  try{const latest=readLocal();for(const id of done)delete latest.additions[id];localStorage.setItem(storageKey,JSON.stringify(latest));local=latest;renderDirectory();message(`${done.length} added passage${done.length===1?' is':'s are'} published and left the local draft.`);}
  catch(e){message(e.message,true);}
}
async function save(transform,advance,{focus='confirm-next'}={}){
  try{const rows=queue(),position=rows.findIndex(s=>s.id===selectionId),nextId=rows[position+1]?.id,oldId=selectionId,oldSubject=active;const latest=readLocal(),next=validate(transform(structuredClone(latest)));localStorage.setItem(storageKey,JSON.stringify(next));undo={draft:latest,subject:oldSubject,selection:oldId};local=next;renderDirectory();renderAdditions();
    if(advance){const remaining=queue();if(nextId&&remaining.some(s=>s.id===nextId))await showSelection(nextId,true);else if(remaining.length)await showSelection(remaining[0].id,true);else await nextSubject();}
    else await showSelection(oldId,false);
    message('Saved in this browser. Export decisions to keep a backup.');if(focus)$(focus)?.focus({preventScroll:true});
  }catch(e){message('Not saved: '+e.message+' Export a backup before leaving.',true);}
}
async function verifyImport(incoming){
  const holders=[...Object.values(incoming.matches).filter(edit=>edit.status==='confirmed'),...Object.values(incoming.additions||{})];
  for(const [id,addition] of Object.entries(incoming.additions||{}))if(await additionId(addition.subject,addition.candidate)!==id)throw Error('An added passage does not match its identity. Add it again on this page.');
  const grouped=new Map();for(const holder of holders){const source=holder.candidate.source;if(!grouped.has(source))grouped.set(source,[]);grouped.get(source).push(holder);}
  const work=[...grouped.entries()];let cursor=0,done=0;
  await Promise.all(Array.from({length:Math.min(4,work.length)},async()=>{while(cursor<work.length){const [id,entries]=work[cursor++],r=await record(id);for(const holder of entries)holder.candidate=confirmedCandidate(holder.candidate,r);done++;message(`Checking imported source versions: ${done} of ${work.length}…`);}}));
}
function download(){const value=mergeDrafts(published,readLocal()),text=JSON.stringify(value,null,2);$('export-preview').value=text;const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='subject-edits.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message('Export prepared, including passage and connection decisions and added passages.');}
async function restoreUrl(){const p=new URLSearchParams(location.search);$('review-search').value=p.get('q')||'';$('review-order').value=p.get('order')==='alphabetical'?'alphabetical':'thematic';$('review-queue').value=['pending','approximate','ambiguous','unmatched','reviewed','all'].includes(p.get('status'))?p.get('status'):'pending';const subject=ids.has(p.get('subject'))?p.get('subject'):ordered.find(s=>available(s.id).length)?.id||ordered[0].id;await openSubject(subject,p.get('selection')||'',false);}
document.addEventListener('click',e=>{const link=e.target.closest('[data-subject]');if(link&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey){e.preventDefault();openSubject(link.dataset.subject);}});
document.addEventListener('keydown',e=>{if(!ready)return;const editable=!!e.target?.closest?.('input,textarea,select,[contenteditable="true"]'),action=reviewKeyAction(e,{editable,canConfirm:!$('confirm-next')?.disabled});if(!action)return;e.preventDefault();if(action==='next')step(1);else if(action==='previous')step(-1);else $(action==='confirm'?'confirm-next':'reject-next')?.click();});
window.addEventListener('popstate',()=>{if(ready)restoreUrl();});
window.addEventListener('storage',async e=>{if(ready&&e.key===storageKey){try{local=readLocal();undo=null;renderDirectory();renderAdditions();await showSelection(selectionId,false);message('Updated decisions from another tab.');}catch(error){message(error.message,true);}}});
try{
  const response=await fetch('./stats.json',{cache:'no-cache'});if(!response.ok)throw Error('Collection manifest unavailable');const stats=await response.json();base=new URL(stats.dataset,location.href);
  const [loadedIndex,review,pub,orderResponse]=await Promise.all([loadCompressed(new URL('subjects/index.json.gz',base)),loadCompressed(new URL('subjects/review-index.json.gz',base)),loadCompressed(new URL('subjects/editorial-decisions.json.gz',base)),fetch('./subject-order.json')]);
  index=loadedIndex;ids=new Set(index.subjects.map(s=>s.id));published=validate(pub);local=readLocal();summaries=new Map(review.subjects.map(s=>[s.subject,s]));
  if(!orderResponse.ok)throw Error('Subject order unavailable');const groups=(await orderResponse.json()).groups,byName=new Map(index.subjects.map(s=>[s.name,s]));ordered=groups.flatMap(g=>g.subjects.map(name=>byName.get(name)).filter(Boolean));const included=new Set(ordered.map(s=>s.id));ordered.push(...index.subjects.filter(s=>!included.has(s.id)));
  $('export-decisions').disabled=false;$('import-decisions').disabled=false;$('export-decisions').onclick=()=>{try{download();}catch(e){message(e.message,true);}};
  $('undo-change').onclick=async()=>{try{if(!undo)return;if(JSON.stringify(readLocal())!==JSON.stringify(local))throw Error('Another tab changed the draft. Reload before undoing.');const previous=undo;localStorage.setItem(storageKey,JSON.stringify(previous.draft));local=previous.draft;undo=null;await openSubject(previous.subject,previous.selection);message('Last change undone.');}catch(e){message(e.message,true);}};
  $('import-decisions').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;const incoming=validate(JSON.parse(await file.text()));await verifyImport(incoming);await save(d=>mergeDrafts(d,incoming),false);}catch(error){message('Import failed: '+error.message,true);}finally{e.target.value='';}};
  $('review-search').oninput=()=>{updateUrl();renderDirectory();};$('review-order').onchange=()=>{updateUrl();renderDirectory();};$('review-queue').onchange=()=>{renderDirectory();openSubject(active,'',true);};
  ready=true;const done=Object.keys(local.additions).filter(id=>published.matches[id]);prunePublished(done);await restoreUrl();
  message(done.length?`Ready. ${done.length} added passage${done.length===1?' is':'s are'} published and left the local draft.`:'Ready. Compare the quotation and source before confirming.');
}catch(e){message('Could not open passage review: '+e.message+' Reload to try again.',true);}
