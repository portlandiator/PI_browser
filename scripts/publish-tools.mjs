// Shared pieces of the publishing tools: the bundled Windows tools, a
// temporary job folder outside the project, running commands, and opening a
// pull request from a commit. Nothing here pushes to main.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn,execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';

export async function tool(name,root){
  const runtime=path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies');
  const candidates=name==='python'?[process.env.PI_EDITOR_PYTHON,path.join(runtime,'python/python.exe')]:name==='gh'?[process.env.PI_EDITOR_GH,path.join(root,'.tools/gh/bin/gh.exe')]:name==='git'?[path.join(runtime,'native/git/cmd/git.exe')]:[];
  for(const candidate of candidates.filter(Boolean))try{await fs.access(candidate);return candidate;}catch{}
  return name;
}
// Temporary files live outside the project folder. Inside a Dropbox (or
// OneDrive) folder the sync client briefly locks files Git has just written,
// so Git's next write to the same file fails with "Permission denied", and
// syncing throwaway output wastes time and space.
export async function jobFolder(){
  const folder=path.join(os.tmpdir(),'pi-browser-jobs');
  await fs.mkdir(folder,{recursive:true});
  return folder;
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Retry a file operation that a sync client or virus scanner briefly blocks
// (Windows reports EPERM, EBUSY or EACCES while another program has the file).
export async function retryBusy(operation,attempts=6){
  for(let attempt=0;;attempt++){
    try{return await operation();}
    catch(error){if(attempt>=attempts-1||!['EPERM','EBUSY','EACCES'].includes(error.code))throw error;await sleep(250*(attempt+1));}
  }
}
// A lock file names the process holding it. A lock whose process has ended is
// taken over; a live one makes the caller wait up to `wait` ms, then fail.
async function lockHolder(file){
  try{return JSON.parse(await fs.readFile(file,'utf8'));}
  catch(error){
    if(error.code==='ENOENT')return null;
    // Being written right now, or left half-written by a crash.
    const stat=await fs.stat(file).catch(()=>null);
    return stat&&Date.now()-stat.mtimeMs<10000?{pid:process.pid,token:'writing'}:{pid:-1,token:'damaged'};
  }
}
const alive=pid=>{if(!Number.isInteger(pid)||pid<=0)return false;try{process.kill(pid,0);return true;}catch(error){return error.code==='EPERM';}};
export async function withLock(file,work,{wait=0,busy='Another run holds '+file}={}){
  await fs.mkdir(path.dirname(file),{recursive:true});
  const token=randomUUID(),deadline=Date.now()+wait;
  for(;;){
    try{await fs.writeFile(file,JSON.stringify({pid:process.pid,token,since:new Date().toISOString()}),{flag:'wx'});break;}
    catch(error){if(error.code!=='EEXIST')throw error;}
    const holder=await lockHolder(file);
    if(holder&&!alive(holder.pid)){
      // Take over a lock left by a process that has ended, unless someone else just did.
      if((await lockHolder(file))?.token===holder.token)await fs.rm(file,{force:true});
      continue;
    }
    if(holder&&Date.now()>=deadline)throw Error(busy);
    await sleep(100);
  }
  try{return await work();}
  finally{if((await lockHolder(file))?.token===token)await fs.rm(file,{force:true}).catch(()=>{});}
}
export async function run(command,args,cwd,quiet=false,env=null){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd,windowsHide:true,stdio:['ignore','pipe','pipe'],...env&&{env:{...process.env,...env}}});let result='',diagnostic='';
    child.stdout.on('data',chunk=>{result+=chunk;if(!quiet)process.stdout.write(chunk);});
    child.stderr.on('data',chunk=>{diagnostic=(diagnostic+chunk).slice(-6000);if(!quiet)process.stderr.write(chunk);});
    child.on('error',reject);child.on('close',code=>code===0?resolve(result.trim()):reject(Error(`${path.basename(command)} ${args.slice(0,2).join(' ')} failed (${code}). ${diagnostic.trim()||result.trim().slice(-2000)||'No diagnostic output was returned.'}`)));
  });
}
// A command's complete standard output as bytes (for example a file read from
// a Git object), up to 512 MB.
export function capture(command,args,cwd){
  return new Promise((resolve,reject)=>execFile(command,args,{cwd,windowsHide:true,encoding:'buffer',maxBuffer:512*1024*1024},(error,stdout,stderr)=>{
    if(error){error.message=`${path.basename(command)} ${args.slice(0,2).join(' ')} failed. ${String(stderr).trim().slice(-2000)||error.message}`;reject(error);}
    else resolve(stdout);
  }));
}
// Push the committed change to a new branch and open a pull request against
// main. Nothing reaches main or the website until the pull request is merged.
// `ref` is the commit to propose (HEAD of `repo` by default); the maintenance
// tools use the `maintenance` prefix.
export async function openPullRequest({gh,git='git',repo,repository,prefix='maintenance',kind,id,title,body,ref='HEAD',bodyFile=path.join(path.dirname(repo),'pull-request.md'),execute=run}){
  const stamp=new Date().toISOString().replace(/\D/g,'').slice(0,14);
  const branch=`${prefix}/${kind}${id?'-'+id.replace(/[^\w-]+/g,'_'):''}-${stamp}`;
  // A new branch name: an ordinary push never overwrites remote history.
  await execute(git,['push','origin',ref+':refs/heads/'+branch],repo);
  let url;
  try{
    await fs.writeFile(bodyFile,body);
    url=(await execute(gh,['pr','create','--repo',repository,'--base','main','--head',branch,'--title',title,'--body-file',bodyFile],repo,true)).split('\n').at(-1).trim();
  }catch(error){
    // Leave no branch without a pull request behind: the next run pushes a new one.
    await execute(git,['push','--quiet','origin','--delete',branch],repo,true).catch(()=>{error.message+=` The branch ${branch} is still on GitHub; delete it there.`;});
    throw error;
  }
  console.log('Pull request: '+url);
  return {branch,url,number:Number(/\/pull\/(\d+)/.exec(url)?.[1])||null};
}
