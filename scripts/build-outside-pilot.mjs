// Pilot page: a study guide cut to a limit of quotations and read together with an
// equal number of quotations from beyond the Bahá’í writings (study-guides/outside/).
// Run after a build; nothing in dist/ is changed and the site does not publish the page.
//   node scripts/build-outside-pilot.mjs [slug ...] [--out folder] [--base site-address] [--fragment]
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {brotliDecompressSync} from 'node:zlib';
import {escapeHtml as esc} from '../src/text.mjs';
import {decodeGuideArchive} from './study-guide-archive.mjs';
import {githubTarget} from './github-target.mjs';
import {relations,kinds,rightsStatuses,sourceStatuses,lineBreak,cutGuide,guideSections,authorizedRank,proportionalReadings,validateOutsideLibrary,validateOutsidePlan,combinedSequence,readOutside,words} from './study-guide-outside.mjs';

const pad=n=>String(n).padStart(2,'0');
const plural=(n,one,many=one+'s')=>`${n} ${n===1?one:many}`;
const inWords=n=>['no','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'][n]??String(n);
const count=(items,key)=>{const result=new Map();for(const item of items){const k=key(item);result.set(k,(result.get(k)||0)+1);}return result;};
const quotationsIn=entries=>entries.reduce((n,entry)=>n+entry.selectionIds.length,0);
const eras=[[-Infinity,'Before the common era'],[1,'1 – 1499'],[1500,'1500 – 1799'],[1800,'1800 – 1899'],[1900,'1900 – 1999'],[2000,'2000 onward']];
export const eraOf=year=>eras.findLast(([from])=>year>=from)[1];

// The published guide page already holds each reading as built; take those articles as they are.
export function guideArticles(html){
  const articles=new Map();
  for(const match of html.matchAll(/<article class="quotation" id="reading-(\d+)">[\s\S]*?<\/article>/g))articles.set(Number(match[1]),match[0]);
  return articles;
}

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

