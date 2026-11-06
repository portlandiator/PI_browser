// Pure helpers of the read-only dictionary browser (dictionary-browser.html):
// prepare published dictionary entries with search keys computed once, match a
// search, filter, sort, group a word family, keep the state in the URL and
// render result rows and entry details with every source value escaped.
// Entries are AI-generated dictionary lookups, never a translation.
import {escapeHtml as esc,normalize} from './text.mjs';
import {candidateKeys,dictionaryKey,entryTags,isOriginalScript,reviewStatuses,tagLabels,wordTags} from './dictionary.mjs';

export const pageSize=50;
export const languages=['fa','ar','fa/ar','en'];
export const languageLabels={fa:'Persian','ar':'Arabic','fa/ar':'Persian / Arabic',en:'English'};
export const posGroups=['noun','verb','adjective','adverb','particle','pronoun','proper','other'];
export const posLabels={noun:'Noun',verb:'Verb',adjective:'Adjective',adverb:'Adverb',particle:'Preposition / particle',pronoun:'Pronoun',proper:'Proper noun',other:'Other'};
export const sorts=['alpha','root','frequency','english'];
export const sortLabels={alpha:'Persian/Arabic A–Z',root:'By root',frequency:'Frequency in authorized translations',english:'English A–Z'};
export const statusLabels={unreviewed:'Unreviewed',uncertain:'Uncertain reading',reviewed:'Reviewed'};

