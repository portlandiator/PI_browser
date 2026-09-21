import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

// Only generated assets belong in the cache. Browser code always comes from src/.
export const generatedPaths=['collections','pdf-volumes','stats.json','volumes.json','volume-titles.json'];
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
  await collect('pdf_volumes - copy');
  for(const name of await fs.readdir(root))if(name.endsWith('.csv'))await collect(name);
  await collect('subjects - reference.docx');
  // Follow build-time imports so a new shared parser/helper cannot silently reuse
  // stale data. Interface-only modules, HTML, CSS and fonts do not affect the key.
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
  await dependency('scripts/build.mjs');
  await dependency('scripts/deployment-cache.mjs');
  return [...files].sort();
}

export async function fingerprint(root){
  const hash=createHash('sha256');
  hash.update(`pages-data-v1\0node-${process.versions.node.split('.')[0]}\0`);
  for(const relative of await buildInputs(root)){
    const content=createHash('sha256');
    for await(const chunk of createReadStream(path.join(root,relative)))content.update(chunk);
    hash.update(relative+'\0'+content.digest('hex')+'\0');
  }
  return hash.digest('hex');
}

export async function refreshSite(root){
  const out=path.join(root,'dist');
  const stats=JSON.parse(await fs.readFile(path.join(out,'stats.json'),'utf8'));
  if(!/^collections\/[\w-]+\/$/.test(stats.dataset||''))throw Error('Invalid cached dataset path');
  for(const name of generatedPaths)await fs.access(path.join(out,name));
  for(const name of ['catalog.json.gz','metadata-schema.json','subjects/index.json.gz'])await fs.access(path.join(out,stats.dataset,name));
  for(const name of await fs.readdir(path.join(root,'src'))){
    if(generatedPaths.includes(name))throw Error(`Interface would overwrite generated data: ${name}`);
  }
  await fs.cp(path.join(root,'src'),out,{recursive:true});
  await fs.writeFile(path.join(out,'.nojekyll'),'');
  return stats;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv[2]==='key')console.log(`key=${await fingerprint(rootDirectory)}`);
  else if(process.argv[2]==='refresh')console.log('Refreshed interface over existing dataset:',(await refreshSite(rootDirectory)).dataset);
  else throw Error('Usage: node scripts/deployment-cache.mjs key|refresh');
}
