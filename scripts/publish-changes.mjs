// Propose specific project files from this folder as a pull request. Used by
// the maintenance tools: only the named files are committed, on a new branch
// made from main, and nothing reaches main or the website until the pull
// request is merged on GitHub. This folder stays on main with its files as
// they are, so unrelated local work stays put.
//
//   node scripts/publish-changes.mjs --message "Title" [--kind NAME] [--body-file FILE] FILE...
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {run,tool,openPullRequest,jobFolder} from './publish-item.mjs';
import {githubTarget} from './github-target.mjs';

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let gitPath='git';
const git=(args,root,quiet=true,env=null)=>run(gitPath,['-C',root,...args],root,quiet,env);
const changedFiles=async(root,...range)=>(await git(['-c','core.quotePath=false','diff','--name-only',...range],root)).split('\n').filter(Boolean);

// Before changing anything: on main, no local commits, up to date with GitHub.
// A file whose local edit has since been merged on GitHub (it now matches
// main there) is brought up to date instead of blocking the update.
export async function prepareRepository(root,files){
  gitPath=await tool('git',root);
  const top=await git(['rev-parse','--show-toplevel'],root);
  if(path.resolve(top)!==path.resolve(root))throw Error('Run this from the project folder (the Git repository root).');
  if(await git(['rev-parse','--abbrev-ref','HEAD'],root)!=='main')throw Error('Switch this folder to the main branch first.');
  console.log('Checking GitHub for newer changes…');
  await git(['fetch','--quiet','origin','main'],root);
  if(await git(['log','--format=%H','origin/main..HEAD'],root))throw Error('This folder has local commits that are not on GitHub. Push or resolve them first.');
  const upstream=new Set(await changedFiles(root,'HEAD..origin/main'));
  const merged=[];
  for(const file of (await changedFiles(root,'HEAD')).filter(file=>upstream.has(file))){
    try{await git(['diff','--quiet','origin/main','--',file],root);merged.push(file);}catch{}
  }
  if(merged.length)await git(['checkout','HEAD','--',...merged],root);
  try{await git(['merge','--ff-only','--quiet','origin/main'],root);}
  catch{
    const blocking=(await changedFiles(root,'HEAD')).filter(file=>upstream.has(file));
    throw Error('GitHub has newer versions of files that also have unpublished changes here:\n  '+blocking.slice(0,10).join('\n  ')+'\nIf a pull request for them is still open, merge or close it on GitHub first.');
  }
  const allowed=new Set(files.map(file=>file.replaceAll('\\','/')));
  const other=(await changedFiles(root,'HEAD')).filter(file=>!allowed.has(file));
  if(other.length)console.log('Other changed files in this folder are not included:\n  '+other.slice(0,10).join('\n  '));
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
// never moves. Returns the commit and the files it changes.
export async function proposalCommit(root,files,message,account){
  const index=path.join(await jobFolder(),'pull-request-index-'+randomUUID()),env={GIT_INDEX_FILE:index};
  let sha;
  try{
    await git(['read-tree','HEAD'],root,true,env);
    await git(['add','-A','--',...files],root,true,env);
    const tree=await git(['write-tree'],root,true,env);
    sha=await git(['-c','user.name='+account.login,'-c',`user.email=${account.id}+${account.login}@users.noreply.github.com`,'commit-tree',tree,'-p','HEAD','-m',message],root,true,env);
  }finally{await fs.rm(index,{force:true});}
  return {sha,proposed:await changedFiles(root,'HEAD',sha)};
}

export async function publishChanges(root,files,message,{kind='change',body='',toolName}={}){
  const gh=await tool('gh',root);
  const target=await githubTarget(root,{gh,git:gitPath});
  if(target.renamedFrom)console.log(`Note: GitHub now calls this repository ${target.repository}. Update this folder with:\n  git remote set-url origin ${target.remote}`);
  const changed=(await git(['status','--porcelain','--',...files],root)).trim();
  if(!changed){console.log('Nothing to propose: these files already match GitHub.');return null;}
  const account=JSON.parse(await run(gh,['api','user','--jq','{login,id}'],root,true));
  const {sha,proposed}=await proposalCommit(root,files,message,account);
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
    await publishChanges(projectRoot,files,options.message,{kind:options.kind||'change',body,toolName:options.tool});
  }catch(error){console.error('\nNO PULL REQUEST OPENED: '+error.message);process.exitCode=1;}
}
