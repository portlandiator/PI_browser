// Propose specific project files from this folder as a pull request. Used by
// the maintenance tools: only the named files are committed, on a new branch
// made from main, and nothing reaches main or the website until the pull
// request is merged on GitHub. This folder stays on main with its files as
// they are, so unrelated local work stays put.
//
//   node scripts/publish-changes.mjs --message "Title" [--kind NAME] [--body-file FILE] [--tool NAME] FILE...
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {run,capture,tool,openPullRequest,jobFolder} from './publish-tools.mjs';
import {githubTarget} from './github-target.mjs';

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let gitPath='git';
const git=(args,root,quiet=true,env=null)=>run(gitPath,['-C',root,...args],root,quiet,env);
const changedFiles=async(root,...range)=>(await git(['-c','core.quotePath=false','diff','--name-only',...range],root)).split('\n').filter(Boolean);

// Before changing anything: on main, no local commits, up to date with GitHub.
// A file whose local edit has since been merged on GitHub (it now matches
// main there) is brought up to date instead of blocking the update. A file
// edited again after its earlier edit was merged keeps the new edit on top of
// GitHub's version when the two merge without overlapping (`mergeLocalEdit`).
export async function prepareRepository(root,files){
  gitPath=await tool('git',root);
  const top=await git(['rev-parse','--show-toplevel'],root);
  if(path.resolve(top)!==path.resolve(root))throw Error('Run this from the project folder (the Git repository root).');
  if(await git(['rev-parse','--abbrev-ref','HEAD'],root)!=='main')throw Error('Switch this folder to the main branch first.');
  console.log('Checking GitHub for newer changes…');
  await git(['fetch','--quiet','origin','main'],root);
  if(await git(['log','--format=%H','origin/main..HEAD'],root))throw Error('This folder has local commits that are not on GitHub. Push or resolve them first.');
  const upstream=new Set(await changedFiles(root,'HEAD..origin/main'));
  const merged=[],edited=[];
  for(const file of (await changedFiles(root,'HEAD')).filter(file=>upstream.has(file))){
    try{await git(['diff','--quiet','origin/main','--',file],root);merged.push(file);}catch{edited.push(file);}
  }
  const blocking=[],rebased=new Map();
  for(const file of edited){
    const result=await mergeLocalEdit(root,file);
    if(result)rebased.set(file,result);else blocking.push(file);
  }
  if(blocking.length)throw Error('GitHub has newer versions of files that also have unpublished changes here:\n  '+blocking.slice(0,10).join('\n  ')+'\nIf a pull request for them is still open, merge or close it on GitHub first.');
  if(merged.length||rebased.size)await git(['checkout','HEAD','--',...merged,...rebased.keys()],root);
  let updated=false;
  try{await git(['merge','--ff-only','--quiet','origin/main'],root);updated=true;}
  catch{
    const remaining=(await changedFiles(root,'HEAD')).filter(file=>upstream.has(file));
    throw Error('GitHub has newer versions of files that also have unpublished changes here:\n  '+remaining.slice(0,10).join('\n  ')+'\nIf a pull request for them is still open, merge or close it on GitHub first.');
  }
  finally{
    // The local edit returns either way: merged with GitHub's version after
    // the update, or exactly as it was if the update did not happen.
    for(const [file,{local,combined}] of rebased)await fs.writeFile(path.join(root,file),await capture(gitPath,['-C',root,'cat-file','--filters','--path='+file,updated?combined:local],root));
  }
  if(rebased.size)console.log('Kept the local edits on top of GitHub’s newer version of:\n  '+[...rebased.keys()].slice(0,10).join('\n  '));
  const allowed=new Set(files.map(file=>file.replaceAll('\\','/')));
  const other=(await changedFiles(root,'HEAD')).filter(file=>!allowed.has(file));
  if(other.length)console.log('Other changed files in this folder are not included:\n  '+other.slice(0,10).join('\n  '));
}

// Merge this folder's edit of `file` (against HEAD) into GitHub's version.
// Returns the blobs of the local file and of the combined result, or null when
// the two change the same lines or the file was added or removed on one side.
async function mergeLocalEdit(root,file){
  const blob=async ref=>{try{return await git(['rev-parse','--verify','--quiet',ref+':'+file],root);}catch{return null;}};
  const base=await blob('HEAD'),theirs=await blob('origin/main');
  let local;try{await fs.access(path.join(root,file));local=await git(['hash-object','-w','--',file],root);}catch{return null;}
  if(!base||!theirs)return null;
  const folder=await fs.mkdtemp(path.join(await jobFolder(),'merge-'));
  try{
    const copies=[];
    for(const [name,object] of [['local',local],['base',base],['github',theirs]]){
      const copy=path.join(folder,name);copies.push(copy);
      await fs.writeFile(copy,await capture(gitPath,['-C',root,'cat-file','blob',object],root));
    }
    try{await git(['merge-file','-q','--',...copies],root);}catch{return null;}
    return {local,combined:await git(['hash-object','-w','--no-filters','--',copies[0]],root)};
  }finally{await fs.rm(folder,{recursive:true,force:true});}
}

