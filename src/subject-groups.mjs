import {escapeHtml as esc} from './text.mjs';
import {passageCitation} from './passage-citation.mjs';
import {publicSelections,unlinkedPassage} from './subject-list.mjs';

export function groupSelections(selections,sources){
  const groups=[],bySource=new Map();
  for(const selection of publicSelections(selections,sources)){
    const source=selection.passage?selection.candidates[0]?.source:null;
    let group=source?bySource.get(source):null;
    if(!group){group={id:selection.id,source,selections:[]};groups.push(group);if(source)bySource.set(source,group);}
    group.selections.push(selection);
  }
  return groups;
}

export function groupedParagraphs(group){
  const paragraphs=new Map();
  for(const s of group.selections)for(const range of s.candidates[0].ranges){
    if(!paragraphs.has(range.paragraph))paragraphs.set(range.paragraph,[]);
    paragraphs.get(range.paragraph).push(range);
  }
  return [...paragraphs].sort((a,b)=>a[0]-b[0]).map(([number,ranges])=>{
    const merged=[];
    for(const range of ranges.sort((a,b)=>a.start-b.start)){
      if(merged.length&&range.start<=merged.at(-1).end)merged.at(-1).end=Math.max(merged.at(-1).end,range.end);
      else merged.push({start:range.start,end:range.end});
    }
    return {number,ranges:merged};
  });
}

function highlight(text,ranges){
  let html='',end=0;
  for(const range of ranges){html+=esc(text.slice(end,range.start))+`<mark>${esc(text.slice(range.start,range.end))}</mark>`;end=range.end;}
  return html+esc(text.slice(end));
}

export function renderSourceGroup(group,record,subject){
  const anchors=group.selections.slice(1).map(s=>`<span id="selection-${esc(s.id)}"></span>`).join('');
  if(!record)return `<article class="subject-passage" id="selection-${esc(group.id)}">${unlinkedPassage(group.selections[0])}</article>`;
  const paragraphs=groupedParagraphs(group),first=group.selections[0];
  const reference=passageCitation(record,`./?id=${encodeURIComponent(record.id)}&passage=${encodeURIComponent(first.passage)}&subject=${encodeURIComponent(subject)}#p-en-${paragraphs[0].number}`);
  return `<article class="subject-passage" id="selection-${esc(group.id)}">${anchors}${paragraphs.map(({number,ranges},i)=>{
    const citation=i===paragraphs.length-1?' '+reference:'';
    const separator=i&&number>paragraphs[i-1].number+1?'<span class="passage-gap" aria-label="Passages omitted">…</span> ':'';
    const original=record.original.paragraphs[number-1]?.plain;
    return `<div class="passage-pair"><div class="passage-translation" aria-label="English paragraph ${number}"><p>${separator}${highlight((record.en.paragraphs[number-1]?.plain||'').trimEnd(),ranges)}${citation}</p></div><div class="passage-original" aria-label="Original paragraph ${number}"><p dir="${original?'rtl':'ltr'}">${original?separator+esc(original.trimEnd()):'Original text unavailable'}${citation}</p></div></div>`;
  }).join('')}</article>`;
}
