// Read-only dictionary browser (dictionary-browser.html): search, filter and
// sort the published word-study dictionaries and open any entry in full. It
// loads each dictionary's published source file only when the filters need
// it, and the concordance only for an opened entry or the frequency order.
// The dictionaries are AI-generated samples; the review page edits them.
import {escapeHtml as esc} from './text.mjs';
import {parseDictionary,wordTags,tagLabels,dictionaryKey} from './dictionary.mjs';
import {createConcordance,englishSectionHtml,fillTransliterations,openConcordanceDialog} from './concordance-view.mjs';
import {createDictionaryStore} from './dictionary-store.mjs';
import {dictionaryAboutHtml} from './word-study.mjs';
import {concordanceShards} from './concordance.mjs';
import {paragraphUrl} from './paragraph-links.mjs';
import {recordFilename} from './record-file.mjs';
import {loadCompressed} from './data.mjs';
import {prepareEntry,stateFromParams,stateQuery,neededDictionaries,filterItems,sortMatches,groupByLemma,frequencyOf,rowHtml,detailHtml,domId,count,pages,pageSize,posGroups,posLabels,sorts,sortLabels} from './dictionary-browser-core.mjs';

const $=id=>document.getElementById(id);
const base=new URL('./',location.href);
let index=[],state=stateFromParams(location.search),shown=[],searchTimer=0,run=0;
const loaded=new Map(),records=new Map();
let transliterations=null,manifest=null,concordance=null,datasetBase=null,frequencies=null,frequencyLoad=null;

// Published dictionaries, each parsed once, its search keys prepared once.
function loadDictionary(info){
  if(!loaded.has(info.id))loaded.set(info.id,(async()=>{
    const response=await fetch(new URL(`dictionaries/${encodeURIComponent(info.file)}`,base));
    if(!response.ok)throw Error(`Could not load ${info.name} (${response.status}).`);
    const entries=parseDictionary(await response.text());
    return entries.map((entry,row)=>prepareEntry(entry,info.id,row,info.target));
  })().catch(error=>{loaded.delete(info.id);throw error;}));
  return loaded.get(info.id);
}
const infoFor=id=>index.find(item=>item.id===id);

async function collection(){
  if(!manifest)manifest=fetch(new URL('stats.json',base)).then(response=>{if(!response.ok)throw Error('The collection manifest could not be loaded.');return response.json();}).then(stats=>{const path=stats.dataset||'./';datasetBase=new URL(path,base);concordance=createConcordance(base,path);return path;}).catch(error=>{manifest=null;throw error;});
  return manifest;
}
async function getRecord(id){
  if(!/^[\p{L}\p{N}_ ()-]+$/u.test(id))throw Error('Invalid text ID');
  await collection();
  if(records.has(id))return records.get(id);
  const promise=loadCompressed(new URL(`data/${encodeURIComponent(recordFilename(id))}`,datasetBase)).catch(error=>{records.delete(id);throw error;});
  records.set(id,promise);if(records.size>30)records.delete(records.keys().next().value);return promise;
}
// Paragraph counts of every concordance key, for the frequency order: all
// shards, a few at a time, only when that order is chosen.
function loadFrequencies(){
  frequencyLoad||=(async()=>{
    const path=await collection();
    const info=await fetch(new URL('concordance/index.json',base)).then(response=>response.ok?response.json():null);
    if(info?.format!==1||info.dataset!==path)throw Error('No concordance is published for this collection.');
    const counts=new Map(),total=Number(info.shards)||concordanceShards;let next=0;
    await Promise.all(Array.from({length:12},async()=>{
      while(next<total){const n=next++;const shard=await fetch(new URL(`concordance/o-${n}.json`,base)).then(response=>response.ok?response.json():{}).catch(()=>({}));for(const [key,value] of Object.entries(shard||{}))if(Number(value?.n)>0)counts.set(key,Number(value.n));}
    }));
    return counts;
  })().catch(error=>{frequencyLoad=null;throw error;});
  return frequencyLoad;
}
const frequency=item=>item.freq??=frequencyOf(item.entry.form,frequencies);

