export const catalogFilterOrder=['pin','author','language','title','word-count','date','period','recipient','place','volume','first-line-original','first-line-translated','manuscripts','publications','translations','musical-interpretations','abstracts','notes'];
export const catalogFilterLabel=(key,name)=>({'pin':'ID','word-count':'Word Count','publications':'Publications (Per/Ara)'}[key]||name);
export const catalogFilterFields=fields=>catalogFilterOrder.flatMap(key=>{
  const field=fields.find(field=>field.key===key);
  return field?[{...field,name:catalogFilterLabel(key,field.name)}]:[];
});
export const volumeFilterLabel=(value,titles)=>titles[String(Number(value))]||value;
