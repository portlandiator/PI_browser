import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {decodeSource} from './source-encoding.mjs';
import {writeZip} from './zip-archive.mjs';
import {retryBusy} from './publish-tools.mjs';

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
// The CSV's records with their exact positions, so that a changed row can be
// replaced while every other byte of the file stays as it was. Quoting follows
// parseCsv (src/text.mjs), but values keep their surrounding spaces, as the
// published archive (Python's csv module) has them.
export function csvRecords(text){
  const records=[];let i=text.startsWith('\uFEFF')?1:0;
  while(i<text.length){
    const start=i,values=[];let cell='',quoted=false;
    for(;i<text.length;i++){
      const c=text[i];
      if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(quoted||cell==='')quoted=!quoted;else cell+=c;}
      else if(c===','&&!quoted){values.push(cell);cell='';}
      else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;i++;break;}
      else cell+=c;
    }
    if(quoted)throw Error('Unclosed CSV quotation in the metadata CSV.');
    values.push(cell);
    if(values.some(Boolean))records.push({values,start,end:i});
  }
  return records;
}
// Quoted only when needed, as the published archive writes its CSV.
const csvCell=value=>{value=String(value??'');return /[",\r\n]/.test(value)?'"'+value.replaceAll('"','""')+'"':value;};
// The CSV text with some rows replaced (id → row) or removed (id → null) and
// others appended; untouched rows, blank lines and line endings are unchanged.
function spliceCsv(meta,changes,appended){
  const {text,records,fields}=meta,ending=/\r?\n$/.exec(text.slice(records[0].start,records[0].end))?.[0]||'\n';
  const line=row=>fields.map(field=>csvCell(row[field])).join(',');
  const pin=fields.indexOf('PIN');
  let out='',from=0;
  for(const record of records.slice(1)){
    const id=record.values[pin];
    if(!changes.has(id))continue;
    const row=changes.get(id);
    out+=text.slice(from,record.start)+(row===null?'':line(row)+(/\r?\n$/.exec(text.slice(record.start,record.end))?.[0]||''));
    from=record.end;
  }
  out+=text.slice(from);
  if(appended.length){if(out&&!/[\r\n]$/.test(out))out+=ending;for(const row of appended)out+=line(row)+ending;}
  return out;
}
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
  // The metadata CSV, read and checked once (it holds every item's row).
  async readMetadata(){
    const directory=path.join(this.root,'metadata - copy');
    const csvs=(await fs.readdir(directory)).filter(name=>name.endsWith('.csv'));
    if(csvs.length!==1)throw Error('Keep exactly one CSV in metadata - copy.');
    const name=path.join('metadata - copy',csvs[0]),file=path.join(this.root,name);
    if((await fs.lstat(file)).isSymbolicLink())throw Error('Source files must not be symbolic links.');
    const bytes=await fs.readFile(file);
    const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes),records=csvRecords(text);
    const fields=records[0]?.values||[];
    const rows=records.slice(1).map((record,i)=>{
      if(record.values.length!==fields.length)throw Error(`Metadata CSV row ${i+2}: expected ${fields.length} columns, found ${record.values.length}.`);
      return Object.fromEntries(fields.map((field,j)=>[field,record.values[j]]));
    });
    if(!rows.length||!fields.includes('PIN')||new Set(rows.map(row=>row.PIN)).size!==rows.length)throw Error('The metadata CSV has missing or duplicate IDs.');
    return {name,bytes,text,records,rows,fields};
  }
  // `metadata` and `listings` (folder name → file names) may be shared by
  // several snapshots taken together.
  async snapshot(id,{metadata=null,listings=new Map()}={}){
    if(!validId(id))throw Error('Enter an exact catalog ID, without a file extension.');
    const meta=metadata||await this.readMetadata();
    const names=[meta.name,...folders.map(folder=>path.join(folder,id+'.txt'))],bytes=[meta.bytes];
    for(const name of names.slice(1)){
      // Exact, case-sensitive file names, also on Windows.
      const folder=path.dirname(name);
      if(!listings.has(folder))listings.set(folder,new Set(await fs.readdir(path.join(this.root,folder))));
      if(!listings.get(folder).has(path.basename(name))){bytes.push(null);continue;}
      const file=path.join(this.root,name);
      if((await fs.lstat(file)).isSymbolicLink())throw Error('Source files must not be symbolic links.');
      bytes.push(await fs.readFile(file));
    }
    const row=meta.rows.find(row=>row.PIN===id);
    if(!row&&!bytes[1]&&!bytes[2])throw Error('No source item has that exact ID. IDs are case-sensitive.');
    const fields=meta.fields;
    // The files as a whole, to notice a concurrent write while saving.
    const revision=sha(JSON.stringify(bytes.map(value=>value===null?null:sha(value))));
    const item={id,fields,metadata:row||Object.fromEntries(fields.map(field=>[field,field==='PIN'?id:''])),original:bytes[1]===null?null:decode(bytes[1]),english:bytes[2]===null?null:decode(bytes[2])};
    // Earlier versions read metadata with surrounding spaces trimmed, so a
    // pending edit saved then names this content as its base.
    const trimmed=itemState({...item,metadata:Object.fromEntries(Object.entries(item.metadata).map(([field,value])=>[field,value.trim()]))});
    return {...item,state:itemState(item),trimmedState:trimmed,revision,names,bytes,rows:meta.rows,listed:Boolean(row)};
  }
  async load(id){
    const {id:itemId,state,fields,metadata,original,english}=await this.snapshot(id);
    return {id:itemId,state,fields,metadata,original,english};
  }
  // Write the item as given. `input.state` is the content it was based on: the
  // save stops when the source files hold something else now.
  async save(input){
    const {backup}=await this.applyBatch([{id:input.id,action:'edit',state:input.state,input}],{strict:true});
    return {...await this.load(input.id),backup};
  }
  // Remove the item from the local source folders once its deletion has been
  // proposed, so a later full collection update cannot restore it.
  async remove(id){
    return (await this.applyBatch([{id,action:'delete'}],{strict:true})).backup;
  }
  // Apply edits and deletions of several items as one change: the metadata
  // CSV (which holds every row) is read, rewritten and backed up once, and
  // either every file is replaced or none is.
  //   changes: [{id, action:'edit', state, input:{metadata, original, english}} | {id, action:'delete'}]
  // `state` is the item content the edit was based on. Returns the backup and
  // one result per item: status written, removed, unchanged (already holds the
  // edit), absent (nothing to delete) or failed (with the reason; with
  // `strict` the first failure throws instead and nothing is written).
  async applyBatch(changes,{strict=false}={}){
    const metadata=await this.readMetadata(),listings=new Map(),results=[],files=new Map();
    const rowChanges=new Map(),appended=[];
    const fail=(id,error)=>{if(strict)throw error;results.push({id,status:'failed',reason:error.message});};
    const seen=new Set();
    for(const change of changes){
      const id=change.id;
      if(seen.has(id)){fail(id,Error(`${id} is listed twice.`));continue;}
      seen.add(id);
      let s;
      try{s=await this.snapshot(id,{metadata,listings});}
      catch(error){if(change.action==='delete'&&/^No source item/.test(error.message)){results.push({id,status:'absent'});continue;}fail(id,error);continue;}
      const replaceText=(i,next)=>{const name=s.names[i],before=s.bytes[i];if(next===null?before!==null:before===null||!next.equals(before))files.set(name,{before,after:next});};
      if(change.action==='delete'){
        if(s.listed)rowChanges.set(id,null);
        replaceText(1,null);replaceText(2,null);
        results.push({id,status:'removed'});
        continue;
      }
      if(change.action!=='edit'){fail(id,Error(`Unknown action for ${id}.`));continue;}
      const input=change.input;
      if(itemState(input)===s.state){results.push({id,status:'unchanged'});continue;}
      if(change.state!==s.state&&change.state!==s.trimmedState){fail(id,Error('The source files changed since this item was opened. Reload before saving; your edits have not been written.'));continue;}
      try{checkItemInput(input,s.fields,s.id);}catch(error){fail(id,error);continue;}
      if(JSON.stringify(input.metadata)!==JSON.stringify(s.metadata)||!s.listed){
        if(s.listed)rowChanges.set(id,input.metadata);else appended.push(input.metadata);
      }
      ['original','english'].forEach((language,i)=>replaceText(i+1,input[language]===null?null:s.bytes[i+1]!==null&&input[language]===s[language]?s.bytes[i+1]:Buffer.from(input[language],'utf8')));
      results.push({id,status:'written'});
    }
    if(rowChanges.size||appended.length){
      const next=Buffer.from(spliceCsv(metadata,rowChanges,appended),'utf8');
      if(!next.equals(metadata.bytes))files.set(metadata.name,{before:metadata.bytes,after:next});
    }
    if(!files.size)return {backup:null,results};
    const changed=results.filter(r=>r.status==='written'||r.status==='removed');
    const backup=await this.replaceFiles(files,{
      ...changed.length===1&&{id:changed[0].id,...changed[0].status==='removed'&&{deleted:true}},
      items:changed.map(r=>({id:r.id,...r.status==='removed'&&{deleted:true}})),
    });
    return {backup,results};
  }
  // Replace source files (name → {before, after}; after null removes the file).
  // One ZIP backup first (Dropbox syncs the project folder): manifest.json and
  // the previous bytes of each file under its source path. Every new file is
  // written beside its target before any target is replaced; the targets must
  // still hold the bytes read, and a failure part-way puts back those already
  // replaced.
  async replaceFiles(files,note={}){
    const backup=await writeZip(path.join(this.root,'.qa','item-backups',new Date().toISOString().replaceAll(':','-')+'-'+randomUUID().slice(0,8)+'.zip'),[
      {name:'manifest.json',bytes:JSON.stringify({...note,files:[...files].map(([name,f])=>({name:archiveName(name),existed:f.before!==null,changed:true}))},null,2)},
      ...[...files].flatMap(([name,f])=>f.before!==null?[{name:archiveName(name),bytes:f.before}]:[])]);
    const staged=new Map();
    try{
      for(const [name,f] of files)if(f.after!==null){const file=path.join(this.root,name+'.item-'+randomUUID()+'.tmp');await fs.writeFile(file,f.after,{flag:'wx'});staged.set(name,file);}
      for(const [name,f] of files){
        let now=null;try{now=await fs.readFile(path.join(this.root,name));}catch(error){if(error.code!=='ENOENT')throw error;}
        if(now===null?f.before!==null:f.before===null||!now.equals(f.before))throw Error('Sources changed during save. Reload and try again.');
      }
      const committed=[];
      try{
        for(const [name,f] of files){
          const file=path.join(this.root,name);
          await retryBusy(()=>f.after===null?fs.unlink(file):fs.rename(staged.get(name),file));
          committed.push(name);
        }
      }catch(error){
        const lost=[];
        for(const name of committed.reverse()){
          const file=path.join(this.root,name),before=files.get(name).before;
          try{await retryBusy(()=>before===null?fs.rm(file,{force:true}):fs.writeFile(file,before));}catch{lost.push(name);}
        }
        if(lost.length)error.message+=` Could not put back ${lost.join(', ')}; restore them from ${backup}.`;
        throw error;
      }
    }finally{for(const file of staged.values())await fs.rm(file,{force:true}).catch(()=>{});}
    return backup;
  }
}
