// Word tooltip and interlinear word study for the Catalog reader.
// Interlinear blocks show the source paragraph word by word, each word with
// its dictionary pronunciation and one-word gloss, followed by the counterpart
// paragraph as published. Glosses are dictionary lookups: they do not claim
// that the published translation renders the text word for word.
import {escapeHtml as esc} from './text.mjs';
import {applyVowels,dictionaryKey,interlinearTokens,isOriginalScript,textWords,wordAt} from './dictionary.mjs';

export const studyModes=['original','en'];
export const studyMode=value=>studyModes.includes(value)?value:'';
// The language English words are glossed into in Words: English.
export const glossTargets=['fa','ar'];
export const glossTarget=value=>glossTargets.includes(value)?value:'fa';
// How original words are glossed in Words: original: a plain modern English
// gloss, or the word as the authorized (Bahá'í English) translations render it.
export const glossStyles=['plain','bahai'];
export const glossStyle=value=>glossStyles.includes(value)?value:'plain';

// Bahá'í English marks a word only when its rendering actually differs from
// the plain gloss (ignoring case, hyphens and punctuation).
const glossKey=value=>String(value||'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export const renderingDiffers=entry=>!!entry.rendering&&glossKey(entry.rendering)!==glossKey(entry.gloss);

// The text each interlinear row shows for a lookup result.
// In the Bahá'í English style an original word shows its `rendering` when
// the entry has one, and `elevated` marks a word of the elevated register.
export function interlinearCells(result,style='plain'){
  const entry=result?.entries?.[0];
  if(!entry)return {pronunciation:'',gloss:'',target:'',partial:false};
  const partial=!!result.via;
  // The fully vowelled spelling applies only to the word exactly as listed.
  if(result.side==='original')return {pronunciation:entry.translit||'',gloss:(style==='bahai'&&entry.rendering)||entry.gloss||'',target:'',partial,vocalized:partial?'':entry.vocalized||'',elevated:entry.register==='elevated'&&renderingDiffers(entry)};
  // English words: how the English word sounds (in the script an English to
  // Persian/Arabic dictionary writes it) and its equivalent. An entry found
  // only through a Persian/Arabic gloss gives the equivalent, not a sound.
  const target=entry.reverse?(entry.lemma||entry.form):(entry.gloss||'');
  return {pronunciation:entry.reverse?'':entry.translit||'',gloss:target,target,partial};
}

export function tooltipHtml(result,info){
  const word=`<div class="word-tooltip-word" dir="auto">${esc(result.word)}</div>`;
  if(!result.entries.length)return `${word}<p class="word-tooltip-empty">No dictionary entry for this word.</p>`;
  const via=result.via==='parts'?'<p class="word-tooltip-via">Shown by its parts.</p>':result.via?`<p class="word-tooltip-via">Found as <span dir="auto">${esc(result.matched)}</span> (${esc(result.via.replace(/–/g,''))} removed).</p>`:'';
  const items=result.entries.slice(0,8).map(entry=>{
    const source=info(entry.dictionary);
    const vowelled=entry.vocalized&&!entry.reverse?`<span class="word-tooltip-vocalized" dir="rtl" lang="fa" title="With vowel marks">${esc(entry.vocalized)}</span>`:'';
    const head=entry.reverse?`<span class="word-tooltip-lemma" dir="rtl" lang="fa">${esc(entry.lemma||entry.form)}</span>`:(entry.lemma&&dictionaryKey(entry.lemma)!==dictionaryKey(entry.form)?`<span class="word-tooltip-lemma" dir="auto">${esc(entry.lemma)}</span>`:'');
    const script=value=>isOriginalScript(value)?' dir="rtl" lang="fa"':' dir="auto"';
    return `<li>${entry.part?`<div class="word-tooltip-part" dir="auto">${esc(entry.part)}</div>`:''}<div class="word-tooltip-head">${vowelled}${head}${entry.translit?`<span class="word-tooltip-translit${isOriginalScript(entry.translit)?' in-script':''}"${script(entry.translit)}>${esc(entry.translit)}</span>`:''}${entry.lang?`<span class="word-tooltip-lang">${esc(entry.lang)}</span>`:''}${entry.register==='elevated'?'<span class="word-tooltip-register">elevated style</span>':''}</div><div class="word-tooltip-gloss"${script(entry.gloss||'')}>${esc(entry.gloss||'')}</div>${entry.rendering&&entry.rendering!==entry.gloss?`<div class="word-tooltip-rendering" dir="auto">Bahá'í English: ${esc(entry.rendering)}</div>`:''}${entry.definition?`<p class="word-tooltip-definition"${script(entry.definition)}>${esc(entry.definition)}</p>`:''}${entry.notes?`<p class="word-tooltip-notes"${script(entry.notes)}>${esc(entry.notes)}</p>`:''}<div class="word-tooltip-source">${esc(source?.name||entry.dictionary)}${source?.aiGenerated?' · AI-generated':''}${source?.kind==='personal'?' · your dictionary':''}</div></li>`;
  }).join('');
  const more=result.entries.length>8?`<p class="word-tooltip-via">${result.entries.length-8} more entries not shown.</p>`:'';
  return `${word}${via}<ol class="word-tooltip-entries">${items}</ol>${more}`;
}

// Interlinear markup for one paragraph: word columns (filled in later by
// fillInterlinear) and, below, the counterpart paragraph as published.
export function interlinearBlockHtml({top,topLanguage,number,numberHtml,bottomHtml,bottomId,bottomLanguage,bottomClass=''}){
  const rtl=topLanguage==='original';
  const tokens=interlinearTokens(top.plain||'');
  const columns=tokens.map((token,i)=>`<span class="ilw" tabindex="${i?-1:0}" data-word="${esc(token.word)}"><span class="ilw-word"${rtl?' lang="fa"':''}>${esc(token.lead)}<span class="ilw-text">${esc(token.word)}</span>${esc(token.trail)}</span><span class="ilw-pron"></span><span class="ilw-gloss"${rtl?'':' dir="rtl" lang="fa"'}></span></span>`).join('');
  const bottom=bottomHtml===null?'':bottomHtml===undefined?`<p class="interlinear-missing">${bottomLanguage==='en'?'No English paragraph is paired with this paragraph.':'No original paragraph is paired with this paragraph.'}</p>`:`<div class="paragraph-cell interlinear-free ${bottomLanguage==='en'?'english-cell':'original-cell'}${bottomClass}" id="${bottomId}" dir="${bottomLanguage==='en'?'ltr':'rtl'}" lang="${bottomLanguage==='en'?'en':'fa'}"><p>${bottomHtml}</p></div>`;
  return `<section class="interlinear-block"><div class="interlinear-top" id="p-${topLanguage}-${number}" data-top-language="${topLanguage}">${numberHtml}<div class="interlinear-line" role="group" aria-label="Paragraph ${number}, word by word" dir="${rtl?'rtl':'ltr'}">${columns}</div></div>${bottom}</section>`;
}

// Look up every word column under `root` and fill its rows.
export async function fillInterlinear(root,store,isCurrent=()=>true,target='',vowels=false,style='plain',prefer=''){
  const columns=[...root.querySelectorAll('.ilw:not([data-filled])')];
  if(!columns.length)return;
  await store.prefetch([...new Set(columns.flatMap(column=>[dictionaryKey(column.dataset.word),...column.dataset.word.split('\u200c').map(dictionaryKey)]))].filter(Boolean));
  const cache=new Map();
  for(const column of columns){
    if(!isCurrent())return;
    const word=column.dataset.word;
    if(!cache.has(word))cache.set(word,await store.lookup(word,{target,prefer}));
    const cells=interlinearCells(cache.get(word),style);
    column.dataset.filled='';
    column.classList.toggle('ilw-elevated',style==='bahai'&&cells.elevated);
    column.classList.toggle('ilw-unknown',!cells.gloss&&!cells.pronunciation);
    column.classList.toggle('ilw-partial',cells.partial);
    const pronunciation=column.querySelector('.ilw-pron');
    pronunciation.textContent=cells.pronunciation||'·';
    if(isOriginalScript(cells.pronunciation)){pronunciation.dir='rtl';pronunciation.lang='fa';pronunciation.classList.add('in-script');}
    column.querySelector('.ilw-gloss').textContent=cells.gloss||'·';
    // Vowel marks come from the dictionary and are laid on the letters as
    // written (applyVowels); the dictionary's own spelling stays in the tooltip.
    const text=column.querySelector('.ilw-text');
    const shown=vowels&&cells.vocalized?applyVowels(word,cells.vocalized):word;
    text.textContent=shown;column.classList.toggle('ilw-vowelled',shown!==word);
  }
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
// `concordance` ({lookup(word),sectionHtml(result,{word})}) adds what the
// authorized translations show for an original word below its entries;
// its Show passages button (or P on a focused word column) calls
// onOpenConcordance(word,result,{returnFocus}).
export const passagesKey=event=>(event.key==='p'||event.key==='P')&&!event.shiftKey&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&!event.isComposing;
export function attachWordTooltip(container,store,{target=()=>'',prefer=()=>'',concordance=null,onOpenConcordance=null}={}){
  let tooltip=document.getElementById('word-tooltip');
  if(!tooltip){tooltip=document.createElement('div');tooltip.id='word-tooltip';tooltip.className='word-tooltip';tooltip.setAttribute('role','tooltip');tooltip.hidden=true;document.body.append(tooltip);}
  const highlights=typeof CSS!=='undefined'&&CSS.highlights&&typeof Highlight==='function';
  let current=null,timer=0,request=0,lastPointer='mouse',described=null,anchorRect=null,shown=null;
  // Only the word or note the tooltip currently describes is marked.
  const describe=anchor=>{if(described&&described!==anchor)described.removeAttribute('aria-describedby');described=anchor||null;if(anchor)anchor.setAttribute('aria-describedby','word-tooltip');};
  const info=id=>store.info(id);

  function hide(){clearTimeout(timer);request++;current=null;shown=null;anchorRect=null;tooltip.hidden=true;describe(null);if(highlights)CSS.highlights.delete('word-hover');}
  function place(rect){
    tooltip.style.left='0px';tooltip.style.top='0px';tooltip.style.maxHeight='';tooltip.classList.remove('word-tooltip-wide');tooltip.hidden=false;
    const box=placement(rect,{width:document.documentElement.clientWidth,height:innerHeight},()=>({width:tooltip.offsetWidth,height:tooltip.offsetHeight}),()=>tooltip.classList.add('word-tooltip-wide'));
    if(box.maxHeight)tooltip.style.maxHeight=`${box.maxHeight}px`;
    tooltip.style.left=`${box.left+scrollX}px`;tooltip.style.top=`${box.top+scrollY}px`;
  }
  // The concordance section comes after the entries, if the tooltip still shows this word.
  async function addConcordance(token,word,rect,anchor,keyboard){
    if(!concordance||!isOriginalScript(word))return;
    let result=null;try{result=await concordance.lookup(word);}catch{}
    if(token!==request||!result)return;
    const html=concordance.sectionHtml(result,{word,shortcut:keyboard});if(!html)return;
    shown={word,result,anchor,keyboard};tooltip.insertAdjacentHTML('beforeend',html);place(anchorRect?anchorRect():rect);
  }
  async function show(word,rect,anchor,range,keyboard=false){
    const token=++request;shown=null;
    describe(anchor);anchorRect=()=>(anchor||range)?.getBoundingClientRect()||rect;
    if(highlights){if(range)CSS.highlights.set('word-hover',new Highlight(range));else CSS.highlights.delete('word-hover');}
    // Wait for the dictionary list on the first lookup of a visit.
    await store.ready();if(token!==request)return;
    if(!store.hasActive()){tooltip.innerHTML=`<div class="word-tooltip-word" dir="auto">${esc(word)}</div><p class="word-tooltip-empty">No dictionaries are turned on. Choose Dictionaries to add or turn one on.</p>`;place(rect);addConcordance(token,word,rect,anchor,keyboard);return;}
    const result=await store.lookup(word,{target:target(),prefer:prefer()});
    if(token!==request)return;
    tooltip.innerHTML=tooltipHtml(result,info);place(rect);
    addConcordance(token,word,rect,anchor,keyboard);
  }
  // The word under a point in published paragraph text, as a DOM range.
  function wordRangeAt(x,y){
    let node,offset;
    if(document.caretPositionFromPoint){const position=document.caretPositionFromPoint(x,y);node=position?.offsetNode;offset=position?.offset;}
    else if(document.caretRangeFromPoint){const range=document.caretRangeFromPoint(x,y);node=range?.startContainer;offset=range?.startOffset;}
    if(!node||node.nodeType!==3)return null;
    const parent=node.parentElement;
    if(!parent?.closest('.paragraph-cell > p')||!container.contains(parent)||parent.closest('a,sup,.paragraph-number'))return null;
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

  container.addEventListener('pointerdown',event=>{lastPointer=event.pointerType||'mouse';});
  container.addEventListener('pointermove',event=>{
    if(event.pointerType&&event.pointerType!=='mouse')return;
    if(noteLink(event.target))return;
    const hit=fromEvent(event);
    if(!hit){if(current&&!tooltip.matches(':hover')){clearTimeout(timer);timer=setTimeout(()=>{if(!tooltip.matches(':hover'))hide();},250);}return;}
    if(current===hit.key)return;
    clearTimeout(timer);timer=setTimeout(()=>{current=hit.key;show(hit.word,hit.rect,hit.anchor,hit.range);},90);
  });
  container.addEventListener('pointerleave',event=>{if(event.pointerType&&event.pointerType!=='mouse')return;clearTimeout(timer);timer=setTimeout(()=>{if(!tooltip.matches(':hover'))hide();},250);});
  tooltip.addEventListener('pointerleave',event=>{if(event.pointerType==='mouse'&&!container.contains(event.relatedTarget))hide();});
  // Footnote numbers show their note in place, so readers need not jump to
  // the notes and back. A tap previews the note; the preview links to it.
  const noteFor=link=>{const note=document.getElementById(decodeURIComponent((link.getAttribute('href')||'').slice(1)));if(!note)return null;const copy=note.cloneNode(true);copy.querySelectorAll('a[href^="#ref-"]').forEach(back=>back.remove());copy.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));return copy.innerHTML.trim();};
  function showNote(link){
    const html=noteFor(link);if(!html)return false;
    request++;current=link;if(highlights)CSS.highlights.delete('word-hover');
    const rtl=link.closest('[dir=rtl]');
    tooltip.innerHTML=`<div class="word-tooltip-note-label">Note ${esc(link.textContent.trim())}</div><div class="word-tooltip-note"${rtl?' dir="rtl" lang="fa"':''}>${html}</div><a class="word-tooltip-note-link" href="${esc(link.getAttribute('href'))}">Go to the note</a>`;
    describe(link);anchorRect=()=>link.getBoundingClientRect();place(anchorRect());return true;
  }
  const noteLink=target=>{const link=target.closest?.('a.note-ref');return link&&container.contains(link)?link:null;};
  container.addEventListener('pointerover',event=>{if(event.pointerType&&event.pointerType!=='mouse')return;const link=noteLink(event.target);if(link&&current!==link){clearTimeout(timer);showNote(link);}});
  container.addEventListener('focusin',event=>{const link=noteLink(event.target);if(link)showNote(link);});
  container.addEventListener('focusout',event=>{const link=noteLink(event.target);if(link&&!tooltip.contains(event.relatedTarget))hide();});
  container.addEventListener('click',event=>{const link=noteLink(event.target);if(link&&lastPointer!=='mouse'&&current!==link&&showNote(link))event.preventDefault();},true);
  tooltip.addEventListener('click',event=>{
    if(event.target.closest('.word-tooltip-note-link'))hide();
    if(event.target.closest('.concordance-open')&&shown&&container.isConnected)openPassages();
  });
  // Focus returns to the word column after the dialog when the keyboard opened it.
  function openPassages(){const {word,result,anchor,keyboard}=shown;hide();onOpenConcordance?.(word,result,{returnFocus:keyboard&&anchor?.matches?.('.ilw')?anchor:null});}
  // Touch and pen: a tap opens the entry; tapping elsewhere closes it.
  container.addEventListener('click',event=>{
    if(lastPointer==='mouse'||event.target.closest('a,button'))return;
    const hit=fromEvent(event);if(!hit){hide();return;}
    current=hit.key;show(hit.word,hit.rect,hit.anchor,hit.range);
  });
  document.addEventListener('pointerdown',event=>{if(!tooltip.hidden&&!tooltip.contains(event.target)&&!container.contains(event.target))hide();});
  // Keyboard: one tab stop per interlinear paragraph; arrows move by word.
  const focusVisible=element=>{try{return element.matches(':focus-visible');}catch{return lastPointer!=='mouse';}};
  container.addEventListener('focusin',event=>{const column=event.target.closest?.('.ilw');if(column){current=column;show(column.dataset.word,column.getBoundingClientRect(),column,null,focusVisible(column));}});
  container.addEventListener('focusout',event=>{if(event.target.closest?.('.ilw')&&!event.relatedTarget?.closest?.('.ilw'))hide();});
  container.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!tooltip.hidden){hide();return;}
    const column=event.target.closest?.('.ilw');if(!column||!container.contains(column))return;
    if(passagesKey(event)){if(shown?.anchor===column&&!tooltip.hidden&&container.isConnected){event.preventDefault();openPassages();}return;}
    const line=column.parentElement,columns=[...line.children],i=columns.indexOf(column),rtl=line.dir==='rtl';
    const step={ArrowRight:rtl?-1:1,ArrowLeft:rtl?1:-1}[event.key];
    let next=null;
    if(step)next=columns[i+step];else if(event.key==='Home')next=columns[0];else if(event.key==='End')next=columns.at(-1);
    else if(event.key==='Enter'||event.key===' '){event.preventDefault();if(tooltip.hidden)show(column.dataset.word,column.getBoundingClientRect(),column,null,true);else hide();return;}
    if(!next)return;
    event.preventDefault();column.tabIndex=-1;next.tabIndex=0;next.focus();
  });
  // Scrolling keeps the tooltip beside its word; it closes once the word has
  // left the viewport.
  let frame=0;
  addEventListener('scroll',()=>{if(tooltip.hidden||!anchorRect||frame)return;frame=requestAnimationFrame(()=>{frame=0;if(tooltip.hidden||!anchorRect)return;const rect=anchorRect();if(rect.bottom<0||rect.top>innerHeight||!rect.width)hide();else place(rect);});},{passive:true});
  return {hide};
}

