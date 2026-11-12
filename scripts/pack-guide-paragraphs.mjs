import fs from 'node:fs/promises';import path from 'node:path';
import {createHash} from 'node:crypto';import {gzipSync,gunzipSync} from 'node:zlib';
import {decodeGuideHtmlPayload} from './guide-html-payload.mjs';
const paragraphs=/<p(?:\s[^>]*)?>[\s\S]*?<\/p>/g;
export async function packGuideParagraphs(directory){
 const names=(await fs.readdir(directory)).filter(n=>n.endsWith('.quotations.html.gz')).sort(),counts=new Map(),cache=new Map();
 const dictionaries=path.join(directory,'shared-paragraphs');await fs.mkdir(dictionaries,{recursive:true});
 async function readDictionary(hash){if(!cache.has(hash)){const value=JSON.parse(gunzipSync(await fs.readFile(path.join(dictionaries,hash+'.json.gz'))));cache.set(hash,value);}return cache.get(hash);}
 const read=async name=>decodeGuideHtmlPayload(gunzipSync(await fs.readFile(path.join(directory,name))).toString(),readDictionary);
 for(const name of names)for(const m of (await read(name)).matchAll(paragraphs))if(m[0].length>=250&&Buffer.byteLength(JSON.stringify(m[0]))<=32768)counts.set(m[0],(counts.get(m[0])||0)+1);
 const shared=[...counts].filter(([,count])=>count>1).map(([text])=>text).sort(),references=new Map(),used=new Set();
 let shard=[],bytes=2,dictionaryBytes=0;
 async function flush(){if(!shard.length)return;const raw=Buffer.from(JSON.stringify(shard));if(raw.length>32768)throw Error('Shared paragraph shard exceeds bound');const hash=createHash('sha256').update(raw).digest('hex'),packed=gzipSync(raw,{level:9});if(!gunzipSync(packed).equals(raw))throw Error('Shared paragraph compression changed content');await fs.writeFile(path.join(dictionaries,hash+'.json.gz'),packed);dictionaryBytes+=packed.length;used.add(hash);shard.forEach((text,index)=>references.set(text,{ref:[hash,index]}));shard=[];bytes=2;}
 for(const text of shared){const length=Buffer.byteLength(JSON.stringify(text))+1;if(length+2>32768)continue;if(bytes+length>32768)await flush();shard.push(text);bytes+=length;}await flush();
 let before=0,after=0;cache.clear();
 for(const name of names){const html=await read(name),parts=[];let end=0;
  for(const m of html.matchAll(paragraphs))if(references.has(m[0])){parts.push(html.slice(end,m.index),references.get(m[0]));end=m.index+m[0].length;}parts.push(html.slice(end));
  const encoded=JSON.stringify({format:'pi-guide-html-1',parts}),reconstructed=await decodeGuideHtmlPayload(encoded,readDictionary);
  if(reconstructed!==html)throw Error('Shared paragraphs changed guide: '+name);
  const raw=Buffer.from(encoded),packed=gzipSync(raw,{level:9});if(!gunzipSync(packed).equals(raw))throw Error('Guide paragraph compression changed content');
  before+=gzipSync(html,{level:9}).length;after+=packed.length;await fs.writeFile(path.join(directory,name),packed);
 }
 // Only remove obsolete generated shard files within this checked child directory.
 for(const name of await fs.readdir(dictionaries))if(/^[a-f0-9]{64}\.json\.gz$/.test(name)&&!used.has(name.slice(0,64)))await fs.unlink(path.join(dictionaries,name));
 return {guides:names.length,sharedParagraphs:references.size,shards:used.size,maximumDecodedShardBytes:32768,beforeBytes:before,afterBytes:after+dictionaryBytes,savedBytes:before-after-dictionaryBytes,reconstruction:'exact'};
}
