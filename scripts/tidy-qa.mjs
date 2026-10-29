// One-time tidy of the .qa working folder (maintenance/Tidy-QA-Folder.cmd).
// Dropbox syncs the project folder, so the number of files there matters:
// - older backups in .qa/item-backups and .qa/guide-backups were folders of
//   loose files; each becomes one .zip like the backups the tools write now;
// - other folders in .qa are working copies of the whole project left by
//   earlier versions of the tools (deletion previews, pull request checkouts).
//   Nothing uses them; they are removed unless Git shows work in them that is
//   not on GitHub.
// The pending catalog edits and the other loose files in .qa are not touched.
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import {fileURLToPath} from 'node:url';
import {writeZip,readZip} from './zip-archive.mjs';
import {tool,run} from './publish-tools.mjs';

export const backupFolders=['item-backups','guide-backups'];
const archiveName=name=>String(name).replaceAll('\\','/');
async function listFiles(directory,prefix=''){
  const files=[];
  for(const entry of await fs.readdir(directory,{withFileTypes:true})){
    const file=path.join(directory,entry.name),name=prefix+entry.name;
    if(entry.isDirectory())files.push(...await listFiles(file,name+'/'));
    else if(entry.isFile())files.push({name,file});
  }
  return files;
}
// The archive entries for one old backup folder, named as the tools name them now.
export async function backupEntries(kind,folder){
  const files=await listFiles(folder),read=async f=>({bytes:await fs.readFile(f.file),date:(await fs.stat(f.file)).mtime});
  if(kind==='guide-backups')return Promise.all(files.map(async f=>({name:f.name.includes('/')?f.name:'study-guides/'+f.name,...await read(f)})));
  const manifestFile=files.find(f=>f.name==='manifest.json');
  let manifest=null;
  try{manifest=manifestFile&&JSON.parse(await fs.readFile(manifestFile.file,'utf8'));}catch{}
  if(!Array.isArray(manifest?.files))return Promise.all(files.map(async f=>({name:f.name,...await read(f)})));
  const entries=[{name:'manifest.json',bytes:JSON.stringify({...manifest,files:manifest.files.map(f=>({...f,name:archiveName(f.name)}))},null,2),date:(await fs.stat(manifestFile.file)).mtime}];
  for(const f of files){
    if(f===manifestFile)continue;
    const source=/^\d+$/.test(f.name)?manifest.files[Number(f.name)]?.name:null;
    entries.push({name:source?archiveName(source):f.name,...await read(f)});
  }
  return entries;
}
// Zip one old backup folder beside itself, check the archive, then remove the folder.
export async function zipBackupFolder(kind,folder){
  const entries=await backupEntries(kind,folder),zip=folder+'.zip';
  try{await fs.access(zip);throw Error(`${zip} already exists.`);}catch(error){if(error.code!=='ENOENT')throw error;}
  await writeZip(zip,entries);
  const back=await readZip(zip);
  if(back.size!==entries.length||entries.some(e=>!back.get(e.name)?.equals(Buffer.isBuffer(e.bytes)?e.bytes:Buffer.from(e.bytes))))throw Error(`${zip} did not read back correctly; ${folder} was kept.`);
  await fs.rm(folder,{recursive:true,force:true,maxRetries:5});
  return zip;
}
async function countFiles(directory){
  let count=0;const pending=[directory];
  while(pending.length){
    const dir=await fs.opendir(pending.pop());
    for await(const entry of dir){if(entry.isDirectory())pending.push(path.join(dir.path,entry.name));else count++;}
  }
  return count;
}
// Work a leftover folder holds that is not on GitHub: changed tracked files or
// commits not on any remote branch, in it or in its repo/ subfolder.
async function unpublishedWork(folder,git){
  const notes=[];
  for(const candidate of [folder,path.join(folder,'repo')]){
    try{await fs.access(path.join(candidate,'.git'));}catch{continue;}
    try{
      if(await run(git,['-C',candidate,'status','--porcelain','--untracked-files=no'],candidate,true))notes.push(`${path.basename(candidate)} has changed files`);
      if(await run(git,['-C',candidate,'rev-list','-n','1','HEAD','--not','--remotes'],candidate,true))notes.push(`${path.basename(candidate)} has commits that are not on GitHub`);
    }catch(error){notes.push('Git could not check it ('+error.message.split('\n')[0]+')');}
  }
  return notes;
}
export async function planTidy(root,{git='git',count=true}={}){
  const qa=path.join(root,'.qa'),backups=[],leftovers=[];
  let entries;
  try{entries=await fs.readdir(qa,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return {qa,backups,leftovers};throw error;}
  for(const entry of entries.filter(e=>e.isDirectory())){
    const folder=path.join(qa,entry.name);
    if(backupFolders.includes(entry.name)){
      for(const backup of await fs.readdir(folder,{withFileTypes:true}))if(backup.isDirectory())backups.push({kind:entry.name,folder:path.join(folder,backup.name)});
    }else leftovers.push({folder,files:count?await countFiles(folder):null,keep:await unpublishedWork(folder,git)});
  }
  return {qa,backups,leftovers};
}
export async function tidy(plan,{git='git',root,log=console.log}={}){
  for(const {kind,folder} of plan.backups){
    try{log('Zipped '+path.relative(plan.qa,await zipBackupFolder(kind,folder)));}
    catch(error){log(`Kept ${path.relative(plan.qa,folder)}: ${error.message}`);}
  }
  let removed=false;
  for(const {folder,keep} of plan.leftovers){
    if(keep.length)continue;
    log(`Removing ${path.relative(plan.qa,folder)} ...`);
    try{await fs.rm(folder,{recursive:true,force:true,maxRetries:5});removed=true;}
    catch(error){log(`Could not remove all of ${path.relative(plan.qa,folder)}: ${error.message}. Close programs using it and run the tool again.`);}
  }
  // A removed folder may have been a Git worktree of the project; forget it.
  if(removed&&root)try{await run(git,['worktree','prune'],root,true);}catch{}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),git=await tool('git',root);
  console.log('Looking through .qa (counting files in large folders can take a few minutes) ...');
  const plan=await planTidy(root,{git});
  if(!plan.backups.length&&!plan.leftovers.length){console.log('Nothing to tidy: .qa holds no loose backup folders or old working copies.');process.exit(0);}
  if(plan.backups.length)console.log(`\n${plan.backups.length} older backup folder(s) in item-backups and guide-backups will each become one .zip (nothing is lost).`);
  const remove=plan.leftovers.filter(l=>!l.keep.length),kept=plan.leftovers.filter(l=>l.keep.length);
  if(remove.length){
    console.log('\nThese old working copies left by earlier versions of the tools are not used and will be removed:');
    for(const l of remove)console.log(`  ${path.basename(l.folder)}  (${l.files.toLocaleString('en')} files)`);
  }
  if(kept.length){
    console.log('\nThese folders are kept because they may hold work that is not on GitHub:');
    for(const l of kept)console.log(`  ${path.basename(l.folder)}: ${l.keep.join('; ')}`);
  }
  const prompt=readline.createInterface({input:process.stdin,output:process.stdout});
  const answer=await prompt.question('\nGo ahead? Type Y and press Enter: ');prompt.close();
  if(answer.trim().toUpperCase()!=='Y'){console.log('Nothing was changed.');process.exit(0);}
  await tidy(plan,{git,root});
  console.log('\nDone. Dropbox now syncs the removals; that can take a while.');
}
