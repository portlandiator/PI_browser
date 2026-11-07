// Word tooltip and interlinear word study for the Catalog reader.
// Interlinear blocks show the source paragraph word by word, each word with
// its dictionary pronunciation and one-word gloss, followed by the counterpart
// paragraph as published. Glosses are dictionary lookups: they do not claim
// that the published translation renders the text word for word.
import {escapeHtml as esc} from './text.mjs';
import {applyVowels,dictionaryKey,entryTags,explainsEnglish,interlinearTokens,isOriginalScript,tagLabels,textWords,wordAt,wordTags} from './dictionary.mjs';

export const studyModes=['original','en'];
export const studyMode=value=>studyModes.includes(value)?value:'';
// The language English words are glossed into in Words: English.
export const glossTargets=['fa','ar'];
export const glossTarget=value=>glossTargets.includes(value)?value:'fa';
// How original words are glossed in Words: original: a plain modern English
// gloss, or the word as the authorized (Bahá'í English) translations render it.
export const glossStyles=['plain','bahai'];
export const glossStyle=value=>glossStyles.includes(value)?value:'plain';
// When word tooltips open: only on a click, tap or Enter/Space (the default),
// or on hover and keyboard focus.
export const tooltipModes=['hover','click'];
export const tooltipMode=value=>value==='hover'?'hover':'click';
// Words: original can mark the words whose shown (first) entry has one tag.
export const wordMark=value=>wordTags.includes(value)?value:'';
export const markedWord=(result,mark)=>!!mark&&entryTags(result?.entries?.[0]).includes(mark);