const faCollator=new Intl.Collator('fa'),enCollator=new Intl.Collator('en',{sensitivity:'base'});
// Transliteration without accents, dots, ‘ayn/hamza marks or case.
export const foldLatin=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[‘’'ʼʻ`´]/g,'');
const words=value=>normalize(String(value||'')).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
// Roots compare exactly once letter variants and spaces are normalized.
export const rootKey=value=>normalize(String(value||'')).replace(/\s+/g,'');
export const entryStatus=entry=>reviewStatuses.includes(entry?.status)?entry.status:'unreviewed';

// The coarse part of speech of a pos text, read from its first part
// ("prep. + noun" is a preposition, "active participle" an adjective).
export function posGroup(pos){
  const head=String(pos||'').toLowerCase().split(/\+|,|;/)[0].trim();
  if(!head)return 'other';
  if(/^(proper|name\b)/.test(head))return 'proper';
  if(/^(pron|pers\. pron|demonstrative|relative pron)/.test(head)||/\bpronoun\b/.test(head))return 'pronoun';
  if(/^(prep|particle|conj|interj|art|det|neg)/.test(head))return 'particle';
  if(/^adv/.test(head))return 'adverb';
  if(/^verb\b|^v\.|^aux/.test(head)&&!/^verbal noun/.test(head))return 'verb';
  if(/^(adj|elative|comparative|superlative)|participle/.test(head))return 'adjective';
  if(/noun|^infinitive|^masdar/.test(head))return 'noun';
  return 'other';
}

// One entry with its search keys, prepared once when its dictionary loads.
// `row` is the entry's position in the parsed file; `target` the language
// an English-headword dictionary translates into (its script text's language).
export function prepareEntry(entry,dictionary,row,target=''){
  const original=isOriginalScript(entry.form);
  const english=[entry.gloss,entry.rendering,entry.definition,entry.usage,entry.modern_gloss,entry.shift].filter(Boolean).join(' ');
  return {
    id:`${dictionary}:${row}`,dictionary,row,entry,original,
    formKeys:[...new Set([entry.form,entry.lemma,entry.vocalized].filter(Boolean).map(dictionaryKey).filter(Boolean))],
    ownKeys:[entry.form,entry.vocalized].filter(Boolean).map(dictionaryKey),lemmaKey:dictionaryKey(entry.lemma||''),
    translit:foldLatin(entry.translit),
    words:new Set(words(english)),wordList:null,
    tags:entryTags(entry),pos:posGroup(entry.pos),status:entryStatus(entry),root:rootKey(entry.root),
    lang:entry.lang||(original?'fa/ar':'en'),
    scriptLang:original?(entry.lang==='ar'?'ar':'fa'):(target==='ar'?'ar':'fa'),
  };
}

// A search: the lookup key (for headwords), the folded transliteration and
// the English words (the last may be the start of a word).
export function parseSearch(query){
  const text=String(query||'').trim();
  return {text,key:dictionaryKey(text),latin:foldLatin(text).replace(/\s+/g,' '),words:words(text),original:isOriginalScript(text)};
}
// How well an entry matches (lower is better): 0 the form as written or
// vowelled, 1 the lemma, 2 the start of a form or lemma, 3 the whole
// pronunciation, 4 its start, 5 any part of it, 6 English words; -1 no match.
// An empty search matches everything equally.
export function matchRank(item,search){
  if(!search.text)return 0;
  if(search.key){
    if(item.formKeys.includes(search.key))return item.lemmaKey===search.key&&item.ownKeys.every(key=>key!==search.key)?1:0;
    if(item.formKeys.some(key=>key.startsWith(search.key)))return 2;
  }
  if(search.original)return -1;
  if(search.latin&&item.translit.includes(search.latin))return item.translit===search.latin?3:item.translit.startsWith(search.latin)?4:5;
  if(search.words.length){
    const last=search.words.at(-1),whole=search.words.slice(0,-1);
    if(whole.every(word=>item.words.has(word))){
      if(item.words.has(last))return 6;
      item.wordList||=[...item.words];
      if(last.length>=3&&item.wordList.some(word=>word.startsWith(last)))return 6;
    }
  }
  return -1;
}

// The page state, read from and written to the URL query.
export const defaultState=()=>({q:'',dict:[],lang:'',tag:[],pos:'',status:'',modern:false,shifted:false,usage:false,root:'',sort:'alpha',page:1,entry:''});
const list=value=>[...new Set(String(value||'').split(',').map(item=>item.trim()).filter(Boolean))];
export function stateFromParams(params){
  params=params instanceof URLSearchParams?params:new URLSearchParams(params);
  const state=defaultState();
  state.q=params.get('q')||'';
  state.dict=list(params.get('dict'));
  state.lang=languages.includes(params.get('lang'))?params.get('lang'):'';
  state.tag=list(params.get('tag')).filter(tag=>wordTags.includes(tag));
  state.pos=posGroups.includes(params.get('pos'))?params.get('pos'):'';
  state.status=reviewStatuses.includes(params.get('status'))?params.get('status'):'';
  for(const flag of ['modern','shifted','usage'])state[flag]=params.get(flag)==='1';
  state.root=params.get('root')||'';
  state.sort=sorts.includes(params.get('sort'))?params.get('sort'):'alpha';
  state.page=Math.max(1,Math.floor(Number(params.get('page')))||1);
  state.entry=/^[\w.-]+:\d+$/.test(params.get('entry')||'')?params.get('entry'):'';
  return state;
}
export function stateToParams(state){
  const params=new URLSearchParams();
  if(state.q.trim())params.set('q',state.q.trim());
  if(state.dict.length)params.set('dict',state.dict.join(','));
  if(state.lang)params.set('lang',state.lang);
  if(state.tag.length)params.set('tag',state.tag.join(','));
  if(state.pos)params.set('pos',state.pos);
  if(state.status)params.set('status',state.status);
  for(const flag of ['modern','shifted','usage'])if(state[flag])params.set(flag,'1');
  if(state.root)params.set('root',state.root);
  if(state.sort!=='alpha')params.set('sort',state.sort);
  if(state.page>1)params.set('page',String(state.page));
  if(state.entry)params.set('entry',state.entry);
  return params;
}
export const stateQuery=state=>{const params=stateToParams(state);return params.size?`?${params}`:'';};

// Dictionaries a state needs: the chosen ones (or all), limited by language:
// English headwords are in dictionaries that translate into Persian or Arabic.
export function neededDictionaries(index,state){
  return index.filter(item=>(!state.dict.length||state.dict.includes(item.id))&&(!state.lang||(state.lang==='en'?item.target!=='en':item.target==='en')));
}

// Entries matching a state's search and filters, each with its match rank.
export function filterItems(items,state){
  const search=parseSearch(state.q),root=rootKey(state.root),out=[];
  for(const item of items){
    if(state.dict.length&&!state.dict.includes(item.dictionary))continue;
    if(state.lang&&item.lang!==state.lang)continue;
    if(state.tag.length&&!state.tag.some(tag=>item.tags.includes(tag)))continue;
    if(state.pos&&item.pos!==state.pos)continue;
    if(state.status&&item.status!==state.status)continue;
    if(state.modern&&!item.entry.modern)continue;
    if(state.shifted&&!item.entry.shift&&!item.tags.includes('meaning-shift'))continue;
    if(state.usage&&!item.entry.usage)continue;
    if(root&&item.root!==root)continue;
    const rank=matchRank(item,search);
    if(rank>=0)out.push({item,rank});
  }
  return out;
}

// The paragraph count of a headword in a full concordance map (key → n), as
// the tooltip counts it: as written, else with a common prefix or suffix removed.
export function frequencyOf(form,counts){
  if(!counts||!isOriginalScript(form))return 0;
  for(const candidate of candidateKeys(form)){const n=counts.get(candidate.key);if(n>0)return n;}
  return 0;
}

const englishKey=item=>item.original?(item.entry.gloss||item.entry.rendering||''):item.entry.form;
const byForm=(a,b)=>faCollator.compare(a.entry.form,b.entry.form)||a.row-b.row||a.dictionary.localeCompare(b.dictionary);
const comparators={
  alpha:byForm,
  root:(a,b)=>(!a.root)-(!b.root)||faCollator.compare(a.entry.root||'',b.entry.root||'')||faCollator.compare(a.entry.lemma||a.entry.form,b.entry.lemma||b.entry.form)||byForm(a,b),
  english:(a,b)=>enCollator.compare(englishKey(a).replace(/^[\s(“"'-]+/,''),englishKey(b).replace(/^[\s(“"'-]+/,''))||byForm(a,b),
};
// Sort matches: better search matches first, then by the chosen order.
// Frequency sorts by `frequency(item)` (most paragraphs first) once known,
// otherwise alphabetically.
export function sortMatches(matches,sort,frequency=null){
  const compare=sort==='frequency'&&frequency?(a,b)=>frequency(b)-frequency(a)||byForm(a,b):comparators[sort]||byForm;
  return matches.sort((a,b)=>a.rank-b.rank||compare(a.item,b.item)).map(match=>match.item);
}

// A word family: entries grouped by lemma in the order they first appear.
export function groupByLemma(items){
  const groups=new Map();
  for(const item of items){const lemma=item.entry.lemma||item.entry.form;const key=dictionaryKey(lemma)||lemma;if(!groups.has(key))groups.set(key,{lemma,items:[]});groups.get(key).items.push(item);}
  return [...groups.values()];
}

export const count=n=>Number(n||0).toLocaleString('en-US');
export const pages=total=>Math.max(1,Math.ceil(total/pageSize));
// Text reads right to left when its first letter is Persian or Arabic (a
// definition may quote Arabic inside English).
const rtlFirst=value=>/^[^\p{L}]*\p{Script=Arabic}/u.test(String(value||''));
const langAttrs=(value,lang)=>rtlFirst(value)?` dir="rtl" lang="${lang==='ar'?'ar':'fa'}"`:' dir="ltr" lang="en"';
// Tag chips in wordTags order (Elevated style first), as the word tooltip shows them.
export function tagChipsHtml(tags){
  const sorted=wordTags.filter(tag=>tags.includes(tag));
  return sorted.length?`<span class="word-tooltip-tags">${sorted.map(tag=>`<span class="word-tag tag-${tag}">${esc(tagLabels[tag])}</span>`).join('')}</span>`:'';
}
export const domId=item=>`e-${item.id.replace(/[^\w-]/g,'-')}`;
const differs=(a,b)=>String(a||'').toLowerCase().replace(/[-\s\p{P}]+/gu,'')!==String(b||'').toLowerCase().replace(/[-\s\p{P}]+/gu,'');

// One compact result row: the word with its vowelled spelling, pronunciation ·
// part of speech, gloss / Bahá'í English, and tag chips.
export function rowHtml(item,{expanded=false,frequency=0}={}){
  const e=item.entry,lang=item.scriptLang;
  const vocal=e.vocalized&&e.vocalized!==e.form?` <span class="dict-vocalized"${langAttrs(e.vocalized,lang)}>${esc(e.vocalized)}</span>`:'';
  const meta=[e.translit?`<span${langAttrs(e.translit,lang)} class="dict-translit">${esc(e.translit)}</span>`:'',e.pos?esc(e.pos):'',frequency?`${count(frequency)} ¶`:''].filter(Boolean).join(' · ');
  const rendering=e.rendering&&differs(e.rendering,e.gloss)?` <span class="dict-rendering">/ Bahá'í English: ${esc(e.rendering)}</span>`:'';
  const gloss=e.gloss||e.definition||'';
  return `<li class="dict-item${expanded?' is-open':''}" data-id="${esc(item.id)}"><button type="button" class="dict-row" id="${domId(item)}" aria-expanded="${expanded}" aria-controls="${domId(item)}-detail"><span class="dict-head"><span class="dict-word"${langAttrs(e.form,lang)}>${esc(e.form)}</span>${vocal}</span>${meta?`<span class="dict-meta">${meta}</span>`:''}<span class="dict-gloss"><span${langAttrs(gloss,lang)}>${esc(gloss)}</span>${rendering}</span>${tagChipsHtml(item.tags)}</button><div class="dict-detail" id="${domId(item)}-detail"${expanded?'':' hidden'}></div></li>`;
}

// Everything an entry says, labelled. `info` is the dictionary's index entry;
// `rootHref` gives the link that shows the entry's word family; the
// concordance section is filled in afterwards.
export function detailHtml(item,info,{rootHref=()=>'#'}={}){
  const e=item.entry,lang=item.scriptLang;
  const field=(label,html,cls='')=>html?`<div class="dict-field${cls?' '+cls:''}"><dt>${label}</dt><dd>${html}</dd></div>`:'';
  const text=value=>value?`<span${langAttrs(value,lang)}>${esc(value)}</span>`:'';
  const modern=e.modern?`${text(e.modern)}${e.modern_translit?` <span class="dict-translit">${esc(e.modern_translit)}</span>`:''}${e.modern_gloss?` (${esc(e.modern_gloss)})`:''}`:'';
  const root=e.root?`<a class="dict-root-link" href="${esc(rootHref(e.root))}" data-root="${esc(e.root)}"><span dir="rtl" lang="ar">${esc(e.root)}</span> <span class="dict-root-hint">word family</span></a>`:'';
  const status=e.status==='reviewed'?`<span class="word-tooltip-status status-reviewed">Reviewed${e.reviewer?` by ${esc(e.reviewer)}`:''}</span>`:e.status==='uncertain'?'<span class="word-tooltip-status status-uncertain">Uncertain reading</span>':'<span class="word-tooltip-status status-unreviewed">Unreviewed</span>';
  const source=`${esc(info?.name||item.dictionary)}${info?.aiGenerated!==false?' · <span class="dict-ai">AI-generated</span>':''}`;
  const view=item.original?'original':'en';
  return `<dl class="dict-fields">${[
    field('Form',text(e.form)),field('Vowelled spelling',e.vocalized&&e.vocalized!==e.form?text(e.vocalized):''),field('Lemma',text(e.lemma)),
    field('Language',esc(languageLabels[item.lang]||item.lang)),field('Pronunciation',text(e.translit)),field('Part of speech',esc(e.pos||'')),
    field('Root',root),field('Gloss',text(e.gloss)),field("Bahá'í English",e.rendering?esc(e.rendering):''),
    field('Tags',tagChipsHtml(item.tags)),field('Modern equivalent',modern),field('Meaning shift',text(e.shift),'dict-wide dict-shift'),
    field('Definition',text(e.definition),'dict-wide'),field('In the Writings',text(e.usage),'dict-wide'),field('Notes',text(e.notes),'dict-wide'),
    field('Review',status),field('Dictionary',source),
  ].join('')}</dl>${item.original?'<div class="dict-concordance" aria-live="polite"></div>':''}<p class="dict-detail-links"><a class="secondary" href="./?q=${encodeURIComponent(e.form)}&amp;view=${view}">Search the Catalog for this word</a></p>`;
}
