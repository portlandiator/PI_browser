// The study-guide view of a guide read with quotations from beyond the Bahá’í
// writings: the readings its plan keeps, each followed by the outside quotations
// chosen for it (study-guide-outside.mjs, OUTSIDE.md). The site build writes it
// in place of the guide's usual study-guide view for every published plan; the
// workflow tool uses it for previews.
import {escapeHtml as esc} from '../src/text.mjs';
import {relations,sourceStatuses,rightsStatuses,lineBreak,quotationsIn,guideSections,planReadings,combinedSequence} from './study-guide-outside.mjs';

const pad=n=>String(n).padStart(2,'0');
const count=(n,one,many=one+'s')=>`${n} ${n===1?one:many}`;
// Every guide page announces its unlinked quotations with this line, above the first of them.
export const suppliedLabel='<p class="section-label">Further quotations · supplied wording and references</p>';

function quotationHtml(quotation){
  // Verse keeps its lines; a long line wraps with a hanging indent.
  return quotation.verse?`<p>${quotation.text.split(lineBreak).map(line=>`<span class="line">${esc(line)}</span>`).join('')}</p>`:`<p>${esc(quotation.text)}</p>`;
}

export function citation(quotation){
  // A named version (King James Version) stands as it is; a person is the translator.
  const translated=quotation.translator?`${/\b(Version|Edition|Bible)\b/.test(quotation.translator)?'':'translated by '}${[quotation.translator,quotation.translationYear].filter(Boolean).join(', ')}`:'';
  const description=[quotation.author,quotation.work,quotation.locator,quotation.year,translated].filter(Boolean).join(', ');
  const url=new URL(quotation.source.url);
  if(url.protocol!=='https:')throw Error('Unsafe link');
  return `<span class="passage-citation" dir="ltr" lang="en">(${esc(description)} -- <a href="${esc(url.href)}" rel="noopener">${esc(quotation.source.label)} ↗</a>)</span>`;
}

// Each reading's article as a built guide page holds it, by its position in the guide,
// without the source context that only the regular view shows.
export function guideArticles(html){
  const articles=new Map();
  for(const match of html.matchAll(/(?:<p class="section-label">[^<]*<\/p>)?<article class="quotation" id="reading-(\d+)">[\s\S]*?<\/article>/g))
    articles.set(Number(match[1]),match[0].replace(/<details class="context">[\s\S]*?<\/details>/g,''));
  return articles;
}

export const translationKey='Among the Bahá’í quotations, authorized translations are displayed in blue text while provisional translations, which may be AI-generated and lightly vetted, are in black and white. AI-generated translations may contain inaccuracies; the final authority is always the original text. Quotations from beyond the Bahá’í writings stand on a tinted ground, each with the readings it accompanies and the reason it is there.';