// Bahá'í English marks a word only when its rendering actually differs from
// the plain gloss (ignoring case, hyphens and punctuation).
const glossKey=value=>String(value||'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export const renderingDiffers=entry=>!!entry.rendering&&glossKey(entry.rendering)!==glossKey(entry.gloss);

// The text each interlinear row shows for a lookup result.
// In the Bahá'í English style an original word shows its `rendering` when
// the entry has one, and `elevated` marks a word with the elevated tag.
export function interlinearCells(result,style='plain'){
  const entry=result?.entries?.[0];
  if(!entry)return {pronunciation:'',gloss:'',target:'',partial:false};
  const partial=!!result.via;
  // A compound found by its parts shows every part, joined with +, each by its
  // first entry (? for a part no dictionary lists): never one part alone.
  if(result.via==='parts'&&result.parts){
    const firsts=result.parts.map(piece=>piece.entries[0]);
    const join=value=>firsts.map(entry=>entry?value(entry)||'?':'?').join(' + ');
    return {pronunciation:join(entry=>entry.translit),gloss:join(entry=>(style==='bahai'&&entry.rendering)||entry.gloss),target:'',partial,parts:true,vocalized:'',elevated:false};
  }
  // The fully vowelled spelling applies only to the word exactly as listed.
  if(result.side==='original')return {pronunciation:entry.translit||'',gloss:(style==='bahai'&&entry.rendering)||entry.gloss||'',target:'',partial,vocalized:partial?'':entry.vocalized||'',elevated:entryTags(entry).includes('elevated')&&renderingDiffers(entry)};
  // English words: how the English word sounds (in the script an English to
  // Persian/Arabic dictionary writes it) and its equivalent. An entry found
  // only through a Persian/Arabic gloss gives the equivalent, not a sound.
  const target=entry.reverse?(entry.lemma||entry.form):(entry.gloss||'');
  return {pronunciation:entry.reverse?'':entry.translit||'',gloss:target,target,partial};
}

// An entry's review label: uncertain readings and reviewed entries (with the
// reviewer when known). Unreviewed entries need none: the dictionary's
// AI-generated label already covers them.
export function reviewLabelHtml(entry){
  if(entry?.status==='uncertain')return '<span class="word-tooltip-status status-uncertain">Uncertain reading</span>';
  if(entry?.status==='reviewed')return `<span class="word-tooltip-status status-reviewed">Reviewed${entry.reviewer?` by ${esc(entry.reviewer)}`:''}</span>`;
  return '';
}
// The compact word tooltip. The first (best) entry shows a head row (the word
// as written, its vowelled spelling, pronunciation and part of speech), one
// gloss line in the chosen gloss style with the other style after it when it
// differs, category chips, the definition, the Bahá'í usage (clamped to three
// lines), one line of facts and a footer naming the dictionary and review
// status. Other senses and dictionaries are folded under "N more".
const script=value=>isOriginalScript(value)?' dir="rtl" lang="fa"':' dir="auto"';
// Hyphens joining the words of an English gloss read as spaces ("the-Cause").
const readable=value=>isOriginalScript(value)?String(value):String(value).replace(/(\p{L})-(?=\p{L})/gu,'$1 ');
// Tags as one row of chips, Elevated style first.
const tagChipsHtml=entry=>{const tags=entryTags(entry).sort((a,b)=>(b==='elevated')-(a==='elevated'));return tags.length?`<div class="word-tooltip-tags">${tags.map(tag=>`<span class="word-tag tag-${tag}">${esc(tagLabels[tag])}</span>`).join('')}</div>`:'';};
// The head is two lines: the Persian/Arabic on its own right-to-left line
// (the word as written in the main entry, then the vowelled spelling when it
// differs; a folded sense or an entry found from English shows its own
// headword), then pronunciation, part of speech and language left to right.
const scriptLang=entry=>entry.lang==='ar'?'ar':'fa';
function scriptLineHtml(entry,word,main){
  const original=isOriginalScript(word);
  const vocalized=entry.vocalized&&entry.vocalized!==word?entry.vocalized:'';
  const own=!main||!original||entry.reverse?(vocalized?'':entry.lemma||entry.form):'';
  const items=[main&&original?`<span class="word-tooltip-word">${esc(word)}</span>`:'',own&&isOriginalScript(own)?`<span class="word-tooltip-lemma">${esc(own)}</span>`:'',vocalized&&isOriginalScript(entry.form)?`<span class="word-tooltip-vocalized" dir="rtl" lang="${scriptLang(entry)}" title="With vowel marks">${esc(vocalized)}</span>`:''].filter(Boolean);
  return items.length?`<div class="word-tooltip-script" dir="rtl" lang="${scriptLang(entry)}">${items.join('')}</div>`:'';
}
function metaHtml(entry,extra=''){
  const translit=entry.translit?`<span class="word-tooltip-translit${isOriginalScript(entry.translit)?' in-script':''}"${script(entry.translit)}>${esc(entry.translit)}</span>`:'';
  const items=`${entry.part?`<span class="word-tooltip-part" dir="auto">${esc(entry.part)}</span>`:''}${translit}${entry.pos?`<span class="word-tooltip-pos">${esc(entry.pos)}</span>`:''}${entry.lang?`<span class="word-tooltip-lang">${esc(entry.lang)}</span>`:''}${extra}`;
  return items?`<div class="word-tooltip-head" dir="ltr">${items}</div>`:'';
}
// What a meaning-shift word means here against its usual modern meaning.
const shiftHtml=entry=>entry.shift?`<p class="word-tooltip-shift" dir="auto"><span class="word-tooltip-shift-label">Meaning shift:</span> ${esc(entry.shift)}</p>`:'';
// The gloss in the chosen style first; the other style follows only when it
// differs. An English word explained in English shows its modern meaning.
function glossLineHtml(entry,style){
  if(explainsEnglish(entry))return entry.gloss?`<div class="word-tooltip-gloss word-tooltip-modern-gloss" dir="ltr" lang="en"><span class="word-tooltip-gloss-label">Modern:</span> ${esc(entry.gloss)}</div>`:'';
  const original=isOriginalScript(entry.form)&&!entry.reverse;
  const bahai=original&&style==='bahai'&&entry.rendering;
  const first=bahai?entry.rendering:entry.gloss||'';
  const other=!original||!renderingDiffers(entry)?'':bahai?(entry.gloss?`Plain: ${entry.gloss}`:''):`Bahá'í English: ${entry.rendering}`;
  if(!first&&!other)return '';
  return `<div class="word-tooltip-gloss"${script(first)}>${esc(readable(first))}${other?`<span class="word-tooltip-rendering" dir="ltr" lang="en"> · ${esc(readable(other))}</span>`:''}</div>`;
}
const definitionHtml=entry=>entry.definition?`<p class="word-tooltip-definition"${script(entry.definition)}>${esc(entry.definition)}</p>`:'';
// Usage longer than about three lines gets a "more" toggle; the tooltip
// removes it again when the text turns out to fit.
// For an English word explained in English the usage is that of the authorized translations.
const usageHtml=entry=>{if(!entry.usage)return '';const long=entry.usage.length>150;return `<div class="word-tooltip-usage${long?' clamped':''}"><p dir="ltr" lang="en"><span class="word-tooltip-usage-label">${explainsEnglish(entry)?'In the translations:':'In the Writings:'}</span> ${esc(entry.usage)}</p>${long?'<button type="button" class="text-button word-tooltip-more" aria-expanded="false">more</button>':''}</div>`;};
function wordFactsHtml(entry){
  const lang=entry.lang==='ar'?'ar':'fa';
  const extra=[entry.modern_translit,entry.modern_gloss].filter(Boolean).map(esc).join(', ');
  const facts=[
    !entry.reverse&&entry.lemma&&dictionaryKey(entry.lemma)!==dictionaryKey(entry.form)?`<span>Lemma <span class="word-tooltip-lemma" dir="auto">${esc(entry.lemma)}</span></span>`:'',
    entry.root?`<span>Root <span class="word-tooltip-root" dir="rtl" lang="ar">${esc(entry.root)}</span></span>`:'',
    entry.modern?`<span>Modern: <span class="word-tooltip-modern"${isOriginalScript(entry.modern)?` dir="rtl" lang="${lang}"`:' dir="auto"'}>${esc(entry.modern)}</span>${extra?` <span class="word-tooltip-modern-note" dir="ltr">(${extra})</span>`:''}</span>`:'',
    entry.notes?`<span class="word-tooltip-notes"${script(entry.notes)}>${esc(entry.notes)}</span>`:''].filter(Boolean);
  return facts.length?`<div class="word-tooltip-facts">${facts.join(' · ')}</div>`:'';
}
// A King James Bible example: the excerpt (verbatim from the verse) and its reference.
export const kjvHtml=entry=>entry.kjv&&entry.kjv_text?`<p class="word-tooltip-kjv" dir="ltr" lang="en"><span class="word-tooltip-kjv-label">King James Bible:</span> “…${esc(entry.kjv_text)}…” — <span class="word-tooltip-kjv-ref">${esc(entry.kjv)}</span></p>`:'';
// A published dictionary's name links to its About box in the dictionary browser.
function sourceHtml(entry,info){
  const source=info(entry.dictionary);
  const status=reviewLabelHtml(entry)||'<span class="word-tooltip-status-plain">Unreviewed</span>';
  const name=esc(source?.name||entry.dictionary);
  return `<div class="word-tooltip-source">${[source?.kind==='published'?`<a class="word-tooltip-about-link" href="./dictionary-browser.html?dict=${encodeURIComponent(entry.dictionary)}&amp;about=1">${name}</a>`:name,source?.aiGenerated?'AI-generated':'',source?.kind==='personal'?'your dictionary':'',status].filter(Boolean).join(' · ')}</div>`;
}
export function tooltipHtml(result,info,{style='plain'}={}){
  const original=isOriginalScript(result.word);
  // An original word heads its own right-to-left line; an English word heads the tooltip left to right.
  const word=original?`<div class="word-tooltip-script" dir="rtl" lang="fa"><span class="word-tooltip-word">${esc(result.word)}</span></div>`:`<div class="word-tooltip-english"><span class="word-tooltip-word" dir="ltr" lang="en">${esc(result.word)}</span></div>`;
  if(!result.entries.length)return `${word}<p class="word-tooltip-empty">No dictionary entry for this word.</p>`;
  style=glossStyle(style);
  if(result.via==='parts'&&result.parts)return partsTooltipHtml(result,info,word,style);
  const via=result.via?`<p class="word-tooltip-via">Found as <span dir="auto">${esc(result.matched)}</span> (${esc(result.via.replace(/–/g,''))} removed).</p>`:'';
  const [entry,...others]=result.entries.slice(0,8);
  const main=`${original?'':word}${scriptLineHtml(entry,result.word,true)}${metaHtml(entry)}${via}${glossLineHtml(entry,style)}${tagChipsHtml(entry)}${shiftHtml(entry)}${definitionHtml(entry)}${usageHtml(entry)}${kjvHtml(entry)}${wordFactsHtml(entry)}`;
  // Other senses: head row, gloss line and definition, with their source when it differs.
  const sense=other=>`<li>${scriptLineHtml(other,result.word,false)}${metaHtml(other,`${other.foundAs?`<span class="word-tooltip-lang">as <span dir="auto">${esc(other.foundAs)}</span></span>`:''}${reviewLabelHtml(other)}${other.dictionary!==entry.dictionary?`<span class="word-tooltip-lang">${esc(info(other.dictionary)?.name||other.dictionary)}</span>`:''}`)}${glossLineHtml(other,style)}${definitionHtml(other)}</li>`;
  const hidden=result.entries.length-8;
  const more=others.length?`<details class="word-tooltip-senses"><summary>${others.length} more</summary><ol class="word-tooltip-entries">${others.map(sense).join('')}</ol>${hidden>0?`<p class="word-tooltip-via">${hidden} more entries not shown.</p>`:''}</details>`:'';
  // The full entry, its word family and its filters are in the dictionary browser.
  const open=info(entry.dictionary)?.kind==='personal'?'':`<a class="word-tooltip-dict-link" href="./dictionary-browser.html?q=${encodeURIComponent(entry.form)}&amp;dict=${encodeURIComponent(entry.dictionary)}">Open in dictionary</a>`;
  return `${main}<div class="word-tooltip-concordance-slot"></div>${more}${open}${sourceHtml(entry,info)}`;
}
// A compound no dictionary lists whole (written with a zero-width
// non-joiner): the word, a note that it is shown by its parts, then each part
// with its first entry (head row, gloss line, tags, definition); the parts'
// other entries are folded under "N more", each labelled with its part.
function partsTooltipHtml(result,info,word,style){
  const names=result.parts.map(piece=>`<span dir="auto">${esc(piece.part)}</span>`).join(' + ');
  const note=`<p class="word-tooltip-via">Not listed as one word; shown by its parts: ${names}.</p>`;
  const block=piece=>{
    const [entry]=piece.entries;
    if(!entry)return `<div class="word-tooltip-part-entry">${scriptLineHtml({},piece.part,true)}<p class="word-tooltip-empty">No dictionary entry for this part.</p></div>`;
    const found=piece.via?`<p class="word-tooltip-via">Found as <span dir="auto">${esc(piece.matched)}</span> (${esc(piece.via.replace(/–/g,''))} removed).</p>`:'';
    return `<div class="word-tooltip-part-entry">${scriptLineHtml(entry,piece.part,true)}${metaHtml({...entry,part:''})}${found}${glossLineHtml(entry,style)}${tagChipsHtml(entry)}${definitionHtml(entry)}</div>`;
  };
  const first=result.entries[0];
  const others=result.parts.flatMap(piece=>piece.entries.slice(1)).slice(0,7);
  const more=others.length?`<details class="word-tooltip-senses"><summary>${others.length} more</summary><ol class="word-tooltip-entries">${others.map(other=>`<li>${scriptLineHtml(other,other.part,false)}${metaHtml(other,reviewLabelHtml(other))}${glossLineHtml(other,style)}${definitionHtml(other)}</li>`).join('')}</ol></details>`:'';
  return `${isOriginalScript(result.word)?`<div class="word-tooltip-script" dir="rtl" lang="fa"><span class="word-tooltip-word">${esc(result.word)}</span></div>`:word}${note}${result.parts.map(block).join('')}<div class="word-tooltip-concordance-slot"></div>${more}${sourceHtml(first,info)}`;
}

// Interlinear markup for one paragraph: word columns (filled in later by
// fillInterlinear) and, below, the counterpart paragraph as published.
// `topId` '' leaves the word rows without an id; `match(word)` marks columns
// with ilw-match (true) or with the class it returns. `lazy` renders the words as plain text (ids, number and the
// paragraph beneath already final) until buildInterlinear makes the columns.
export function interlinearColumnsHtml(plain,rtl,match=null){
  return interlinearTokens(plain||'').map((token,i)=>{const hit=match?.(token.word);return `<span class="ilw${hit===true?' ilw-match':hit?` ${hit}`:''}" tabindex="${i?-1:0}" data-word="${esc(token.word)}"><span class="ilw-word"${rtl?' lang="fa"':''}>${esc(token.lead)}<span class="ilw-text">${esc(token.word)}</span>${esc(token.trail)}</span><span class="ilw-pron"></span><span class="ilw-gloss"${rtl?'':' dir="rtl" lang="fa"'}></span></span>`;}).join('');
}
export function interlinearBlockHtml({top,topLanguage,number,numberHtml,bottomHtml,bottomId,bottomLanguage,bottomClass='',topId=`p-${topLanguage}-${number}`,match=null,lazy=false}){
  const rtl=topLanguage==='original';
  const columns=lazy?`<span class="ilw-pending"${rtl?' lang="fa"':''}>${esc(top.plain||'')}</span>`:interlinearColumnsHtml(top.plain,rtl,match);
  const bottom=bottomHtml===null?'':bottomHtml===undefined?`<p class="interlinear-missing">${bottomLanguage==='en'?'No English paragraph is paired with this paragraph.':'No original paragraph is paired with this paragraph.'}</p>`:`<div class="paragraph-cell interlinear-free ${bottomLanguage==='en'?'english-cell':'original-cell'}${bottomClass}"${bottomId?` id="${bottomId}"`:''} dir="${bottomLanguage==='en'?'ltr':'rtl'}" lang="${bottomLanguage==='en'?'en':'fa'}"><p>${bottomHtml}</p></div>`;
  return `<section class="interlinear-block"${lazy?' data-lazy':''}><div class="interlinear-top"${topId?` id="${topId}"`:''} data-top-language="${topLanguage}">${numberHtml}<div class="interlinear-line" role="group" aria-label="Paragraph ${number}, word by word" dir="${rtl?'rtl':'ltr'}"${lazy?' tabindex="0"':''}>${columns}</div></div>${bottom}</section>`;
}
// Make the word columns of a lazy block; true if it was still plain text.
export function buildInterlinear(block){
  if(!block?.hasAttribute('data-lazy'))return false;
  const line=block.querySelector('.interlinear-line');
  block.removeAttribute('data-lazy');line.removeAttribute('tabindex');
  line.innerHTML=interlinearColumnsHtml(line.textContent,line.dir==='rtl');
  return true;
}

// Lookup results for the visit, per dictionary set, word, target and
// preferred language, so a word repeated across paragraphs is filled at once.
export function boundedCache(limit){
  const map=new Map();
  return {get(key){if(!map.has(key))return undefined;const value=map.get(key);map.delete(key);map.set(key,value);return value;},set(key,value){map.delete(key);map.set(key,value);if(map.size>limit)map.delete(map.keys().next().value);return value;},get size(){return map.size;}};
}
const lookups=new WeakMap();
function cachedLookup(store,word,target,prefer){
  if(!lookups.has(store))lookups.set(store,boundedCache(20000));
  const cache=lookups.get(store),key=`${(store.active?.()||[]).map(item=>item.id).join(',')}\u0001${target}\u0001${prefer}\u0001${word}`;
  let value=cache.get(key);
  if(!value){value=store.lookup(word,{target,prefer});cache.set(key,value);value.catch(()=>{if(cache.get(key)===value)cache.set(key,undefined);});}
  return value;
}
const nextFrame=()=>new Promise(resolve=>typeof requestAnimationFrame==='function'&&!document.hidden?requestAnimationFrame(()=>resolve()):setTimeout(resolve,0));

// Look up every word column under `root` and fill its rows: all lookups at
// once, then every column written in one frame.
// `mark` (a tag) marks columns whose shown entry has it with ilw-tagged.
export async function fillInterlinear(root,store,isCurrent=()=>true,target='',vowels=false,style='plain',prefer='',mark=''){
  const columns=[...root.querySelectorAll('.ilw:not([data-filled])')];
  if(!columns.length)return;
  const words=[...new Set(columns.map(column=>column.dataset.word))];
  await store.prefetch([...new Set(words.flatMap(word=>[dictionaryKey(word),...word.split('\u200c').map(dictionaryKey)]))].filter(Boolean));
  if(!isCurrent())return;
  const results=new Map(await Promise.all(words.map(async word=>[word,await cachedLookup(store,word,target,prefer)])));
  await nextFrame();
  if(!isCurrent())return;
  for(const column of columns){
    if(column.hasAttribute('data-filled')||!column.isConnected)continue;
    const word=column.dataset.word;
    const cells=interlinearCells(results.get(word),style);
    column.dataset.filled='';
    if(style==='bahai'&&cells.elevated)column.classList.add('ilw-elevated');
    if(!cells.gloss&&!cells.pronunciation)column.classList.add('ilw-unknown');
    if(cells.partial)column.classList.add('ilw-partial');
    if(cells.parts)column.classList.add('ilw-parts');
    if(markedWord(results.get(word),mark))column.classList.add('ilw-tagged',`tag-${mark}`);
    const pronunciation=column.children[1];
    pronunciation.textContent=cells.pronunciation||'·';
    // A Latin pronunciation or gloss reads left to right even under a
    // right-to-left word (‘ala'l-khuṣúṣ, not ala'l-khuṣúṣ‘).
    if(isOriginalScript(cells.pronunciation)){pronunciation.dir='rtl';pronunciation.lang='fa';pronunciation.classList.add('in-script');}
    else if(cells.pronunciation)pronunciation.dir='ltr';
    column.children[2].textContent=cells.gloss||'·';
    if(cells.gloss&&!isOriginalScript(cells.gloss))column.children[2].dir='ltr';
    // Vowel marks come from the dictionary and are laid on the letters as
    // written (applyVowels); the dictionary's own spelling stays in the tooltip.
    if(vowels&&cells.vocalized){const shown=applyVowels(word,cells.vocalized);if(shown!==word){column.querySelector('.ilw-text').textContent=shown;column.classList.add('ilw-vowelled');}}
  }
}

// Word study over a long text: blocks rendered lazy become word columns once
// they come within about 1.5 screens of the viewport (all at once without
// IntersectionObserver), and stay built. `fill(root)` fills new columns.
// Where the browser has no scroll anchoring, a block growing above the
// viewport scrolls the page by as much, so the text being read stays put.
export function lazyInterlinear(root,fill){
  const pending=new Set(),blocks=()=>root.querySelectorAll('.interlinear-block[data-lazy]');
  let frame=0,observer=null,resizer=null,kept=null;
  // A paragraph jumped to stays in view while blocks near it are built and
  // filled, until the reader scrolls, types or taps, or two seconds pass.
  const keep=()=>{if(!kept)return;if(Date.now()>kept.until||!kept.element.isConnected){kept=null;return;}kept.element.scrollIntoView({block:kept.block});};
  const release=()=>{kept=null;};
  const flush=()=>{frame=0;const built=[...pending].filter(buildInterlinear);pending.clear();for(const block of built)observer?.unobserve(block);if(!built.length)return;keep();Promise.resolve(fill(built.length===1?built[0]:{querySelectorAll:selector=>built.flatMap(block=>[...block.querySelectorAll(selector)])})).then(keep);};
  const build=block=>{if(!block?.hasAttribute('data-lazy'))return;pending.add(block);flush();};
  const reveal=(element,{block='start'}={})=>{build(element.closest('.interlinear-block'));element.scrollIntoView({block});kept={element,block,until:Date.now()+2000};};
  const events=['wheel','touchstart','keydown','pointerdown'];
  for(const type of events)addEventListener(type,release,{passive:true,capture:true});
  const stop=()=>{for(const type of events)removeEventListener(type,release,{capture:true});};
  if(typeof IntersectionObserver!=='function'){for(const block of blocks())pending.add(block);flush();return {build,reveal,disconnect:stop};}
  observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting)pending.add(entry.target);if(pending.size&&!frame)frame=requestAnimationFrame(flush);},{rootMargin:'150% 0px'});
  for(const block of blocks())observer.observe(block);
  if(typeof ResizeObserver==='function'&&typeof CSS!=='undefined'&&!CSS.supports?.('overflow-anchor','auto')){
    const heights=new WeakMap();
    resizer=new ResizeObserver(entries=>{let delta=0;for(const entry of entries){const height=entry.target.offsetHeight,before=heights.get(entry.target);heights.set(entry.target,height);if(before===undefined)continue;const rect=entry.target.getBoundingClientRect();if(rect.top<0&&rect.bottom-(height-before)<=0)delta+=height-before;}if(delta)scrollBy(0,delta);});
    for(const block of root.querySelectorAll('.interlinear-block'))resizer.observe(block);
  }
  // A keyboard user tabbing into a block not yet built lands on its first word.
  const focus=event=>{const line=event.target;if(!line.matches?.('.interlinear-line[tabindex]'))return;const block=line.closest('.interlinear-block');build(block);block.querySelector('.ilw')?.focus();};
  root.addEventListener('focusin',focus);
  return {build,reveal,disconnect(){stop();observer.disconnect();resizer?.disconnect();cancelAnimationFrame(frame);root.removeEventListener('focusin',focus);}};
}

