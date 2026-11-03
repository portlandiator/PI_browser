import {createHash} from 'node:crypto';
import {parseText} from '../src/text.mjs';
import {decode} from './item-store.mjs';

// Carry forward a review only when its entire paragraph and exact range survive.
export function revalidateItemQuotes(decisions,id,before,after,prepared){
  const version=bytes=>bytes===null?undefined:createHash('sha256').update(bytes).digest('hex');
  const oldVersion=prepared?.oldVersion??version(before),nextVersion=prepared?.nextVersion??version(after);
  const oldParagraphs=prepared?.oldParagraphs??(before===null?[]:parseText(decode(before),'en').paragraphs);
  const nextParagraphs=prepared?.nextParagraphs??(after===null?[]:parseText(decode(after),'en').paragraphs);
  const result=structuredClone(decisions);let updated=0;
  function visit(value){
    if(!value||typeof value!=='object')return;
    if(value.source===id&&Array.isArray(value.ranges)&&value.version!==nextVersion){
      const relocated=[];
      const valid=after!==null&&value.version===oldVersion&&value.ranges.length&&value.ranges.every(r=>{
        const old=oldParagraphs[r.paragraph-1]?.plain;
        if(!(Number.isInteger(r.paragraph)&&r.paragraph>0&&typeof old==='string'&&Number.isInteger(r.start)&&Number.isInteger(r.end)&&r.start>=0&&r.end>r.start&&r.end<=old.length&&r.text===old.slice(r.start,r.end)))return false;
        const hits=nextParagraphs.flatMap((p,i)=>p.plain===old?[i+1]:[]);
        // A move must have exactly one complete-paragraph match. Never guess
        // among repeated passages or accept only a matching fragment.
        const paragraph=nextParagraphs[r.paragraph-1]?.plain===old?r.paragraph:hits.length===1?hits[0]:null;
        if(paragraph===null)return false;
        const previous=relocated.at(-1);
        if(previous&&(paragraph<previous.paragraph||paragraph===previous.paragraph&&r.start<previous.end))return false;
        relocated.push({...r,paragraph});return true;
      });
      if(!valid)throw Error(`Saved locally, but reviewed subject quotations for ${id} need review against the corrected text before publication. No change has been pushed.`);
      value.version=nextVersion;
      value.ranges=relocated;
      for(const r of value.ranges)r.paragraphId=`${id}@${nextVersion}:en:${r.paragraph}`;
      updated++;
    }
    for(const child of Object.values(value))if(typeof child==='object')visit(child);
  }
  visit(result);return {decisions:result,updated};
}
