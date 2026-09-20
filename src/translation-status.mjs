// Paragraph numbers refer to the English source order, starting at one.
// Reject malformed declarations rather than implying authorization.
export function authorizedRanges(value=''){
  const text=String(value).trim();
  if(text==='Y')return [[1,Infinity]];
  if(!/^Y\s*\d/.test(text))return [];
  const ranges=[];
  for(const token of text.slice(1).split(',')){
    const match=/^\s*([1-9]\d*)\s*(?:-\s*([1-9]\d*)?\s*)?$/.exec(token);
    if(!match)return [];
    const start=Number(match[1]);
    const end=match[2]?Number(match[2]):token.includes('-')?Infinity:start;
    if(!Number.isSafeInteger(start)||(end!==Infinity&&!Number.isSafeInteger(end))||end<start)return [];
    ranges.push([start,end]);
  }
  return ranges;
}

export function isAuthorizedParagraph(ranges,number){
  return Number.isSafeInteger(number)&&number>0&&ranges.some(([start,end])=>number>=start&&number<=end);
}

export function catalogueDetails(fields,metadata={}){
  const names=fields.map(field=>field.name).filter(name=>!['Citation count','Subjects','Extract'].includes(name));
  if(fields.some(field=>field.name==='Extract')){
    const index=names.indexOf('Word count');
    names.splice(index<0?names.length:index+1,0,'Extract');
  }
  return names.map(name=>[name,name==='Extract'?(String(metadata[name]||'').trim().toLowerCase()==='x'?'Yes':metadata[name]?.trim()||'No'):metadata[name]||'']);
}