// guide: the built guide (slug, displayTitle, arc, order, compiled readings).
// articles: each reading's printed article by position (guideArticles, or the build's own).
// links: the subject's page and the guide's regular view, which keeps every quotation.
// exploration: the guide's Continue exploring section, as built.
// Returns the page's main content and what it shows, or null when none of the plan's
// readings is left in the guide.
export function outsideGuideBody({guide,articles,plan,library,subjectName,links,exploration=''}){
  const {readings,missing}=planReadings(plan,guide.compiled);
  if(!readings.length)return null;
  const sequence=combinedSequence(readings,plan,library),numberOf=new Map();
  sequence.forEach((item,i)=>{if(item.reading)numberOf.set(item.reading.key,i+1);});
  const placed=sequence.filter(item=>item.placement),quotations=quotationsIn(readings),total=quotationsIn(guide.compiled);
  // A named section is announced at the first of its readings that the plan keeps.
  const kept=new Set(readings),labelled=new Map();
  for(const [i,section] of (guideSections(guide)?.sections||[]).entries()){
    const first=section.readings.find(entry=>kept.has(entry));
    if(first)labelled.set(first.key,{name:section.name,number:i+1});
  }
  const firstSupplied=readings.find(entry=>!entry.source),body=[];
  for(const [i,item] of sequence.entries()){
    const n=i+1;
    if(item.reading){
      const label=labelled.get(item.reading.key),position=item.reading.position,article=articles.get(position);
      if(!article)throw Error(`${guide.slug}: reading ${position} has no article`);
      if(label)body.push(`<h3 class="section-label" id="section-${label.number}">${esc(label.name)}</h3>`);
      if(item.reading===firstSupplied)body.push(suppliedLabel);
      const numbered=article.replace(suppliedLabel,'').replace(`<article class="quotation" id="reading-${position}">`,`<article class="quotation" id="reading-${n}" data-kind="guide">`)
        .replace(/<span class="sequence" aria-label="Reading position \d+">\d+<\/span>/,`<span class="sequence" aria-label="Reading ${n}">${pad(n)}</span>`);
      if(!numbered.includes(`id="reading-${n}" data-kind="guide"`))throw Error(`${guide.slug}: reading ${position} is not the article expected`);
      body.push(numbered);
    }else{
      const {placement,quotation}=item;
      const partners=placement.responds.map(key=>`<a href="#reading-${numberOf.get(key)}">${pad(numberOf.get(key))}</a>`).join(', ');
      const asides=[`<p class="meta why">${esc(placement.why)}</p>`];
      if(quotation.caveat)asides.push(`<p class="meta">Note on the text: ${esc(quotation.caveat)}</p>`);
      if(quotation.rights.status!=='public-domain')asides.push(`<p class="meta">Rights: ${esc(rightsStatuses[quotation.rights.status])}. ${esc(quotation.rights.note)}</p>`);
      body.push(`<article class="quotation outside" id="reading-${n}" data-kind="outside" data-relation="${placement.relation}"><span class="sequence" aria-label="Reading ${n}">${pad(n)}</span><div class="quote-body"><p class="outside-label">Beyond the Bahá’í writings · ${esc(relations[placement.relation])} · with ${partners}</p><blockquote${quotation.verse?' class="verse"':''}>${quotationHtml(quotation)}</blockquote><div class="citation">${citation(quotation)}</div>${asides.join('')}</div></article>`);
    }
  }
  const related=name=>placed.filter(item=>item.placement.relation===name).length;
  const heading=`<h1>${esc(guide.displayTitle)}</h1><p class="guide-subtitle">${esc(subjectName)}</p><p class="meta compilation-count">${count(quotations,'quotation')} from the Bahá’í writings · ${placed.length} from beyond them${total>quotations?` · <a href="${esc(links.complete)}">All ${total} chosen quotations ↗</a>`:''} · <a href="${esc(links.subject)}">Current subject view ↗</a></p>`;
  const introduction=plan.introduction?`<p class="pdf-label">Editorial introduction (AI generated)</p><section class="introduction" aria-label="Editorial introduction"><p>${esc(plan.introduction)}</p></section>`:'';
  const questions=plan.questions?.length?`<section id="questions" class="questions"><p class="eyebrow">For thought and discussion</p><h2>Questions to carry forward</h2><ol>${plan.questions.map(q=>`<li>${esc(q)}</li>`).join('')}</ol></section>`:'';
  const controls=`<div class="reading-heading"><h2>Selected passages</h2></div><p class="translation-key">${esc(translationKey)}</p><div class="view-controls"><button class="action" id="print-compilation" disabled>Print / Save as PDF</button><a href="${esc(links.subject)}">Back to subject</a>${questions?'<a href="#questions">Questions for reflection ↓</a>':''}<span id="print-status" class="meta" role="status">Preparing fonts…</span></div>`;
  const chip=(show,label,pressed=false)=>`<button type="button" class="chip" data-show="${show}" aria-pressed="${pressed}">${label}</button>`;
  const filter=`<div class="reading-filter" role="group" aria-label="Which readings to show">${chip('all',`All ${sequence.length}`,true)}${chip('guide',`Bahá’í writings · ${readings.length}`)}${chip('outside',`Beyond them · ${placed.length}`)}${chip('adjacent',`Alongside · ${related('adjacent')}`)}${chip('counter',`Contrast and complement · ${related('contrast')+related('complement')}`)}</div>`;
  const rows=sequence.map((item,i)=>item.placement&&`<tr><td><a href="#reading-${i+1}">${pad(i+1)}</a></td><td>${esc([item.quotation.author,item.quotation.work,item.quotation.locator].filter(Boolean).join(', '))}</td><td>${esc(item.quotation.year)}</td><td>${esc(item.quotation.tradition)}</td><td>${esc(relations[item.placement.relation])}</td><td>${item.placement.responds.map(key=>pad(numberOf.get(key))).join(', ')}</td><td>${esc(sourceStatuses[item.quotation.source.status])}, ${esc(item.quotation.source.checked)}</td></tr>`).filter(Boolean).join('');
  const sources=`<section class="external-sources"><h2>Behind the external sources</h2><details><summary>Every outside quotation, with its source</summary><div class="wide"><table class="ledger"><thead><tr><th>No.</th><th>Source</th><th>Date</th><th>Tradition</th><th>Relation</th><th>With</th><th>Checked</th></tr></thead><tbody>${rows}</tbody></table></div></details></section>`;
  // The filter stays in view only while the readings are.
  return {html:`${heading}${introduction}${controls}<div id="readings">${filter}${body.join('')}</div>${exploration}${questions}${sources}`,
    readings:readings.length,quotations,outside:placed.length,sequence:sequence.length,first:readings[0].position,missing,unplaced:plan.outside.length-placed.length};
}
