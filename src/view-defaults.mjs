import {parseCsv} from './text.mjs';

export const defaultFiles={subject:'knowledge_graph_defaults.csv',volume:'volume_view_defaults.csv'};

export function parseDefaults(kind,text){
  const rows=parseCsv(kind==='subject'?'subject\n'+text.replace(/^\uFEFF/,''):text);
  if(!rows.length)throw Error('The default view list is empty.');
  if(kind==='subject'){
    if(rows.some(row=>!row.subject))throw Error('Invalid default subject.');
    return rows.map(row=>row.subject);
  }
  if(rows.some(row=>!/^\d+$/.test(row.volume)||!/^\d+$/.test(row.page)||Number(row.volume)<1||Number(row.page)<1))throw Error('Invalid default volume or page.');
  return rows.map(row=>({volume:String(Number(row.volume)),page:Number(row.page)}));
}

export function randomDefault(entries,random=Math.random){
  if(!entries.length)throw Error('No available default views.');
  return entries[Math.floor(random()*entries.length)];
}

export async function loadDefaults(kind){
  const response=await fetch(new URL(defaultFiles[kind],import.meta.url));
  if(!response.ok)throw Error('The default view list could not be loaded.');
  return parseDefaults(kind,await response.text());
}

export function volumeStart(params,defaults,random=Math.random){
  if(!params.has('volume')&&!params.has('page'))return randomDefault(defaults,random);
  const volume=params.get('volume')||'30';
  return {volume,page:params.get('page')??(volume==='30'?14:1)};
}
