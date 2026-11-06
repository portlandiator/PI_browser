// The word tooltip's "In authorized translations" section and passages dialog.
// The concordance counts the authorized-translation paragraphs whose original
// contains a word form, lists where, and names English words that often appear
// in those paragraphs. These are statistics only: never present them as the
// word's translation or as a word-for-word alignment. The reverse
// concordance does the same for an English word: the original word forms
// most often found in the paragraphs paired with it ("Usually renders"),
// shown as likely sources, never as certain ones.
import {escapeHtml as esc} from './text.mjs';
import {candidateKeys,dictionaryKey,isOriginalScript,textLanguage,textWords} from './dictionary.mjs';
import {attachWordTooltip,fillInterlinear,interlinearBlockHtml} from './word-study.mjs';
import {readingSlots,alignmentCounts} from './paragraph-alignment.mjs';
import {concordanceShard} from './concordance.mjs';

const shardLimit=64;
const statisticsNote='statistics from authorized paragraphs, not a word-for-word translation';
const count=n=>Number(n||0).toLocaleString('en-US');
const fetchJsonDefault=url=>fetch(url).then(response=>response.ok?response.json():null);

// Concordance data published at <base>/concordance/. It is used only when its
// index names the dataset the reader shows, so stale data never mixes with a
// new collection. `shard` maps a key to its shard number. Original word forms
// are in o-<n>.json, English words (when the index says `english`) in e-<n>.json.
export function createConcordance(base,datasetPath,{fetchJson=fetchJsonDefault,shard=concordanceShard}={}){
  const url=path=>new URL(`concordance/${path}`,base);
  const shards=new Map();let index=null;
  const usable=()=>index||=Promise.resolve().then(()=>fetchJson(url('index.json'))).then(value=>value?.format===1&&value.dataset===datasetPath?value:null,()=>null);
  async function load(file){
    if(shards.has(file)){const value=shards.get(file);shards.delete(file);shards.set(file,value);return value;}
    const promise=Promise.resolve().then(()=>fetchJson(url(file))).then(value=>value&&typeof value==='object'?value:{},()=>{shards.delete(file);return {};});
    shards.set(file,promise);if(shards.size>shardLimit)shards.delete(shards.keys().next().value);
    return promise;
  }
  async function entryFor(prefix,key){
    const entry=(await load(`${prefix}-${shard(key)}.json`))[key];
    return entry&&typeof entry==='object'&&Number(entry.n)>0?entry:null;
  }
  // The word as written first, then forms with a common prefix or suffix removed.
  async function find(word,prefix,extra){
    const key=dictionaryKey(word);if(!key)return null;
    for(const candidate of candidateKeys(word)){
      const entry=await entryFor(prefix,candidate.key);
      if(entry)return {key,matched:candidate.key,via:candidate.stripped,entry,...extra};
    }
    return null;
  }
  const api={
    async ready(){return !!await usable();},
    async lookup(word){return await usable()?find(word,'o',{}):null;},
    // An English word (plural, -ed, -ing … removed when needed).
    async lookupEnglish(word){if(isOriginalScript(word)||!(await usable())?.english)return null;return find(word,'e',{english:true});},
    lookupAny(word){return isOriginalScript(word)?api.lookup(word):api.lookupEnglish(word);},
  };
  return api;
}

// The tooltip section for a lookup result ('' when there is none). `shortcut`
// (the tooltip was opened from the keyboard) names the P key on the button.
export function concordanceSectionHtml(result,{word='',shortcut=false}={}){
  if(!result?.entry)return '';
  const {n,r=[],w=[]}=result.entry;
  const via=result.via?` <span class="concordance-via">(counted as <span dir="auto">${esc(result.matched)}</span>, ${esc(String(result.via).replace(/–/g,''))} removed)</span>`:'';
  const words=w.slice(0,4).map(item=>esc(item[0])).filter(Boolean);
  const often=words.length?` · <span class="concordance-often"><span class="sr-only">often appears with </span>${words.join(', ')}</span>`:'';
  const open=r.length?`<button type="button" class="text-button concordance-open" data-concordance-key="${esc(result.matched)}"${word?` aria-label="Show passages with ${esc(word)}"`:''}${shortcut?' aria-keyshortcuts="P"':''}>Show passages${shortcut?' (P)':''}</button>`:'';
  // One or two lines: the count and frequent words, then Show passages and the statistics note.
  return `<section class="word-tooltip-concordance" title="${statisticsNote[0].toUpperCase()+statisticsNote.slice(1)}"><p class="concordance-line"><span class="concordance-heading">Authorized translations:</span> <span class="concordance-count">${count(n)}<span aria-hidden="true"> ¶</span><span class="sr-only"> paragraph${Number(n)===1?'':'s'}</span></span>${via}${often}</p><p class="concordance-actions">${open}<span class="concordance-note">statistics, not a translation</span></p></section>`;
}