// The dictionaries dialog: turn dictionaries on or off, order them, and add
// or remove personal dictionary files.
export function dictionaryDialogHtml(list){
  const rows=list.map((item,i)=>`<li class="dictionary-row"><label><input type="checkbox" data-dictionary-toggle="${esc(item.id)}"${item.enabled?' checked':''}> <span class="dictionary-name">${esc(item.name)}</span></label><span class="dictionary-meta">${item.kind==='personal'?'Your dictionary (kept in this browser)':'Published'}${item.aiGenerated?' · AI-generated':''} · ${Number(item.entries||0).toLocaleString('en-US')} entries</span>${item.description?`<span class="dictionary-description">${esc(item.description)}</span>`:''}<span class="dictionary-actions"><button type="button" class="text-button" data-dictionary-move="${esc(item.id)}" data-delta="-1"${i?'':' disabled'} aria-label="Move ${esc(item.name)} up">↑</button><button type="button" class="text-button" data-dictionary-move="${esc(item.id)}" data-delta="1"${i<list.length-1?'':' disabled'} aria-label="Move ${esc(item.name)} down">↓</button>${item.kind==='personal'?`<button type="button" class="text-button" data-dictionary-remove="${esc(item.id)}">Remove</button>`:''}</span></li>`).join('');
  return `<h2 id="dictionary-dialog-title">Dictionaries</h2><p class="dictionary-help">Word tooltips and interlinear rows use the dictionaries turned on below, in this order. Pronunciations and one-word glosses come from the dictionaries, not from the translation shown beneath each paragraph.</p>${rows?`<ol class="dictionary-list">${rows}</ol>`:'<p class="dictionary-help">No dictionaries are available yet.</p>'}<div class="dictionary-add"><label class="secondary-button" for="dictionary-file">Add a dictionary file…</label><input type="file" id="dictionary-file" accept=".tsv,.csv,.txt,text/tab-separated-values,text/csv"><p class="dictionary-help">A spreadsheet saved as TSV or CSV. The first row names the columns: <code>form</code> and <code>gloss</code> are required; <code>lemma</code>, <code>lang</code>, <code>translit</code>, <code>definition</code> and <code>notes</code> are optional. The file stays in this browser and is not uploaded.</p><p id="dictionary-status" class="dictionary-status" role="status"></p></div><div class="dictionary-close"><button type="button" class="secondary" id="dictionary-close">Close</button></div>`;
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