// guide: the compiled guide (order, arc, compiled entries); pageHtml: its published study-guide page.
// collectionGuides: every published guide as compiled, for the collection-wide figures.
export function renderOutsidePilot({guide,pageHtml,plan,library,base,collection,collectionGuides=[]}){
  validateOutsideLibrary(library);
  const {readings,quotations}=cutGuide(guide,plan);
  validateOutsidePlan(plan,library,readings);
  if(plan.quotations!==quotations)throw Error(`${plan.slug}: written for ${plan.quotations} of the guide's quotations, but the cut now keeps ${quotations}`);
  const articles=guideArticles(pageHtml);
  if(articles.size!==guide.compiled.length)throw Error(`The published page of ${guide.slug} does not match its compiled readings; rebuild the guides`);
  const sequence=combinedSequence(readings,plan,library);
  const numberOf=new Map();
  sequence.forEach((item,i)=>{if(item.reading)numberOf.set(item.reading.key,i+1);});
  // A named section is announced at the first of its readings that the cut keeps.
  const kept=new Set(readings),divided=guideSections(guide),sections=divided?.sections||[],beyond=divided?.beyond||[];
  const labelled=new Map(),sectionOf=new Map();
  for(const [i,section] of sections.entries()){
    for(const entry of section.readings)sectionOf.set(entry.key,i);
    const first=section.readings.find(entry=>kept.has(entry));
    if(first)labelled.set(first.key,{name:section.name,number:i+1});
  }
  const sectionsKept=labelled.size,inCut=entries=>entries.filter(entry=>kept.has(entry)),whollyAuthorized=entries=>entries.filter(entry=>authorizedRank(entry)===0);
  const sectionRow=(name,entries,outside)=>`<tr><th scope="row">${esc(name)}</th><td>${inCut(entries).length} of ${entries.length}</td><td>${quotationsIn(inCut(entries))} of ${quotationsIn(entries)}</td><td>${quotationsIn(whollyAuthorized(inCut(entries)))}</td><td>${outside}</td></tr>`;
  const sectionRows=sections.map((section,i)=>sectionRow(section.name,section.readings,plan.outside.filter(placement=>sectionOf.get(placement.after)===i).length)).join('')
    +(beyond.length?sectionRow('After the named sections',beyond,plan.outside.filter(placement=>!sectionOf.has(placement.after)).length):'');
  const guideLink=`${base}study-guides/${guide.slug}-pdf.html`;
  const body=[];
  for(const [i,item] of sequence.entries()){
    const n=i+1;
    if(item.reading){
      const label=labelled.get(item.reading.key);
      if(label)body.push(`<h3 class="section-label" id="section-${label.number}">${esc(label.name)}</h3>`);
      const article=articles.get(item.reading.position);
      if(!article)throw Error(`Reading ${item.reading.position} is missing from the published page`);
      body.push(article.replace(`id="reading-${item.reading.position}"`,`id="reading-${n}" data-kind="guide"`)
        .replace(/<span class="sequence" aria-label="Reading position \d+">\d+<\/span>/,`<span class="sequence" aria-label="Reading ${n}">${pad(n)}</span>`)
        .replaceAll('href="../',`href="${esc(base)}`)
        .replace(/<\/div><\/article>$/,`<p class="meta in-guide"><a href="${esc(guideLink)}#reading-${item.reading.position}">Reading ${item.reading.position} of ${guide.compiled.length} in the published guide ↗</a></p></div></article>`));
    }else{
      const {placement,quotation}=item;
      const partners=placement.responds.map(key=>`<a href="#reading-${numberOf.get(key)}">${pad(numberOf.get(key))}</a>`).join(', ');
      const asides=[`<p class="meta why">${esc(placement.why)}</p>`];
      if(quotation.caveat)asides.push(`<p class="meta">Note on the text: ${esc(quotation.caveat)}</p>`);
      if(quotation.rights.status!=='public-domain')asides.push(`<p class="meta">Rights: ${esc(rightsStatuses[quotation.rights.status])}. ${esc(quotation.rights.note)}</p>`);
      body.push(`<article class="quotation outside" id="reading-${n}" data-kind="outside" data-relation="${placement.relation}"><span class="sequence" aria-label="Reading ${n}">${pad(n)}</span><div class="quote-body"><p class="outside-label">Beyond the Bahá’í writings · ${esc(relations[placement.relation])} · with ${partners}</p><blockquote${quotation.verse?' class="verse"':''}>${quotationHtml(quotation)}</blockquote><div class="citation">${citation(quotation)}</div>${asides.join('')}</div></article>`);
    }
  }
  const placed=plan.outside.map(placement=>({placement,quotation:library.quotations[placement.id]}));
  const table=(title,counts,order)=>`<table><caption>${esc(title)}</caption><tbody>${(order||[...counts.keys()]).filter(k=>counts.has(k)).map(k=>`<tr><th scope="row">${esc(k)}</th><td>${counts.get(k)}</td></tr>`).join('')}</tbody></table>`;
  const byKind=count(placed,p=>kinds[p.quotation.kind]),byEra=count(placed,p=>eraOf(p.quotation.sortYear)),byRelation=count(placed,p=>relations[p.placement.relation]);
  const byRights=count(placed,p=>rightsStatuses[p.quotation.rights.status]),bySource=count(placed,p=>sourceStatuses[p.quotation.source.status]),byTradition=count(placed,p=>p.quotation.tradition);
  const traditions=[...byTradition].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([k])=>k);
  const authorizedIn=entries=>entries.reduce((n,entry)=>n+entry.paragraphs.filter(p=>p.authorized).length,0);
  const authorized=authorizedIn(readings),authorizedAll=authorizedIn(guide.compiled),provisional=readings.reduce((n,entry)=>n+entry.paragraphs.length,0)-authorized;
  const number=n=>n.toLocaleString('en-GB');
  const total=quotationsIn(guide.compiled),proportional=plan.rule==='proportional';
  // What the same limit, and the same rule, would mean for every published guide.
  const sizes=collectionGuides.map(other=>quotationsIn(other.compiled)),capped=sizes.reduce((n,size)=>n+Math.min(plan.limit,size),0);
  const long=collectionGuides.filter((other,i)=>sizes[i]>plan.limit),dividedLong=proportional?long.filter(other=>guideSections(other)):[];
  const cuts=proportional?dividedLong.map(other=>proportionalReadings(other,plan.limit)):[];
  const cutQuotations=cuts.reduce((n,cut)=>n+cut.quotations,0),cutAuthorized=cuts.reduce((n,cut)=>n+quotationsIn(whollyAuthorized(cut.readings)),0),cutWholly=cuts.filter(cut=>cut.readings.every(entry=>authorizedRank(entry)===0)).length;
  const across=!collectionGuides.length?'':`<p>Across all ${collectionGuides.length} study guides a limit of ${plan.limit} would keep at most ${number(capped)} of ${number(sizes.reduce((n,size)=>n+size,0))} quotations, shortening ${plural(long.length,'guide')}, and would call for as many again from outside: ${number(capped)} quotations to find, check and place.${proportional?` Named sections like this guide’s are found in only ${dividedLong.length} of those ${long.length}; the rest give each reading a note of its own or name no parts, and would need their sections marked before this rule could be applied. In the ${dividedLong.length} the rule would keep ${number(cutQuotations)} quotations, ${number(cutAuthorized)} of them in readings wholly in authorized translation, and in ${cutWholly} of the ${dividedLong.length} every section’s share can be filled from authorized translations alone.`:''}</p>`;
  const figures=`<div class="figures">${table('How they stand to the readings',byRelation,Object.values(relations))}${table('Kind of text',byKind,Object.values(kinds))}${table('When written',byEra,eras.map(e=>e[1]))}${table('Tradition or setting',byTradition,traditions)}${table('Checked against',bySource,Object.values(sourceStatuses))}${table('Rights',byRights,Object.values(rightsStatuses))}</div>`;
  const rows=sequence.map((item,i)=>item.placement&&`<tr><td><a href="#reading-${i+1}">${pad(i+1)}</a></td><td>${esc([item.quotation.author,item.quotation.work,item.quotation.locator].filter(Boolean).join(', '))}</td><td>${esc(item.quotation.year)}</td><td>${esc(item.quotation.tradition)}</td><td>${esc(relations[item.placement.relation])}</td><td>${item.placement.responds.map(key=>pad(numberOf.get(key))).join(', ')}</td><td>${words(item.quotation.text)}</td><td>${esc(rightsStatuses[item.quotation.rights.status])}</td><td>${esc(sourceStatuses[item.quotation.source.status])}, ${esc(item.quotation.source.checked)}</td></tr>`).filter(Boolean).join('');
  const dropped=guide.compiled.length-readings.length;
  const leftOut=(plan.leftOut||[]).map(item=>`<li><strong>${esc(item.saying)}</strong> <span class="meta">${esc(item.attributed)}</span><p>${esc(item.reason)}</p></li>`).join('');
  const findings=(plan.findings||[]).map(item=>`<li><strong>${esc(item.title)}</strong> ${esc(item.text)}</li>`).join('');
  const subjectLink=`${base}subjects.html?subject=${encodeURIComponent(guide.id)}`;
  // How the guide was cut, said once near the top and once in full below.
  const authorizedNote=provisional?`${number(quotationsIn(whollyAuthorized(readings)))} of the ${quotations} are in readings wholly in authorized translation.`:`Every one of the ${quotations} is an authorized translation.`;
  const cutSummary=proportional
    ?`Here it is cut to ${quotations} (${plural(readings.length,'reading')}), drawn from all ${inWords(sections.length)} of its sections in proportion to their length; within a section, readings wholly in authorized translation were taken first. ${authorizedNote}`
    :`Here it is cut to its first ${quotations} (${plural(readings.length,'reading')}${sections.length?`; ${sectionsKept} of its ${sections.length} sections`:''}).`;
  const one=beyond.length===1,beyondNote=beyond.length?` A further ${plural(beyond.length,'reading')} (${plural(quotationsIn(beyond),'quotation')}) ${one?'stands':'stand'} after the last named section, outside any of them, and ${proportional?(one?'is':'are')+' not drawn on':(one?'lies':'lie')+' beyond the cut'}.`:'';
  const cutDetail=proportional
    ?`The cut keeps ${readings.length} of the guide’s ${plural(guide.compiled.length,'reading')} and ${quotations} of its ${total} quotations. Each section’s share is reckoned from its number of quotations: ${sections.map(section=>`${esc(section.name)}, ${quotationsIn(inCut(section.readings))} of ${quotationsIn(section.readings)}`).join('; ')}. Within a section the readings wholly in authorized translation come first, then those partly so, then the rest, each group in reading order, and a reading is taken when its quotations still fit the section’s share.${beyondNote} ${authorized} of the guide’s ${authorizedAll} paragraphs in authorized translation are kept, and ${provisional?`${plural(provisional,'paragraph')} of the cut ${provisional===1?'is a provisional translation':'are provisional translations'}`:'the cut holds no provisional translation'}.`
    :`The first-${plan.limit} rule keeps readings 1 to ${readings.length} of ${guide.compiled.length} and drops ${plural(dropped,'reading')} (${total-quotations} quotations). ${authorized} of the guide’s ${authorizedAll} paragraphs in authorized translation are kept.${sections.length?` The sections that fall away entirely are: ${esc(sections.filter(section=>!inCut(section.readings).length).map(section=>section.name).join('; ')||'none')}.`:''}${beyondNote}`;
  const main=`<p class="eyebrow">Study-guide pilot · not published on the site</p><h1>${esc(guide.displayTitle)}</h1><p class="guide-subtitle">${esc(guide.sourceName)}</p><p class="meta compilation-count">${quotations} quotations from the Bahá’í writings · ${plan.outside.length} from beyond them · ${plural(sequence.length,'reading')} · <a href="${esc(guideLink)}">Published guide ↗</a> · <a href="${esc(subjectLink)}">Subject view ↗</a></p>
<section class="about" aria-labelledby="about-heading"><h2 id="about-heading">About this pilot</h2><p>The published guide holds ${total} quotations in ${plural(guide.compiled.length,'reading')}. ${cutSummary} Each is read with voices from other scriptures, philosophy, literature and public life. Every outside quotation was chosen against particular readings, named beside it, for one of three reasons: it is widely known, it says something close to the reading, or it stands in contrast or as a complement to it. Its wording was copied from the linked page and checked against it by program.</p>${across}${findings?`<h3>What the pilot shows</h3><ul class="findings">${findings}</ul>`:''}<details><summary>The ${plan.outside.length} outside quotations in figures</summary>${sectionRows?`<div class="wide"><table class="sections"><caption>By section of the guide</caption><thead><tr><th>Section</th><th>Readings kept</th><th>Bahá’í quotations kept</th><th>Of them authorized</th><th>Outside quotations</th></tr></thead><tbody>${sectionRows}</tbody></table></div>`:''}${figures}</details></section>
<p class="pdf-label">Editorial introduction (AI generated, for the pilot)</p><section class="introduction" aria-label="Editorial introduction"><p>${esc(plan.introduction)}</p></section>
<div class="reading-heading"><h2>Selected passages</h2></div><p class="translation-key">Among the Bahá’í quotations, authorized translations are displayed in blue text while provisional translations, which may be AI-generated and lightly vetted, are in black and white. Quotations from beyond the Bahá’í writings stand on a tinted ground, each with the readings it accompanies and the reason it is there.</p>
<div class="view-controls" role="group" aria-label="Which readings to show"><button type="button" class="chip" data-show="all" aria-pressed="true">All ${sequence.length}</button><button type="button" class="chip" data-show="guide" aria-pressed="false">Bahá’í writings · ${readings.length}</button><button type="button" class="chip" data-show="outside" aria-pressed="false">Beyond them · ${plan.outside.length}</button><button type="button" class="chip" data-show="adjacent" aria-pressed="false">Alongside · ${byRelation.get(relations.adjacent)||0}</button><button type="button" class="chip" data-show="counter" aria-pressed="false">Contrast and complement · ${(byRelation.get(relations.contrast)||0)+(byRelation.get(relations.complement)||0)}</button><a href="#questions">Questions ↓</a></div>
<div id="readings">${body.join('')}</div>
<section id="questions" class="questions"><p class="eyebrow">For thought and discussion</p><h2>Questions to carry forward</h2><ol>${plan.questions.map(q=>`<li>${esc(q)}</li>`).join('')}</ol></section>
<section class="appendix"><h2>Behind the pilot</h2><details><summary>Every outside quotation, with its source and rights</summary><div class="wide"><table class="ledger"><thead><tr><th>No.</th><th>Source</th><th>Date</th><th>Tradition</th><th>Relation</th><th>With</th><th>Words</th><th>Rights</th><th>Checked</th></tr></thead><tbody>${rows}</tbody></table></div></details>${leftOut?`<details><summary>Well-known sayings left out, and why</summary><ul class="left-out">${leftOut}</ul></details>`:''}<details><summary>What was cut from the published guide</summary><p>${cutDetail}</p></details><p class="meta">Built from ${esc(collection)} and study-guides/outside/${esc(plan.slug)}.json.</p></section>`;
  return {title:plan.title||`${guide.displayTitle} pilot`,main,counts:{readings:readings.length,quotations,outside:plan.outside.length,sequence:sequence.length}};
}

