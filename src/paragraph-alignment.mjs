// Text paragraph identities stay unchanged; null entries are reading-layout slots.
export function alignmentSlots(text){
  const normalized=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();
  if(!normalized.trim())return [];
  const slots=[];let paragraph=0;
  for(const [i,part] of normalized.split(/(\n[\t ]*\n+)/).entries()){
    if(i%2){
      const hasBlank=/\n{4,}/.test(part);
      if(hasBlank)slots.push(null);
    }else if(part.trim())slots.push(paragraph++);
  }
  return slots;
}

export function readingSlots(version){
  return version.paragraphs.length?(version.alignment||version.paragraphs.map((_,i)=>i)):[];
}

export function alignmentCounts(record){
  return {en:readingSlots(record.en).length,original:readingSlots(record.original).length};
}

export function readingPosition(version,paragraph){
  return readingSlots(version).indexOf(paragraph);
}