// Controls ⇄ state.
function fillControls(){
  $('dict-q').value=state.q;
  for(const box of document.querySelectorAll('#dict-dicts input'))box.checked=state.dict.includes(box.value);
  for(const box of document.querySelectorAll('#dict-tags input'))box.checked=state.tag.includes(box.value);
  $('dict-lang').value=state.lang;$('dict-pos').value=state.pos;$('dict-status').value=state.status;$('dict-sort').value=state.sort;
  for(const flag of ['modern','shifted','usage'])$(`dict-${flag}`).checked=state[flag];
  $('dict-root-control').hidden=!state.root;$('dict-root-value').textContent=state.root;
  const active=state.dict.length+state.tag.length+[state.lang,state.pos,state.status,state.modern,state.shifted,state.usage,state.root].filter(Boolean).length;
  $('dict-filter-count').textContent=active?`(${active})`:'';
}
function readControls(){
  state.dict=[...document.querySelectorAll('#dict-dicts input:checked')].map(box=>box.value);
  state.tag=[...document.querySelectorAll('#dict-tags input:checked')].map(box=>box.value);
  state.lang=$('dict-lang').value;state.pos=$('dict-pos').value;state.status=$('dict-status').value;state.sort=$('dict-sort').value;
  for(const flag of ['modern','shifted','usage'])state[flag]=$(`dict-${flag}`).checked;
}
const url=next=>`${location.pathname}${stateQuery(next)}`;
function commit(push){const href=url(state);if(href!==location.pathname+location.search)history[push?'pushState':'replaceState'](null,'',href);}
function change({push=true,keepPage=false}={}){if(!keepPage)state.page=1;state.entry='';fillControls();commit(push);apply();}

function note(text){$('dict-note').textContent=text||'';$('dict-note').hidden=!text;}
async function apply({reveal=false}={}){
  const token=++run,needed=neededDictionaries(index,state);
  const pending=needed.filter(info=>!loaded.has(info.id));
  if(pending.length)$('dict-count').textContent=`Loading ${pending.map(info=>info.name).join(', ')}…`;
  let items;
  try{items=(await Promise.all(needed.map(loadDictionary))).flat();}
  catch(error){if(token===run){$('dict-count').textContent=error.message;$('dict-results').innerHTML='';}return;}
  if(token!==run)return;
  if(state.sort==='frequency'&&!frequencies){
    note('Loading frequencies from authorized translations… Entries are shown alphabetically until they arrive.');
    loadFrequencies().then(counts=>{frequencies=counts;note('');if(state.sort==='frequency')apply();},error=>{if(state.sort==='frequency')note(`${error.message} Entries are shown alphabetically.`);});
  }else if(state.sort!=='frequency'||frequencies)note('');
  shown=sortMatches(filterItems(items,state),state.sort,state.sort==='frequency'&&frequencies?frequency:null);
  if(reveal&&state.entry){const at=shown.findIndex(item=>item.id===state.entry);if(at>=0)state.page=Math.floor(at/pageSize)+1;}
  render();
}

function resultCount(){
  const n=shown.length;
  return n?`${count(n)} entr${n===1?'y matches':'ies match'}`:'No entries match';
}
// With exactly one dictionary chosen, its About box shows above the results
// (open when the URL says about=1, as the tooltip's dictionary link does).
function renderAbout(){
  const box=$('dict-about'),info=state.dict.length===1?index.find(item=>item.id===state.dict[0]):null;
  const html=info?dictionaryAboutHtml(info,{summary:`About ${info.name}`,open:state.about,className:'dict-about-box'}):'';
  if(box.dataset.for!==(info?.id||'')||!html){box.innerHTML=html;box.dataset.for=info?.id||'';}
  else box.querySelector('details').open=state.about;
  box.hidden=!html;
}
function render(){
  renderAbout();
  const total=pages(shown.length);state.page=Math.min(state.page,total);
  const slice=shown.slice((state.page-1)*pageSize,state.page*pageSize);
  $('dict-count').textContent=resultCount();
  $('dict-family').hidden=!state.root;
  if(state.root)$('dict-family').innerHTML=`Root <span dir="rtl" lang="ar">${esc(state.root)}</span> — ${count(shown.length)} entr${shown.length===1?'y':'ies'}`;
  const row=item=>rowHtml(item,{expanded:item.id===state.entry,frequency:frequencies&&item.original?frequency(item):0});
  if(!slice.length)$('dict-results').innerHTML='<div class="empty-state"><h3>No entries match</h3><p>Try fewer filters, another spelling, or a shorter search.</p><button type="button" class="secondary" data-action="clear">Clear search and filters</button></div>';
  else if(state.root)$('dict-results').innerHTML=groupByLemma(slice).map(group=>`<section class="dict-group"><h3 class="dict-lemma"><span class="dict-lemma-label">Lemma</span> <span dir="auto">${esc(group.lemma)}</span></h3><ol class="dict-list">${group.items.map(row).join('')}</ol></section>`).join('');
  else $('dict-results').innerHTML=`<ol class="dict-list" aria-label="Dictionary entries">${slice.map(row).join('')}</ol>`;
  $('dict-pages').hidden=total<=1;
  $('dict-page').textContent=shown.length?`Page ${count(state.page)} of ${count(total)} · entries ${count((state.page-1)*pageSize+1)}–${count((state.page-1)*pageSize+slice.length)}`:'';
  $('dict-prev').disabled=state.page<=1;$('dict-next').disabled=state.page>=total;
  const open=state.entry&&slice.find(item=>item.id===state.entry);
  if(open)fillDetail(open);
  standalone(open?null:state.entry);
  commit(false);
}

