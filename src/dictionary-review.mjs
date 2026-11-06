// Dictionary review page: a reviewer works through a published dictionary's
// entries, edits them, marks them reviewed or uncertain, and downloads the
// whole file for a pull request. Drafts stay in this browser (localStorage);
// nothing is uploaded. Concordance context comes from authorized paragraphs
// and is statistics, never a translation of the word.
import {escapeHtml as esc} from './text.mjs';
import {parseDictionary,isOriginalScript,wordTags} from './dictionary.mjs';
import {readReviewSource,editableColumns,reviewFilter,filterRows,statusCounts,draftFor,draftKey,setDraft,draftCount,storageKey,reviewerStamp,markReviewed,markUncertain,exportTsv,hasContext,entryStatus} from './dictionary-review-core.mjs';
import {dictionaryAboutHtml,reviewLabelHtml} from './word-study.mjs';
import {createConcordance,passageHtml} from './concordance-view.mjs';
import {paragraphUrl} from './paragraph-links.mjs';
import {recordFilename} from './record-file.mjs';
import {loadCompressed} from './data.mjs';

const $=id=>document.getElementById(id);
const pageSize=50,base=new URL('./',location.href),reviewerKey='pi-dictionary-reviewer';
const labels={modern_translit:'Modern pronunciation',modern_gloss:'Modern meaning',shift:'Meaning shift',form:'Form',vocalized:'Vocalized (vowel marks)',lemma:'Lemma',lang:'Language',translit:'Pronunciation',gloss:'Gloss',rendering:"Bahá'í English",register:'Register',definition:'Definition',notes:'Notes',status:'Status',reviewer:'Reviewer',pos:'Part of speech',root:'Root',tags:'Tags',modern:'Modern equivalent',usage:"Bahá'í usage",kjv:'King James Bible reference',kjv_text:'King James Bible excerpt'};
const count=n=>Number(n||0).toLocaleString('en-US');
const params=new URLSearchParams(location.search);
let index=[],item=null,source=null,drafts={},rows=[],page=Math.max(1,Number(params.get('page'))||1),storageOk=true,saveTimer=0;
let concordance=null,datasetBase=null,opening=0;
const records=new Map();

const store={
  get(key){try{return localStorage.getItem(key);}catch{return null;}},
  set(key,value){try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);return true;}catch{return false;}},
};
function message(text,error=false){const node=$('review-message');node.textContent=text;node.classList.toggle('review-error',error);}
function syncUrl(){
  const next=new URLSearchParams();
  if(item)next.set('dict',item.id);
  if($('review-filter').value!=='pending')next.set('show',$('review-filter').value);
  if($('review-query').value.trim())next.set('q',$('review-query').value.trim());
  if(page>1)next.set('page',String(page));
  history.replaceState(null,'',`${location.pathname}${next.size?'?'+next:''}`);
}
function saveDrafts(){
  clearTimeout(saveTimer);saveTimer=0;if(!item)return;
  storageOk=store.set(storageKey(item.id),Object.keys(drafts).length?JSON.stringify(drafts):null);
  summary();
}
const scheduleSave=()=>{clearTimeout(saveTimer);saveTimer=setTimeout(saveDrafts,300);};

function summary(){
  if(!source)return;
  const counts=statusCounts(source,drafts),n=draftCount(source,drafts);
  $('review-counts').textContent=`${count(counts.uncertain)} uncertain · ${count(counts.unreviewed)} unreviewed · ${count(counts.reviewed)} reviewed · ${count(source.rows.length)} entries`;
  $('review-drafts').textContent=`Unsaved changes: ${count(n)}${n?' (kept in this browser until you download)':''}${storageOk?'':' — this browser cannot store drafts, so download before leaving the page'}`;
  $('review-drafts').classList.toggle('review-error',!storageOk);
  $('review-download').disabled=false;$('review-discard').disabled=!n;
}

