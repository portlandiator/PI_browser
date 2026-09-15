import {escapeHtml as esc,normalize,tokenize,parseQuery,matchRanges} from './text.mjs';
import {loadCompressed} from './data.mjs';
const $=id=>document.getElementById(id);
const filters=['author','volume','date','addressee','place','availability'];
const labels={author:'Author',volume:'Volume',date:'Date',addressee:'Addressee',place:'Place',availability:'Availability'};
let worker,requestId=0,currentSearch=0,readerRequest=0,facets={},lastResults=null,reading=null;
let datasetBase,datasetPath;
const recordCache=new Map();
let preferences={mode:'parallel',scale:1};
try{preferences={...preferences,...JSON.parse(localStorage.getItem('pi-reading')||'{}')};}catch{}
if(!['parallel','en','original'].includes(preferences.mode))preferences.mode='parallel';
preferences.scale=Math.max(.85,Math.min(1.35,Number(preferences.scale)||1));
function savePreferences(){try{localStorage.setItem('pi-reading',JSON.stringify(preferences));}catch{}}
function stateFromUrl(){const params=new URLSearchParams(location.search);return {query:params.get('q')||'',language:['both','en','original'].includes(params.get('language'))?params.get('language'):'both',sort:['id','title','volume','date'].includes(params.get('sort'))?params.get('sort'):'id',page:Math.max(1,parseInt(params.get('page'))||1),id:params.get('id')||'',filters:Object.fromEntries(filters.map(key=>[key,params.get(key)||'']))};}
let state=stateFromUrl();
function urlFor(next){const params=new URLSearchParams();if(next.query)params.set('q',next.query);if(next.language!=='both')params.set('language',next.language);for(const key of filters)if(next.filters[key])params.set(key,next.filters[key]);if(next.sort!=='id')params.set('sort',next.sort);if(next.page>1)params.set('page',next.page);if(next.id)params.set('id',next.id);return `${location.pathname}${params.size?'?'+params:''}`;}
function updateUrl(replace=false){history[replace?'replaceState':'pushState']({},'',urlFor(state));}
function syncControls(){
  $('query').value=state.query;$('search-language').value=state.language;$('sort').value=state.sort;
  for(const key of filters){if($(key).tagName==='SELECT'&&state.filters[key]&&![...$(key).options].some(o=>o.value===state.filters[key]))$(key).add(new Option(state.filters[key],state.filters[key]));$(key).value=state.filters[key];}
  $('query-clear').hidden=!state.query;
}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,2800);}
function showError(container,message,retry){container.innerHTML=`<div class="empty-state"><h3>We couldn’t open this just yet.</h3><p>${esc(message)}</p><button class="secondary" data-retry>Try again</button></div>`;container.querySelector('[data-retry]').onclick=retry;}
function setupWorker(){
  worker=new Worker(new URL('./search-worker.mjs',import.meta.url),{type:'module'});
  worker.onerror=()=>{showError($('results'),'Search could not start. Please reload this page in a current browser.',()=>location.reload());$('results').setAttribute('aria-busy','false');$('results-heading').textContent='Search unavailable';};
  worker.onmessage=({data})=>{
    if(data.type==='init'){
      facets=data.facets;$('collection-count').textContent=data.total.toLocaleString();
      for(const key of ['author','volume']){const selected=state.filters[key];$(key).innerHTML=`<option value="">All ${key==='author'?'authors':'volumes'}</option>`;for(const value of facets[key])$(key).add(new Option(key==='volume'?`Volume ${value}`:value,value));$(key).value=selected;}
      for(const key of ['place','addressee'])updateSuggestions(key);
      return;
    }
    if(data.requestId!==currentSearch)return;
    $('results').setAttribute('aria-busy','false');
    if(data.type==='error'){$('results-heading').textContent='Search unavailable';showError($('results'),data.message,runSearch);return;}
    lastResults=data;state.page=data.page;updateUrl(true);renderResults(data);
  };
  worker.postMessage({type:'init',requestId:++requestId,dataset:datasetPath});
}
function updateSuggestions(key){const q=normalize($(key).value);const choices=(facets[key]||[]).filter(value=>!q||normalize(value).includes(q)).slice(0,100);$(key+'-options').innerHTML=choices.map(value=>`<option value="${esc(value)}"></option>`).join('');}
function displayTitle(record){if(record.title)return record.title;if(record.addressee)return `To ${record.addressee}`;return record.excerpt?record.excerpt.slice(0,85)+(record.excerpt.length>85?'…':''):record.id;}
function highlight(text){
  let result='',end=0;for(const [start,stop] of matchRanges(text,state.query)){result+=esc(text.slice(end,start))+`<mark>${esc(text.slice(start,stop))}</mark>`;end=stop;}return result+esc(text.slice(end));
}
function renderResults(data){
  $('results-heading').textContent=`${data.total.toLocaleString()} ${data.total===1?'text':'texts'}${state.query?' found':''}`;
  $('active-filters').innerHTML=filters.filter(key=>state.filters[key]).map(key=>`<button class="filter-chip" data-remove="${key}" aria-label="Remove ${labels[key]} filter">${labels[key]}: ${esc(state.filters[key])}<span aria-hidden="true">×</span></button>`).join('');
  if(!data.total){$('results').innerHTML=`<div class="empty-state"><h3>No texts found.</h3><p>Try another spelling, fewer words, or a different filter.<br>For an ID, use the complete filename, such as BH00001.</p><button id="clear-all" class="secondary">Clear search and filters</button></div>`;$('clear-all').onclick=resetAll;}
  else{
    $('results').innerHTML=data.rows.map(row=>`<a class="result-row" href="${esc(urlFor({...state,id:row.id}))}" data-id="${esc(row.id)}"><div class="result-code">${esc(row.id)}</div><div class="result-body"><div class="result-author">${esc(row.author)}${row.matches?' · '+(row.matches.length===2?'Both languages':row.matches[0]==='en'?'English match':'Original match'):''}</div><h3 class="result-title" dir="auto">${esc(displayTitle(row))}</h3><p class="result-excerpt" data-excerpt="${esc(row.id)}" dir="${!row.hasEnglish&&row.hasOriginal?'rtl':'ltr'}">${highlight(row.excerpt)}</p><div class="result-meta"><span>${esc(row.date||'Date not recorded')}</span>${row.volume?`<span>Vol. ${esc(row.volume)}</span>`:''}${row.place?`<span>${esc(row.place)}</span>`:''}${!(row.hasEnglish&&row.hasOriginal)?`<span class="availability-label">${row.hasEnglish?'English only':row.hasOriginal?'Original only':'Catalogue record'}</span>`:''}</div></div><span class="result-arrow" aria-hidden="true">↗</span></a>`).join('');
    if(state.query&&!/^[a-z]{2}\d/i.test(state.query))loadExcerpts(data.rows,currentSearch);
  }
  $('pagination').hidden=data.pages<=1;$('prev-page').disabled=data.page<=1;$('next-page').disabled=data.page>=data.pages;$('page-status').textContent=`Page ${data.page.toLocaleString()} of ${data.pages.toLocaleString()}`;
}
async function getRecord(id){
  if(!/^[\p{L}\p{N}_ ()-]+$/u.test(id))throw new Error('Invalid text ID. Use a filename such as BH00001.');
  if(recordCache.has(id))return recordCache.get(id);
  const promise=loadCompressed(new URL(`data/${encodeURIComponent(id)}.json.gz`,datasetBase)).catch(error=>{recordCache.delete(id);throw error;});
  recordCache.set(id,promise);if(recordCache.size>30)recordCache.delete(recordCache.keys().next().value);return promise;
}
async function loadExcerpts(rows,searchId){
  let next=0;const groups=parseQuery(state.query),words=new Set(groups.flatMap(g=>g.words));
  await Promise.all(Array.from({length:4},async()=>{while(next<rows.length){const row=rows[next++];if(searchId!==currentSearch)return;try{
    const record=await getRecord(row.id);if(searchId!==currentSearch)return;
    const language=row.matches?.includes('en')?'en':'original';
    const parts=[...record[language].paragraphs,...record[language].notes];
    const locate=part=>{const chunks=[...part.plain.matchAll(/[\p{L}\p{N}\p{M}]+/gu)],normalized=chunks.map(c=>normalize(c[0]));let found=-1;for(const group of groups.filter(g=>g.phrase)){found=normalized.findIndex((_,i)=>group.words.every((w,j)=>normalized[i+j]===w));if(found>=0)return {part,score:1000+group.words.length,first:chunks[found].index};}found=normalized.findIndex(w=>words.has(w));return {part,score:found<0?0:1,first:found<0?0:chunks[found].index};};
    const scored=parts.map(locate).sort((a,b)=>b.score-a.score);
    let text=scored[0]?.part.plain||row.excerpt;
    const first=scored[0]?.first||0;
    const start=Math.max(0,first-65);text=(start?'…':'')+text.slice(start,start+270)+(text.length>start+270?'…':'');
    const node=document.querySelector(`[data-excerpt="${CSS.escape(row.id)}"]`);if(node){node.innerHTML=highlight(text);node.dir=language==='original'?'rtl':'ltr';}
  }catch{/* Catalogue opening words remain usable if an excerpt fails. */}}}));
}
function runSearch(){
  if(!worker)return;
  currentSearch=++requestId;$('results').setAttribute('aria-busy','true');$('results-heading').textContent='Searching…';$('pagination').hidden=true;
  worker.postMessage({type:'search',requestId:currentSearch,...state});
}
function submitSearch(){state={...state,query:$('query').value.trim(),language:$('search-language').value,sort:$('sort').value,page:1,id:'',filters:Object.fromEntries(filters.map(key=>[key,$(key).value.trim()]))};updateUrl();showCollection();runSearch();$('query-clear').hidden=!state.query;}
function resetAll(){state={query:'',language:'both',sort:'id',page:1,id:'',filters:Object.fromEntries(filters.map(k=>[k,'']))};syncControls();updateUrl();runSearch();}
function showCollection(){readerRequest++;$('collection').hidden=false;$('reader').hidden=true;document.title='Partial Inventory browser';}
function backToCollection(){state.id='';updateUrl();showCollection();syncControls();if(!lastResults)runSearch();$('results-heading').scrollIntoView({block:'start'});$('query').focus({preventScroll:true});}
function metadataValue(label,value){return `<div><dt>${label}</dt><dd>${esc(value||'Not recorded')}</dd></div>`;}
function paragraphHtml(part,i,language){return `<div class="paragraph-cell ${language==='en'?'english-cell':'original-cell'}" dir="${language==='en'?'ltr':'rtl'}" lang="${language==='en'?'en':'fa'}" id="p-${language}-${i+1}"><a class="paragraph-number" href="#p-${language}-${i+1}" aria-label="${language==='en'?'English':'Original'} paragraph ${i+1}">${String(i+1).padStart(2,'0')}</a><p>${part.html}</p></div>`;}
function notesHtml(record){if(!record.en.notes.length&&!record.original.notes.length)return '';return `<section class="footnotes" aria-label="Footnotes"><h2>Notes</h2>${['en','original'].map(lang=>record[lang].notes.length?`<div class="${lang==='en'?'english':'original'}-notes" dir="${lang==='en'?'ltr':'rtl'}"><h3>${lang==='en'?'English translation':'فارسی / العربية'}</h3><ol>${record[lang].notes.map(note=>`<li id="note-${lang}-${note.number}">${note.html} <a href="#ref-${lang}-${note.number}" aria-label="Return to footnote ${note.number}">↩</a></li>`).join('')}</ol></div>`:'').join('')}</section>`;}
let visibleParagraphs=100;
let readerMatches=[],matchCursor=-1;
function collectReadingMatches(record){
  const groups=parseQuery(state.query);
  if(!groups.length||state.query.replace(/\.txt$/i,'').toUpperCase()===record.id.toUpperCase())return [];
  const matches=[];
  for(const language of state.language==='both'?['en','original']:[state.language]){
    for(const kind of ['paragraphs','notes'])record[language][kind].forEach((part,index)=>{
      const tokens=tokenize(part.plain);
      if(groups.some(g=>g.phrase?tokens.some((_,i)=>g.words.every((w,j)=>tokens[i+j]===w)):g.words.some(w=>tokens.includes(w))))matches.push({language,kind,index,id:kind==='paragraphs'?`p-${language}-${index+1}`:`note-${language}-${index+1}`});
    });
  }
  return matches;
}
function highlightReading(){
  if(!readerMatches.length)return;
  for(const match of readerMatches){
    const element=document.getElementById(match.id);if(!element||element.querySelector('mark'))continue;
    const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT),nodes=[];let text='';
    while(walker.nextNode())if(walker.currentNode.parentElement.tagName!=='A'){nodes.push({node:walker.currentNode,start:text.length});text+=walker.currentNode.textContent;}
    const ranges=matchRanges(text,state.query);
    for(const {node,start} of nodes){const value=node.textContent,local=ranges.filter(([a,b])=>b>start&&a<start+value.length).map(([a,b])=>[Math.max(0,a-start),Math.min(value.length,b-start)]);if(!local.length)continue;const fragment=document.createDocumentFragment();let end=0;for(const [a,b] of local){fragment.append(document.createTextNode(value.slice(end,a)));const mark=document.createElement('mark');mark.textContent=value.slice(a,b);fragment.append(mark);end=b;}fragment.append(document.createTextNode(value.slice(end)));node.replaceWith(fragment);}
  }
}
function nextMatch(){
  if(!readerMatches.length)return;
  matchCursor=(matchCursor+1)%readerMatches.length;const match=readerMatches[matchCursor];
  if(preferences.mode!=='parallel'&&preferences.mode!==match.language){preferences.mode='parallel';applyReadingPreferences();}
  if(match.kind==='paragraphs'&&match.index>=visibleParagraphs){visibleParagraphs=Math.ceil((match.index+1)/100)*100;renderReading();}
  document.getElementById(match.id)?.scrollIntoView({block:'center'});
  $('match-label').textContent=`Match ${matchCursor+1} of ${readerMatches.length}`;
}
function renderReading(){
  if(!reading)return;
  const record=reading;const n=Math.max(record.en.paragraphs.length,record.original.paragraphs.length);
  let html='';
  if(record.paired){for(let i=0;i<Math.min(n,visibleParagraphs);i++)html+=`<div class="paragraph-pair">${paragraphHtml(record.en.paragraphs[i],i,'en')}${paragraphHtml(record.original.paragraphs[i],i,'original')}</div>`;}
  else{
    html='<div class="independent-columns">'+['en','original'].map(lang=>`<div class="${lang==='en'?'english-cell':'original-cell'}">${record[lang].paragraphs.length?record[lang].paragraphs.slice(0,visibleParagraphs).map((p,i)=>paragraphHtml(p,i,lang)).join(''):`<div class="paragraph-cell"><p class="missing-version">${lang==='en'?'An English translation':'The original text'} is not available for this record.</p></div>`}</div>`).join('')+'</div>';
  }
  $('reading-paragraphs').innerHTML=html;
  $('reading-more').innerHTML=n>visibleParagraphs?`<button class="secondary" id="more-paragraphs">Continue reading · ${Math.min(n-visibleParagraphs,100)} more paragraphs</button>`:'';
  document.querySelector('.reader-end').hidden=n>visibleParagraphs;
  if($('more-paragraphs'))$('more-paragraphs').onclick=()=>{visibleParagraphs+=100;renderReading();};
  applyReadingPreferences();
  highlightReading();
}
function applyReadingPreferences(){const view=$('reading-view');if(!view)return;view.dataset.mode=preferences.mode;view.style.setProperty('--scale',preferences.scale);document.querySelectorAll('[data-mode-button]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.modeButton===preferences.mode)));$('size-label').textContent=`${Math.round(preferences.scale*100)}%`;$('size-down').disabled=preferences.scale<=.85;$('size-up').disabled=preferences.scale>=1.35;}
async function openReader(id,{push=true}={}){
  id=id.replace(/\.txt$/i,'').toUpperCase();state.id=id;if(push)updateUrl();const token=++readerRequest;
  $('collection').hidden=true;$('reader').hidden=false;$('reader-id').textContent=id;$('reader-content').innerHTML='<div class="loading-state"><div class="loading-line"></div><p>Opening text…</p></div>';window.scrollTo(0,0);
  try{
    const record=await getRecord(id);if(token!==readerRequest)return;reading=record;visibleParagraphs=100;readerMatches=collectReadingMatches(record);matchCursor=-1;
    const title=record.title||(record.addressee?`To ${record.addressee}`:record.id);
    document.title=`${record.id} · ${title} — Partial Inventory browser`;
    const extra=Object.entries(record.metadata).filter(([key,value])=>value&&!['ID','Title','Date','volume_number','Addressee','Place','thumbnail'].includes(key));
    const notice=record.paired?'Paragraphs paired by source order. Matching paragraph counts do not certify alignment.':record.hasOriginal&&record.hasEnglish?`Paragraph counts differ (${record.en.paragraphs.length} English / ${record.original.paragraphs.length} original). Each language follows its own source order.`:'This record does not have both language versions available.';
    $('reader-content').innerHTML=`<header class="reader-header"><div class="eyebrow">${esc(record.id)}${record.volume?' · Volume '+esc(record.volume):''}</div><h1 id="reader-title" tabindex="-1">${esc(title)}</h1><div class="reader-author">${esc(record.author)}</div><dl class="reader-metadata">${metadataValue('Date',record.date)}${metadataValue('Addressee',record.addressee)}${metadataValue('Place',record.place)}</dl>${extra.length?`<details class="source-details"><summary>Catalogue details &amp; source notes</summary><dl>${extra.map(([key,value])=>`<dt>${esc(({volume_title:'Volume title',authorized:'Translation status (source code)',Abstract:'Abstract',Question:'Question',ext:'Source extension'})[key]||key)}</dt><dd>${esc(value)}</dd>`).join('')}</dl></details>`:''}</header><div class="reader-controls"><div class="segmented" role="group" aria-label="Reading language"><button data-mode-button="parallel" aria-pressed="true">Parallel</button><button data-mode-button="en" aria-pressed="false">English</button><button data-mode-button="original" aria-pressed="false">Original</button></div><div class="type-controls" role="group" aria-label="Text size"><button id="size-down" aria-label="Decrease text size">A−</button><span id="size-label">100%</span><button id="size-up" aria-label="Increase text size">A+</button></div></div><p class="alignment-note">${notice}</p><div id="reading-view" class="reading-view" data-mode="parallel"><div class="language-headings"><span class="english-heading">English translation</span><span class="original-heading">Original · فارسی / العربية</span></div><article class="reading-paper" aria-label="Text and translation"><div id="reading-paragraphs"></div><div id="reading-more" class="load-more-reading"></div>${notesHtml(record)}</article></div><div class="reader-end" aria-label="End of text">❧</div>`;
    renderReading();
    if(readerMatches.length){const bar=document.createElement('div');bar.className='reader-search';bar.innerHTML=`<span>Search: <strong>${esc(state.query)}</strong></span><span id="match-label">${readerMatches.length} matching passages</span><button class="text-button" id="next-match">Next match ↓</button>`;document.querySelector('.reader-controls').after(bar);$('next-match').onclick=nextMatch;}
    document.querySelectorAll('[data-mode-button]').forEach(button=>button.onclick=()=>{preferences.mode=button.dataset.modeButton;savePreferences();applyReadingPreferences();});
    $('size-down').onclick=()=>{preferences.scale=Math.max(.85,Math.round((preferences.scale-.05)*100)/100);savePreferences();applyReadingPreferences();};
    $('size-up').onclick=()=>{preferences.scale=Math.min(1.35,Math.round((preferences.scale+.05)*100)/100);savePreferences();applyReadingPreferences();};
    $('reader-title').focus({preventScroll:true});
    jumpToHash();
  }catch(error){if(token!==readerRequest)return;$('reader-content').innerHTML=`<div class="empty-state"><h1 id="reader-title">Text unavailable</h1><p>We couldn’t open ${esc(id)}. Check the ID and your connection.</p><button class="secondary" id="retry-reader">Try again</button></div>`;$('retry-reader').onclick=()=>openReader(id,{push:false});}
}
function jumpToHash(){
  if(!location.hash)return;
  const hash=decodeURIComponent(location.hash.slice(1));
  const paragraph=/^p-(en|original)-(\d+)$/.exec(hash);
  if(paragraph&&Number(paragraph[2])>visibleParagraphs){visibleParagraphs=Math.ceil(Number(paragraph[2])/100)*100;renderReading();}
  // Notes may link back to a paragraph beyond the initially rendered section.
  if(/^ref-(en|original)-\d+$/.test(hash)&&!document.getElementById(hash)&&reading){visibleParagraphs=Math.max(reading.en.paragraphs.length,reading.original.paragraphs.length);renderReading();}
  document.getElementById(hash)?.scrollIntoView({block:'center'});
}
$('search-form').onsubmit=event=>{event.preventDefault();submitSearch();};
$('query').oninput=()=>{$('query-clear').hidden=!$('query').value;};
$('query-clear').onclick=()=>{$('query').value='';submitSearch();$('query').focus();};
$('phrase-example').onclick=()=>{$('query').value='"the love of God"';submitSearch();};
for(const key of ['author','volume','availability','sort','search-language'])$(key).onchange=submitSearch;
let filterTimer;for(const key of ['date','addressee','place']){$(key).oninput=()=>{if(facets[key])updateSuggestions(key);clearTimeout(filterTimer);filterTimer=setTimeout(submitSearch,400);};$(key).onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();clearTimeout(filterTimer);submitSearch();}};}
$('reset-filters').onclick=()=>{for(const key of filters)$(key).value='';submitSearch();};
$('active-filters').onclick=event=>{const button=event.target.closest('[data-remove]');if(button){$(button.dataset.remove).value='';submitSearch();}};
$('results').onclick=event=>{const row=event.target.closest('[data-id]');if(row&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey){event.preventDefault();openReader(row.dataset.id);}};
for(const [id,delta] of [['prev-page',-1],['next-page',1]])$(id).onclick=()=>{state.page+=delta;updateUrl();runSearch();$('results-heading').scrollIntoView({block:'start'});};
$('filter-toggle').onclick=()=>{const expanded=$('filter-fields').classList.toggle('expanded');$('filter-toggle').setAttribute('aria-expanded',String(expanded));$('filter-toggle').lastElementChild.textContent=expanded?'−':'+';};
$('back-results').onclick=backToCollection;
$('copy-link').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);toast('Link copied');}catch{toast('Copy the link from your browser’s address bar.');}};
for(const id of ['about-open','footer-about'])$(id).onclick=()=>$('about-dialog').showModal();
$('about-close').onclick=()=>$('about-dialog').close();
$('about-dialog').onclick=event=>{if(event.target===$('about-dialog')){const rect=event.target.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)event.target.close();}};
window.addEventListener('popstate',()=>{const next=stateFromUrl();if(urlFor(next)===urlFor(state)){jumpToHash();return;}state=next;syncControls();if(state.id)openReader(state.id,{push:false});else{showCollection();runSearch();}});
window.addEventListener('hashchange',jumpToHash);
document.addEventListener('click',event=>{const link=event.target.closest('a[href^="#"]');if(link&&reading){const hash=link.getAttribute('href');if(hash.startsWith('#ref-')&&!document.querySelector(hash)){visibleParagraphs=Math.max(reading.en.paragraphs.length,reading.original.paragraphs.length);renderReading();}}});
syncControls();
try{
  const response=await fetch(new URL('./stats.json',import.meta.url),{cache:'no-cache'});
  if(!response.ok)throw new Error('The collection manifest could not be loaded. Please reload the page.');
  const stats=await response.json();datasetPath=stats.dataset||'./';datasetBase=new URL(datasetPath,import.meta.url);
  $('about-stats').textContent=`The collection contains ${stats.records.toLocaleString()} catalogue records, including ${stats.pairs.toLocaleString()} texts with both language versions. ${stats.metadataOnly.toLocaleString()} records have metadata only.`;
  setupWorker();runSearch();if(state.id)openReader(state.id,{push:false});
}catch(error){showError($('results'),error.message,()=>location.reload());$('results').setAttribute('aria-busy','false');$('results-heading').textContent='Collection unavailable';}