// The site's own palette and reading face (scripts/compilation-pilot.css, src/theme.css).
// Layout: one reading column; each reading is a numbered row, outside quotations on a tinted ground.
export const style=`:root{--paper:#f7f6f0;--sheet:#fffefa;--ink:#203a32;--muted:#627069;--rule:#dddfd4;--accent:#8b6c36;--link-hover:#725522;--quote:#202020;--authorized:#163f80;--band:#eef0e4;--control-rule:#bcc8b7;--selection:#e7ede4;--reading:'EB Garamond',Georgia,'Times New Roman',serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--paper:#151d19;--sheet:#1d2922;--ink:#e4e9dd;--muted:#acb9ae;--rule:#3d4b40;--accent:#d7b77c;--link-hover:#d7b77c;--quote:#e4e9dd;--authorized:#9ec5ff;--band:#232f27;--control-rule:#637460;--selection:#303f34;color-scheme:dark}}
:root[data-theme="dark"]{--paper:#151d19;--sheet:#1d2922;--ink:#e4e9dd;--muted:#acb9ae;--rule:#3d4b40;--accent:#d7b77c;--link-hover:#d7b77c;--quote:#e4e9dd;--authorized:#9ec5ff;--band:#232f27;--control-rule:#637460;--selection:#303f34;color-scheme:dark}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--paper);color:var(--ink);font:1.25rem/1.65 var(--reading);padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:10;background:var(--paper)}
main{max-width:46rem;margin:0 auto;padding-block:2.5rem 4rem}
a{color:inherit;text-decoration-thickness:1px;text-underline-offset:4px}a:hover{color:var(--link-hover)}
a:focus-visible,summary:focus-visible,button:focus-visible{outline:3px solid var(--accent);outline-offset:4px;border-radius:2px}
h1{font-weight:500;font-size:clamp(2.1rem,6vw,3.2rem);line-height:1.13;letter-spacing:-.02em;margin:.6rem 0 .9rem;text-wrap:balance}
h2{font-size:1.75rem;line-height:1.25;font-weight:500;margin:.8rem 0 1rem;text-wrap:balance}
h3{font-size:1.2rem;font-weight:500;margin:1.4rem 0 .6rem}
p{margin:0 0 1.1rem}
.eyebrow,.section-label,.outside-label{color:var(--accent);font-size:.82rem;letter-spacing:.09em;text-transform:uppercase}
.section-label{margin:3rem 0 0;padding-top:1rem;border-top:2px solid var(--ink);font-weight:600}
.meta,.pdf-label,.translation-key{font-size:.95rem;line-height:1.5;color:var(--muted)}
.guide-subtitle{font-size:1.35rem;line-height:1.4;color:var(--muted);margin:-.3rem 0 .8rem}
.about{border-block:1px solid var(--rule);padding:1rem 0 .4rem;margin:1.6rem 0 2rem;font-size:1.08rem;line-height:1.55}.about h2{font-size:1.3rem;margin-top:0}
.findings{padding-left:1.2rem;margin:0 0 1.1rem}.findings li{margin-bottom:.7rem}
.introduction{font-size:1.3rem;line-height:1.6;margin:0 0 1.6rem}
summary{cursor:pointer;min-height:44px;display:list-item;align-content:center;font-size:1.05rem}
.reading-heading{margin-top:2.6rem}
.view-controls{display:flex;align-items:center;flex-wrap:wrap;gap:.5rem .6rem;margin:.6rem 0 1.2rem;font-size:1rem;position:sticky;top:env(safe-area-inset-top,0px);background:var(--paper);padding:.5rem 0;z-index:2;border-bottom:1px solid var(--rule)}
.chip{font:inherit;font-size:.95rem;min-height:44px;padding:.3rem .85rem;border:1px solid var(--control-rule);border-radius:3px;background:none;color:var(--ink);cursor:pointer}
.chip:hover{background:var(--selection)}.chip[aria-pressed="true"]{background:var(--ink);border-color:var(--ink);color:var(--paper)}
.quotation{display:grid;grid-template-columns:2.4rem minmax(0,1fr);gap:1rem;border-bottom:1px solid var(--rule);padding:1.7rem 0;scroll-margin-top:7.5rem}
.quotation.outside{background:var(--band);margin-inline:-.9rem;padding-inline:.9rem}
.sequence{color:var(--accent);font-size:1.05rem;padding-top:.3rem;font-variant-numeric:tabular-nums}
.quote-body{min-width:0}
blockquote{margin:0;font-size:1.32rem;line-height:1.5;color:var(--quote)}blockquote p{margin:0 0 .8rem}blockquote p.authorized{color:var(--authorized)}
blockquote.verse .line{display:block;padding-left:1.4rem;text-indent:-1.4rem}
.outside-label{margin:0 0 .5rem}.outside-label a{text-decoration:none;border-bottom:1px solid currentColor}
.citation{font-size:.98rem;line-height:1.45;color:var(--muted);margin:.2rem 0 .5rem;overflow-wrap:anywhere}
.why{color:var(--ink);font-size:1rem;margin:.5rem 0 .35rem}.outside .meta{margin-bottom:.35rem}
.in-guide{font-size:.85rem;margin:.35rem 0 0}.in-guide a{text-decoration:none;border-bottom:1px solid var(--rule)}
.questions{margin-top:3rem;padding-top:1.4rem;border-top:2px solid var(--ink)}.questions ol{padding-left:1.4rem}.questions li{font-size:1.25rem;line-height:1.5;margin:1rem 0}
.appendix{margin-top:3rem;border-top:1px solid var(--rule);padding-top:1rem;font-size:1.05rem}
.figures{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:1.2rem 2rem;align-items:start;margin:.8rem 0 1.2rem}
table{border-collapse:collapse;width:100%;font-size:.98rem;line-height:1.35}caption{text-align:left;color:var(--accent);font-size:.8rem;letter-spacing:.09em;text-transform:uppercase;padding-bottom:.3rem}
th,td{text-align:left;font-weight:400;padding:.3rem .5rem .3rem 0;border-top:1px solid var(--rule);vertical-align:top}.figures td{text-align:right;font-variant-numeric:tabular-nums;width:3rem}.sections{margin:.8rem 0 1.4rem;min-width:38rem}.sections thead th{color:var(--muted);font-size:.85rem;border-top:0}.sections td{font-variant-numeric:tabular-nums}
.wide{overflow-x:auto}.ledger{min-width:56rem}.ledger thead th{color:var(--muted);font-size:.85rem;border-top:0}.ledger td:first-child,.ledger td:nth-child(7){font-variant-numeric:tabular-nums}
.left-out{padding-left:1.2rem}.left-out li{margin-bottom:.9rem}.left-out p{margin:.2rem 0 0}
@media (max-width:700px){.view-controls{position:static}.quotation{scroll-margin-top:1rem}}
@media (max-width:650px){body{font-size:1.15rem}.quotation{grid-template-columns:1.9rem minmax(0,1fr);gap:.6rem}blockquote{font-size:1.2rem}.quotation.outside{margin-inline:-.5rem;padding-inline:.5rem}}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
@media print{body{background:#fff}.view-controls,.about details,.appendix{display:none}.quotation{break-inside:avoid;padding:.8rem 0}}`;

