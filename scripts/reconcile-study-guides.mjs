// After a build stopped with "Catalogue review data changed for …" because a
// pull request from the catalog tools deleted or corrected items, bring the
// study guides in line with the rebuilt subject data identified by that failed
// build, as the deletion plan does for the changes it can predict: baselines
// are updated for the subjects whose quotations changed, readings whose
// quotations moved to another record keep their place, and new quotations are
// added as left out (or shown, when they carry authorized wording). The
// GitHub check runs this and pushes the result to the pull request; a change
// that needs an editorial decision stops it instead.
//
//   node scripts/reconcile-study-guides.mjs [--output NOTES.md]
// The published subject data comes from this checkout's GitHub Pages site.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {parseCsv} from '../src/text.mjs';
import {recordFilename} from '../src/record-file.mjs';
import {githubTarget} from './github-target.mjs';
import {liveSite,updateGuides,authorizedGroups} from './catalog-deletion.mjs';
import {catalogueFingerprint} from './study-guide-catalogue.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

export async function reconciliationDataset(project){
  let pending;
  try{pending=JSON.parse(await fs.readFile(path.join(project,'dist/study-guide-reconciliation.json'),'utf8'));}
  catch(error){if(error.code==='ENOENT')throw Error('No failed study-guide build is recorded. Run the collection build before reconciling.');throw error;}
  if(pending.format!==1||!/^collections\/[\w-]+\/$/.test(pending.dataset||''))throw Error('Invalid study-guide reconciliation dataset.');
  const dataset=path.resolve(project,'dist',pending.dataset);
  await fs.access(path.join(dataset,'subjects/index.json.gz'));
  return dataset;
}

// Catalog IDs the pull request removes or changes in the metadata, read from
// the published and the proposed metadata shard (Linux tar).
export function catalogChange(base='origin/main'){
  const csv=ref=>parseCsv(execFileSync('sh',['-c',`git show ${ref}:data/collection/metadata.tar | tar -xO --wildcards '*.csv'`],{cwd:root,encoding:'utf8',maxBuffer:256*1024*1024}));
  const before=new Map(csv(base).map(row=>[row.PIN,JSON.stringify(row)])),after=new Map(csv('HEAD').map(row=>[row.PIN,JSON.stringify(row)]));
  const deleted=[...before.keys()].filter(id=>!after.has(id)),changed=[...after].filter(([id,row])=>before.has(id)&&before.get(id)!==row).map(([id])=>id);
  return {deleted,changed};
}
export function describeCause({deleted,changed}){
  const list=ids=>ids.length>3?`${ids.slice(0,3).join(', ')} and ${ids.length-3} more`:ids.join(', ');
  if(deleted.length)return deleted.length===1?`catalog item ${deleted[0]} was deleted`:`catalog items ${list(deleted)} were deleted`;
  if(changed.length)return changed.length===1?`catalog item ${changed[0]} was corrected`:`catalog items ${list(changed)} were corrected`;
  return 'the catalog texts were corrected';
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),output=args[args.indexOf('--output')+1];
  const target=await githubTarget(root),site=liveSite(target.site);
  let change={deleted:[],changed:[]};
  try{change=catalogChange();}catch(error){console.log('Could not list the changed catalog items: '+error.message);}
  const cause=describeCause(change);
  const dataset=await reconciliationDataset(root);
  console.log('Reconciling study guides against '+path.relative(root,dataset)+'.');
  const read=async name=>JSON.parse(gunzipSync(await fs.readFile(path.join(dataset,name))));
  const files={read:name=>fs.readFile(path.join(root,name)).catch(error=>error.code==='ENOENT'?null:Promise.reject(error)),list:directory=>fs.readdir(path.join(root,directory))};
  const baseline=JSON.parse(await files.read('study-guides/catalogue-baseline.json'));
  const subjects=new Map();
  for(const [id,expected] of Object.entries(baseline.subjects)){
    const after=await read(`subjects/${id}.json.gz`);
    if(catalogueFingerprint(after.selections)===expected.fingerprint)continue;
    const before=await site(`subjects/${id}.json.gz`);
    if(!before)throw Error(`The website has no compilation for subject ${id}.`);
    subjects.set(id,{before,after});
    console.log(`Quotations changed in “${after.subject.name}”.`);
  }
  if(!subjects.size)throw Error('Every study-guide baseline matches the build; the build stopped for another reason.');
  const exists=new Map([...subjects].map(([id,{after}])=>[id,new Set(after.selections.map(s=>s.id))]));
  const result=await updateGuides({...files,item:change.deleted.join(', ')||change.changed.join(', ')||'catalog change',removedSources:change.deleted,cause,subjects,evidenceGone:(subjectId,selection)=>exists.has(subjectId)&&!exists.get(subjectId).has(selection),authorized:authorizedGroups(source=>read('data/'+recordFilename(source)).catch(()=>null))});
  for(const [name,value] of result.changes)await fs.writeFile(path.join(root,name),value);
  const notes=[`Study guides reconciled after ${cause}: the quotations of ${subjects.size} subject${subjects.size===1?'':'s'} changed when the collection was rebuilt (${[...subjects.values()].map(s=>'“'+s.after.subject.name+'”').join(', ')}).`,
    ...result.guides.map(g=>`- **${g.title}**\n${g.notes.map(n=>'  - '+n).join('\n')}`),
    result.guides.length?'':'- No study guide needed changes beyond its catalogue baseline.',
    `Files changed: ${[...result.changes.keys()].map(name=>'`'+name+'`').join(', ')}.`].filter(Boolean);
  console.log(notes.join('\n'));
  if(output)await fs.writeFile(output,notes.join('\n\n')+'\n');
}
