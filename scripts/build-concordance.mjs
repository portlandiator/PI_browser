// Publish the concordance of authorized renderings as <out>/concordance/:
// index.json and up to 256 shards o-<n>.json keyed by original word form, read
// on demand by the reader. Built from the dataset's records on every build and
// interface refresh.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {authorizedPairs,buildConcordance,concordanceShards} from '../src/concordance.mjs';

// Only records with authorized pairs are kept, and only the fields the
// concordance reads, so memory stays bounded over the whole collection.
async function readRecords(folder){
  let names;
  try{names=(await fs.readdir(folder)).filter(name=>name.endsWith('.json.gz')).sort();}
  catch(error){if(error.code==='ENOENT')return [];throw error;}
  const records=[];
  for(let i=0;i<names.length;i+=64){
    const batch=await Promise.all(names.slice(i,i+64).map(async name=>{
      const record=JSON.parse(gunzipSync(await fs.readFile(path.join(folder,name))));
      if(!authorizedPairs(record).length)return null;
      const {id,citationCount,metadata,hasEnglish,hasOriginal,en,original}=record;
      return {id,citationCount,metadata:{Authorized:metadata.Authorized,Manuscripts:metadata.Manuscripts,Publications:metadata.Publications},hasEnglish,hasOriginal,en,original};
    }));
    for(const record of batch)if(record)records.push(record);
  }
  return records;
}

export async function writeConcordance(root,out,dataset){
  if(!/^collections\/[\w-]+\/$/.test(dataset||''))throw Error(`Invalid dataset path: ${dataset}`);
  const {index,shards}=buildConcordance(await readRecords(path.join(out,dataset,'data')));
  const target=path.join(out,'concordance');
  await fs.rm(target,{recursive:true,force:true});
  await fs.mkdir(target,{recursive:true});
  let files=0,bytes=0;
  for(let n=0;n<concordanceShards;n++){
    if(!Object.keys(shards[n]).length)continue;
    const text=JSON.stringify(shards[n]);
    await fs.writeFile(path.join(target,`o-${n}.json`),text);
    files++;bytes+=Buffer.byteLength(text);
  }
  const summary={format:1,dataset,shards:concordanceShards,...index};
  await fs.writeFile(path.join(target,'index.json'),JSON.stringify(summary));
  return {...index,files,bytes};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const out=path.join(root,process.argv[2]||'dist');
  const started=Date.now();
  const {dataset}=JSON.parse(await fs.readFile(path.join(out,'stats.json'),'utf8'));
  console.log('Concordance:',await writeConcordance(root,out,dataset),`${((Date.now()-started)/1000).toFixed(1)} s`);
}