// Show all readings, one kind, or one relation; the choice is kept only while the page is open.
export const script=`(()=>{const chips=[...document.querySelectorAll('.chip')],rows=[...document.querySelectorAll('#readings .quotation')],labels=[...document.querySelectorAll('#readings .section-label')];
const shown={all:()=>true,guide:r=>r.dataset.kind==='guide',outside:r=>r.dataset.kind==='outside',adjacent:r=>r.dataset.relation==='adjacent',counter:r=>r.dataset.relation==='contrast'||r.dataset.relation==='complement'};
for(const chip of chips)chip.addEventListener('click',()=>{for(const other of chips)other.setAttribute('aria-pressed',String(other===chip));for(const row of rows)row.hidden=!shown[chip.dataset.show](row);for(const label of labels)label.hidden=false;});})();`;

const fonts='https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400..800;1,400..800&display=swap';
// A complete page for reading from a folder, or the same page without its outer tags for a host that supplies them.
export function pilotDocument({title,main},fragment=false){
  const head=`<title>${esc(title)}</title><meta name="claude:viewport-fit-sides" content="cover"><link rel="stylesheet" href="${fonts}"><style>${style}</style>`;
  const page=`<main id="main">${main}</main><script>${script}</script>`;
  return fragment?head+page:`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${head}</head><body>${page}</body></html>`;
}