// Where a tooltip goes, in viewport coordinates, so its whole content shows
// whenever it can: below the word, else above it, else (made wider) below or
// above, else beside the word using the full viewport height. Only when none
// of these fit does it take the larger side and scroll within it.
export function placement(rect,viewport,measure,widen,margin=8){
  const clamp=(value,min,max)=>Math.max(min,Math.min(value,max));
  const below=viewport.height-rect.bottom-2*margin,above=rect.top-2*margin;
  let {width,height}=measure();
  if(height>below&&height>above&&viewport.width>=640){widen();({width,height}=measure());}
  const centred=()=>clamp(rect.left+rect.width/2-width/2,margin,Math.max(margin,viewport.width-width-margin));
  if(height<=below)return {left:centred(),top:rect.bottom+margin};
  if(height<=above)return {left:centred(),top:rect.top-height-margin};
  const right=viewport.width-rect.right-2*margin,left=rect.left-2*margin,full=viewport.height-2*margin;
  if(height<=full&&Math.max(right,left)>=width)return {left:right>=width?rect.right+margin:rect.left-width-margin,top:clamp(rect.top+rect.height/2-height/2,margin,viewport.height-height-margin)};
  const space=Math.max(below,above);
  // Too little room on either side: cover the word rather than cut the entry short.
  if(space<Math.min(height,full)*0.6)return {left:centred(),top:margin,maxHeight:full};
  return below>=above?{left:centred(),top:rect.bottom+margin,maxHeight:below}:{left:centred(),top:rect.top-Math.min(height,above)-margin,maxHeight:above};
}

