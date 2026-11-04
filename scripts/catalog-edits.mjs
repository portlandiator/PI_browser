// Catalog edits made with Edit-Catalog-Item.cmd wait in one pending file until
// Publish-Editorial-Decisions.cmd proposes them, together with any exported
// subject decisions, as a single pull request. Until then nothing changes in
// the project folder, the source folders or on GitHub. The pull request is
// built from the published archive in Git's object store, so no copy of the
// repository, no volume PDF and no local rebuild is involved: only the archive
// shards and data files that actually change are committed.
//
// Pending entries live in Downloads/subject-edits.json under `catalogEdits`:
//   {format: 1,
//    items: {ID: {action: 'edit', savedAt, state, fields, metadata, original, english, changed, unchanged}
//                | {action: 'delete', savedAt, state}},
//    pullRequest: {number, url, branch, openedAt, ids, decisions},   (after publishing)
//    publishedDecisions: [digest]}   (exported decisions already published)
// `state` is the content of the source files the entry was based on, and
// `unchanged` names the texts left as those files have them. After
// publishing, an entry carries `publishedIn` and `applied`, and stays until the
// pull request is merged (it is proposed again if the pull request is closed).
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {ItemStore,itemState,checkItemInput,validId,decode} from './item-store.mjs';
import {tool,run,capture,jobFolder,withLock,retryBusy} from './publish-tools.mjs';
import {githubTarget} from './github-target.mjs';
import {planDeletion,liveSite} from './catalog-deletion.mjs';
import {editorialFile,readEditorialExport} from './editorial-exports.mjs';
import {planTranslationCorrection} from './approved-translation-corrections.mjs';

const codeRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const pendingFile=editorialFile;
export const legacyPendingFile='.qa/pending-catalog-edits.json';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const languages=[['original','original_texts - copy','original text'],['english','translated_texts - copy','English translation']];

export class PendingCatalogEdits{
  constructor(root,{file=pendingFile}={}){this.root=path.resolve(root);this.file=path.resolve(file);}
  async read(){
    const exported=await readEditorialExport(this.file,true);
    let data=exported?.value.catalogEdits;
    if(data===undefined){
      try{data=JSON.parse(await fs.readFile(path.join(this.root,legacyPendingFile),'utf8'));}
      catch(error){if(error.code==='ENOENT')return {format:1,items:{}};throw error;}
    }
    if(data?.format!==1||!data.items||typeof data.items!=='object'||Array.isArray(data.items))throw Error(`${this.file} contains a pending-edits file this tool does not understand.`);
    return data;
  }
  async write(data){
    const exported=await readEditorialExport(this.file,true);
    const value={...(exported?.value||{format:1,matches:{},relationships:[]}),catalogEdits:data,subjectDecisionsModifiedAt:exported?.time??0};
    // Keep an empty catalogEdits section: discarding the last edit must not
    // delete subject decisions or reimport the unchanged legacy pending file.
    await fs.mkdir(path.dirname(this.file),{recursive:true});
    const temporary=this.file+'.'+randomUUID().slice(0,8)+'.tmp';
    await fs.writeFile(temporary,JSON.stringify(value,null,2)+'\n');
    // A sync client may hold a freshly written file for a moment.
    try{await retryBusy(()=>fs.rename(temporary,this.file));}
    catch(error){await fs.rm(temporary,{force:true});throw error;}
  }
  // Read, change and write the file as one step. The editor and this tool are
  // separate processes, so a lock keeps one from overwriting the other's change.
  async update(change){
    return withLock(this.lockFile,async()=>{const data=await this.read();const result=await change(data);await this.write(data);return result;},{wait:15000,busy:`Another tool is still writing ${this.file}. Try again in a moment.`});
  }
  get lockFile(){return path.join(os.tmpdir(),'pi-browser-locks',sha(Buffer.from(this.file.toLowerCase(),'utf8')).slice(0,16)+'.lock');}
  async get(id){return (await this.read()).items[id]||null;}
  async set(id,entry){await this.update(data=>{data.items[id]=entry;});}
  async remove(id){return this.update(data=>{const had=Boolean(data.items[id]);delete data.items[id];return had;});}
}

