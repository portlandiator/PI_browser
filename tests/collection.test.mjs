import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {parseText,tokenize,parseQuery,shardKey,unpackPosting,matchPostings} from '../src/text.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'dist');
const load=async file=>JSON.parse(gunzipSync(await fs.readFile(path.join(out,file))));
let catalog;
try{catalog=await load('catalog.json.gz');}catch{}

test('full corpus build is required',()=>assert.ok(catalog,'Run node scripts/build.mjs before collection tests.'));
test('catalogue includes all input IDs and expected languages',async()=>{
  if(!catalog)return;
  const originals=new Set((await fs.readdir(path.join(root,'original_texts - copy'))).filter(n=>n.endsWith('.txt')).map(n=>n.slice(0,-4)));
  const english=new Set((await fs.readdir(path.join(root,'translated_texts - copy'))).filter(n=>n.endsWith('.txt')).map(n=>n.slice(0,-4)));
  const records=new Map(catalog.map(row=>[row.id,row]));
  assert.equal(records.size,catalog.length);
  for(const id of originals)assert.ok(records.get(id)?.hasOriginal,id);
  for(const id of english)assert.ok(records.get(id)?.hasEnglish,id);
  for(const row of catalog){assert.equal(row.hasOriginal,originals.has(row.id));assert.equal(row.hasEnglish,english.has(row.id));}
  assert.ok(catalog.length>=28949);
});
test('sampled generated paragraphs preserve source text through encoding and rendering',async()=>{
  if(!catalog)return;
  const ids=['AB00001','AB00011','BB00151','BH00001','AB00292 (2)',...catalog.filter((r,i)=>i%1500===0).map(r=>r.id)];
  for(const id of new Set(ids)){
    const record=await load(`data/${id}.json.gz`);
    for(const [lang,folder] of [['en','translated_texts - copy'],['original','original_texts - copy']]){
      let bytes;try{bytes=await fs.readFile(path.join(root,folder,id+'.txt'));}catch{assert.equal(record[lang].paragraphs.length,0);continue;}
      let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('windows-1252').decode(bytes);}
      assert.deepEqual(record[lang],parseText(text,lang),`${id} ${lang}`);
      for(const p of record[lang].paragraphs)assert.ok(!/<script[\s>]/i.test(p.html));
    }
  }
});
async function search(language,query){
  const groups=parseQuery(query),postings=new Map();
  for(const word of new Set(groups.flatMap(g=>g.words))){const bucket=await load(`index/${language}/${shardKey(word)}.json.gz`);if(Object.hasOwn(bucket,word))postings.set(word,unpackPosting(Buffer.from(bucket[word],'base64')));}
  return matchPostings(groups,postings).map(index=>catalog[index].id);
}
test('actual compressed indices find sampled phrases and honor whole words',async()=>{
  if(!catalog)return;
  for(const id of ['AB00001','BH00001','BB00151']){
    const record=await load(`data/${id}.json.gz`);
    for(const language of ['en','original']){
      const part=record[language].paragraphs.find(p=>tokenize(p.plain).length>=8);if(!part)continue;
      const words=tokenize(part.plain).slice(2,7),query='"'+words.join(' ')+'"';
      const matches=await search(language,query);assert.ok(matches.includes(id),`${id}: ${language} ${query}`);
    }
  }
  assert.deepEqual(await search('en','nonexistentword987zyx'),[]);
  const matches=await search('en','"the love of god"');assert.ok(matches.length>10);
  for(const id of matches.slice(0,15)){const record=await load(`data/${id}.json.gz`);assert.ok([...record.en.paragraphs,...record.en.notes].some(p=>(' '+tokenize(p.plain).join(' ')+' ').includes(' the love of god ')));}
});
test('build remains inside GitHub Pages size limit and shards are bounded',async()=>{
  if(!catalog)return;
  let size=0,maxShard=0;
  async function walk(folder){for(const entry of await fs.readdir(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory())await walk(file);else{const bytes=(await fs.stat(file)).size;size+=bytes;if(file.includes(path.sep+'index'+path.sep))maxShard=Math.max(maxShard,bytes);}}}
  await walk(out);assert.ok(size<1_000_000_000,`Output size ${size}`);assert.ok(maxShard<5_000_000,`Largest shard ${maxShard}`);
  console.log(`Site size: ${(size/1e6).toFixed(1)} MB; largest index shard: ${(maxShard/1000).toFixed(1)} KB`);
});