// Hover, tap and keyboard access to the tooltip within `container`.
// `concordance` ({lookup(word),sectionHtml(result,{word}),english,fill})
// adds what the authorized translations show for an original word (and, when
// `english` is set, for an English word) below its entries; `fill(section,
// isCurrent)` may complete the section later (true when it changed);
// its Show passages button (or P on a focused word column) calls
// onOpenConcordance(word,result,{returnFocus}). `mode()` is 'hover' or
// 'click': in click mode neither hovering nor focusing opens a tooltip; a
// click, tap or Enter/Space does. `prefer(anchor)` names the language whose
// entries come first. `layer` (a modal dialog) gets its own tooltip inside
// it, fixed to the viewport, because a modal dialog sits in the browser's
// top layer above anything appended to the page. `gloss()` is the gloss
// style ('plain' or 'bahai') whose gloss the tooltip shows first.
export const passagesKey=event=>(event.key==='p'||event.key==='P')&&!event.shiftKey&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&!event.isComposing;
const tooltips=new Set();
export function attachWordTooltip(container,store,{target=()=>'',prefer=()=>'',concordance=null,onOpenConcordance=null,mode=()=>'click',gloss=()=>'plain',layer=null}={}){
  const id=layer?`${layer.id||'layer'}-word-tooltip`:'word-tooltip';
  let tooltip=layer?null:document.getElementById(id);
  if(!tooltip){tooltip=document.createElement('div');tooltip.id=id;tooltip.className=`word-tooltip${layer?' word-tooltip-fixed':''}`;tooltip.setAttribute('role','tooltip');tooltip.hidden=true;(layer||document.body).append(tooltip);}
  const highlights=typeof CSS!=='undefined'&&CSS.highlights&&typeof Highlight==='function';
  let current=null,timer=0,request=0,lastPointer='mouse',described=null,anchorRect=null,shown=null;
  const hovering=()=>tooltipMode(mode())==='hover';
  // Only the word or note the tooltip currently describes is marked.
  const describe=anchor=>{if(described&&described!==anchor)described.removeAttribute('aria-describedby');described=anchor||null;if(anchor)anchor.setAttribute('aria-describedby',id);};
  const info=id=>store.info(id);
  const handle={hide,isOpen:()=>!tooltip.hidden};
  // One tooltip shows at a time, in the page or in a dialog.
  const claim=()=>{for(const other of tooltips){if(other===handle)continue;if(!other.container.isConnected)tooltips.delete(other);else other.hide();}};
  handle.container=container;tooltips.add(handle);

  function hide(){clearTimeout(timer);request++;current=null;shown=null;anchorRect=null;tooltip.hidden=true;describe(null);if(highlights)CSS.highlights.delete('word-hover');}
  function place(rect){
    // A dialog may have replaced its contents, tooltip included.
    if(layer&&tooltip.parentNode!==layer)layer.append(tooltip);
    tooltip.style.left='0px';tooltip.style.top='0px';tooltip.style.maxHeight='';tooltip.classList.remove('word-tooltip-wide');tooltip.hidden=false;
    // A usage note that fits in its three lines needs no "more".
    for(const box of tooltip.querySelectorAll('.word-tooltip-usage.clamped:not(.expanded)')){const text=box.firstElementChild;if(text.scrollHeight<=text.clientHeight+1){box.classList.remove('clamped');box.querySelector('.word-tooltip-more')?.remove();}}
    const box=placement(rect,{width:document.documentElement.clientWidth,height:innerHeight},()=>({width:tooltip.offsetWidth,height:tooltip.offsetHeight}),()=>tooltip.classList.add('word-tooltip-wide'));
    if(box.maxHeight)tooltip.style.maxHeight=`${box.maxHeight}px`;
    tooltip.style.left=`${box.left+(layer?0:scrollX)}px`;tooltip.style.top=`${box.top+(layer?0:scrollY)}px`;
  }
  // The concordance section comes after the entries, if the tooltip still shows this word.
  async function addConcordance(token,word,rect,anchor,keyboard){
    if(!concordance||!(isOriginalScript(word)||concordance.english))return;
    let result=null;try{result=await concordance.lookup(word);}catch{}
    if(token!==request||!result)return;
    const html=concordance.sectionHtml(result,{word,shortcut:keyboard});if(!html)return;
    // Show passages needs a result with paragraphs; a "not found" line has none.
    shown=result.entry?{word,result,anchor,keyboard}:null;const slot=tooltip.querySelector('.word-tooltip-concordance-slot');if(slot)slot.outerHTML=html;else tooltip.insertAdjacentHTML('beforeend',html);place(anchorRect?anchorRect():rect);
    const section=tooltip.querySelector('.word-tooltip-concordance');
    if(section&&concordance.fill)Promise.resolve(concordance.fill(section,()=>token===request)).then(changed=>{if(changed&&token===request)place(anchorRect?anchorRect():rect);},()=>{});
  }
  async function show(word,rect,anchor,range,keyboard=false){
    const token=++request;shown=null;claim();
    describe(anchor);anchorRect=()=>(anchor||range)?.getBoundingClientRect()||rect;
    if(highlights){if(range)CSS.highlights.set('word-hover',new Highlight(range));else CSS.highlights.delete('word-hover');}
    // Wait for the dictionary list on the first lookup of a visit.
    await store.ready();if(token!==request)return;
    if(!store.hasActive()){tooltip.innerHTML=`<div class="word-tooltip-word" dir="auto">${esc(word)}</div><p class="word-tooltip-empty">No dictionaries are turned on. Choose Dictionaries to add or turn one on.</p>`;place(rect);addConcordance(token,word,rect,anchor,keyboard);return;}
    const result=await store.lookup(word,{target:target(),prefer:prefer(anchor||range?.startContainer?.parentElement),explain:true});
    if(token!==request)return;
    tooltip.innerHTML=tooltipHtml(result,info,{style:gloss()});place(rect);
    addConcordance(token,word,rect,anchor,keyboard);
  }
  // The word under a point in published paragraph text, as a DOM range.
  function wordRangeAt(x,y){
    let node,offset;
    if(document.caretPositionFromPoint){const position=document.caretPositionFromPoint(x,y);node=position?.offsetNode;offset=position?.offset;}
    else if(document.caretRangeFromPoint){const range=document.caretRangeFromPoint(x,y);node=range?.startContainer;offset=range?.startOffset;}
    if(!node||node.nodeType!==3)return null;
    const parent=node.parentElement;
    if(!parent?.closest('.paragraph-cell > p,[data-word-text]')||!container.contains(parent)||tooltip.contains(parent)||parent.closest('a,sup,.paragraph-number'))return null;
    const word=wordAt(node.textContent,offset);if(!word)return null;
    const range=document.createRange();range.setStart(node,word.start);range.setEnd(node,word.end);
    const rect=range.getBoundingClientRect();
    if(x<rect.left-2||x>rect.right+2||y<rect.top-2||y>rect.bottom+2)return null;
    return {word:word.text,range,rect};
  }
  function fromEvent(event){
    const column=event.target.closest?.('.ilw');
    if(column&&container.contains(column))return {word:column.dataset.word,rect:column.getBoundingClientRect(),anchor:column,key:column};
    const hit=wordRangeAt(event.clientX,event.clientY);
    return hit?{...hit,key:`${hit.word}@${Math.round(hit.rect.left)},${Math.round(hit.rect.top)}`}:null;
  }
  const inTooltip=event=>tooltip.contains(event.target);

  container.addEventListener('pointerdown',event=>{lastPointer=event.pointerType||'mouse';});
  container.addEventListener('pointermove',event=>{
    if(event.pointerType&&event.pointerType!=='mouse')return;
    if(!hovering()||inTooltip(event)||noteLink(event.target))return;
    const hit=fromEvent(event);
    if(!hit){if(current&&!tooltip.matches(':hover')){clearTimeout(timer);timer=setTimeout(()=>{if(!tooltip.matches(':hover'))hide();},250);}return;}
    if(current===hit.key)return;
    clearTimeout(timer);timer=setTimeout(()=>{current=hit.key;show(hit.word,hit.rect,hit.anchor,hit.range);},90);
  });
  container.addEventListener('pointerleave',event=>{if(event.pointerType&&event.pointerType!=='mouse')return;if(!hovering())return;clearTimeout(timer);timer=setTimeout(()=>{if(!tooltip.matches(':hover'))hide();},250);});
  tooltip.addEventListener('pointerleave',event=>{if(event.pointerType==='mouse'&&hovering()&&!container.contains(event.relatedTarget))hide();});
  // Footnote numbers show their note in place, so readers need not jump to
  // the notes and back. A tap previews the note; the preview links to it.
  const noteFor=link=>{const note=document.getElementById(decodeURIComponent((link.getAttribute('href')||'').slice(1)));if(!note)return null;const copy=note.cloneNode(true);copy.querySelectorAll('a[href^="#ref-"]').forEach(back=>back.remove());copy.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));return copy.innerHTML.trim();};
  function showNote(link){
    const html=noteFor(link);if(!html)return false;
    request++;current=link;claim();if(highlights)CSS.highlights.delete('word-hover');
    const rtl=link.closest('[dir=rtl]');
    tooltip.innerHTML=`<div class="word-tooltip-note-label">Note ${esc(link.textContent.trim())}</div><div class="word-tooltip-note"${rtl?' dir="rtl" lang="fa"':''}>${html}</div><a class="word-tooltip-note-link" href="${esc(link.getAttribute('href'))}">Go to the note</a>`;
    describe(link);anchorRect=()=>link.getBoundingClientRect();place(anchorRect());return true;
  }
  const noteLink=target=>{const link=target.closest?.('a.note-ref');return link&&container.contains(link)&&!tooltip.contains(link)?link:null;};
  container.addEventListener('pointerover',event=>{if(event.pointerType&&event.pointerType!=='mouse')return;if(!hovering())return;const link=noteLink(event.target);if(link&&current!==link){clearTimeout(timer);showNote(link);}});
  container.addEventListener('focusin',event=>{if(!hovering())return;const link=noteLink(event.target);if(link)showNote(link);});
  container.addEventListener('focusout',event=>{const link=noteLink(event.target);if(link&&!tooltip.contains(event.relatedTarget))hide();});
  container.addEventListener('click',event=>{const link=noteLink(event.target);if(link&&lastPointer!=='mouse'&&current!==link&&showNote(link))event.preventDefault();},true);
  tooltip.addEventListener('click',event=>{
    if(event.target.closest('.word-tooltip-note-link'))hide();
    if(event.target.closest('.concordance-open')&&shown&&container.isConnected)openPassages();
    // The page's tooltip element is shared by every reader attached to it; only the one describing a word acts.
    const more=event.target.closest('.word-tooltip-more');
    if(more&&described&&container.isConnected){const open=more.getAttribute('aria-expanded')!=='true';more.setAttribute('aria-expanded',String(open));more.textContent=open?'less':'more';more.parentElement.classList.toggle('expanded',open);if(anchorRect)place(anchorRect());}
  });
  // Opening or closing the other senses keeps the tooltip beside its word.
  tooltip.addEventListener('toggle',()=>{if(!tooltip.hidden&&anchorRect&&container.isConnected)place(anchorRect());},true);
  // Tab from the described word column enters the tooltip's controls; Tab
  // past the last one closes it and returns to the word, Shift+Tab from the
  // first goes back to the word with the tooltip still open.
  const controls=()=>[...tooltip.querySelectorAll('button,summary,a[href]')].filter(control=>control.getClientRects().length);
  // Focus returns to the word column after the dialog when the keyboard opened it.
  function openPassages(){const {word,result,anchor,keyboard}=shown;hide();onOpenConcordance?.(word,result,{returnFocus:keyboard&&anchor?.matches?.('.ilw')?anchor:null});}
  // Touch and pen (and the mouse in click mode): a tap opens the entry;
  // tapping elsewhere closes it. In click mode a second click closes it.
  container.addEventListener('click',event=>{
    const mouse=lastPointer==='mouse';
    if((mouse&&hovering())||inTooltip(event)||event.target.closest('a,button'))return;
    if(mouse&&!getSelection()?.isCollapsed)return;
    const hit=fromEvent(event);if(!hit){hide();return;}
    if(mouse&&current===hit.key&&!tooltip.hidden){hide();return;}
    current=hit.key;show(hit.word,hit.rect,hit.anchor,hit.range);
  });
  document.addEventListener('pointerdown',event=>{if(!tooltip.hidden&&!tooltip.contains(event.target)&&!container.contains(event.target))hide();});
  // Keyboard: one tab stop per interlinear paragraph; arrows move by word.
  const focusVisible=element=>{try{return element.matches(':focus-visible');}catch{return lastPointer!=='mouse';}};
  container.addEventListener('focusin',event=>{
    const column=event.target.closest?.('.ilw');if(!column||current===column)return;
    if(hovering()){current=column;show(column.dataset.word,column.getBoundingClientRect(),column,null,focusVisible(column));}
    else if(!tooltip.hidden&&shown?.anchor!==column&&described!==column)hide();
  });
  container.addEventListener('focusout',event=>{if(event.target.closest?.('.ilw')&&!event.relatedTarget?.closest?.('.ilw')&&!tooltip.contains(event.relatedTarget))hide();});
  // Escape closes the tooltip first (in a dialog, before the dialog itself).
  const escape=event=>{if(event.key==='Escape'&&!tooltip.hidden){event.preventDefault();event.stopPropagation();const anchor=described;hide();if(tooltip.contains(document.activeElement)||!document.activeElement||document.activeElement===document.body)anchor?.focus?.({preventScroll:true});return true;}return false;};
  tooltip.addEventListener('keydown',event=>{
    if(escape(event)||event.key!=='Tab'||!described?.matches?.('.ilw')||!container.isConnected)return;
    const list=controls(),i=list.indexOf(document.activeElement);
    if(event.shiftKey&&i===0){event.preventDefault();described.focus({preventScroll:true});}
    else if(!event.shiftKey&&i===list.length-1){event.preventDefault();const anchor=described;hide();current=anchor;anchor.focus({preventScroll:true});}
  });
  container.addEventListener('keydown',event=>{
    if(inTooltip(event)||escape(event))return;
    const column=event.target.closest?.('.ilw');if(!column||!container.contains(column))return;
    if(event.key==='Tab'&&!event.shiftKey&&!tooltip.hidden&&described===column){const first=controls()[0];if(first){event.preventDefault();first.focus({preventScroll:true});}return;}
    if(passagesKey(event)){if(shown?.anchor===column&&!tooltip.hidden&&container.isConnected){event.preventDefault();openPassages();}return;}
    const line=column.parentElement,columns=[...line.children],i=columns.indexOf(column),rtl=line.dir==='rtl';
    const step={ArrowRight:rtl?-1:1,ArrowLeft:rtl?1:-1}[event.key];
    let next=null;
    if(step)next=columns[i+step];else if(event.key==='Home')next=columns[0];else if(event.key==='End')next=columns.at(-1);
    else if(event.key==='Enter'||event.key===' '){event.preventDefault();if(tooltip.hidden||described!==column){current=column;show(column.dataset.word,column.getBoundingClientRect(),column,null,true);}else hide();return;}
    if(!next)return;
    event.preventDefault();column.tabIndex=-1;next.tabIndex=0;next.focus();
  });
  // Scrolling keeps the tooltip beside its word; it closes once the word has
  // left the viewport. In a dialog its own scrolling counts too.
  let frame=0;
  const follow=event=>{if(tooltip.hidden||!anchorRect||frame||tooltip.contains(event.target))return;frame=requestAnimationFrame(()=>{frame=0;if(tooltip.hidden||!anchorRect)return;const rect=anchorRect();if(rect.bottom<0||rect.top>innerHeight||!rect.width)hide();else place(rect);});};
  if(layer)layer.addEventListener('scroll',follow,{passive:true,capture:true});else addEventListener('scroll',follow,{passive:true});
  return handle;
}