// The pull request description: the tool's own account of the change, the
// files it touches, and what merging does.
export function pullRequestBody({body='',files,toolName}){
  return [body.trim(),
    'Files changed:\n'+files.map(file=>'- `'+file+'`').join('\n'),
    `Opened by ${toolName||'a maintenance tool'} (maintenance folder). Merging this pull request publishes the change: the website rebuilds and is checked automatically.`,
  ].filter(Boolean).join('\n\n')+'\n';
}

// Commit the named files on top of HEAD through a separate index, so that
// this folder's branch, index and working files are not touched; main itself
// never moves. `blobs` maps further repository paths to files prepared
// elsewhere (null removes the path), stored byte for byte. Returns the commit
// and the files it changes.
export async function proposalCommit(root,files,message,account,blobs=new Map()){
  const index=path.join(await jobFolder(),'pull-request-index-'+randomUUID()),env={GIT_INDEX_FILE:index};
  let sha;
  try{
    await git(['read-tree','HEAD'],root,true,env);
    if(files.length)await git(['add','-A','--',...files],root,true,env);
    for(const [name,source] of blobs){
      if(source===null){await git(['update-index','--force-remove','--',name],root,true,env);continue;}
      const object=await git(['hash-object','-w','--no-filters','--',source],root,true);
      await git(['update-index','--add','--cacheinfo',`100644,${object},${name}`],root,true,env);
    }
    const tree=await git(['write-tree'],root,true,env);
    sha=await git(['-c','user.name='+account.login,'-c',`user.email=${account.id}+${account.login}@users.noreply.github.com`,'commit-tree',tree,'-p','HEAD','-m',message],root,true,env);
  }finally{await fs.rm(index,{force:true});}
  return {sha,proposed:await changedFiles(root,'HEAD',sha)};
}

// The GitHub account that signs the proposal commit.
export async function githubAccount(root,gh){return JSON.parse(await run(gh,['api','user','--jq','{login,id}'],root,true));}

// Pull requests the maintenance tools opened that are still open on GitHub.
// Two of them could change the same files, so a tool waits for the earlier one
// to be merged or closed.
export async function openProposals(root,{gh,repository}){
  const open=JSON.parse(await run(gh,['pr','list','--repo',repository,'--state','open','--limit','100','--json','number,url,title,headRefName'],root,true));
  return open.filter(pr=>/^(maintenance|catalog)\//.test(pr.headRefName));
}
export async function requireNoOpenProposals(root,target){
  const open=await openProposals(root,target);
  if(open.length)throw Error(`A pull request from the maintenance tools is still open: #${open[0].number} “${open[0].title}”\n  ${open[0].url}\nMerge or close it on GitHub first, so that two pull requests cannot change the same files.`);
}

// `target` and `account` may be passed when the caller already asked GitHub.
export async function publishChanges(root,files,message,{kind='change',body='',toolName,blobs=new Map(),target=null,account=null}={}){
  const gh=await tool('gh',root);
  target||=await githubTarget(root,{gh,git:gitPath});
  if(target.renamedFrom)console.log(`Note: GitHub now calls this repository ${target.repository}. Update this folder with:\n  git remote set-url origin ${target.remote}`);
  if(!blobs.size){
    const changed=files.length?(await git(['status','--porcelain','--',...files],root)).trim():'';
    if(!changed){console.log('Nothing to propose: these files already match GitHub.');return null;}
  }
  account||=await githubAccount(root,gh);
  const {sha,proposed}=await proposalCommit(root,files,message,account,blobs);
  if(!proposed.length){console.log('Nothing to propose: these files already match GitHub.');return null;}
  console.log('Uploading to a new branch and opening a pull request…');
  const pr=await openPullRequest({gh,git:gitPath,repo:root,repository:target.repository,prefix:'maintenance',kind,title:message,ref:sha,
    body:pullRequestBody({body,files:proposed,toolName}),bodyFile:path.join(await jobFolder(),'pull-request-'+randomUUID().slice(0,8)+'.md')});
  console.log('Nothing is published until the pull request is merged on GitHub; the website then rebuilds automatically.');
  return {sha,...pr};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),options={},files=[];
  for(let i=0;i<args.length;i++){
    if(['--message','--kind','--body-file','--tool'].includes(args[i])){options[args[i].slice(2)]=args[++i];}
    else files.push(args[i]);
  }
  try{
    if(!options.message)throw Error('Usage: node scripts/publish-changes.mjs --message "text" [--kind NAME] [--body-file FILE] [--tool NAME] FILE...');
    if(!files.length)throw Error('Name the files to propose.');
    const body=options['body-file']?await fs.readFile(options['body-file'],'utf8'):'';
    await prepareRepository(projectRoot,files);
    const gh=await tool('gh',projectRoot);
    await requireNoOpenProposals(projectRoot,{gh,repository:(await githubTarget(projectRoot,{gh,git:gitPath})).repository});
    await publishChanges(projectRoot,files,options.message,{kind:options.kind||'change',body,toolName:options.tool});
  }catch(error){console.error('\nNO PULL REQUEST OPENED: '+error.message);process.exitCode=1;}
}