// The English section of a word tooltip: how often the word is found in
// authorized paragraphs and the original words most often paired with it
// (up to 4, right to left, each followed by its transliteration once
// fillTransliterations has looked it up).
export function englishSectionHtml(result,{word='',shortcut=false}={}){
  if(!result?.entry)return '';
  const {n,r=[],o=[]}=result.entry;
  const via=result.via?` <span class="concordance-via">(counted as <span dir="auto">${esc(result.matched)}</span>, ${esc(String(result.via).replace(/–/g,''))} removed)</span>`:'';
  const sources=o.slice(0,4).filter(item=>item?.[0]).map(([form,,joint])=>`<span class="concordance-source-item" title="Found together in ${count(joint)} of ${count(n)} paragraphs"><span class="concordance-source" dir="rtl" lang="fa" data-concordance-source="${esc(form)}">${esc(form)}</span><span class="concordance-translit" dir="ltr"></span></span>`);
  const renders=sources.length?`<p class="concordance-renders">Usually renders: ${sources.join('<span class="concordance-sep">, </span>')}</p>`:'';
  const open=r.length?`<button type="button" class="text-button concordance-open" data-concordance-key="${esc(result.matched)}"${word?` aria-label="Show passages with ${esc(word)}"`:''}${shortcut?' aria-keyshortcuts="P"':''}>Show passages${shortcut?' (P)':''}</button>`:'';
  return `<section class="word-tooltip-concordance concordance-english-section" title="${statisticsNote[0].toUpperCase()+statisticsNote.slice(1)}"><p class="concordance-line"><span class="concordance-heading">In authorized translations:</span> <span class="concordance-count">Found in ${count(n)} paragraph${Number(n)===1?'':'s'}</span>${via}</p>${renders}<p class="concordance-actions">${open}<span class="concordance-note">${statisticsNote}</span></p></section>`;
}

// Transliterations of the original words in an English section, from the
// dictionaries turned on in `store` (optional). Resolves true when any was
// filled, so a tooltip can be placed again.
export async function fillTransliterations(root,store,isCurrent=()=>true){
  const items=[...(root?.querySelectorAll?.('[data-concordance-source]')||[])];
  if(!store?.lookup||!items.length)return false;
  const found=await Promise.all(items.map(item=>Promise.resolve().then(()=>store.lookup(item.dataset.concordanceSource,{})).then(result=>(result?.entries||[]).find(entry=>!entry.reverse&&entry.translit)?.translit||'',()=>'')));
  if(!isCurrent())return false;
  let changed=false;
  items.forEach((item,i)=>{const target=item.nextElementSibling;if(found[i]&&target?.classList.contains('concordance-translit')){target.textContent=` ${found[i]}`;changed=true;}});
  return changed;
}

// What the reader's word tooltips need for both directions: `get()` gives
// the concordance once the dataset is known; `store` supplies transliterations.
export function concordanceTools(get,store=null){
  return {english:true,
    lookup:word=>get()?.lookupAny(word)||Promise.resolve(null),
    sectionHtml:(result,options)=>result?.english?englishSectionHtml(result,options):concordanceSectionHtml(result,options),
    fill:(section,isCurrent)=>fillTransliterations(section,store,isCurrent)};
}

// Paragraph text with every word of this key (a key or a Set of keys)
// marked, with `className` on the marks when given.
export function markedText(text,key,className=''){
  text=String(text||'');let html='',cursor=0;
  const hit=typeof key==='string'?value=>value===key:value=>!!key?.has?.(value);
  const open=className?`<mark class="${className}">`:'<mark>';
  for(const word of textWords(text))if(hit(dictionaryKey(word.text))){html+=esc(text.slice(cursor,word.start))+`${open}${esc(word.text)}</mark>`;cursor=word.end;}
  return html+esc(text.slice(cursor));
}

// The English paragraph paired with an original paragraph (1-based) by the
// reader's rule: equal slot counts pair by position, otherwise none.
export function pairedEnglish(record,number){
  if(!record?.en||!record?.original)return null;
  const counts=alignmentCounts(record);if(!counts.en||counts.en!==counts.original)return null;
  const slot=readingSlots(record.original).indexOf(number-1);if(slot<0)return null;
  const index=readingSlots(record.en)[slot];
  return index===null||index===undefined?null:record.en.paragraphs[index]||null;
}