function fieldHtml(row,column,entry){
  const id=`f-${row.index}-${column}`,value=entry[column]??'',changed=column in (draftFor(drafts,row)||{});
  const label=`<label for="${id}">${esc(labels[column])}${changed?' <span class="review-changed">edited</span>':''}</label>`;
  const attrs=`id="${id}" data-field="${column}" dir="auto"${isOriginalScript(value)?' lang="fa"':''}`;
  if(column==='status'){const status=String(value).toLowerCase();return `<div class="review-field field-status">${label}<select ${attrs}>${['unreviewed','uncertain','reviewed'].map(option=>`<option value="${option}"${(status||'unreviewed')===option?' selected':''}>${option[0].toUpperCase()+option.slice(1)}</option>`).join('')}${status&&!['unreviewed','uncertain','reviewed'].includes(status)?`<option value="${esc(value)}" selected>${esc(value)} (invalid)</option>`:''}</select></div>`;}
  if(column==='register')return `<div class="review-field field-register">${label}<select ${attrs}>${['','plain','elevated'].map(option=>`<option value="${option}"${value===option?' selected':''}>${option?option[0].toUpperCase()+option.slice(1):'—'}</option>`).join('')}${value&&!['plain','elevated'].includes(value)?`<option value="${esc(value)}" selected>${esc(value)} (invalid)</option>`:''}</select></div>`;
  if(column==='tags')return `<div class="review-field field-tags">${label}<input type="text" ${attrs} value="${esc(value)}" aria-describedby="${id}-hint" spellcheck="false"><span class="review-hint" id="${id}-hint">Comma-separated: ${wordTags.join(', ')}</span></div>`;
  if(column==='definition'||column==='notes'||column==='usage'||column==='kjv_text')return `<div class="review-field field-${column}">${label}<textarea ${attrs} rows="2">${esc(value)}</textarea></div>`;
  return `<div class="review-field field-${column}">${label}<input type="text" ${attrs} value="${esc(value)}"></div>`;
}
function cardHtml(row){
  const entry={...row.entry,...(draftFor(drafts,row)||{})},edited=!!draftFor(drafts,row);
  const form=entry.form||row.entry.form||'',original=isOriginalScript(form);
  const status=entryStatus(entry);
  const context=hasContext(row.entry)?`<button type="button" class="secondary" data-action="context" aria-expanded="false" aria-controls="ctx-${row.index}">Show context</button>`:'';
  return `<li class="review-entry entry-${status}${edited?' is-edited':''}" data-row="${row.index}" aria-labelledby="h-${row.index}"><div class="review-entry-head"><h2 class="review-form" id="h-${row.index}" tabindex="-1"${original?' dir="rtl" lang="fa"':' dir="auto"'}>${esc(form)}</h2><span class="review-row">Row ${count(row.index+2)}</span>${reviewLabelHtml(entry)||'<span class="word-tooltip-status status-unreviewed">Unreviewed</span>'}${edited?'<span class="review-edited">Unsaved changes</span>':''}</div><div class="review-fields">${editableColumns(source).map(column=>fieldHtml(row,column,entry)).join('')}</div><div class="review-entry-actions"><button type="button" class="secondary" data-action="reviewed" aria-label="Mark ${esc(form)} reviewed">Mark reviewed</button><button type="button" class="secondary" data-action="uncertain" aria-label="Mark ${esc(form)} uncertain">Mark uncertain</button><button type="button" class="secondary" data-action="revert"${edited?'':' disabled'} aria-label="Discard edits to ${esc(form)}">Discard edits</button>${context}</div><div class="review-context" id="ctx-${row.index}" hidden></div></li>`;
}

function render({focus=false}={}){
  const pages=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.min(page,pages);
  const slice=rows.slice((page-1)*pageSize,page*pageSize);
  $('review-entries').innerHTML=slice.map(cardHtml).join('');
  $('review-page').textContent=rows.length?`Page ${count(page)} of ${count(pages)} · entries ${count((page-1)*pageSize+1)}–${count((page-1)*pageSize+slice.length)} of ${count(rows.length)}`:'';
  $('review-prev').disabled=page<=1;$('review-next').disabled=page>=pages;
  message(rows.length?'':'No entries match this filter and search.');
  summary();syncUrl();
  if(focus)$('review-entries').querySelector('.review-form')?.focus();
}
function refilter(){rows=filterRows(source,drafts,{filter:$('review-filter').value,query:$('review-query').value});}
const rowOf=node=>source.rows[Number(node.closest('[data-row]')?.dataset.row)];
function rerenderCard(row,focusSelector=''){
  const card=$('review-entries').querySelector(`[data-row="${row.index}"]`);if(!card)return;
  const context=card.querySelector('.review-context'),open=context&&!context.hidden?context.innerHTML:'';
  card.outerHTML=cardHtml(row);
  const next=$('review-entries').querySelector(`[data-row="${row.index}"]`);
  if(open){const box=next.querySelector('.review-context');box.innerHTML=open;box.hidden=false;const button=next.querySelector('[data-action=context]');button.textContent='Hide context';button.setAttribute('aria-expanded','true');}
  if(focusSelector)next.querySelector(focusSelector)?.focus();
  return next;
}
// Update the card's head and markers after an inline edit without
// re-creating the field being typed in.
function refreshHead(row){
  const card=$('review-entries').querySelector(`[data-row="${row.index}"]`);if(!card)return;
  const fresh=document.createElement('template');fresh.innerHTML=cardHtml(row);const li=fresh.content.firstElementChild;
  card.className=li.className;card.querySelector('.review-entry-head').replaceWith(li.querySelector('.review-entry-head'));
  for(const label of card.querySelectorAll('.review-field>label'))label.innerHTML=li.querySelector(`label[for="${label.htmlFor}"]`).innerHTML;
  card.querySelector('[data-action=revert]').disabled=!draftFor(drafts,row);
}
function change(row,changes){drafts=setDraft(drafts,row,changes);scheduleSave();summary();}