// What differs between two versions of an item, for people: changed metadata
// columns, then each text that was added, changed or removed.
export function describeChanges(before,after){
  const changed=Object.keys(after.metadata).filter(field=>field!=='PIN'&&(before.metadata[field]??'')!==(after.metadata[field]??''));
  for(const [language,,label] of languages){
    if((before[language]??null)===(after[language]??null))continue;
    changed.push(`${label} ${after[language]===null?'removed':before[language]==null?'added':'changed'}`);
  }
  return changed;
}
const pendingView=entry=>entry?{action:entry.action,savedAt:entry.savedAt,changed:entry.changed||[],publishedIn:entry.publishedIn||null,applied:entry.applied||null}:null;

// The editor's view of the catalog: source items with their pending edits.
export class CatalogEdits{
  constructor(root,options){this.root=path.resolve(root);this.store=new ItemStore(root);this.pending=new PendingCatalogEdits(root,options);}
  view(current,entry){
    const item={...current,pending:pendingView(entry)};
    return entry?.action==='edit'?{...item,metadata:entry.metadata,original:entry.original,english:entry.english}:item;
  }
  // The item as the editor shows it: its pending edit when there is one,
  // otherwise the source files. `state` always describes the source files.
  async load(id){
    const current=await this.store.load(id);
    return this.view(current,await this.pending.get(id));
  }
  // Record an edit. The source files are not changed.
  async save(input){
    const current=await this.store.load(input.id);
    if(current.state!==input.state)throw Error('The source files changed since this item was opened. Reload before saving; nothing was recorded.');
    checkItemInput(input,current.fields,current.id);
    const changed=describeChanges(current,input);
    if(!changed.length){await this.pending.remove(current.id);return {...this.view(current,null),note:'This matches the source files; nothing is pending for this item.'};}
    const unchanged=languages.filter(([language])=>(input[language]??null)===(current[language]??null)).map(([language])=>language);
    const entry={action:'edit',savedAt:new Date().toISOString(),state:current.state,fields:current.fields,metadata:input.metadata,original:input.original,english:input.english,changed,unchanged};
    await this.pending.set(current.id,entry);
    return this.view(current,entry);
  }
  async discard(id){
    if(!validId(id))throw Error('Enter an exact catalog ID, without a file extension.');
    const entry=await this.pending.get(id);
    await this.pending.remove(id);
    let current=null;try{current=await this.store.load(id);}catch{}
    return {...(current?this.view(current,null):{id,pending:null}),discarded:pendingView(entry)};
  }
  async clear(){
    return this.pending.update(data=>{
      const cleared=Object.keys(data.items).length;
      data.items={};
      // Keep publication tracking: clearing drafts cannot undo a pull request
      // or the changes already applied to the source folders.
      return {cleared};
    });
  }
  // Record a deletion. The source files are not changed.
  async markDeletion(id){
    if(!validId(id))throw Error('Enter an exact catalog ID, without a file extension.');
    let current=null;try{current=await this.store.load(id);}catch(error){if(!/^No source item/.test(error.message))throw error;}
    const entry={action:'delete',savedAt:new Date().toISOString(),state:current?.state??null};
    await this.pending.set(id,entry);
    return current?this.view(current,entry):{id,pending:pendingView(entry)};
  }
  async list(){
    const data=await this.pending.read();
    return {file:this.pending.file,pullRequest:data.pullRequest||null,items:Object.entries(data.items).map(([id,entry])=>({id,...pendingView(entry)}))};
  }
}

// Repository files as published on GitHub, read from the fetched branch in
// Git's object store: no checkout. `overlay` holds files changed earlier in the
// same plan (null for a removed file).
// Each file is read from Git once (`ref` names one fixed commit).
export function publishedFiles(root,git,ref,overlay=new Map()){
  const blobs=new Map(),listings=new Map();
  const load=async name=>{
    try{return await capture(git,['-C',root,'cat-file','blob',`${ref}:${name}`],root);}
    catch(error){if(/does not exist in|Not a valid object name|not in the tree/i.test(error.message))return null;throw error;}
  };
  const read=async name=>{
    if(overlay.has(name)){const value=overlay.get(name);return value===null?null:Buffer.isBuffer(value)?value:Buffer.from(value,'utf8');}
    if(!blobs.has(name))blobs.set(name,load(name).catch(error=>{blobs.delete(name);throw error;}));
    return blobs.get(name);
  };
  const list=directory=>{
    directory=directory.replace(/\/?$/,'/');
    if(!listings.has(directory))listings.set(directory,run(git,['-C',root,'-c','core.quotePath=false','ls-tree','--name-only',ref,directory],root,true).then(out=>out.split('\n').filter(Boolean).map(name=>path.posix.basename(name))).catch(error=>{listings.delete(directory);throw error;}));
    return listings.get(directory).then(names=>[...names]);
  };
  return {read,list,overlay};
}
export async function fetchMain(root,git){await run(git,['-C',root,'fetch','--quiet','--no-tags','origin','main'],root,true);return 'origin/main';}

