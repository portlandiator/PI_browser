import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

async function ordinaryDirectory(directory){
  const stat=await fs.lstat(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink()||path.relative(directory,await fs.realpath(directory)))throw Error('Unsafe collection directory: '+directory);
}

async function readReference(out,name,required=false){
  const file=path.join(out,name);
  try{
    const stat=await fs.lstat(file);
    if(!stat.isFile()||stat.isSymbolicLink())throw Error('Unsafe collection reference: '+file);
    const value=JSON.parse(await fs.readFile(file,'utf8')).dataset;
    if(value!==undefined&&!/^collections\/[\w-]+\/$/.test(value))throw Error('Invalid dataset path in '+name);
    if(required&&!value)throw Error('Missing dataset path in '+name);
    return value;
  }catch(error){if(!required&&error.code==='ENOENT')return;throw error;}
}

async function validateTree(directory){
  for(const entry of await fs.readdir(directory,{withFileTypes:true})){
    const target=path.join(directory,entry.name);
    if(entry.isSymbolicLink()||(!entry.isDirectory()&&!entry.isFile()))throw Error('Unsafe collection entry: '+target);
    if(entry.isDirectory()){await ordinaryDirectory(target);await validateTree(target);}
  }
}

async function prune(out){
  await ordinaryDirectory(out);
  const parent=path.join(out,'collections');await ordinaryDirectory(parent);
  const dataset=await readReference(out,'stats.json',true);
  for(const name of ['build-state.json','study-guides/manifest.json']){
    const other=await readReference(out,name);
    if(other&&other!==dataset)throw Error('Collection references disagree; finish or repair the build before cleanup: '+name);
  }
  const active=path.resolve(out,dataset);
  if(path.dirname(active)!==parent)throw Error('Active collection escapes the generated directory');
  await ordinaryDirectory(active);
  for(const name of ['catalog.json.gz','metadata-schema.json','subjects/index.json.gz']){
    const file=path.join(active,name),stat=await fs.lstat(file);
    if(!stat.isFile()||stat.isSymbolicLink())throw Error('Incomplete active collection: '+file);
  }
  const targets=[];
  // Validate every target before deleting anything, and never traverse links.
  for(const entry of await fs.readdir(parent,{withFileTypes:true})){
    if(entry.name===path.basename(active))continue;
    const target=path.resolve(parent,entry.name);
    if(path.dirname(target)!==parent)throw Error('Obsolete collection escapes the generated directory');
    await ordinaryDirectory(target);await validateTree(target);targets.push(target);
  }
  const removed=[];
  for(const target of targets){
    if(await readReference(out,'stats.json',true)!==dataset)throw Error('The active dataset changed during cleanup');
    await ordinaryDirectory(target);
    await fs.rm(target,{recursive:true,force:false});removed.push(path.basename(target));
  }
  return {dataset,removed};
}

// A build, refresh or cleanup owns this lock until its final manifest is ready.
// Interrupted processes leave a visible lock rather than risk deleting another
// process's unfinished generation. Normal failures release it in finally.
export async function beginCollectionUpdate(root){
  root=path.resolve(root);await ordinaryDirectory(root);
  const out=path.join(root,'dist');
  await fs.mkdir(out).catch(error=>{if(error.code!=='EEXIST')throw error;});
  await ordinaryDirectory(out);
  const file=path.join(out,'.collection-update.lock'),token=JSON.stringify({pid:process.pid,token:randomUUID()});
  let handle;
  try{handle=await fs.open(file,'wx');}
  catch(error){if(error.code==='EEXIST')throw Error('Another collection build, refresh or cleanup owns '+file+'. If a process was interrupted, verify it has stopped before removing its lock.');throw error;}
  try{await handle.writeFile(token);}catch(error){await handle.close();await fs.unlink(file);throw error;}
  let closed=false;
  return {
    async prune(){if(closed)throw Error('Collection update is already closed');return prune(out);},
    async close(){if(closed)return;closed=true;await handle.close();if(await fs.readFile(file,'utf8')===token)await fs.unlink(file);},
  };
}

export async function pruneCollections(root){
  const update=await beginCollectionUpdate(root);
  try{return await update.prune();}finally{await update.close();}
}
