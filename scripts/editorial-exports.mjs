import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const editorialFile=path.join(os.homedir(),'Downloads','subject-edits.json');

export async function readEditorialExport(file,optional=false){
  try{
    const value=JSON.parse(await fs.readFile(file,'utf8'));
    if(value?.format!==1||!value.matches||typeof value.matches!=='object'||Array.isArray(value.matches)||!Array.isArray(value.relationships))throw Error(`${file} is not a format 1 subject-edits.json file; it has not been changed.`);
    const stat=await fs.stat(file);
    return {file,value,time:Number.isFinite(value.subjectDecisionsModifiedAt)?value.subjectDecisionsModifiedAt:stat.mtimeMs};
  }catch(error){if(optional&&error.code==='ENOENT')return null;throw error;}
}

// Catalog saves update the canonical file's mtime, but do not make its subject
// decisions newer than a browser export such as subject-edits (2).json.
export async function editorialExports({file,pendingPath=editorialFile}={}){
  pendingPath=path.resolve(pendingPath);file=file?path.resolve(file):null;
  const canonical=await readEditorialExport(pendingPath,file!==pendingPath);
  if(!file){
    const folder=path.dirname(pendingPath);
    let names=[];try{names=await fs.readdir(folder,{withFileTypes:true});}catch(error){if(error.code!=='ENOENT')throw error;}
    const candidates=await Promise.all(names.filter(entry=>entry.isFile()&&/^subject-edits.*\.json$/i.test(entry.name)&&path.resolve(folder,entry.name)!==pendingPath).map(async entry=>{
      const name=path.join(folder,entry.name);return {file:name,time:(await fs.stat(name)).mtimeMs};
    }));
    file=candidates.sort((a,b)=>b.time-a.time)[0]?.file||null;
    const other=file?await readEditorialExport(file):null;
    return [canonical,other].filter(Boolean).sort((a,b)=>a.time-b.time);
  }
  // A file explicitly selected by the editor wins any subject-decision conflict.
  return [canonical,file!==pendingPath?await readEditorialExport(file):null].filter(Boolean);
}
