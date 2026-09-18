import {parseCsv} from '../src/text.mjs';

export function parsePeriodRenaming(csv){
  const rows=parseCsv(csv);
  if(!rows.length||Object.keys(rows[0]).join(',')!=='Old,New')throw Error('Period renaming requires Old,New columns.');
  const seen=new Set();
  for(const {Old,New} of rows){
    if(!Old||!New||seen.has(Old))throw Error(`Empty or duplicate Period mapping: ${Old}`);
    seen.add(Old);
  }
  // Longest first, literal, one pass: replacement text is never replaced again.
  const mappings=[...rows].sort((a,b)=>b.Old.length-a.Old.length);
  const pattern=new RegExp(mappings.map(r=>r.Old.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
  const replacements=new Map(rows.map(r=>[r.Old,r.New]));
  return {rows,rename:value=>value.replace(pattern,old=>replacements.get(old))};
}

export function renamePeriods(rows,mapping){
  const originalValues=new Map(),unmapped=new Map();
  let changed=0;
  const renamed=rows.map(row=>{
    const old=row.Period||'',value=mapping.rename(old);
    if(old===value){if(old)unmapped.set(old,(unmapped.get(old)||0)+1);return row;}
    originalValues.set(row.PIN,{Period:old});changed++;
    return {...row,Period:value};
  });
  return {rows:renamed,originalValues,report:{file:'period_renaming.csv',mappings:mapping.rows,changed,unmapped:Object.fromEntries(unmapped)}};
}

export function requireCompletePeriodRenaming(report){
  if(Object.keys(report.unmapped).length)throw Error(`Period values still unchanged; update period_renaming.csv: ${JSON.stringify(report.unmapped)}`);
}
