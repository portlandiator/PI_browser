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
  const names=fields.map(field=>field.name).filter(name=>!['Citation count','Subjects','Extract','Volume_title'].includes(name));
  if(fields.some(field=>field.name==='Extract')){
    const index=names.indexOf('Word count');
    names.splice(index<0?names.length:index+1,0,'Extract');
  }
  if(names.includes('Authorized')&&names.includes('Translations')){
    names.splice(names.indexOf('Authorized'),1);
    names.splice(names.indexOf('Translations')+1,0,'Authorized');
  }
  if(names.includes('Language')){
    const contextFields=['Date','Recipient','Period','Place'].filter(name=>names.includes(name));
    for(const name of contextFields)names.splice(names.indexOf(name),1);
    names.splice(names.indexOf('Language')+1,0,...contextFields);
  }
  return names.map(name=>{
    let value=metadata[name]||'';
    if(name==='Extract')value=String(value).trim().toLowerCase()==='x'?'Yes':value.trim()||'No';
    if(name==='Authorized'&&/^Y\s*\S/.test(value.trim()))value=`Y (paragraphs ${value.trim().slice(1).trim().replace(/\s*,\s*/g,', ')})`;
    return [name==='Authorized'?'Translation authorized':name,value];
  });
}
