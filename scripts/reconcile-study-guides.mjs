// After a build stopped with "Catalogue review data changed for …" because a
// pull request from the catalog tools deleted or corrected items, bring the
// study guides in line with the rebuilt subject data identified by that failed
// build, as the deletion plan does for the changes it can predict: baselines
// are updated for the subjects whose quotations changed, readings whose
// quotations moved to another record keep their place, and new quotations are
// added as left out (or shown, when they carry authorized wording). The
// GitHub check runs this and pushes the result to the pull request; a change
// that needs an editorial decision stops it instead. A correction of an item's
// Authorized field changes no quotation, but it changes which wording a guide
// must show; the subjects quoting such an item are reconciled as well.
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
// the published and the proposed metadata shard (Linux tar), and the passages
// it adds to subject compilations (data/subject-additions.json).
export function catalogChange(base='origin/main'){
  const csv=ref=>parseCsv(execFileSync('sh',['-c',`git show ${ref}:data/collection/metadata.tar | tar -xO --wildcards '*.csv'`],{cwd:root,encoding:'utf8',maxBuffer:256*1024*1024}));
  const before=new Map(csv(base).map(row=>[row.PIN,JSON.stringify(row)])),after=new Map(csv('HEAD').map(row=>[row.PIN,JSON.stringify(row)]));
  const deleted=[...before.keys()].filter(id=>!after.has(id)),changed=[...after].filter(([id,row])=>before.has(id)&&before.get(id)!==row).map(([id])=>id);
  const additions=ref=>{try{return JSON.parse(execFileSync('git',['show',`${ref}:data/subject-additions.json`],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']})).selections.map(s=>s.id);}catch{return [];}};
  const previous=new Set(additions(base)),added=additions('HEAD').filter(id=>!previous.has(id));
  const field=row=>JSON.parse(row).Authorized??'';
  const reauthorized=changed.filter(id=>field(before.get(id))!==field(after.get(id)));
  return {deleted,changed,added,reauthorized};
}
export function describeCause({deleted,changed,added=[]}){
  const list=ids=>ids.length>3?`${ids.slice(0,3).join(', ')} and ${ids.length-3} more`:ids.join(', ');
  if(deleted.length)return deleted.length===1?`catalog item ${deleted[0]} was deleted`:`catalog items ${list(deleted)} were deleted`;
  if(changed.length)return changed.length===1?`catalog item ${changed[0]} was corrected`:`catalog items ${list(changed)} were corrected`;
  if(added.length)return added.length===1?'a passage was added to a subject compilation':`${added.length} passages were added to subject compilations`;
  return 'the catalog texts were corrected';
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),output=args[args.indexOf('--output')+1];
  const target=await githubTarget(root),site=liveSite(target.site);
  let change={deleted:[],changed:[],added:[],reauthorized:[]};
  try{change=catalogChange();}catch(error){console.log('Could not list the changed catalog items: '+error.message);}
  const cause=describeCause(change);
  const dataset=await reconciliationDataset(root);
  console.log('Reconciling study guides against '+path.relative(root,dataset)+'.');
  const read=async name=>JSON.parse(gunzipSync(await fs.readFile(path.join(dataset,name))));
  const files={read:name=>fs.readFile(path.join(root,name)).catch(error=>error.code==='ENOENT'?null:Promise.reject(error)),list:directory=>fs.readdir(path.join(root,directory))};
  const baseline=JSON.parse(await files.read('study-guides/catalogue-baseline.json'));
  const subjects=new Map(),reauthorized=new Set(change.reauthorized);
  for(const [id,expected] of Object.entries(baseline.subjects)){
    const after=await read(`subjects/${id}.json.gz`);
    const quotations=catalogueFingerprint(after.selections)!==expected.fingerprint;
    if(!quotations&&!after.selections.some(s=>s.passage&&reauthorized.has(s.candidates?.[0]?.source)))continue;
    const before=await site(`subjects/${id}.json.gz`);
    if(!before)throw Error(`The website has no compilation for subject ${id}.`);
    subjects.set(id,{before,after});
    console.log(quotations?`Quotations changed in “${after.subject.name}”.`:`“${after.subject.name}” quotes an item whose authorized paragraphs changed.`);
  }
  if(!subjects.size)throw Error('Every study-guide baseline matches the build and no quoted item changed its authorized paragraphs; the build stopped for another reason.');
  const exists=new Map([...subjects].map(([id,{after}])=>[id,new Set(after.selections.map(s=>s.id))]));
  const result=await updateGuides({...files,item:change.deleted.join(', ')||change.changed.join(', ')||(change.added.length?'added passages':'catalog change'),removedSources:change.deleted,cause,subjects,evidenceGone:(subjectId,selection)=>exists.has(subjectId)&&!exists.get(subjectId).has(selection),authorized:authorizedGroups(source=>read('data/'+recordFilename(source)).catch(()=>null))});
  // A guide that needed nothing comes back byte for byte; leave it out.
  for(const [name,value] of [...result.changes]){
    const current=await files.read(name);
    if(current&&Buffer.compare(current,Buffer.from(value))===0)result.changes.delete(name);
    else await fs.writeFile(path.join(root,name),value);
  }
  const notes=[`Study guides reconciled after ${cause}: the quotations of ${subjects.size} subject${subjects.size===1?'':'s'}, or the authorized paragraphs they quote, changed when the collection was rebuilt (${[...subjects.values()].map(s=>'“'+s.after.subject.name+'”').join(', ')}).`,
    ...result.guides.map(g=>`- **${g.title}**\n${g.notes.map(n=>'  - '+n).join('\n')}`),
    result.guides.length?'':'- No study guide needed changes beyond its catalogue baseline.',
    `Files changed: ${[...result.changes.keys()].map(name=>'`'+name+'`').join(', ')}.`].filter(Boolean);
  console.log(notes.join('\n'));
  if(output)await fs.writeFile(output,notes.join('\n\n')+'\n');
}
