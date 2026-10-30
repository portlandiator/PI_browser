import {readingPosition} from './paragraph-alignment.mjs';

// Numbers refer to source paragraphs, never to the extra blank alignment slots.
export function paragraphReference(number,language='en'){
  if(!/^\d+$/.test(String(number))||!Number.isSafeInteger(Number(number))||Number(number)<1)return null;
  if(!['en','original'].includes(language))return null;
  return {number:Number(number),language};
}

export function paragraphUrl(pathname,id,reference){
  const params=new URLSearchParams({id,paragraph:String(reference.number)});
  if(reference.language==='original')params.set('lang','original');
  return pathname+'?'+params;
}

export function paragraphTarget(record,reference){
  if(!record||!reference)return null;
  const version=record[reference.language];
  if(!version?.paragraphs[reference.number-1])return null;
  const position=readingPosition(version,reference.number-1);
  if(position<0)return null;
  return {id:`p-${reference.language}-${reference.number}`,visibleParagraphs:Math.ceil((position+1)/100)*100};
}