export async function buildOutsidePilot(root,slug,{out=path.join(root,'reports','outside-pilot'),base,fragment=false}={}){
  const dist=path.join(root,'dist'),{dataset}=JSON.parse(await fs.readFile(path.join(dist,'stats.json'),'utf8'));
  const archive=decodeGuideArchive(JSON.parse(brotliDecompressSync(await fs.readFile(path.join(dist,'study-guides','compiled.archive.json.br')))));
  const {library,plan}=await readOutside(root,slug);
  const guide=archive.subjects.find(subject=>subject.slug===slug);
  if(!guide||guide.id!==plan.subject)throw Error(`No built study guide matches the plan ${slug}`);
  const pageHtml=await fs.readFile(path.join(dist,'study-guides',slug+'-pdf.html'),'utf8');
  const rendered=renderOutsidePilot({guide,pageHtml,plan,library,base,collection:dataset,collectionGuides:archive.subjects});
  await fs.mkdir(out,{recursive:true});
  const file=path.join(out,slug+(fragment?'.fragment':'')+'.html');
  await fs.writeFile(file,pilotDocument(rendered,fragment));
  return {file,...rendered.counts};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2),options={},slugs=[];
  while(args.length){
    const arg=args.shift();
    if(arg==='--out')options.out=path.resolve(args.shift());
    else if(arg==='--base')options.base=args.shift();
    else if(arg==='--fragment')options.fragment=true;
    else slugs.push(arg);
  }
  options.base??=(await githubTarget(root)).site;
  if(!slugs.length)slugs.push(...(await fs.readdir(path.join(root,'study-guides','outside'))).filter(name=>name.endsWith('.json')&&name!=='quotations.json').map(name=>name.slice(0,-5)).sort());
  for(const slug of slugs)console.log(await buildOutsidePilot(root,slug,options));
}
