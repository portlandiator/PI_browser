import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {parseCsv} from '../src/text.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const folders=['original_texts - copy','translated_texts - copy'];
export const validId=id=>typeof id==='string'&&/^[\p{L}\p{N}_ ()-]+$/u.test(id)&&id.length<=160;
export function csvText(rows,fields){
  const cell=value=>'"'+String(value??'').replaceAll('"','""')+'"';
  return [fields.map(cell).join(','),...rows.map(row=>fields.map(field=>cell(row[field])).join(','))].join('\n')+'\n';
}
export function decode(bytes){try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return new TextDecoder('windows-1252').decode(bytes);}}
export class ItemStore{
  constructor(root){this.root=path.resolve(root);}
  async snapshot(id){
    if(!validId(id))throw Error('Enter an exact catalog ID, without a file extension.');
    const directory=path.join(this.root,'metadata - copy');
    const csvs=(await fs.readdir(directory)).filter(name=>name.endsWith('.csv'));
    if(csvs.length!==1)throw Error('Keep exactly one CSV in metadata - copy.');
    const names=[path.join('metadata - copy',csvs[0]),...folders.map(folder=>path.join(folder,id+'.txt'))];
    const bytes=[];
    for(const [i,name] of names.entries()){
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
    const revision=sha(JSON.stringify(bytes.map(value=>value===null?null:sha(value))));
    return {id,revision,names,bytes,rows,fields,metadata:row||Object.fromEntries(fields.map(field=>[field,field==='PIN'?id:'']))};
  }
  async load(id){
    const s=await this.snapshot(id);
    return {id:s.id,revision:s.revision,fields:s.fields,metadata:s.metadata,original:s.bytes[1]===null?null:decode(s.bytes[1]),english:s.bytes[2]===null?null:decode(s.bytes[2])};
  }
  async save(input){
    const s=await this.snapshot(input.id);
    if(s.revision!==input.revision)throw Error('The source files changed since this item was opened. Reload before saving; your edits have not been written.');
    if(!input.metadata||Object.keys(input.metadata).length!==s.fields.length||s.fields.some(field=>typeof input.metadata[field]!=='string')||input.metadata.PIN!==s.id)throw Error('Keep the ID and metadata column names unchanged.');
    for(const language of ['original','english'])if(input[language]!==null&&typeof input[language]!=='string')throw Error('Text must be a string, or absent.');
    const rows=s.rows.map(row=>row.PIN===s.id?input.metadata:row);
    if(!s.rows.some(row=>row.PIN===s.id))rows.push(input.metadata);
    const metadataChanged=JSON.stringify(input.metadata)!==JSON.stringify(s.metadata)||!s.rows.some(row=>row.PIN===s.id);
    const next=[metadataChanged?Buffer.from(csvText(rows,s.fields)):s.bytes[0],...['original','english'].map((language,i)=>input[language]===null?null:input[language]===decode(s.bytes[i+1]||Buffer.alloc(0))&&s.bytes[i+1]!==null?s.bytes[i+1]:Buffer.from(input[language],'utf8'))];
    const changed=next.map((value,i)=>value===null?s.bytes[i]!==null:s.bytes[i]===null||!value.equals(s.bytes[i]));
    if(!changed.some(Boolean))return {...await this.load(s.id),backup:null};
    const backup=path.join(this.root,'.qa','item-backups',new Date().toISOString().replaceAll(':','-')+'-'+randomUUID().slice(0,8));
    await fs.mkdir(backup,{recursive:true});
    await fs.writeFile(path.join(backup,'manifest.json'),JSON.stringify({id:s.id,files:s.names.map((name,i)=>({name,existed:s.bytes[i]!==null,changed:changed[i]}))},null,2));
    for(const [i,bytes] of s.bytes.entries())if(bytes!==null&&changed[i])await fs.writeFile(path.join(backup,String(i)),bytes);
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
    return {...await this.load(s.id),backup};
  }
}
