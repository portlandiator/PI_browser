// Help: word study and tooltips, dictionary tags, pronunciation, and the
// subject colour key. Shown as a modal dialog (openHelp) on any page, and as
// the standalone page help.html. Static content except the colour key, which
// is filled from the published subjects index (the same colours Subject view
// shows, through the theme-aware shades in theme.css).
import {wordTags,tagLabels} from './dictionary.mjs';
import {pronunciationGuideHtml} from './pronunciation-guide.mjs';
import {subjectColorStyle} from './subject-colors.mjs';
import {escapeHtml as esc} from './text.mjs';

export const helpSections=[['word-study','Word study'],['tags','Tags'],['pronunciation','Pronunciation'],['colours','Subject colours']];
const item=(term,text)=>`<dt>${term}</dt><dd>${text}</dd>`;

export function wordStudyHelpHtml(){
  return `<section id="help-word-study" class="help-section" aria-labelledby="help-word-study-title"><h3 id="help-word-study-title">Word study and tooltips</h3>
<p>Click or tap a word in the reader to open its tooltip. Glosses are dictionary lookups shown beside the published text, not a word-for-word alignment of the translation.</p>
<dl class="help-list">
${item('The word','The word as written, its fully vowelled form when the dictionary gives one, its transliteration (how it sounds) and its part of speech.')}
${item('Gloss line','A short English meaning. <b>Plain</b> is a plain modern English gloss; <b>Bahá’í English</b> is the word as Shoghi Effendi’s authorized translations render it, in their King James–style English (for example <i>verily</i>, <i>the Cause</i>, <i>glad-tidings</i>). The chosen gloss style comes first, followed by the other one when it differs.')}
${item('Tags','Categories such as Archaic or Bahá’í term, and the style tag Elevated style; see <a href="#help-tags">Dictionary tags</a>.')}
${item('Root','The Arabic root letters the word is built from.')}
${item('Modern','The everyday modern equivalent, with its pronunciation and meaning, for archaic, literary and meaning-shifted words.')}
${item('Meaning shift','For a word whose usual meaning has changed: “Here …” is its meaning in this text, “Today …” its usual modern meaning.')}
${item('In the Writings','A note on how the word is generally used in the Bahá’í Writings.')}
${item('Authorized translations','How often the word occurs in paragraphs that have an authorized translation, with English words that often appear there. These are statistics, not a translation. <b>Show passages</b> lists those paragraphs.')}
${item('Review status','<b>Unreviewed</b>, <b>Uncertain reading</b> (a reviewer doubts the entry) or <b>Reviewed by …</b> (with the reviewer’s name). The sample dictionaries are AI-generated and may contain mistakes.')}
</dl>
<h4>Reader controls</h4>
<dl class="help-list">
${item('Words: original','Original words in columns, each with its pronunciation and gloss, with the English paragraph beneath.')}
${item('Words: English','English words with their Persian or Arabic equivalents, with the original paragraph beneath.')}
${item('Vowel marks','Shows the dictionary’s vowel marks on the original words.')}
${item('Mark','Highlights the words whose dictionary entry has the chosen tag.')}
${item('Tooltips','<b>Hover</b> opens a tooltip when you point at or focus a word; <b>Click</b> (the default) only when you click or tap it or press Enter.')}
</dl></section>`;
}

// What each tag means, in wordTags order (Elevated style first).
export const tagMeanings={
  elevated:'The original word belongs to the elevated register of these texts: formal, literary, Arabic-learned or honorific words, scriptural formulas, and formal verb forms such as <span lang="fa" dir="rtl">گردد، نماید، فرمود</span>. In the Bahá’í English gloss style, words with this tag whose rendering differs from the plain gloss are underlined.',
  archaic:'Rare or obsolete in modern Persian or Arabic; typical of 19th-century usage.',
  literary:'Still understood, but bookish; not used in speech.',
  religious:'General religious or theological vocabulary.',
  bahai:'A term or sense specific to the Bahá’í Faith.',
  quranic:'A Qur’anic phrase or allusion.',
  mystical:'A technical term of Sufism or philosophy.',
  honorific:'A title or term of respect.',
  'meaning-shift':'The usual modern meaning differs from the meaning here; see the Meaning shift note in the tooltip.',
  'arabic-loan':'An Arabic word used within Persian.'
};
export function tagsHelpHtml(tags=wordTags){
  const rows=tags.map(tag=>`<li><span class="word-tag tag-${esc(tag)}">${esc(tagLabels[tag]||tag)}</span><span class="help-tag-meaning">${tagMeanings[tag]||''} <a href="./dictionary-browser.html?tag=${encodeURIComponent(tag)}">Browse entries with this tag</a></span></li>`).join('');
  return `<section id="help-tags" class="help-section" aria-labelledby="help-tags-title"><h3 id="help-tags-title">Dictionary tags</h3>
<p>Tags appear as chips in a word’s tooltip, in this order, and can be marked in the text with <b>Mark</b>.</p>
<ul class="help-tags">${rows}</ul></section>`;
}

export function pronunciationHelpHtml(){
  return `<section id="help-pronunciation" class="help-section" aria-labelledby="help-pronunciation-title"><h3 id="help-pronunciation-title">Pronunciation</h3>${pronunciationGuideHtml()}</section>`;
}