// What a published dictionary covers and how it was made: its `about`
// paragraphs (plain text, escaped) and its counts, folded under `summary`.
export function dictionaryAboutHtml(info,{summary='About this dictionary',open=false,className=''}={}){
  const about=Array.isArray(info?.about)?info.about.filter(text=>typeof text==='string'&&text.trim()):[];
  if(!about.length)return '';
  const number=n=>Number(n||0).toLocaleString('en-US');
  const facts=[info.entries!==undefined?`${number(info.entries)} entries`:'',info.forms!==undefined?`${number(info.forms)} distinct forms`:'',info.uncertain!==undefined?`${number(info.uncertain)} marked uncertain`:'',info.aiGenerated?'AI-generated':''].filter(Boolean).join(' · ');
  return `<details class="dictionary-about${className?` ${className}`:''}"${open?' open':''}><summary>${esc(summary)}</summary><div class="dictionary-about-body">${about.map(text=>`<p>${esc(text)}</p>`).join('')}${facts?`<p class="dictionary-about-facts">${facts}</p>`:''}</div></details>`;
}

// The dictionaries dialog: turn dictionaries on or off, order them, and add
// or remove personal dictionary files.
export function dictionaryDialogHtml(list){
  const rows=list.map((item,i)=>`<li class="dictionary-row"><label><input type="checkbox" data-dictionary-toggle="${esc(item.id)}"${item.enabled?' checked':''}> <span class="dictionary-name">${esc(item.name)}</span></label><span class="dictionary-meta">${item.kind==='personal'?'Your dictionary (kept in this browser)':'Published'}${item.aiGenerated?' · AI-generated':''} · ${Number(item.entries||0).toLocaleString('en-US')} entries</span>${item.description?`<span class="dictionary-description">${esc(item.description)}</span>`:''}${item.kind==='published'?`<a class="dictionary-review-link" href="./dictionary-browser.html?dict=${encodeURIComponent(item.id)}">Browse entries →</a><a class="dictionary-review-link" href="./dictionary-review.html?dict=${encodeURIComponent(item.id)}">Review entries →</a>${dictionaryAboutHtml(item)}`:''}<span class="dictionary-actions"><button type="button" class="text-button" data-dictionary-move="${esc(item.id)}" data-delta="-1"${i?'':' disabled'} aria-label="Move ${esc(item.name)} up">↑</button><button type="button" class="text-button" data-dictionary-move="${esc(item.id)}" data-delta="1"${i<list.length-1?'':' disabled'} aria-label="Move ${esc(item.name)} down">↓</button>${item.kind==='personal'?`<button type="button" class="text-button" data-dictionary-remove="${esc(item.id)}">Remove</button>`:''}</span></li>`).join('');
  return `<h2 id="dictionary-dialog-title">Dictionaries</h2><p class="dictionary-help">Word tooltips and interlinear rows use the dictionaries turned on below, in this order. Pronunciations and one-word glosses come from the dictionaries, not from the translation shown beneath each paragraph.</p>${rows?`<ol class="dictionary-list">${rows}</ol>`:'<p class="dictionary-help">No dictionaries are available yet.</p>'}<div class="dictionary-add"><label class="secondary-button" for="dictionary-file">Add a dictionary file…</label><input type="file" id="dictionary-file" accept=".tsv,.csv,.txt,text/tab-separated-values,text/csv"><p class="dictionary-help">A spreadsheet saved as TSV or CSV. The first row names the columns: <code>form</code> and <code>gloss</code> are required; <code>lemma</code>, <code>lang</code>, <code>translit</code>, <code>definition</code>, <code>notes</code>, <code>pos</code>, <code>root</code>, <code>tags</code>, <code>modern</code>, <code>modern_translit</code>, <code>modern_gloss</code>, <code>shift</code> and <code>usage</code> are optional. The file stays in this browser and is not uploaded.</p><p id="dictionary-status" class="dictionary-status" role="status"></p></div><div class="dictionary-close"><button type="button" class="secondary" id="dictionary-close">Close</button></div>`;
}

