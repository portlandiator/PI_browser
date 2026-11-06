// The word tooltip's "In authorized translations" section and passages dialog.
// The concordance counts the authorized-translation paragraphs whose original
// contains a word form, lists where, and names English words that often appear
// in those paragraphs. These are statistics only: never present them as the
// word's translation or as a word-for-word alignment.
import {escapeHtml as esc} from './text.mjs';
import {candidateKeys,dictionaryKey,textWords} from './dictionary.mjs';
import {readingSlots,alignmentCounts} from './paragraph-alignment.mjs';
import {concordanceShard} from './concordance.mjs';

const shardLimit=64;
const statisticsNote='statistics from authorized paragraphs, not a word-for-word translation';
const count=n=>Number(n||0).toLocaleString('en-US');
const fetchJsonDefault=url=>fetch(url).then(response=>response.ok?response.json():null);

// Concordance data published at <base>/concordance/. It is used only when its
// index names the dataset the reader shows, so stale data never mixes with a
// new collection. `shard` maps a key to its shard number.
export function createConcordance(base,datasetPath,{fetchJson=fetchJsonDefault,shard=concordanceShard}={}){
  const url=path=>new URL(`concordance/${path}`,base);
  const shards=new Map();let index=null;
  const usable=()=>index||=Promise.resolve().then(()=>fetchJson(url('index.json'))).then(value=>value?.format===1&&value.dataset===datasetPath?value:null,()=>null);
  async function load(n){
    if(shards.has(n)){const value=shards.get(n);shards.delete(n);shards.set(n,value);return value;}
    const promise=Promise.resolve().then(()=>fetchJson(url(`o-${n}.json`))).then(value=>value&&typeof value==='object'?value:{},()=>{shards.delete(n);return {};});
    shards.set(n,promise);if(shards.size>shardLimit)shards.delete(shards.keys().next().value);
    return promise;
  }
  async function entryFor(key){
    const entry=(await load(shard(key)))[key];
    return entry&&typeof entry==='object'&&Number(entry.n)>0?entry:null;
  }
  return {
    async ready(){return !!await usable();},
    // The word as written first, then forms with a common prefix or suffix removed.
    async lookup(word){
      if(!await usable())return null;
      const key=dictionaryKey(word);if(!key)return null;
      for(const candidate of candidateKeys(word)){
        const entry=await entryFor(candidate.key);
        if(entry)return {key,matched:candidate.key,via:candidate.stripped,entry};
      }
      return null;
    },
  };
}

// The tooltip section for a lookup result ('' when there is none). `shortcut`
// (the tooltip was opened from the keyboard) names the P key on the button.
export function concordanceSectionHtml(result,{word='',shortcut=false}={}){
  if(!result?.entry)return '';
  const {n,r=[],w=[]}=result.entry;
  const via=result.via?`<p class="word-tooltip-via">Counted as <span dir="auto">${esc(result.matched)}</span> (${esc(String(result.via).replace(/–/g,''))} removed).</p>`:'';
  const words=w.slice(0,6).map(item=>esc(item[0])).filter(Boolean);
  const often=words.length?`<p class="concordance-often">Often appears with: ${words.join(' · ')}</p><p class="concordance-note">${statisticsNote}</p>`:'';
  const open=r.length?`<button type="button" class="text-button concordance-open" data-concordance-key="${esc(result.matched)}"${word?` aria-label="Show passages with ${esc(word)}"`:''}${shortcut?' aria-keyshortcuts="P"':''}>Show passages${shortcut?' (P)':''}</button>`:'';
  return `<section class="word-tooltip-concordance"><h3 class="concordance-heading">In authorized translations</h3>${via}<p class="concordance-count">Found in ${count(n)} paragraph${Number(n)===1?'':'s'}</p>${often}${open}</section>`;
}

// Original paragraph text with every word of this key marked.
export function markedText(text,key){
  text=String(text||'');let html='',cursor=0;
  for(const word of textWords(text))if(dictionaryKey(word.text)===key){html+=esc(text.slice(cursor,word.start))+`<mark>${esc(word.text)}</mark>`;cursor=word.end;}
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

export function passageHtml(record,[id,number],key,href){
  const original=record?.original?.paragraphs?.[number-1];
  if(!original)return '<p class="concordance-error">This passage could not be loaded.</p>';
  const english=pairedEnglish(record,number);
  return `<a class="concordance-link" href="${esc(href)}">${esc(record.title||id)} <span class="concordance-ref">${esc(id)} · ¶${count(number)}</span></a><p class="concordance-original" dir="rtl" lang="fa">${markedText(original.plain,key)}</p>${english?`<p class="concordance-english" dir="ltr" lang="en">${esc(english.plain)}</p>`:'<p class="concordance-note">No English paragraph is paired with this paragraph.</p>'}`;
}

const batch=8;
let generation=0;
// The passages dialog: references load 8 at a time.
export function openConcordanceDialog({word,result,getRecord,paragraphUrl,returnFocus=null}){
  if(!result?.entry)return;
  const run=++generation,key=result.matched,refs=result.entry.r||[];
  let dialog=document.getElementById('concordance-dialog');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='concordance-dialog';dialog.className='dictionary-dialog concordance-dialog';dialog.setAttribute('aria-labelledby','concordance-dialog-title');document.body.append(dialog);}
  const listed=refs.length<Number(result.entry.n)?` The first ${count(refs.length)} are listed.`:'';
  dialog.innerHTML=`<h2 id="concordance-dialog-title">“<span dir="auto">${esc(word)}</span>” in authorized translations</h2><p class="dictionary-help">Found in ${count(result.entry.n)} paragraph${Number(result.entry.n)===1?'':'s'} of authorized translations.${listed} Beneath each original paragraph is its authorized English paragraph as published; the counts are ${statisticsNote}.</p><ol class="concordance-list"></ol><div class="dictionary-close"><button type="button" class="secondary" id="concordance-more" hidden>Show more</button><button type="button" class="secondary" id="concordance-close">Close</button></div>`;
  const list=dialog.querySelector('.concordance-list'),more=dialog.querySelector('#concordance-more');
  let shown=0;
  async function next(){
    const slice=refs.slice(shown,shown+batch);shown+=slice.length;more.hidden=shown>=refs.length;
    await Promise.all(slice.map(async ref=>{
      const item=document.createElement('li');item.className='concordance-item';item.innerHTML='<p class="concordance-note">Loading…</p>';list.append(item);
      try{const record=await getRecord(String(ref[0]));if(run!==generation)return;item.innerHTML=passageHtml(record,ref,key,paragraphUrl(String(ref[0]),{number:Number(ref[1]),language:'original'}));}
      catch{if(run===generation)item.innerHTML='<p class="concordance-error">This passage could not be loaded.</p>';}
    }));
  }
  dialog.onclick=event=>{
    if(event.target.id==='concordance-more'){next();return;}
    if(event.target.id==='concordance-close'||event.target===dialog||event.target.closest('.concordance-link'))dialog.close();
  };
  dialog.onclose=()=>{if(run===generation&&returnFocus?.isConnected)returnFocus.focus({preventScroll:true});};
  next();
  if(!dialog.open)dialog.showModal();
}
