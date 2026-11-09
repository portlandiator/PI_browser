// The repository and public site come from the checkout's own "origin"
// remote, so the same tools work in any copy of the project without editing.
// When GitHub CLI is available, the name is confirmed with GitHub so that a
// renamed repository still yields its current GitHub Pages address (GitHub
// redirects the old Git address, but not the old Pages address).
import {execFile} from 'node:child_process';

export function parseGithubRemote(url){
  const match=/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(String(url).trim());
  if(!match)return null;
  return targetFor(match[1],match[2]);
}

export function targetFor(owner,name){
  return {repository:`${owner}/${name}`,remote:`https://github.com/${owner}/${name}.git`,site:`https://${owner.toLowerCase()}.github.io/${name}/`};
}

// A command that hangs (GitHub CLI waiting on a blocked network, for example)
// is given up after `timeout` ms so that the tools fall back to the origin
// address instead of never starting.
const exec=(command,args)=>new Promise((resolve,reject)=>execFile(command,args,{windowsHide:true,timeout:20000},(error,stdout)=>error?reject(error):resolve(String(stdout).trim())));

// gh: path to GitHub CLI, or null to skip the online check.
export async function githubTarget(root,{gh=null,git='git',execute=exec}={}){
  let url;
  try{url=await execute(git,['-C',root,'remote','get-url','origin']);}
  catch{throw Error('This folder has no Git "origin" remote. Clone the repository from GitHub first.');}
  const target=parseGithubRemote(url);
  if(!target)throw Error('The Git "origin" remote is not a GitHub repository: '+url.trim());
  if(!gh)return target;
  let current;
  try{current=await execute(gh,['api','repos/'+target.repository,'--jq','.full_name']);}catch{return target;}
  const match=/^([\w.-]+)\/([\w.-]+)$/.exec(current);
  if(!match||current===target.repository)return target;
  return {...targetFor(match[1],match[2]),renamedFrom:target.repository};
}