// An entry named in the URL that is not on this page of results.
async function standalone(id){
  const box=$('dict-standalone');
  if(!id){box.hidden=true;box.innerHTML='';return;}
  const [dictionary,row]=id.split(':'),info=infoFor(dictionary);
  if(!info){box.hidden=true;return;}
  try{
    const item=(await loadDictionary(info))[Number(row)];
    if(!item||state.entry!==id){box.hidden=true;return;}
    box.innerHTML=`<div class="dict-standalone-head"><h2>Entry</h2><button type="button" class="secondary" data-action="close-entry">Close entry</button></div><ol class="dict-list">${rowHtml(item,{expanded:true})}</ol>`;
    box.hidden=false;fillDetail(item,box);
  }catch{box.hidden=true;}
}

function fillDetail(item,scope=$('dict-results')){
  const detail=scope.querySelector(`#${domId(item)}-detail`);if(!detail)return;
  detail.innerHTML=detailHtml(item,infoFor(item.dictionary),{rootHref:root=>url({...state,root,page:1,entry:'',q:''})});
  detail.hidden=false;
  const box=detail.querySelector('.dict-concordance');if(box)fillConcordance(item,box);
}
async function fillConcordance(item,box){
  box.innerHTML='<p class="concordance-note">Loading authorized-translation statistics…</p>';
  try{
    await collection();
    if(!await concordance.ready()){box.innerHTML='<p class="concordance-note">No concordance is published for this collection.</p>';return;}
    const word=item.entry.form,result=item.original?await concordance.lookup(word):await concordance.lookupEnglish(word);
    if(!box.isConnected)return;
    if(!result){box.innerHTML='<p class="concordance-note">Not found in any authorized-translation paragraph.</p>';return;}
    // An English headword: the original words usually found with it, with their transliterations.
    if(!item.original){box.innerHTML=englishSectionHtml(result,{word});box.lastResult=result;transliterations??=createDictionaryStore(base);fillTransliterations(box,transliterations,()=>box.isConnected).catch(()=>{});return;}
    const {n,r=[],w=[]}=result.entry,often=w.slice(0,8).map(pair=>esc(pair[0])).filter(Boolean);
    const via=result.via?` (counted as <span dir="auto">${esc(result.matched)}</span>, ${esc(String(result.via).replace(/–/g,''))} removed)`:'';
    box.innerHTML=`<h3 class="concordance-heading">In authorized translations</h3><p class="concordance-count">Found in ${count(n)} paragraph${Number(n)===1?'':'s'}${via}</p>${often.length?`<p class="concordance-often">Often appears with: ${often.join(' · ')}</p>`:''}<p class="concordance-actions">${r.length?`<button type="button" class="secondary" data-action="passages" aria-label="Show passages with ${esc(word)}">Show passages</button>`:''}<span class="concordance-note">Statistics from authorized paragraphs, not a word-for-word translation.</span></p>`;
    box.lastResult=result;
  }catch(error){box.innerHTML=`<p class="concordance-error">${esc(error.message)}</p>`;}
}

function toggle(button){
  const li=button.closest('.dict-item'),id=li.dataset.id,inStandalone=!!button.closest('#dict-standalone');
  if(inStandalone){state.entry='';commit(false);standalone(null);return;}
  const opening=state.entry!==id;
  for(const other of $('dict-results').querySelectorAll('.dict-item.is-open')){other.classList.remove('is-open');other.querySelector('.dict-row').setAttribute('aria-expanded','false');const d=other.querySelector('.dict-detail');d.hidden=true;d.innerHTML='';}
  state.entry=opening?id:'';commit(false);standalone(null);
  if(!opening)return;
  li.classList.add('is-open');button.setAttribute('aria-expanded','true');
  fillDetail(shown.find(item=>item.id===id));
}

