import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {ItemStore,decode} from './item-store.mjs';
import {publicMetadata,mayPublishOriginal} from '../src/original-publication.mjs';
import {recordFilename} from '../src/record-file.mjs';
import {parseText} from '../src/text.mjs';
import assert from 'node:assert/strict';

const codeRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repository='portlandiator/PI_browser',remote='https://github.com/'+repository+'.git';
export async function tool(name,root){
  const runtime=path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies');
  const candidates=name==='python'?[process.env.PI_EDITOR_PYTHON,path.join(runtime,'python/python.exe')]:name==='gh'?[process.env.PI_EDITOR_GH,path.join(root,'.tools/gh/bin/gh.exe')]:[];
  for(const candidate of candidates.filter(Boolean))try{await fs.access(candidate);return candidate;}catch{}
  return name;
}
export async function run(command,args,cwd,quiet=false){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd,windowsHide:true,stdio:['ignore','pipe','pipe']});let result='',diagnostic='';
    child.stdout.on('data',chunk=>{result+=chunk;if(!quiet)process.stdout.write(chunk);});
    child.stderr.on('data',chunk=>{diagnostic=(diagnostic+chunk).slice(-6000);if(!quiet)process.stderr.write(chunk);});
    child.on('error',reject);child.on('close',code=>code===0?resolve(result.trim()):reject(Error(`${path.basename(command)} ${args.slice(0,2).join(' ')} failed (${code}). ${diagnostic.trim()||result.trim().slice(-2000)||'No diagnostic output was returned.'}`)));
  });
}
export async function watchDeployment(gh,runId,repo,execute=run){
  const url=`https://github.com/${repository}/actions/runs/${runId}`;
  console.log('Deployment: '+url);
  try{await execute(gh,['run','watch',String(runId),'--repo',repository,'--interval','15','--exit-status'],repo);}
  catch(error){
    let detail=error.message;
    try{
      const report=JSON.parse(await execute(gh,['run','view',String(runId),'--repo',repository,'--json','status,conclusion,jobs'],repo,true));
      const failed=report.jobs.flatMap(job=>job.steps.filter(step=>step.conclusion==='failure').map(step=>job.name+': '+step.name));
      detail=failed.length?'Failed check: '+failed.join('; '):`Deployment status: ${report.status} (${report.conclusion||'pending'}). ${detail}`;
    }catch{}
    throw Error(`Your saved correction was uploaded, but publication could not be confirmed. ${detail}\nSee ${url}\nYour local edits and backups are preserved. Do not re-enter the correction.`);
  }
}
export async function publishItem(root,id,revision){
  root=path.resolve(root);
  const store=new ItemStore(root),snapshot=await store.snapshot(id);
  if(snapshot.revision!==revision)throw Error('Sources changed. Reload this item before publishing.');
  const qa=path.join(root,'.qa');await fs.mkdir(qa,{recursive:true});
  const lockFile=path.join(qa,'item-publish.lock');let lock;
  try{lock=await fs.open(lockFile,'wx');}catch{throw Error('Another item publication is running. If it was interrupted, close the editor and remove .qa/item-publish.lock before retrying.');}
  const stage=path.join(qa,'item-publish-'+randomUUID()),repo=path.join(stage,'repo'),input=path.join(stage,'source');
  let success=false;
  try{
    console.log('Snapshotting the saved item. Other local items will not be uploaded.');
    for(const [i,name] of snapshot.names.entries()){
      await fs.mkdir(path.dirname(path.join(input,name)),{recursive:true});
      if(snapshot.bytes[i]!==null)await fs.writeFile(path.join(input,name),snapshot.bytes[i]);
    }
    const gh=await tool('gh',root),python=await tool('python',root);
    await run('git',['clone','--shared','--no-checkout',root,repo],root);
    await run('git',['remote','set-url','origin',remote],repo);
    await run('git',['config','core.sparseCheckout','true'],repo);
    await fs.mkdir(path.join(repo,'.git/info'),{recursive:true});
    await fs.writeFile(path.join(repo,'.git/info/sparse-checkout'),'/data/collection.tar.gz\n');
    await run('git',['fetch','--no-tags','origin','main'],repo);
    await run('git',['checkout','-B','main','FETCH_HEAD'],repo);
    const nextEnglish=snapshot.bytes[2]===null?undefined:createHash('sha256').update(snapshot.bytes[2]).digest('hex');
    for(const file of ['data/subject-edits.json','data/extract-review-decisions.json']){
      const decisions=JSON.parse(await run('git',['show','HEAD:'+file],repo,true));
      function check(value){
        if(!value||typeof value!=='object')return;
        if(value.source===id&&Array.isArray(value.ranges)&&value.version!==nextEnglish)throw Error('Saved locally, but this English text is referenced by reviewed subject quotations. Those references need review against the corrected text before publication. No change has been pushed.');
        for(const child of Object.values(value))if(typeof child==='object')check(child);
      }
      check(decisions);
    }
    console.log('Preparing the current published archive with this item only.');
    await run(python,[path.join(codeRoot,'scripts/patch-item-archive.py'),'--root',input,'--archive',path.join(repo,'data/collection.tar.gz'),'--id',id],repo);
    await run(python,[path.join(codeRoot,'scripts/archive-sources.py'),'--root',repo,'--check'],repo);
    const status=await run('git',['status','--porcelain'],repo);
    if(!status)console.log('This item already matches the uploaded source. Checking deployment and the live item.');
    else{
    if(status.split('\n').some(line=>!line.endsWith('data/collection.tar.gz')))throw Error('Unexpected files changed in the isolated publication checkout.');
    const account=JSON.parse(await run(gh,['api','user','--jq','{login,id}'],repo));
    await run('git',['add','--','data/collection.tar.gz'],repo);
    await run('git',['-c','user.name='+account.login,'-c',`user.email=${account.id}+${account.login}@users.noreply.github.com`,'commit','-m','Correct catalog item '+id],repo);
    // A concurrent update rejects this ordinary push. Never overwrite remote history.
    await run('git',['push','origin','HEAD:main'],repo);
    }
    const sha=await run('git',['rev-parse','HEAD'],repo);
    console.log('Waiting for the build, validation and Pages deployment.');
    let runId;
    for(let attempt=0;attempt<30;attempt++){
      const runs=JSON.parse(await run(gh,['run','list','--repo',repository,'--workflow','pages.yml','--commit',sha,'--limit','1','--json','databaseId'],repo));
      if(runs.length){runId=runs[0].databaseId;break;}await new Promise(resolve=>setTimeout(resolve,4000));
    }
    if(!runId)throw Error('The commit was uploaded, but GitHub has not started its workflow. Check repository Actions.');
    await watchDeployment(gh,runId,repo);
    const site='https://portlandiator.github.io/PI_browser/';
    const statsResponse=await fetch(site+'stats.json?item-update='+sha);if(!statsResponse.ok)throw Error('Cannot verify the published manifest.');
    const stats=await statsResponse.json(),response=await fetch(site+stats.dataset+'data/'+recordFilename(id));
    if(!response.ok)throw Error('Cannot verify the published item.');
    const record=JSON.parse(gunzipSync(Buffer.from(await response.arrayBuffer())));
    if(snapshot.rows.some(row=>row.PIN===id))assert.deepEqual({...record.metadata,...record.metadataOriginalValues},publicMetadata(snapshot.metadata),'Published metadata does not match the saved item');
    const expectedEnglish=snapshot.bytes[2]===null?undefined:createHash('sha256').update(snapshot.bytes[2]).digest('hex');
    assert.equal(record.enVersion,expectedEnglish,'Published translation does not match the saved text');
    assert.equal(record.hasOriginal,snapshot.bytes[1]!==null&&mayPublishOriginal(snapshot.metadata),'Published original availability differs');
    if(record.hasOriginal)assert.deepEqual(record.original,parseText(decode(snapshot.bytes[1]),'original'),'Published original differs');
    console.log('Published and verified: '+site+'?id='+encodeURIComponent(id));success=true;
  }finally{
    await lock.close();await fs.unlink(lockFile);
    // Keep failed jobs for diagnosis; remove only this verified transient directory.
    if(success&&path.dirname(stage)===qa&&/^item-publish-[a-f0-9-]+$/.test(path.basename(stage))){
      try{await fs.rm(stage,{recursive:true,force:true,maxRetries:5,retryDelay:500});}
      catch{console.log('Publication succeeded. Temporary files are still in '+stage+' because another program has them open.');}
    }
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [root,id,revision]=process.argv.slice(2);
  publishItem(root,id,revision).catch(error=>{console.error(error.message);process.exitCode=1;});
}