const planSummary=plan=>({id:plan.id,published:plan.published,title:plan.title,subjects:plan.subjects,quotations:plan.quotations,removedIds:plan.removedIds,guides:plan.guides});
// What deleting the item would remove, read from GitHub and the website
// without changing anything.
export async function previewDeletion(root,id){
  root=path.resolve(root);
  if(!validId(id))throw Error('Enter an exact catalog ID, without a file extension.');
  const git=await tool('git',root),gh=await tool('gh',root);
  const target=await githubTarget(root,{gh,git});
  const ref=await fetchMain(root,git);
  const plan=await planDeletion({id,...publishedFiles(root,git,ref),site:liveSite(target.site)});
  let local=false;try{await new ItemStore(root).load(id);local=true;}catch{}
  return {...planSummary(plan),local};
}

const shardDigit=name=>sha(Buffer.from(name,'utf8'))[0];
const b64=bytes=>Buffer.from(bytes).toString('base64');
const fromB64=text=>Buffer.from(text,'base64');

// Everything the pending edits change in the published repository: the
// patched archive shards and, for deletions, the quotation and study-guide
// files. Files are written under `stage`; `blobs` maps each repository path to
// its file there. Entries that cannot be published now are listed in
// `skipped` with the reason and stay pending.
export async function prepareCatalogProposal({root,git,python,entries,files,site,stage}){
  const collection=path.join(stage,'collection'),changes=path.join(stage,'changes');
  await fs.mkdir(collection,{recursive:true});await fs.mkdir(changes,{recursive:true});
  const ids=Object.keys(entries);
  const shards=[...new Set(['metadata.tar',...ids.flatMap(id=>['original','translated'].map(prefix=>`${prefix}-${shardDigit(id+'.txt')}.tar`))])];
  for(const name of shards){
    const bytes=await files.read('data/collection/'+name);
    if(!bytes)throw Error(`The published source archive has no ${name}. Run Update-Collection.cmd first.`);
    await fs.writeFile(path.join(collection,name),bytes);
  }
  const patcher=path.join(codeRoot,'scripts/patch-item-archive.py'),batchFile=path.join(stage,'batch.json'),publishedFile=path.join(stage,'published.json');
  await fs.writeFile(batchFile,JSON.stringify({items:Object.fromEntries(ids.map(id=>[id,{action:entries[id].action}]))}));
  await run(python,[patcher,'--archive',collection,'--batch',batchFile,'--inspect',publishedFile],stage,true);
  const published=JSON.parse(await fs.readFile(publishedFile,'utf8'));
  const batch={items:{}},edits=[],deletions=[],skipped=[],blobs=new Map(),corrections=new Map();
  const blob=async(name,value)=>{const file=path.join(changes,name.replaceAll('/','__'));await fs.writeFile(file,value);blobs.set(name,file);files.overlay.set(name,value);};
  // An item as the archive holds it, decoded for comparison.
  const view=(id,p)=>({metadata:p.metadata||Object.fromEntries(published.fields.map(field=>[field,field==='PIN'?id:''])),original:p.original===null?null:decode(fromB64(p.original)),english:p.english===null?null:decode(fromB64(p.english))});
  for(const id of ids){
    const entry=entries[id],p=published.items[id],inArchive=Boolean(p.metadata||p.original||p.english||p.withheld);
    if(entry.action==='delete'){
      // `archived`: in the published source archive; `published`: on the website.
      if(!inArchive){deletions.push({id,archived:false,published:false,local:entry.state!==null,subjects:[],quotations:0,removedIds:[],guides:[]});continue;}
      const plan=await planDeletion({id,read:files.read,list:files.list,site});
      for(const [name,value] of plan.changes)await blob(name,value);
      batch.items[id]={action:'delete'};
      deletions.push({...planSummary(plan),archived:true,local:entry.state!==null});
      continue;
    }
    if(!inArchive){skipped.push({id,reason:'not in the published catalog. Add new items with Update-Collection.cmd; this edit stays pending.'});continue;}
    if(JSON.stringify(entry.fields)!==JSON.stringify(published.fields)){skipped.push({id,reason:'the metadata columns differ from the published catalog. Use Update-Collection.cmd for a changed metadata schema.'});continue;}
    // Text the editor left as the source folder has it keeps its published
    // bytes (and so its version), also when that folder lacks a text the
    // archive holds; a text the folder holds and the archive lacks is offered
    // for the publication policy to decide. Changed text is stored in UTF-8.
    const before=view(id,p),texts={};
    for(const [language] of languages){
      if(entry.unchanged?.includes(language)&&p[language]!==null){texts[language]=p[language];continue;}
      texts[language]=entry[language]===null?null:p[language]!==null&&before[language]===entry[language]?p[language]:b64(Buffer.from(entry[language],'utf8'));
    }
    if(texts.english!==p.english&&texts.english!==null&&p.english!==null){
      const correction=await planTranslationCorrection({id,before:fromB64(p.english),after:fromB64(texts.english),read:files.read,list:files.list,site});
      for(const [name,value] of correction.changes)await blob(name,value);
      corrections.set(id,correction);
    }
    batch.items[id]={action:'edit',metadata:entry.metadata,...texts};
  }
  if(Object.keys(batch.items).length){
    await fs.writeFile(batchFile,JSON.stringify(batch));
    // The patched shards, and what each item holds afterwards (after the
    // publication policy), in one run.
    const afterFile=path.join(stage,'after.json');
    const report=JSON.parse(await run(python,[patcher,'--archive',collection,'--batch',batchFile,'--report',afterFile],stage,true));
    for(const name of report.changed)blobs.set('data/collection/'+name,path.join(collection,name));
    const after=JSON.parse(await fs.readFile(afterFile,'utf8'));
    for(const [id,item] of Object.entries(batch.items)){
      if(item.action!=='edit')continue;
      const changed=describeChanges(view(id,published.items[id]),view(id,after.items[id]));
      if(changed.length)edits.push({id,changed,...corrections.has(id)&&{quotations:corrections.get(id).quotations}});else skipped.push({id,reason:'already matches the published catalog.',applyOnly:true});
    }
  }
  const byId=(a,b)=>a.id.localeCompare(b.id);
  return {edits:edits.sort(byId),deletions:deletions.sort(byId),skipped:skipped.sort(byId),blobs,overlay:files.overlay};
}