function onResultsClick(event){
  const action=event.target.closest('[data-action]');
  if(action?.dataset.action==='clear'){Object.assign(state,stateFromParams(''));change();$('dict-q').focus();return;}
  if(action?.dataset.action==='close-entry'){state.entry='';commit(false);standalone(null);return;}
  const passages=action?.dataset.action==='passages'?action:event.target.closest('.dict-concordance .concordance-open');
  if(passages){
    const box=passages.closest('.dict-concordance'),item=passages.closest('.dict-item');
    if(!box?.lastResult)return;
    const form=item.querySelector('.dict-word').textContent;
    openConcordanceDialog({word:form,result:box.lastResult,getRecord,paragraphUrl:(id,reference)=>paragraphUrl('./',id,reference),returnFocus:passages});
    return;
  }
  const root=event.target.closest('.dict-root-link');
  if(root){if(event.metaKey||event.ctrlKey||event.shiftKey||event.button)return;event.preventDefault();state.root=root.dataset.root;state.q='';change();$('dict-family').focus();return;}
  const row=event.target.closest('.dict-row');if(row)toggle(row);
}
// Arrow keys, Home and End move between result rows.
function onResultsKey(event){
  const row=event.target.closest?.('.dict-row');if(!row||!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  const rows=[...$('dict-results').querySelectorAll('.dict-row')],at=rows.indexOf(row);
  const next={ArrowDown:at+1,ArrowUp:at-1,Home:0,End:rows.length-1}[event.key];
  if(rows[next]){event.preventDefault();rows[next].focus();}
}

function setUp(){
  $('dict-dicts').innerHTML=index.map(info=>`<div class="dict-check-row"><label class="dict-check"><input type="checkbox" value="${esc(info.id)}"> <span>${esc(info.name.replace(/^Sample:\s*/,''))} <small>${count(info.entries)}${info.aiGenerated?' · AI-generated':''}</small></span></label>${dictionaryAboutHtml(info,{summary:'About',className:'dict-filter-about'})}</div>`).join('');
  $('dict-tags').innerHTML=wordTags.map(tag=>`<label class="dict-check dict-tag-check"><input type="checkbox" value="${tag}"> <span class="word-tag tag-${tag}">${esc(tagLabels[tag])}</span></label>`).join('');
  $('dict-pos').innerHTML='<option value="">Any part of speech</option>'+posGroups.map(group=>`<option value="${group}">${posLabels[group]}</option>`).join('');
  $('dict-sort').innerHTML=sorts.map(sort=>`<option value="${sort}">${sortLabels[sort]}</option>`).join('');
  for(const id of ['dict-dicts','dict-tags'])$(id).addEventListener('change',()=>{readControls();change();});
  for(const id of ['dict-lang','dict-pos','dict-status','dict-modern','dict-shifted','dict-usage','dict-sort'])$(id).addEventListener('change',()=>{readControls();change();});
  $('dict-root-clear').onclick=()=>{state.root='';change();$('dict-q').focus();};
  $('dict-clear').onclick=()=>{const q=state.q;Object.assign(state,stateFromParams(''),{q,sort:state.sort});change();};
  $('dict-q').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{state.q=$('dict-q').value;state.page=1;state.entry='';commit(false);apply();},220);});
  $('dict-search-form').onsubmit=event=>{event.preventDefault();clearTimeout(searchTimer);state.q=$('dict-q').value;state.page=1;state.entry='';commit(true);apply();};
  $('dict-prev').onclick=()=>{state.page--;state.entry='';commit(true);render();$('dict-count').scrollIntoView({block:'start'});$('dict-results').querySelector('.dict-row')?.focus({preventScroll:true});};
  $('dict-next').onclick=()=>{state.page++;state.entry='';commit(true);render();$('dict-count').scrollIntoView({block:'start'});$('dict-results').querySelector('.dict-row')?.focus({preventScroll:true});};
  $('dict-about').addEventListener('toggle',event=>{state.about=event.target.open;commit(false);},true);
  $('dict-results').addEventListener('click',onResultsClick);$('dict-standalone').addEventListener('click',onResultsClick);
  $('dict-results').addEventListener('keydown',onResultsKey);
  window.addEventListener('popstate',()=>{state=stateFromParams(location.search);fillControls();apply({reveal:true});});
  // Filters stay open beside the results on wide screens and fold into a disclosure on narrow ones.
  const wide=matchMedia('(min-width: 801px)');const fold=()=>{$('dict-filters').open=wide.matches;};wide.addEventListener('change',fold);fold();
  fetch(new URL('help.html',base),{method:'HEAD'}).then(response=>{if(response.ok)$('help-link').hidden=false;},()=>{});
}

try{
  const response=await fetch(new URL('dictionaries/index.json',base));
  if(!response.ok)throw Error('No published dictionaries were found.');
  index=((await response.json()).dictionaries||[]).filter(info=>info.file);
  if(!index.length)throw Error('No published dictionaries were found.');
  setUp();fillControls();await apply({reveal:true});
}catch(error){$('dict-count').textContent=error.message;}

// For checks: the current matches and state.
window.piDictionaryBrowser={state:()=>({...state}),count:()=>shown.length,ids:()=>shown.slice(0,pageSize).map(item=>item.id),loaded:()=>[...loaded.keys()],key:dictionaryKey};