async function getRecord(id){
  if(!/^[\p{L}\p{N}_ ()-]+$/u.test(id))throw Error('Invalid text ID');
  if(records.has(id))return records.get(id);
  const promise=loadCompressed(new URL(`data/${encodeURIComponent(recordFilename(id))}`,datasetBase)).catch(error=>{records.delete(id);throw error;});
  records.set(id,promise);if(records.size>30)records.delete(records.keys().next().value);return promise;
}
async function concordanceReady(){
  if(!concordance){
    const response=await fetch(new URL('stats.json',base),{cache:'no-cache'});if(!response.ok)throw Error('The collection manifest could not be loaded.');
    const stats=await response.json();const datasetPath=stats.dataset||'./';
    datasetBase=new URL(datasetPath,base);concordance=createConcordance(base,datasetPath);
  }
  return concordance.ready();
}
async function showContext(row,box){
  box.innerHTML='<p class="concordance-note">Loading context…</p>';
  try{
    if(!await concordanceReady()){box.innerHTML='<p class="concordance-note">No concordance is published for this collection.</p>';return;}
    const word=row.entry.form,result=await concordance.lookup(word);
    if(!result){box.innerHTML='<p class="concordance-note">Not found in any authorized-translation paragraph.</p>';return;}
    const {n,r=[],w=[]}=result.entry,words=w.slice(0,8).map(item=>esc(item[0])).filter(Boolean);
    const via=result.via?`<p class="word-tooltip-via">Counted as <span dir="auto">${esc(result.matched)}</span> (${esc(String(result.via).replace(/–/g,''))} removed).</p>`:'';
    box.innerHTML=`<h3 class="concordance-heading">In authorized translations</h3>${via}<p class="concordance-count">Found in ${count(n)} paragraph${Number(n)===1?'':'s'}</p>${words.length?`<p class="concordance-often">Often appears with: ${words.join(' · ')}</p>`:''}<p class="concordance-note">Statistics from authorized paragraphs, not a word-for-word translation. Beneath each original paragraph is its authorized English as published.</p><ol class="concordance-list">${r.slice(0,3).map(()=>'<li class="concordance-item"><p class="concordance-note">Loading…</p></li>').join('')}</ol>`;
    const items=box.querySelectorAll('.concordance-item');
    await Promise.all(r.slice(0,3).map(async(ref,i)=>{
      try{const record=await getRecord(String(ref[0]));items[i].innerHTML=passageHtml(record,ref,result.matched,paragraphUrl('./',String(ref[0]),{number:Number(ref[1]),language:'original'}),'parallel');}
      catch{items[i].innerHTML='<p class="concordance-error">This passage could not be loaded.</p>';}
    }));
  }catch(error){box.innerHTML=`<p class="concordance-error">${esc(error.message)}</p>`;}
}

$('review-entries').addEventListener('input',event=>{
  const field=event.target.dataset?.field;if(!field)return;
  const row=rowOf(event.target);const changes={[field]:event.target.value};
  // A reviewer name belongs only to a reviewed entry.
  if(field==='status'&&event.target.value!=='reviewed'){changes.reviewer='';const reviewer=event.target.closest('.review-entry').querySelector('[data-field=reviewer]');if(reviewer)reviewer.value='';}
  change(row,changes);refreshHead(row);
});
$('review-entries').addEventListener('click',async event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const row=rowOf(button),action=button.dataset.action;
  if(action==='reviewed'){
    const stamp=reviewerStamp($('reviewer-name').value);
    if(!stamp){message('Enter your name or initials at the top before marking entries reviewed.',true);$('reviewer-name').focus();return;}
    // Fields typed but not yet saved are already in the drafts (input events).
    change(row,markReviewed(stamp));
    rerenderCard(row);
    const next=$('review-entries').querySelector(`[data-row="${row.index}"]`)?.nextElementSibling;
    (next?.querySelector('[data-action=reviewed]')||$('review-entries').querySelector(`[data-row="${row.index}"] [data-action=reviewed]`))?.focus();
    message(`Marked ${row.entry.form} reviewed.`);
  }else if(action==='uncertain'){change(row,markUncertain());rerenderCard(row,'[data-action=uncertain]');message(`Marked ${row.entry.form} uncertain.`);}
  else if(action==='revert'){const next={...drafts};delete next[draftKey(row.entry.form||'',row.index)];drafts=next;saveDrafts();rerenderCard(row,'[data-action=reviewed]');message(`Discarded edits to ${row.entry.form}.`);}
  else if(action==='context'){
    const box=button.closest('.review-entry').querySelector('.review-context'),open=box.hidden;
    box.hidden=!open;button.textContent=open?'Hide context':'Show context';button.setAttribute('aria-expanded',String(open));
    if(open&&!box.childElementCount)showContext(row,box);
  }
});

