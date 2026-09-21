import {escapeHtml} from './text.mjs';

export function publicSelections(selections,sources){
  return [...selections].sort((a,b)=>Boolean(b.passage)-Boolean(a.passage)||(a.passage&&b.passage?compareSelections(a,b,sources):0));
}

export function unlinkedPassage(selection){
  return `<p class="passage-meta">Source ID not linked</p><div class="passage-pair"><div class="passage-translation" aria-label="English excerpt"><p>${escapeHtml(selection.excerpt)}</p></div><div class="passage-original"><p dir="ltr" lang="en">Original text unavailable</p></div></div>`;
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
