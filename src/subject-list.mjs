import {escapeHtml} from './text.mjs';

export function publicSelections(selections,sources){
  return [...selections].sort((a,b)=>Boolean(b.passage)-Boolean(a.passage)||(a.passage&&b.passage?compareSelections(a,b,sources):0));
}

// The imported original contains the citation that the matching excerpt omits.
// Keep it verbatim; tentative catalog candidates are never source references.
export function unlinkedPassage(selection){
  const excerpt=selection.excerpt||'',original=selection.original||excerpt;
  const reference=original.startsWith(excerpt)?original.slice(excerpt.length).trim():'';
  const text=reference?excerpt:original;
  const provenance=selection.provenance||{};
  let source=reference||((selection.suppliedIds||[]).join(', '));
  if(!source){
    const label=`Source collection · selection ${provenance.selectionParagraph||selection.id||'unidentified'}`;
    let href;try{const url=new URL(provenance.subjectUrl);if(['http:','https:'].includes(url.protocol))href=url.href;}catch{}
    source=href?`<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`:escapeHtml(label);
  }else source=escapeHtml(source);
  return `<p class="passage-meta">Source ID not linked</p><div class="passage-pair"><div class="passage-translation" aria-label="English excerpt"><p>${escapeHtml(text)}</p></div><div class="passage-original"><p dir="ltr" lang="en">Original text unavailable</p></div></div><p class="passage-reference" dir="ltr">${source}</p>`;
}

// Citation totals use the same source metadata as Catalog view.
export function compareSelections(a,b,sources){
  const sourceA=a.candidates[0]?.source||a.suppliedIds[0]||'~';
  const sourceB=b.candidates[0]?.source||b.suppliedIds[0]||'~';
  return (sources[sourceB]?.citationCount||0)-(sources[sourceA]?.citationCount||0)
    ||sourceA.localeCompare(sourceB)
    ||(a.candidates[0]?.ranges[0]?.paragraph||0)-(b.candidates[0]?.ranges[0]?.paragraph||0)
    ||a.id.localeCompare(b.id);
}