// The original paragraph paired with an English paragraph (1-based), by the same rule.
export function pairedOriginal(record,number){
  if(!record?.en||!record?.original)return null;
  const counts=alignmentCounts(record);if(!counts.en||counts.en!==counts.original)return null;
  const slot=readingSlots(record.en).indexOf(number-1);if(slot<0)return null;
  const index=readingSlots(record.original)[slot];
  return index===null||index===undefined?null:record.original.paragraphs[index]||null;
}

// Passage views in the dialog: the original paragraph above its authorized
// English (parallel), the original alone, or the original word by word.
export const passageViews=['parallel','original','words'];
export const passageView=value=>passageViews.includes(value)?value:'parallel';

export function passageHtml(record,[id,number],key,href,view='parallel'){
  const original=record?.original?.paragraphs?.[number-1];
  if(!original)return '<p class="concordance-error">This passage could not be loaded.</p>';
  view=passageView(view);
  const english=view==='original'?null:pairedEnglish(record,number);
  const link=`<a class="concordance-link" href="${esc(href)}">${esc(record.title||id)} <span class="concordance-ref">${esc(id)} · ¶${count(number)}</span></a>`;
  if(view==='words')return link+interlinearBlockHtml({top:original,topLanguage:'original',topId:'',number,numberHtml:'',bottomLanguage:'en',bottomHtml:english?esc(english.plain):undefined,bottomId:'',match:word=>dictionaryKey(word)===key});
  const englishHtml=view==='original'?'':english?`<p class="concordance-english" dir="ltr" lang="en" data-word-text>${esc(english.plain)}</p>`:'<p class="concordance-note">No English paragraph is paired with this paragraph.</p>';
  return `${link}<p class="concordance-original" dir="rtl" lang="fa" data-word-text>${markedText(original.plain,key)}</p>${englishHtml}`;
}

// A passage of the reverse concordance: the authorized English paragraph with
// the word (`key`) marked, and the original paired with it, where words of
// `sources` (keys of likely sources) are marked as likely-source. Original
// leaves out the English; Words shows the original word by word with the
// likely-source columns marked and the English beneath.
export function englishPassageHtml(record,[id,number],key,sources,href,view='parallel'){
  const english=record?.en?.paragraphs?.[number-1];
  if(!english)return '<p class="concordance-error">This passage could not be loaded.</p>';
  view=passageView(view);
  const original=pairedOriginal(record,number),likely=new Set(sources);
  const link=`<a class="concordance-link" href="${esc(href)}">${esc(record.title||id)} <span class="concordance-ref">${esc(id)} · ¶${count(number)}</span></a>`;
  const englishHtml=`<p class="concordance-english" dir="ltr" lang="en" data-word-text>${markedText(english.plain,key)}</p>`;
  const missing='<p class="concordance-note">No original paragraph is paired with this paragraph.</p>';
  if(view==='words')return original?link+interlinearBlockHtml({top:original,topLanguage:'original',topId:'',number,numberHtml:'',bottomLanguage:'en',bottomHtml:markedText(english.plain,key),bottomId:'',match:word=>likely.has(dictionaryKey(word))?'ilw-likely':false}):link+englishHtml+missing;
  const originalHtml=original?`<p class="concordance-original" dir="rtl" lang="fa" data-word-text>${markedText(original.plain,likely,'likely-source')}</p>`:missing;
  return view==='original'?link+originalHtml:link+englishHtml+originalHtml;
}