// The pull request description for the catalog part of a publication.
export function catalogBody({edits,deletions,skipped}){
  const plural=(n,word)=>`${n} ${word}${n===1?'':'s'}`;
  const lines=['Catalog edits saved with Edit-Catalog-Item.cmd on the editor’s computer and published with Publish-Editorial-Decisions.cmd. Only these items change in the source archive (`data/collection`); the original-text publication policy was applied. Volume PDFs are unchanged.'];
  if(edits.length)lines.push(`**Corrections (${edits.length}):**\n`+edits.map(e=>`- \`${e.id}\`: ${e.changed.join('; ')}${e.quotations?`; ${plural(e.quotations,'quotation reference')} updated with the approved translation correction`:''}`).join('\n'));
  const removed=deletions.map(d=>{
    const head=`- \`${d.id}\`${d.title?' ('+d.title+')':''}: `;
    if(!d.archived)return head+'not in the published catalog; only the source files on the editor’s computer are removed.';
    const detail=[d.subjects.length?`${plural(d.quotations,'quotation')} removed from ${plural(d.subjects.length,'subject')}: ${d.subjects.map(s=>`${s.name} (${s.removed})`).join(', ')}`:'no subject compilation quoted it'];
    if(d.guides.length)detail.push('study guides changed:\n'+d.guides.map(g=>`  - ${g.title}\n${g.notes.map(n=>'    - '+n).join('\n')}`).join('\n'));
    return head+detail.join('; ');
  });
  if(removed.length)lines.push(`**Deletions (${removed.length}):**\n`+removed.join('\n'));
  if(skipped.length)lines.push('Not included (still pending on the editor’s computer):\n'+skipped.map(s=>`- \`${s.id}\`: ${s.reason}`).join('\n'));
  lines.push('Translation corrections are approved for propagation to existing subject quotations and study guides. GitHub builds and tests this pull request before it is merged, reconciles the affected study guides, and pushes their refreshed references to this pull request.');
  return lines.join('\n\n');
}

