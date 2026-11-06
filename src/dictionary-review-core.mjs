// Pure helpers of the dictionary review page (dictionary-review.html): read a
// published dictionary's source file with its rows in order, apply a
// reviewer's drafts, filter and sort entries, and write the reviewed file.
// Unchanged rows keep their bytes so a pull request shows only the edits.
import {dictionaryColumn,dictionaryKey,reviewStatuses,isOriginalScript} from './dictionary.mjs';
import {parseCsv} from './text.mjs';

// Published column order; a download includes only the columns in use.
export const reviewColumns=['form','vocalized','lemma','lang','translit','pos','root','gloss','rendering','register','tags','modern','modern_translit','modern_gloss','shift','definition','usage','notes','status','reviewer'];
// Default order: uncertain readings first, then unreviewed, then reviewed.
export const statusOrder=['uncertain','unreviewed','reviewed'];
export const reviewFilters=['pending','uncertain','unreviewed','reviewed','all'];
export const reviewFilter=value=>reviewFilters.includes(value)?value:'pending';
export const entryStatus=entry=>reviewStatuses.includes(String(entry?.status||'').toLowerCase())?String(entry.status).toLowerCase():'unreviewed';

// Rows of a dictionary file. TSV keeps each source line so unchanged rows can
// be written back byte for byte; CSV rows are rewritten as TSV.
export function readReviewSource(text){
  text=String(text);
  const bom=text.startsWith('﻿')?'﻿':'';text=text.slice(bom.length);
  const newline=text.includes('\r\n')?'\r\n':'\n';
  const header=text.split(/\r?\n/,1)[0]||'';
  if(!header.includes('\t')){
    const records=parseCsv(text);const names=Object.keys(records[0]||{});
    return {tsv:false,bom,newline,names,columns:names.map(dictionaryColumn),lines:null,trailing:true,rows:records.map((record,index)=>({index,line:null,raw:names.map(name=>record[name]??'')})).map(row=>withEntry(row,names.map(dictionaryColumn)))};
  }
  const lines=text.split(/\r?\n/),trailing=lines.at(-1)==='';if(trailing)lines.pop();
  const names=lines[0].split('\t'),columns=names.map(dictionaryColumn),rows=[];
  for(let n=1;n<lines.length;n++)if(lines[n].trim())rows.push(withEntry({index:rows.length,line:n,raw:lines[n].split('\t')},columns));
  return {tsv:true,bom,newline,names,columns,lines,trailing,rows};
}
function withEntry(row,columns){
  const entry={};
  columns.forEach((column,i)=>{if(reviewColumns.includes(column)&&!(column in entry))entry[column]=String(row.raw[i]??'').trim();});
  if(reviewStatuses.includes(entry.status?.toLowerCase()))entry.status=entry.status.toLowerCase();
  return {...row,entry};
}
// Columns shown for editing: those the file has, plus status and reviewer.
export const editableColumns=source=>reviewColumns.filter(column=>source.columns.includes(column)||column==='status'||column==='reviewer');

// Drafts: {"<row index>:<form>":{field:value}}; the form guards against a
// file whose rows moved since the draft was made.
export const draftKey=(form,index)=>`${index}:${form}`;
export const storageKey=id=>`pi-dictionary-review:${id}`;
export function draftFor(drafts,row){return drafts?.[draftKey(row.entry.form||'',row.index)]||null;}
// Merge a change into the drafts, keeping only fields that differ from the source.
export function setDraft(drafts,row,changes){
  const key=draftKey(row.entry.form||'',row.index),next={...drafts},draft={...(next[key]||{}),...changes};
  for(const [field,value] of Object.entries(draft))if(String(value??'')===(row.entry[field]??''))delete draft[field];
  if(Object.keys(draft).length)next[key]=draft;else delete next[key];
  return next;
}
export const reviewedEntry=(row,drafts)=>({...row.entry,...(draftFor(drafts,row)||{})});
// Drafts that still match a row of this file.
export const draftCount=(source,drafts)=>source.rows.filter(row=>draftFor(drafts,row)).length;

// Status counts with drafts applied.
export function statusCounts(source,drafts){
  const counts=Object.fromEntries(reviewStatuses.map(status=>[status,0]));
  for(const row of source.rows)counts[entryStatus(reviewedEntry(row,drafts))]++;
  return counts;
}

