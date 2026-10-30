import {escapeHtml} from './text.mjs';
import {matchingPassages,passageExcerpts} from './search-passages.mjs';
import {readingSlots} from './paragraph-alignment.mjs';
import {mayPublishOriginal} from './original-publication.mjs';
import {searchHighlightHtml} from './search-highlights.mjs';

export const resultMode=(value,fallback='parallel')=>['parallel','en','original'].includes(value)?value:fallback;

export function resultMetadataHtml(row){
  return `<span>${escapeHtml(row.date||'Date not recorded')}</span>${row.volume?`<span>Vol. ${escapeHtml(row.volume)}</span>`:''}`;
}

export function groupedResultPassages(source,query,languages=['en','original']){
  const record=mayPublishOriginal(source.metadata)?source:{...source,original:{paragraphs:[],notes:[]}};
  const slots={en:readingSlots(record.en),original:readingSlots(record.original)};
  const paired=slots.en.length>0&&slots.en.length===slots.original.length;
  const available={en:slots.en.length>0,original:slots.original.length>0};
  const pairs=new Map(),independent={en:[],original:[]};
  const cell=(language,index,kind,matched=false)=>{
    const part=record[language][kind][index];
    return {language,index,kind,matched,texts:matched?passageExcerpts(part.plain,query):[part.plain]};
  };
  for(const match of matchingPassages(record,query,languages)){
    const {language,index,kind}=match;
    if(paired&&kind==='paragraphs'){
      const position=slots[language].indexOf(index);
      if(!pairs.has(position)){
        const pair={};
        for(const lang of ['en','original']){
          const other=slots[lang][position];
          if(other!==null)pair[lang]=cell(lang,other,kind);
        }
        pairs.set(position,pair);
      }
      pairs.get(position)[language]=cell(language,index,kind,true);
    }else independent[language].push(cell(language,index,kind,true));
  }
  const unequal=available.en&&available.original&&!paired;
  if(unequal&&Object.values(independent).some(cells=>cells.some(part=>part.kind==='paragraphs'))){
    // With no positional pairing, keep the other version available as its own
    // complete flow. Never imply that its rows correspond to the matching side.
    for(const language of ['en','original'])if(!independent[language].some(part=>part.kind==='paragraphs')){
      independent[language].unshift(...record[language].paragraphs.map((_,index)=>cell(language,index,'paragraphs')));
    }
  }
  return {pairs:[...pairs].sort(([a],[b])=>a-b).map(([,pair])=>pair),independent,available,
    notice:unequal?'Paragraph counts differ. These columns follow independent source order and are not aligned. A version without matching paragraphs is shown in full.':''};
}

function cellHtml(cell,query){
  const {language,kind,index,texts,matched}=cell;
  // All context windows for one paragraph stay together under one label.
  const html=texts.map((part,i)=>i?part.replace(/^…\s*/,''):part).map((part,i)=>i<texts.length-1?part.replace(/\s*…$/,''):part).map(part=>matched?searchHighlightHtml(part,query):escapeHtml(part)).join(' … ');
  return `<div class="result-passage" data-passage="${language}-${kind}-${index+1}"><span class="passage-label" dir="ltr">${language==='en'?'English':'Original'} · ${kind==='notes'?'Footnote':'Paragraph'} ${index+1}</span><p class="passage-text" dir="${language==='en'?'ltr':'rtl'}">${html}</p></div>`;
}
const separated=(cells,query)=>cells.map(cell=>cellHtml(cell,query)).join('<div class="excerpt-separator" aria-hidden="true">…</div>');

// Each independent language flow advances in bounded batches. Footnotes are
// never paired by number; only source-layout paragraph slots may form pairs.
export function resultPassagePage(model,query,mode='parallel',limit=8){
  mode=resultMode(mode);
  const languages=mode==='parallel'?['en','original']:[mode];
  const pairs=model.pairs.filter(pair=>languages.some(language=>pair[language]));
  const visible=pairs.slice(0,limit);
  let shown=visible.length,total=pairs.length;
  let html=visible.map(pair=>`<div class="${mode==='parallel'?'result-pair':'result-single'}">${languages.map(language=>`<div class="result-language">${pair[language]?cellHtml(pair[language],query):'<p class="excerpt-status">No paragraph at this source position.</p>'}</div>`).join('')}</div>`).join('<div class="excerpt-separator" aria-hidden="true">…</div>');
  const hasIndependent=languages.some(language=>model.independent[language].length);
  if(hasIndependent){
    html+=`<div class="${mode==='parallel'?'result-independent':'result-single'}">`+languages.map(language=>{
      const cells=model.independent[language];total+=cells.length;shown+=Math.min(limit,cells.length);
      const empty=model.available[language]?'No matching passages in this language.':`${language==='en'?'English':'Original'} text unavailable.`;
      return `<div class="result-language">${cells.length?separated(cells.slice(0,limit),query):`<p class="excerpt-status">${empty}</p>`}</div>`;
    }).join('')+'</div>';
  }
  if(!total)html=`<p class="excerpt-status">${languages.some(language=>model.available[language])?'No matching passages in this language. Choose Parallel to see the matches.':`${mode==='en'?'English':'Original'} text unavailable.`}</p>`;
  return {html,shown,total,notice:mode==='parallel'?model.notice:'',hasMore:shown<total};
}
