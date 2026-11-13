import {beginCollectionUpdate,pruneCollections} from './collection-storage.mjs';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

// Only generated assets belong in the cache. Browser code always comes from src/.
export const generatedPaths=['collections','pdf-volumes','stats.json','volumes.json','volume-titles.json','build-state.json'];
const rootDirectory=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

export async function buildInputs(root){
  const files=new Set();
  async function collect(relative){
    const file=path.join(root,relative),info=await fs.lstat(file);
    if(info.isSymbolicLink())throw Error(`Build input must not be a symlink: ${relative}`);
    if(info.isDirectory()){
      for(const name of await fs.readdir(file))await collect(path.posix.join(relative,name));
    }else files.add(relative);
  }
  await collect('data');
  await collect('subject-summaries');
  // study-guides/ is not an input: guides are rebuilt from it on every deployment
  // (refreshSite), so editing a guide reuses the cached collection.
  // Public builds use only the filtered archive; private raw extracts never affect them.
  try{await fs.access(path.join(root,'data/subject-extracts-public.json.gz'));}catch(error){if(error.code!=='ENOENT')throw error;await collect('subject_extracts');}
  await collect('pdf_volumes - copy');
  for(const name of await fs.readdir(root))if(name.endsWith('.csv'))await collect(name);
  await collect('subjects - reference.docx');
  // Follow build-time imports so a new shared parser/helper cannot silently reuse
  // stale data. Interface-only modules, HTML, CSS and fonts do not affect the key.
  for(const relative of await codeDependencies(root,['scripts/build.mjs','scripts/deployment-cache.mjs']))files.add(relative);
  return [...files].sort();
}

// The modules an entry script imports, directly or indirectly, itself included.
export async function codeDependencies(root,entries){
  const files=new Set();
  async function dependency(relative){
    if(files.has(relative))return;
    const absolute=path.resolve(root,relative);
    if(!absolute.startsWith(path.resolve(root)+path.sep))throw Error(`Build import escapes project: ${relative}`);
    files.add(relative);
    const code=await fs.readFile(absolute,'utf8');
    const imports=[...code.matchAll(/\b(?:import|export)\s+(?:[^;]*?\s+from\s*)?['"]([^'"]+)['"]/g),...code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]/g)];
    for(const match of imports){
      const specifier=match[1];
      if(specifier.startsWith('node:'))continue;
      if(!specifier.startsWith('.'))throw Error(`Unsupported build dependency: ${specifier}`);
      await dependency(path.posix.normalize(path.posix.join(path.posix.dirname(relative),specifier)));
    }
  }
  for(const entry of entries)await dependency(entry);
  return [...files].sort();
}

// What each stage of the build reads, so a change rebuilds only the stages it
// can affect. Every scope includes the build's code.
//   (none)     every input: the cache key of a finished collection
//   'records'  records, search index and volumes, without the source archive
//              (build.mjs compares each record's own signature)
//   'subjects' everything the subject compilations read besides the texts
const recordInputs=name=>name.startsWith('pdf_volumes - copy/')||name==='data/withheld-pdf-volumes.json'||name==='data/volume-front-matter.json'||(!name.includes('/')&&name.endsWith('.csv'));
export async function fingerprint(root,scope){
  if(scope!==undefined&&!['records','subjects'].includes(scope))throw Error('Unknown fingerprint scope: '+scope);
  const code=new Set(await codeDependencies(root,['scripts/build.mjs','scripts/deployment-cache.mjs']));
  const hash=createHash('sha256');
  hash.update(`pages-data-v1\0node-${process.versions.node.split('.')[0]}\0${scope||''}\0`);
  for(const relative of await buildInputs(root)){
    if(scope&&relative.startsWith('data/collection/'))continue;
    if(scope==='records'&&!code.has(relative)&&!recordInputs(relative))continue;
    hash.update(relative+'\0'+await fileDigest(path.join(root,relative))+'\0');
  }
  return hash.digest('hex');
}
async function fileDigest(file){
  const content=createHash('sha256');
  for await(const chunk of createReadStream(file))content.update(chunk);
  return content.digest('hex');
}
// The code of one stage, for caches that stay valid across other code changes.
export async function codeFingerprint(root,entries){
  const hash=createHash('sha256');
  hash.update(`node-${process.versions.node.split('.')[0]}\0`);
  for(const relative of await codeDependencies(root,entries))hash.update(relative+'\0'+await fileDigest(path.join(root,relative))+'\0');
  return hash.digest('hex');
}

export async function refreshSite(root){
  const collectionUpdate=await beginCollectionUpdate(root);
  try{
  const out=path.join(root,'dist');
  const stats=JSON.parse(await fs.readFile(path.join(out,'stats.json'),'utf8'));
  if(!/^collections\/[\w-]+\/$/.test(stats.dataset||''))throw Error('Invalid cached dataset path');
  for(const name of generatedPaths)await fs.access(path.join(out,name));
  for(const name of ['catalog.json.gz','metadata-schema.json','subjects/index.json.gz'])await fs.access(path.join(out,stats.dataset,name));
  for(const name of await fs.readdir(path.join(root,'src'))){
    if(generatedPaths.includes(name))throw Error(`Interface would overwrite generated data: ${name}`);
  }
  await fs.cp(path.join(root,'src'),out,{recursive:true});
  const {copyViewDefaults}=await import('./copy-view-defaults.mjs');
  await copyViewDefaults(root,out);
  await fs.writeFile(path.join(out,'.nojekyll'),'');
  const {buildStudyGuides}=await import('./build-compilation-pilot.mjs');
  const {packStudyGuides}=await import('./pack-study-guides.mjs');
  await buildStudyGuides(root,out,stats.dataset);
  await packStudyGuides(root,out);
  await collectionUpdate.prune();
  return stats;
  }finally{await collectionUpdate.close();}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv[2]==='key')console.log(`key=${await fingerprint(rootDirectory)}`);
  else if(process.argv[2]==='prune')console.log('Collection cleanup:',await pruneCollections(rootDirectory));
  else if(process.argv[2]==='refresh')console.log('Refreshed interface over existing dataset:',(await refreshSite(rootDirectory)).dataset);
  else throw Error('Usage: node scripts/deployment-cache.mjs key|refresh|prune');
}
