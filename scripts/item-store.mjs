import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {parseCsv} from '../src/text.mjs';
import {decodeSource} from './source-encoding.mjs';
import {writeZip} from './zip-archive.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const sourceFolders=['metadata - copy','original_texts - copy','translated_texts - copy'];
const folders=sourceFolders.slice(1);
const archiveName=name=>name.split(path.sep).join('/');
export const validId=id=>typeof id==='string'&&/^[\p{L}\p{N}_ ()-]+$/u.test(id)&&id.length<=160;
export function csvText(rows,fields){
  const cell=value=>'"'+String(value??'').replaceAll('"','""')+'"';
  return [fields.map(cell).join(','),...rows.map(row=>fields.map(field=>cell(row[field])).join(','))].join('\n')+'\n';
}
export function decode(bytes){return decodeSource(bytes).text;}
// One item's content: its metadata row and both texts (decoded). Two items
// with the same content have the same state, whatever the file encodings.
export const itemContent=item=>({metadata:item.metadata,original:item.original??null,english:item.english??null});
export const itemState=item=>sha(JSON.stringify(itemContent(item)));
// Check an item as the editor sends it: the ID and column names are fixed,
// texts are strings or absent (null).
export function checkItemInput(input,fields,id){
  if(!input.metadata||typeof input.metadata!=='object'||Object.keys(input.metadata).length!==fields.length||fields.some(field=>typeof input.metadata[field]!=='string')||input.metadata.PIN!==id)throw Error('Keep the ID and metadata column names unchanged.');
  for(const language of ['original','english'])if(input[language]!==null&&typeof input[language]!=='string')throw Error('Text must be a string, or absent.');
}
// The editor changes the local source folders, which are not in Git. Explain
// how to supply them rather than failing on the first lookup.
export async function requireSourceFolders(root){
  const missing=[];
  for(const folder of sourceFolders)try{if(!(await fs.stat(path.join(root,folder))).isDirectory())missing.push(folder);}catch{missing.push(folder);}
  if(missing.length)throw Error(`The source folders are missing from ${path.resolve(root)}: ${missing.join(', ')}. Copy them into this project folder (they are not stored in Git), then start the editor again.`);
}
export class ItemStore{
  constructor(root){this.root=path.resolve(root);}
  async snapshot(id){
    if(!validId(id))throw Error('Enter an exact catalog ID, without a file extension.');
    const directory=path.join(this.root,'metadata - copy');
    const csvs=(await fs.readdir(directory)).filter(name=>name.endsWith('.csv'));
    if(csvs.length!==1)throw Error('Keep exactly one CSV in metadata - copy.');
    const names=[path.join('metadata - copy',csvs[0]),...folders.map(folder=>path.join(folder,id+'.txt'))];
    const bytes=[];
    for(const name of names){
      const file=path.join(this.root,name),entries=await fs.readdir(path.dirname(file));
      if(!entries.includes(path.basename(file))){bytes.push(null);continue;}
      if((await fs.lstat(file)).isSymbolicLink())throw Error('Source files must not be symbolic links.');
      bytes.push(await fs.readFile(file));
    }
    const rows=parseCsv(new TextDecoder('utf-8',{fatal:true}).decode(bytes[0]));
    if(!rows.length||!Object.hasOwn(rows[0],'PIN')||new Set(rows.map(row=>row.PIN)).size!==rows.length)throw Error('The metadata CSV has missing or duplicate IDs.');
    const row=rows.find(row=>row.PIN===id);
    if(!row&&!bytes[1]&&!bytes[2])throw Error('No source item has that exact ID. IDs are case-sensitive.');
    const fields=Object.keys(rows[0]);
    // The files as a whole, to notice a concurrent write while saving.
    const revision=sha(JSON.stringify(bytes.map(value=>value===null?null:sha(value))));
    const item={id,fields,metadata:row||Object.fromEntries(fields.map(field=>[field,field==='PIN'?id:''])),original:bytes[1]===null?null:decode(bytes[1]),english:bytes[2]===null?null:decode(bytes[2])};
    return {...item,state:itemState(item),revision,names,bytes,rows,listed:Boolean(row)};
  }
  async load(id){
    const {id:itemId,state,fields,metadata,original,english}=await this.snapshot(id);
    return {id:itemId,state,fields,metadata,original,english};
  }
  // Write the item as given. `input.state` is the content it was based on: the
  // save stops when the source files hold something else now.
  async save(input){
    const s=await this.snapshot(input.id);
    if(s.state!==input.state)throw Error('The source files changed since this item was opened. Reload before saving; your edits have not been written.');
    checkItemInput(input,s.fields,s.id);
    const rows=s.rows.map(row=>row.PIN===s.id?input.metadata:row);
    if(!s.listed)rows.push(input.metadata);
    const metadataChanged=JSON.stringify(input.metadata)!==JSON.stringify(s.metadata)||!s.listed;
    const next=[metadataChanged?Buffer.from(csvText(rows,s.fields)):s.bytes[0],...['original','english'].map((language,i)=>input[language]===null?null:s.bytes[i+1]!==null&&input[language]===s[language]?s.bytes[i+1]:Buffer.from(input[language],'utf8'))];
    const backup=await this.replace(s,next);
    return {...await this.load(s.id),backup};
  }
  // Remove the item from the local source folders once its deletion has been
  // proposed, so a later full collection update cannot restore it.
  async remove(id){
    let s;
    try{s=await this.snapshot(id);}catch(error){if(/^No source item/.test(error.message))return null;throw error;}
    const rows=s.rows.filter(row=>row.PIN!==s.id);
    return this.replace(s,[rows.length===s.rows.length?s.bytes[0]:Buffer.from(csvText(rows,s.fields)),null,null],{deleted:true});
  }
  async replace(s,next,note={}){
    const changed=next.map((value,i)=>value===null?s.bytes[i]!==null:s.bytes[i]===null||!value.equals(s.bytes[i]));
    if(!changed.some(Boolean))return null;
    // One ZIP per backup (Dropbox syncs the project folder): manifest.json and
    // the previous bytes of each changed file under its source path.
    const backup=await writeZip(path.join(this.root,'.qa','item-backups',new Date().toISOString().replaceAll(':','-')+'-'+randomUUID().slice(0,8)+'.zip'),[
      {name:'manifest.json',bytes:JSON.stringify({id:s.id,...note,files:s.names.map((name,i)=>({name:archiveName(name),existed:s.bytes[i]!==null,changed:changed[i]}))},null,2)},
      ...s.bytes.flatMap((bytes,i)=>bytes!==null&&changed[i]?[{name:archiveName(s.names[i]),bytes}]:[])]);
    // Stage every changed file before replacing any source. Preserve byte-exact backups.
    const staged=[];
    try{
      for(let i=0;i<next.length;i++)if(changed[i]&&next[i]!==null){const file=path.join(this.root,s.names[i]+'.item-'+randomUUID()+'.tmp');await fs.writeFile(file,next[i],{flag:'wx'});staged[i]=file;}
      if((await this.snapshot(s.id)).revision!==s.revision)throw Error('Sources changed during save. Reload and try again.');
      const committed=[];
      try{
        for(let i=0;i<next.length;i++)if(changed[i]){if(next[i]===null)await fs.unlink(path.join(this.root,s.names[i]));else await fs.rename(staged[i],path.join(this.root,s.names[i]));committed.push(i);}
      }catch(error){for(const i of committed){if(s.bytes[i]===null)await fs.rm(path.join(this.root,s.names[i]),{force:true});else await fs.writeFile(path.join(this.root,s.names[i]),s.bytes[i]);}throw error;}
    }finally{for(const file of staged)if(file)await fs.rm(file,{force:true});}
    return backup;
  }
}
