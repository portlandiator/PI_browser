import fs from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {tokenize,shardKey,unpackPosting} from '../src/text.mjs';

export const unzip=async file=>JSON.parse(gunzipSync(await fs.readFile(file)));

// Cache reuse is limited to identical build dependencies and an identical ID order.
// Posting document numbers are therefore stable. Any uncertainty uses a full build.
export async function reusableBuild(out,ids,compatibility){
  try{
    const state=JSON.parse(await fs.readFile(path.join(out,'build-state.json'),'utf8'));
    const stats=JSON.parse(await fs.readFile(path.join(out,'stats.json'),'utf8'));
    if(state.format!==1||state.compatibility!==compatibility||state.dataset!==stats.dataset||
      !/^collections\/[\w-]+\/$/.test(stats.dataset)||JSON.stringify(state.ids)!==JSON.stringify(ids)||
      state.items?.length!==ids.length)return null;
    const corpus=path.join(out,stats.dataset),catalog=await unzip(path.join(corpus,'catalog.json.gz'));
    if(JSON.stringify(catalog.map(r=>r.id))!==JSON.stringify(ids))return null;
    return {state,stats,corpus,catalog};
  }catch{return null;}
}

export function affectedBuckets(before,after){
  const buckets=new Set();
  for(const version of [before,after])for(const part of [...version.paragraphs,...version.notes])
    for(const word of tokenize(part.plain))buckets.add(shardKey(word));
  return buckets;
}

export function mergeShard(previous,replacements,changedDocs){
  const merged=new Map();
  for(const [word,encoded] of Object.entries(previous)){
    const posting=unpackPosting(Buffer.from(encoded,'base64'));
    for(const doc of changedDocs)posting.delete(doc);
    if(posting.size)merged.set(word,posting);
  }
  for(const [word,posting] of replacements){
    if(!merged.has(word))merged.set(word,new Map());
    for(const [doc,positions] of posting)merged.get(word).set(doc,positions);
  }
  // The posting codec expects document IDs in ascending order.
  return new Map([...merged].map(([word,posting])=>[word,new Map([...posting].sort((a,b)=>a[0]-b[0]))]));
}

export async function refreshSubjectMetadata(corpus,changed,zipWrite){
  const index=await unzip(path.join(corpus,'subjects/index.json.gz'));
  for(const subject of index.subjects){
    const file=path.join(corpus,'subjects',subject.id+'.json.gz'),data=await unzip(file);
    let updated=false;
    for(const [id,row] of changed)if(Object.hasOwn(data.sources,id)){data.sources[id]=row;updated=true;}
    if(updated)await zipWrite(file,data);
  }
}