export function openDictionaryDialog(store){
  let dialog=document.getElementById('dictionary-dialog');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='dictionary-dialog';dialog.className='dictionary-dialog';dialog.setAttribute('aria-labelledby','dictionary-dialog-title');document.body.append(dialog);}
  const render=(status='')=>{dialog.innerHTML=dictionaryDialogHtml(store.list());dialog.querySelector('#dictionary-status').textContent=status;};
  const stop=store.onChange(()=>render(dialog.querySelector('#dictionary-status')?.textContent||''));
  dialog.onchange=async event=>{
    const toggle=event.target.closest('[data-dictionary-toggle]');if(toggle){store.setEnabled(toggle.dataset.dictionaryToggle,toggle.checked);return;}
    if(event.target.id==='dictionary-file'&&event.target.files[0]){
      const file=event.target.files[0];
      try{const {entries,saved}=await store.addFile(file);render(`Added ${file.name}: ${entries.toLocaleString('en-US')} entries.${saved?'':' This browser could not store it, so it lasts only for this visit.'}`);}
      catch(error){render(`Could not read ${file.name}: ${error.message}`);}
    }
  };
  dialog.onclick=event=>{
    const move=event.target.closest('[data-dictionary-move]');if(move){store.move(move.dataset.dictionaryMove,Number(move.dataset.delta));return;}
    const remove=event.target.closest('[data-dictionary-remove]');if(remove){store.remove(remove.dataset.dictionaryRemove);return;}
    if(event.target.id==='dictionary-close'||event.target===dialog)dialog.close();
  };
  dialog.onclose=()=>stop();
  store.ready().then(()=>render());render();
  dialog.showModal();
}
