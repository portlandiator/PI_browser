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
