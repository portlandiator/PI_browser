import {escapeHtml,normalize} from './text.mjs';

export function decodeEntities(value){
  return String(value).replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,(match,entity)=>{
    const names={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '};
    if(entity[0]!=='#')return names[entity.toLowerCase()]??match;
    const code=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):parseInt(entity.slice(1),10);
    return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):'�';
  });
}
export function safeExternalUrl(value){
  const decoded=decodeEntities(value).trim();
  if(/[\u0000-\u0020\u007f]/.test(decoded))return null;
  try{const url=new URL(decoded);return ['https:','http:'].includes(url.protocol)?decoded:null;}catch{return null;}
}
export function sourceExternalUrl(value){
  const direct=safeExternalUrl(value);if(direct)return direct;
  const text=decodeEntities(value).trim();
  if(/^www\.[^\s]+$/i.test(text))return safeExternalUrl('https://'+text);
  const labelled=/^(?:A\. Youssefi:|text at:)\s*(https?:\/\/\S+)$/i.exec(text);
  return labelled?safeExternalUrl(labelled[1]):null;
}
// Source metadata contains anchor markup. Reconstruct only safe hyperlinks;
// never inject source HTML, event attributes, or other active elements.
export function metadataParts(value){
  const parts=[];let cursor=0;
  const addText=text=>{if(text)parts.push({text:decodeEntities(text)});};
  for(const match of String(value).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)){
    addText(String(value).slice(cursor,match.index));
    const href=/(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(match[1]);
    const destination=href?(href[1]??href[2]??href[3]):'';
    const url=sourceExternalUrl(destination);
    const label=decodeEntities(match[2].replace(/<[^>]*>/g,''));
    parts.push({text:label+(!url&&/^[a-z]:\\/i.test(destination)?` (${destination})`:''),...(url?{url}:{})});
    cursor=match.index+match[0].length;
  }
  addText(String(value).slice(cursor));
  return parts;
}
function linkifyText(value){
  let html='',cursor=0;
  for(const match of value.matchAll(/https?:\/\/[^\s<>"']+/gi)){
    let url=match[0].replace(/[.,;!]+$/,'');
    // Leave prose's closing parenthesis outside a link, but keep balanced URL parentheses.
    while(url.endsWith(')')&&(url.match(/\)/g)||[]).length>(url.match(/\(/g)||[]).length)url=url.slice(0,-1);
    if(!safeExternalUrl(url))continue;
    html+=escapeHtml(value.slice(cursor,match.index))+anchor(url,url);cursor=match.index+url.length;
  }
  return html+escapeHtml(value.slice(cursor));
}
const anchor=(url,label)=>`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label||url)}</a>`;
export const renderMetadata=value=>metadataParts(value).map(part=>part.url?anchor(part.url,part.text):linkifyText(part.text)).join('');
export const metadataPlain=value=>metadataParts(value).map(part=>part.text).join('');
export const metadataSearchText=value=>metadataParts(value).map(part=>part.text+(part.url?' '+part.url:'')).join('');
export const fieldKey=name=>name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export function describeFields(rows){
  const categorical=new Set(['Language','Period','Volume','Recipient','Place']);
  return Object.keys(rows[0]||{}).map(name=>{
    const values=rows.map(row=>row[name]).filter(Boolean);
    return {name,key:fieldKey(name),kind:name==='Word count'?'number':categorical.has(name)?'categorical':'text',populated:values.length,distinct:new Set(values).size};
  });
}
export const hasFilter=filter=>Boolean(filter&&(filter.text||filter.presence||filter.values?.length||filter.min!==undefined&&filter.min!==''||filter.max!==undefined&&filter.max!==''));
export function matchesMetadata(value,filter){
  if(!hasFilter(filter))return true;
  const present=Boolean(value.trim());
  if(filter.presence==='present'&&!present||filter.presence==='missing'&&present)return false;
  if(filter.values?.length&&!filter.values.includes(value))return false;
  if(filter.text&&!normalize(value).includes(normalize(filter.text)))return false;
  if(filter.min!==undefined&&filter.min!==''||filter.max!==undefined&&filter.max!==''){
    if(!/^\d+(?:\.\d+)?$/.test(value))return false;
    const n=Number(value);
    if(filter.min!==undefined&&filter.min!==''&&n<Number(filter.min))return false;
    if(filter.max!==undefined&&filter.max!==''&&n>Number(filter.max))return false;
  }
  return true;
}
export function facetSummary(values,indices,{query='',limit=40,selected=[],order=[]}={}){
  const counts=new Map();let present=0;
  for(const index of indices){const value=values[index]||'';if(value.trim()){present++;counts.set(value,(counts.get(value)||0)+1);}}
  const needle=normalize(query);
  const ranks=new Map(order.map((value,i)=>[value,i]));
  const rank=value=>ranks.get(value)??ranks.get(value.replace(/\?$/,''))??Number.MAX_SAFE_INTEGER;
  const compare=(a,b)=>(order.length?rank(a[0])-rank(b[0]):b[1]-a[1])||a[0].localeCompare(b[0],undefined,{numeric:true});
  const all=[...counts].filter(([value])=>!needle||normalize(value).includes(needle)).sort(compare);
  const visible=all.slice(0,limit),included=new Set(visible.map(([value])=>value));
  for(const value of selected)if(!included.has(value))visible.unshift([value,counts.get(value)||0]);
  if(order.length)visible.sort(compare);
  return {present,missing:indices.length-present,total:indices.length,optionCount:all.length,options:visible.map(([value,count])=>({value,count}))};
}
