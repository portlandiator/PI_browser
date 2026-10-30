import {escapeHtml as esc} from './text.mjs';

// This small manifest is independent of the quotation payloads, which are only
// loaded when the reader opens a guide. Never offer a guide for a stale dataset.
export async function loadStudyGuides(dataset,request=fetch){
  try{
    const response=await request('./study-guides/manifest.json',{cache:'no-cache'});
    if(!response.ok)return {};
    const manifest=await response.json();
    if(manifest.format!==1||manifest.dataset!==dataset||!manifest.subjects)return {};
    return Object.fromEntries(Object.entries(manifest.subjects).filter(([id,file])=>/^[A-F0-9]{32}$/.test(id)&&/^[a-z]+-pdf\.html$/.test(file)));
  }catch{return {};}
}

export function studyGuideButton(guides,subjectId){
  const file=guides[subjectId];
  if(typeof file!=='string'||!/^[a-z]+-pdf\.html$/.test(file))return '';
  return `<a id="subject-study-guide" href="./study-guides/${esc(file)}" target="_blank" rel="noopener" title="Open this subject’s study guide in a new tab">Try a study guide</a>`;
}

// Each guide's first reading and its catalog number, shown beside the subject
// graph. Like the manifest, a quotation from another dataset is never shown.
export async function loadGuideOpening(guides,dataset,subjectId,request=fetch){
  if(typeof guides[subjectId]!=='string'||!/^[A-F0-9]{32}$/.test(subjectId))return null;
  try{
    const response=await request(`./study-guides/openings/${subjectId}.json`,{cache:'no-cache'});
    if(!response.ok)return null;
    const opening=await response.json();
    if(opening.format!==1||opening.dataset!==dataset||!Array.isArray(opening.paragraphs)||!opening.paragraphs.length||!opening.paragraphs.every(p=>typeof p==='string'&&p.trim()))return null;
    const source=typeof opening.source==='string'&&opening.source.length<=40?opening.source.trim():'';
    // Authorized paragraphs are blue, as in the guide; anything undeclared is provisional.
    const authorized=opening.paragraphs.map((p,i)=>Array.isArray(opening.authorized)&&opening.authorized[i]===true);
    return {paragraphs:opening.paragraphs,authorized,source};
  }catch{return null;}
}

// The quotation sits within quotation marks; its catalog number follows the closing mark.
function quotationHtml(paragraphs,source,authorized=[]){
  return paragraphs.map((p,i)=>`<p${authorized[i]?' class="authorized-translation"':''}>${i?'':'“'}${esc(p)}${i===paragraphs.length-1?`”${source?` <span class="quotation-source">${esc(source)}</span>`:''}`:''}</p>`).join('');
}

export function studyGuideQuotation(guides,opening,subjectId){
  const file=guides[subjectId];
  if(typeof file!=='string'||!/^[a-z]+-pdf\.html$/.test(file)||!opening?.paragraphs?.length)return '';
  return `<a class="subject-guide-quotation" href="./study-guides/${esc(file)}" target="_blank" rel="noopener" title="Open this subject’s study guide in a new tab"><blockquote>${quotationHtml(opening.paragraphs,opening.source,opening.authorized)}</blockquote></a>`;
}

// Shortens a quotation to the most whole words that fit within `limit`
// pixels, ending in an ellipsis inside the closing quotation mark; the
// catalog number always stays. A quotation that fits is shown in full.
export function fitQuotation(quote,{paragraphs,source,authorized},limit){
  const show=parts=>{quote.innerHTML=quotationHtml(parts,source,authorized);};
  show(paragraphs);
  if(!(limit>0)||quote.getBoundingClientRect().height<=limit)return false;
  const words=paragraphs.map(p=>p.split(/\s+/).filter(Boolean));
  const shortened=count=>{
    const parts=[];
    for(const list of words){
      if(count<=0)break;
      parts.push(list.slice(0,count).join(' '));
      if(count<list.length){parts[parts.length-1]=parts.at(-1).replace(/[\s,;:.…–—-]+$/u,'')+'…';break;}
      count-=list.length;
    }
    return parts;
  };
  let low=1,high=words.flat().length-1;
  while(low<high){
    const middle=Math.ceil((low+high)/2);
    show(shortened(middle));
    if(quote.getBoundingClientRect().height<=limit)low=middle;else high=middle-1;
  }
  show(shortened(low));
  return true;
}