// The whole dictionary with drafts applied, checked as the build checks it.
function exportText(){
  const text=exportTsv(source,drafts);
  parseDictionary(text,{strict:true});
  return text;
}
$('review-download').onclick=()=>{
  if(!source)return;
  let text;try{text=exportText();}catch(error){message(`Not downloaded: ${error.message}. Correct the entry and try again.`,true);return;}
  const name=item.sourceFile||item.file,link=document.createElement('a');
  link.href=URL.createObjectURL(new Blob([text],{type:'text/tab-separated-values;charset=utf-8'}));link.download=name;
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),10000);
  message(`Downloaded ${name}. Replace dictionaries/${name} in the repository with it and open a pull request. Your drafts stay here until you discard them.`);
};
$('review-discard').onclick=()=>{
  const n=draftCount(source,drafts);if(!n||!confirm(`Discard ${n} unsaved change${n===1?'':'s'} to ${item.name}?`))return;
  drafts={};saveDrafts();refilter();render();message('Drafts discarded.');
};
$('review-filter').onchange=()=>{page=1;refilter();render();};
let searchTimer=0;
$('review-query').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{page=1;refilter();render();},200);};
$('review-prev').onclick=()=>{page--;render({focus:true});$('review-entries').scrollIntoView({block:'start'});};
$('review-next').onclick=()=>{page++;render({focus:true});$('review-entries').scrollIntoView({block:'start'});};
$('reviewer-name').value=store.get(reviewerKey)||'';
$('reviewer-name').onchange=()=>store.set(reviewerKey,$('reviewer-name').value.trim());
$('review-dictionary').onchange=()=>{page=1;open($('review-dictionary').value);};
window.addEventListener('pagehide',()=>{if(saveTimer)saveDrafts();});
window.addEventListener('beforeunload',event=>{if(!storageOk&&source&&draftCount(source,drafts))event.preventDefault();});

async function open(id){
  if(saveTimer)saveDrafts();
  const token=++opening;
  item=index.find(entry=>entry.id===id)||index[0];source=null;$('review-dictionary').value=item.id;
  // What the chosen dictionary covers and how it was made.
  const about=dictionaryAboutHtml(item,{summary:`About ${item.name}`});$('review-about').innerHTML=about;$('review-about').hidden=!about;
  $('review-entries').innerHTML='';$('review-download').disabled=true;$('review-discard').disabled=true;
  if(!item.file){message(`${item.name} has no published source file yet; rebuild the site to review it.`,true);return;}
  message(`Loading ${item.name}…`);
  try{
    const response=await fetch(new URL(`dictionaries/${encodeURIComponent(item.file)}`,base),{cache:'no-cache'});
    if(!response.ok)throw Error(`Could not load ${item.file} (${response.status}).`);
    const loaded=readReviewSource(await response.text());if(token!==opening)return;
    source=loaded;
    try{drafts=JSON.parse(store.get(storageKey(item.id))||'{}')||{};}catch{drafts={};}
    refilter();render();
  }catch(error){message(error.message,true);}
}

try{
  const response=await fetch(new URL('dictionaries/index.json',base),{cache:'no-cache'});
  if(!response.ok)throw Error('No published dictionaries were found.');
  index=(await response.json()).dictionaries||[];
  if(!index.length)throw Error('No published dictionaries were found.');
  $('review-dictionary').innerHTML=index.map(entry=>`<option value="${esc(entry.id)}">${esc(entry.name)}${entry.aiGenerated?' (AI-generated)':''}</option>`).join('');
  $('review-filter').value=reviewFilter(params.get('show'));$('review-query').value=params.get('q')||'';
  await open(params.get('dict')||index[0].id);
}catch(error){message(error.message,true);}

// For checks and scripted review: the file a download would contain.
window.piDictionaryReview={exportText:()=>source?exportTsv(source,drafts):'',counts:()=>source?statusCounts(source,drafts):null};
