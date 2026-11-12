// The pull request check builds and tests the site, then uploads the result as
// an artifact named after the Git tree it was built from. When main receives
// exactly that tree (the usual merge of an up-to-date pull request), the
// deployment publishes that build instead of repeating it.
//
//   node scripts/verified-build.mjs name   prints the artifact name for HEAD
//   node scripts/verified-build.mjs find   prints run_id= and name= for GitHub
//                                          Actions when a usable build exists
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const checkWorkflow='.github/workflows/check-pull-request.yml';
export const artifactName=tree=>{
  if(!/^[0-9a-f]{40,64}$/.test(tree))throw Error('Invalid Git tree: '+tree);
  return 'verified-site-'+tree;
};

// Only a build made by this repository's own pull request check counts: the
// artifact is uploaded after its tests pass, so its presence means they did.
// A run from a fork, or another workflow using the same name, is ignored.
export function chooseVerifiedBuild(artifacts,runs,name){
  for(const artifact of [...artifacts].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))){
    if(artifact.name!==name||artifact.expired)continue;
    const reference=artifact.workflow_run;
    if(!reference?.id||reference.head_repository_id!==reference.repository_id)continue;
    const run=runs.get(reference.id);
    if(!run||run.path!==checkWorkflow||run.event!=='pull_request')continue;
    if(run.head_repository?.id!==run.repository?.id)continue;
    if(['failure','timed_out','startup_failure'].includes(run.conclusion))continue;
    return {runId:reference.id,name};
  }
  return null;
}

async function github(pathname){
  const response=await fetch((process.env.GITHUB_API_URL||'https://api.github.com')+pathname,{headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
  if(!response.ok)throw Error(`GitHub answered ${response.status} for ${pathname}`);
  return response.json();
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const name=artifactName(execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:root,encoding:'utf8'}).trim());
  if(process.argv[2]==='name')console.log(`name=${name}`);
  else if(process.argv[2]==='find'){
    // Any failure here only means the deployment builds the site itself.
    try{
      const repository=process.env.GITHUB_REPOSITORY;
      if(!repository||!process.env.GITHUB_TOKEN)throw Error('GITHUB_REPOSITORY and GITHUB_TOKEN are required');
      const {artifacts}=await github(`/repos/${repository}/actions/artifacts?name=${name}&per_page=30`);
      const runs=new Map();
      for(const id of new Set(artifacts.map(a=>a.workflow_run?.id).filter(Boolean)))runs.set(id,await github(`/repos/${repository}/actions/runs/${id}`));
      const found=chooseVerifiedBuild(artifacts,runs,name);
      if(found){console.log(`run_id=${found.runId}`);console.log(`name=${found.name}`);console.error(`Using the build verified by pull request check run ${found.runId}.`);}
      else console.error('No verified build of this content; building it here.');
    }catch(error){console.error('Could not look for a verified build; building it here. '+error.message);}
  }else throw Error('Usage: node scripts/verified-build.mjs name|find');
}