// The colour a section's subjects share; a few subjects in another colour
// do not change it (the most frequent colour wins, ties by first subject).
export function sectionColor(group,byName){
  const counts=new Map();
  for(const name of group.subjects){const color=byName.get(name)?.color;if(/^#[a-f\d]{6}$/i.test(color||''))counts.set(color.toLowerCase(),(counts.get(color.toLowerCase())||0)+1);}
  let best=null;for(const [color,n] of counts)if(!best||n>counts.get(best))best=color;
  return best;
}
export function colourKeyHtml(groups,subjects){
  const byName=new Map(subjects.map(s=>[s.name,s]));
  return `<ul class="help-colours">${groups.map(group=>{const color=sectionColor(group,byName);
    return `<li style="${subjectColorStyle({color})}"><span class="help-swatch" aria-hidden="true"></span><span class="help-colour-title">${esc(group.title)}</span></li>`;}).join('')}</ul>`;
}
export function coloursHelpHtml(){
  return `<section id="help-colours" class="help-section" aria-labelledby="help-colours-title"><h3 id="help-colours-title">Subject colours</h3>
<p>Each subject’s colour marks its thematic section in the subject schema, the outline in “subjects - reference.docx”. Subject view’s Thematic order lists the same sections, and each study guide uses the colour of its subject.</p>
<div id="help-colour-key" aria-live="polite"><p class="help-loading">Loading the colour key…</p></div></section>`;
}

// Fills the colour key from the active dataset's subjects index.
export async function fillColourKey(root=document){
  const holder=root.querySelector('#help-colour-key');if(!holder||holder.dataset.filled)return;holder.dataset.filled='1';
  try{
    const {loadCompressed}=await import('./data.mjs');
    const stats=await (await fetch(new URL('./stats.json',import.meta.url),{cache:'no-cache'})).json();
    const [index,order]=await Promise.all([loadCompressed(new URL(`${stats.dataset}subjects/index.json.gz`,new URL('./',import.meta.url))),fetch(new URL('./subject-order.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('Subject order unavailable');return r.json();})]);
    holder.innerHTML=colourKeyHtml(order.groups,index.subjects);
  }catch{delete holder.dataset.filled;holder.innerHTML='<p class="help-loading">The colour key is temporarily unavailable.</p>';}
}

export function helpTabsHtml(){
  return `<nav class="help-tabs" aria-label="Help sections">${helpSections.map(([id,label])=>`<a href="#help-${id}">${label}</a>`).join('')}</nav>`;
}
export function helpHtml(){return wordStudyHelpHtml()+tagsHelpHtml()+pronunciationHelpHtml()+coloursHelpHtml();}

function ensureStyles(){
  for(const name of ['word-study.css','help.css']){
    const href=new URL('./'+name,import.meta.url).href;
    if([...document.querySelectorAll('link[rel=stylesheet]')].some(link=>link.href===href))continue;
    const link=document.createElement('link');link.rel='stylesheet';link.href=href;
    const theme=document.querySelector('link[href$="theme.css"]');theme?theme.before(link):document.head.append(link);
  }
}
const sectionId=section=>{const name=String(section||'').replace(/^#?(help-)?/,'');return helpSections.some(([id])=>id===name)?'help-'+name:/^guide-/.test(name)?name:'help-word-study';};
function scrollTo(dialog,id){const target=dialog.querySelector('#'+CSS.escape(id));if(!target)return;target.scrollIntoView({block:'start'});for(const tab of dialog.querySelectorAll('.help-tabs a'))tab.toggleAttribute('aria-current',tab.getAttribute('href')==='#'+(target.closest('.help-section')?.id||id));}

// Opens the help dialog at a section ('word-study', 'tags', 'pronunciation',
// 'colours', or a pronunciation part such as 'guide-persian').
export function openHelp(section=''){
  ensureStyles();
  let dialog=document.getElementById('help-dialog');
  if(!dialog){
    dialog=document.createElement('dialog');dialog.id='help-dialog';dialog.className='dictionary-dialog help-dialog';dialog.setAttribute('aria-labelledby','help-dialog-title');
    dialog.innerHTML=`<div class="help-head"><h2 id="help-dialog-title">Help</h2><button type="button" class="secondary help-close" id="help-close">Close</button>${helpTabsHtml()}</div><div class="help-body" tabindex="-1">${helpHtml()}</div>`;
    document.body.append(dialog);
    dialog.addEventListener('click',event=>{
      if(event.target.id==='help-close'||event.target===dialog){dialog.close();return;}
      const link=event.target.closest('a[href^="#"]');if(link){event.preventDefault();dialog.helpTarget=link.getAttribute('href').slice(1);scrollTo(dialog,dialog.helpTarget);}
    });
    dialog.addEventListener('close',()=>{const back=dialog.returnFocus;dialog.returnFocus=null;if(back?.isConnected)back.focus();});
  }
  if(!dialog.open){dialog.returnFocus=document.activeElement;dialog.showModal();}
  const id=sectionId(section);scrollTo(dialog,id);dialog.helpTarget=id;
  // The colour key arrives later; keep the requested section in view.
  fillColourKey(dialog).then(()=>{if(dialog.open&&dialog.helpTarget===id)scrollTo(dialog,id);});
  (dialog.querySelector('.help-tabs a[aria-current]')||dialog.querySelector('#help-close')).focus({preventScroll:true});
  return dialog;
}

// The standalone page: all four sections, at the section the hash names.
export function renderHelpPage(holder){
  holder.innerHTML=helpTabsHtml()+helpHtml();
  fillColourKey(holder).then(()=>{if(location.hash)document.getElementById(location.hash.slice(1))?.scrollIntoView({block:'start'});});
}