const batch=8;
let generation=0,chosenView='parallel',outerFocus=null,dialogTooltip=null;
// The passages dialog: references load 8 at a time. `tools` ({store,
// concordance,mode,vowels,gloss,target}) adds the Words view and word
// tooltips; Show passages in a tooltip there replaces the dialog's contents.
export function openConcordanceDialog(options){
  const {word,result,getRecord,paragraphUrl,returnFocus=null,tools=null}=options;
  if(!result?.entry)return;
  const run=++generation,key=result.matched,refs=result.entry.r||[],english=!!result.english;
  // The likely sources marked in the original: the three original words most often found with the English word.
  const sources=english?(result.entry.o||[]).slice(0,3).map(item=>dictionaryKey(item?.[0]||'')).filter(Boolean):[];
  let dialog=document.getElementById('concordance-dialog');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='concordance-dialog';dialog.className='dictionary-dialog concordance-dialog';dialog.setAttribute('aria-labelledby','concordance-dialog-title');document.body.append(dialog);}
  const reopened=dialog.open;
  if(!reopened)outerFocus=returnFocus;
  if(tools?.store&&!dialogTooltip)dialogTooltip=attachWordTooltip(dialog,tools.store,{layer:dialog,target:()=>tools.target?.()||'',prefer:anchor=>anchor?.closest?.('[data-language]')?.dataset.language||'',concordance:tools.concordance||null,mode:()=>tools.mode?.()||'click',gloss:()=>tools.gloss?.()||'plain',onOpenConcordance:(next,nextResult)=>openConcordanceDialog({...dialog.lastOptions,word:next,result:nextResult,returnFocus:null})});
  dialog.lastOptions=options;
  dialogTooltip?.hide();
  const views=tools?.store?passageViews:passageViews.filter(view=>view!=='words');
  if(!views.includes(chosenView))chosenView='parallel';
  const names={parallel:'Parallel',original:'Original',words:'Words'};
  const listed=refs.length<Number(result.entry.n)?` The first ${count(refs.length)} are listed.`:'';
  const beneath=english?'Beneath each authorized English paragraph is the original paragraph paired with it':'Beneath each original paragraph is its authorized English paragraph as published';
  const legend=sources.length?`<p class="dictionary-help concordance-legend"><mark class="likely-source">Highlighted in the original</mark>: words often found with “<span dir="auto">${esc(word)}</span>” — likely sources, not certain.</p>`:'';
  dialog.innerHTML=`<h2 id="concordance-dialog-title" tabindex="-1">“<span dir="auto">${esc(word)}</span>” in authorized translations</h2><div class="segmented concordance-views" role="group" aria-label="Passage view">${views.map(view=>`<button type="button" data-concordance-view="${view}" aria-pressed="${view===chosenView}">${names[view]}</button>`).join('')}</div><p class="dictionary-help">Found in ${count(result.entry.n)} paragraph${Number(result.entry.n)===1?'':'s'} of authorized translations.${listed} ${beneath}; the counts are ${statisticsNote}.${tools?.store?' In Words, glosses are dictionary lookups, not the translation.':''}</p>${legend}<ol class="concordance-list"></ol><div class="dictionary-close"><button type="button" class="secondary" id="concordance-more" hidden>Show more</button><button type="button" class="secondary" id="concordance-close">Close</button></div>`;
  const list=dialog.querySelector('.concordance-list'),more=dialog.querySelector('#concordance-more');
  const loaded=new Map();
  function render(item){
    const {record,ref}=loaded.get(item);
    item.dataset.language=textLanguage(record?.metadata?.Language)||'';
    item.innerHTML=english?englishPassageHtml(record,ref,key,sources,paragraphUrl(String(ref[0]),{number:Number(ref[1]),language:'en'}),chosenView):passageHtml(record,ref,key,paragraphUrl(String(ref[0]),{number:Number(ref[1]),language:'original'}),chosenView);
    if(chosenView==='words')fillInterlinear(item,tools.store,()=>run===generation&&item.isConnected,'',!!tools.vowels?.(),tools.gloss?.()||'plain',item.dataset.language).catch(()=>{});
  }
  let shown=0;
  async function next(){
    const slice=refs.slice(shown,shown+batch);shown+=slice.length;more.hidden=shown>=refs.length;
    await Promise.all(slice.map(async ref=>{
      const item=document.createElement('li');item.className='concordance-item';item.innerHTML='<p class="concordance-note">Loading…</p>';list.append(item);
      try{const record=await getRecord(String(ref[0]));if(run!==generation)return;loaded.set(item,{record,ref});render(item);}
      catch{if(run===generation)item.innerHTML='<p class="concordance-error">This passage could not be loaded.</p>';}
    }));
  }
  dialog.onclick=event=>{
    const choice=event.target.closest('[data-concordance-view]');
    if(choice){chosenView=passageView(choice.dataset.concordanceView);dialogTooltip?.hide();dialog.querySelectorAll('[data-concordance-view]').forEach(button=>button.setAttribute('aria-pressed',String(button===choice)));for(const item of loaded.keys())render(item);return;}
    if(event.target.id==='concordance-more'){next();return;}
    if(event.target.id==='concordance-close'||event.target===dialog||event.target.closest('.concordance-link'))dialog.close();
  };
  // Escape closes an open word tooltip before the dialog.
  dialog.oncancel=event=>{if(dialogTooltip?.isOpen()){event.preventDefault();dialogTooltip.hide();}};
  dialog.onclose=()=>{dialogTooltip?.hide();if(run===generation&&outerFocus?.isConnected)outerFocus.focus({preventScroll:true});outerFocus=null;};
  next();
  if(!reopened)dialog.showModal();else dialog.querySelector('#concordance-dialog-title').focus({preventScroll:true});
}