// Pending entries that would overwrite source files changed since they were
// saved are not published: the editor must look at them first.
export async function conflictingEntries(root,entries){
  const store=new ItemStore(root),conflicts=[];
  for(const [id,entry] of Object.entries(entries)){
    if(entry.action!=='edit')continue;
    let current;
    try{current=await store.snapshot(id);}catch(error){conflicts.push({id,reason:error.message});continue;}
    if(current.state!==entry.state&&current.trimmedState!==entry.state&&itemState(current)!==itemState(entry))conflicts.push({id,reason:'its source files changed on this computer since the edit was saved. Open it in Edit-Catalog-Item.cmd, check it and save again; this edit stays pending.'});
  }
  return conflicts;
}

// Write the published edits to this computer’s source folders, so that a
// later full collection update cannot undo them, and remove deleted items. All
// items go in one write: the metadata CSV is rewritten and backed up once, and
// if any file cannot be replaced, none is. An edit is written only over the
// source files it was saved from (or is already there). Returns one note per
// item; `failed` marks an item that was not written.
export async function applyLocally(root,entries){
  const ids=Object.keys(entries);
  if(!ids.length)return [];
  const changes=ids.map(id=>{const e=entries[id];return e.action==='delete'?{id,action:'delete'}:{id,action:'edit',state:e.state,input:{metadata:e.metadata,original:e.original,english:e.english}};});
  let outcome;
  try{outcome=await new ItemStore(root).applyBatch(changes);}
  catch(error){return ids.map(id=>({id,backup:null,failed:true,text:`${id} was not written to the source folders: ${error.message}`}));}
  const {backup,results}=outcome;
  return results.map(({id,status,reason})=>{
    if(status==='written')return {id,backup,text:`Wrote ${id} to the source folders. Backup: ${backup}`};
    if(status==='removed')return {id,backup,text:`Removed ${id} from the source folders. Backup: ${backup}`};
    if(status==='unchanged')return {id,backup:null,text:`${id} already holds this edit in the source folders.`};
    if(status==='absent')return {id,backup:null,text:`${id} was not in the source folders.`};
    return {id,backup:null,failed:true,text:`${id} was not written to the source folders: ${reason}`};
  });
}

// The pull request of the previous publication: merged, its entries are done
// (except an edit this computer's source folders could not take, which stays
// pending so the next run writes it there) and its exported decisions count as
// published; closed without merging, they are proposed again; still open, wait.
export async function settlePullRequest(pending,{gh,repository,root,execute=run}){
  const pr=(await pending.read()).pullRequest;
  if(!pr)return null;
  let state;
  try{state=JSON.parse(await execute(gh,['pr','view',String(pr.number),'--repo',repository,'--json','state'],root,true)).state;}
  catch(error){throw Error(`Could not check pull request #${pr.number} (${pr.url}): ${error.message}`);}
  if(state==='OPEN')throw Error(`Pull request #${pr.number} with the previous catalog edits is still open:\n  ${pr.url}\nMerge or close it on GitHub first.`);
  const kept=await pending.update(data=>{
    // Settled once, by whichever run gets here first.
    if(data.pullRequest?.number!==pr.number)return [];
    const kept=[];
    for(const [id,entry] of Object.entries(data.items)){
      if(entry.publishedIn?.number!==pr.number)continue;
      // Merged and written here: done. Not (yet) written here: stays pending.
      if(state==='MERGED'&&entry.applied&&!entry.applied.failed){delete data.items[id];continue;}
      delete entry.publishedIn;
      if(state==='MERGED'){delete entry.applied;kept.push(id);}
    }
    if(state==='MERGED'&&data.pullRequest.decisions)data.publishedDecisions=[...new Set([...(data.publishedDecisions||[]),...data.pullRequest.decisions])];
    delete data.pullRequest;
    return kept;
  });
  console.log(state==='MERGED'?`Pull request #${pr.number} was merged; its changes are published.`:`Pull request #${pr.number} was closed without merging; its changes are proposed again.`);
  if(kept.length)console.log('Still to be written to this computer’s source folders: '+kept.join(', '));
  return state;
}

// A temporary folder for one publication, outside the project.
export async function withStage(work){
  const stage=path.join(await jobFolder(),'catalog-edits-'+randomUUID());
  await fs.mkdir(stage,{recursive:true});
  // Removed also when the work fails: the stage holds copies of archive shards.
  try{return await work(stage);}
  finally{await fs.rm(stage,{recursive:true,force:true,maxRetries:5,retryDelay:500}).catch(()=>console.log('Temporary files are still in '+stage+' because another program has them open.'));}
}