// Rows for a filter and search, in review order (status, then file order).
// `pending` shows uncertain and unreviewed entries; the search matches the
// form (as dictionary lookups do) or the text of gloss, lemma, translit
// and rendering.
export function filterRows(source,drafts,{filter='pending',query=''}={}){
  filter=reviewFilter(filter);
  const text=String(query).trim().toLowerCase(),key=dictionaryKey(query);
  const rank=row=>statusOrder.indexOf(entryStatus(row.reviewed));
  return source.rows.map(row=>({...row,reviewed:reviewedEntry(row,drafts)})).filter(row=>{
    const status=entryStatus(row.reviewed);
    if(filter==='pending'&&status==='reviewed')return false;
    if(filter!=='pending'&&filter!=='all'&&status!==filter)return false;
    if(!text)return true;
    const e=row.reviewed;
    return (key&&[e.form,e.lemma,e.vocalized].some(value=>value&&dictionaryKey(value).includes(key)))||[e.gloss,e.lemma,e.translit,e.rendering].some(value=>String(value||'').toLowerCase().includes(text));
  }).sort((a,b)=>rank(a)-rank(b)||a.index-b.index);
}

// The reviewer value for "Mark reviewed": name or initials and today's date.
export function reviewerStamp(name,date=new Date()){
  const clean=String(name||'').replace(/\s+/g,' ').trim().replace(/\s*\d{4}-\d{2}-\d{2}$/,'');
  if(!clean)return '';
  const day=typeof date==='string'?date:`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  return `${clean} ${day}`;
}
// Changes for the mark buttons. A reviewer belongs only to reviewed entries.
export const markReviewed=reviewer=>({status:'reviewed',reviewer});
export const markUncertain=()=>({status:'uncertain',reviewer:''});

// The whole dictionary as TSV with the drafts applied. When every drafted
// field is a column of the file, its header and column order stay, and rows
// without a draft keep their exact text; otherwise the file is written in the
// published column order with the new columns added. Columns this page does
// not know follow at the end. Values cannot contain tabs or line breaks.
export function exportTsv(source,drafts){
  const cell=value=>String(value??'').replace(/[\t\r\n]+/g,' ');
  const used=new Set();
  for(const row of source.rows)for(const field of Object.keys(draftFor(drafts,row)||{}))used.add(field);
  const keep=source.tsv&&[...used].every(field=>source.columns.includes(field));
  const known=source.columns.filter(column=>reviewColumns.includes(column));
  const unknown=source.names.filter((name,i)=>!reviewColumns.includes(source.columns[i]));
  const columns=keep?source.columns:[...reviewColumns.filter(column=>known.includes(column)||used.has(column)),...unknown.map(name=>({unknown:name}))];
  const header=keep?source.names.join('\t'):columns.map(column=>column.unknown??column).join('\t');
  const rowText=row=>{
    const draft=draftFor(drafts,row);
    if(keep&&!draft)return source.lines[row.line];
    if(keep){const seen=new Set();return source.columns.map((column,i)=>{if(draft&&column in draft&&!seen.has(column)){seen.add(column);return cell(draft[column]);}seen.add(column);return row.raw[i]??'';}).join('\t');}
    const entry=reviewedEntry(row,drafts);
    return columns.map(column=>{
      if(column.unknown!==undefined)return cell(row.raw[source.names.indexOf(column.unknown)]);
      const at=source.columns.indexOf(column);
      return draft&&column in draft?cell(draft[column]):at<0?'':cell(row.raw[at]??entry[column]);
    }).join('\t');
  };
  if(keep){
    const byLine=new Map(source.rows.map(row=>[row.line,row]));
    const lines=source.lines.map((line,n)=>n===0?header:byLine.has(n)?rowText(byLine.get(n)):line);
    return source.bom+lines.join(source.newline)+(source.trailing?source.newline:'');
  }
  return source.bom+[header,...source.rows.map(rowText)].join(source.newline)+source.newline;
}

// Whether the concordance can give context: Persian/Arabic headwords only.
export const hasContext=entry=>isOriginalScript(entry?.form||'');
