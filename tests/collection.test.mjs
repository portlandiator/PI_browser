import {recordFilename} from '../src/record-file.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {parseCsv,parseText,tokenize,parseQuery,shardKey,unpackPosting,matchPostings} from '../src/text.mjs';
import {mayPublishOriginal} from '../src/original-publication.mjs';
import {decodeSource} from '../scripts/source-encoding.mjs';
import {indexedUnits,unitShard,matchingUnits,matchingPassages} from '../src/search-passages.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'dist');
const metadataFolder=path.join(root,'metadata - copy');
const sourceMetadata=new Map(parseCsv(await fs.readFile(path.join(metadataFolder,(await fs.readdir(metadataFolder)).find(n=>n.endsWith('.csv'))),'utf8')).map(row=>[row.PIN,row]));
const stats=JSON.parse(await fs.readFile(path.join(out,'stats.json'),'utf8'));
const load=async file=>JSON.parse(gunzipSync(await fs.readFile(path.join(out,stats.dataset||'',file))));
let catalog;
try{catalog=await load('catalog.json.gz');}catch{}

test('full corpus build is required',()=>assert.ok(catalog,'Run node scripts/build.mjs before collection tests.'));
test('catalogue includes all input IDs and expected languages',async()=>{
  if(!catalog)return;
  const originals=new Set((await fs.readdir(path.join(root,'original_texts - copy'))).filter(n=>n.endsWith('.txt')).map(n=>n.slice(0,-4)));
  const english=new Set((await fs.readdir(path.join(root,'translated_texts - copy'))).filter(n=>n.endsWith('.txt')).map(n=>n.slice(0,-4)));
  const records=new Map(catalog.map(row=>[row.id,row]));
  assert.equal(records.size,catalog.length);
  for(const id of originals)assert.ok(records.has(id),id);
  for(const id of english)assert.ok(records.get(id)?.hasEnglish,id);
  for(const row of catalog){assert.equal(row.hasOriginal,originals.has(row.id)&&mayPublishOriginal(sourceMetadata.get(row.id)),row.id);assert.equal(row.hasEnglish,english.has(row.id));}
  assert.ok(catalog.length>=28949);
});
test('sampled generated paragraphs preserve source text through encoding and rendering',async()=>{
  if(!catalog)return;
  const ids=['AB00001','AB00011','BB00151','BH00001','AB00292 (2)',...catalog.filter((r,i)=>i%1500===0).map(r=>r.id)];
  for(const id of new Set(ids)){
    const record=await load(`data/${recordFilename(id)}`);
    for(const [lang,folder] of [['en','translated_texts - copy'],['original','original_texts - copy']]){
      if(lang==='original'&&!mayPublishOriginal(sourceMetadata.get(id))){assert.deepEqual(record.original,parseText('','original'));continue;}
      let bytes;try{bytes=await fs.readFile(path.join(root,folder,id+'.txt'));}catch{assert.equal(record[lang].paragraphs.length,0);continue;}
      const {text}=decodeSource(bytes);
      assert.deepEqual(record[lang],parseText(text,lang),`${id} ${lang}`);
      for(const p of record[lang].paragraphs)assert.ok(!/<script[\s>]/i.test(p.html));
    }
  }
});
async function search(language,query){
  const groups=parseQuery(query),postings=new Map();
  for(const word of new Set(groups.flatMap(g=>g.words))){const bucket=await load(`index/${language}/${shardKey(word)}.json.gz`);if(Object.hasOwn(bucket,word))postings.set(word,unpackPosting(Buffer.from(bucket[word],'base64')));}
  const units=new Map(),matches=[];
  for(const doc of matchPostings(groups,postings)){
    const key=unitShard(doc);if(!units.has(key))units.set(key,await load(`index/units/${key}.json.gz`));
    if(matchingUnits(groups,postings,doc,units.get(key)[doc][language]).length)matches.push(catalog[doc].id);
  }
  return matches;
}
test('generated boundaries and complete-query matches agree with source paragraphs and notes',async()=>{
  for(const id of ['AB00001','BH00001','BB00151','BH00004','AB00292 (2)']){
    const doc=catalog.findIndex(row=>row.id===id),record=await load(`data/${recordFilename(id)}`);
    const boundaries=(await load(`index/units/${unitShard(doc)}.json.gz`))[doc];
    for(const language of ['en','original'])assert.deepEqual(boundaries[language],[...indexedUnits(record[language])].map(unit=>unit.end),`${id} ${language}`);
  }
  for(const [language,query] of [['en','"love of God" peace'],['en','love justice'],['en','love God'],['original','کتاب الله']]){
    const matches=await search(language,query);assert.ok(matches.length>0,query);
    // This source has love and God in separate paragraphs, catching the former
    // document-wide AND while still deriving expectations from current sources.
    const sample=await load('data/BH00386.json.gz');
    assert.equal(matches.includes(sample.id),matchingPassages(sample,query,[language]).length>0);
    for(const id of matches.slice(0,30)){
      const record=await load(`data/${recordFilename(id)}`);
      assert.ok(matchingPassages(record,query,[language]).length,`${id}: ${query}`);
    }
  }
});
test('actual compressed indices find sampled phrases and honor whole words',async()=>{
  if(!catalog)return;
  for(const id of ['AB00001','BH00001','BB00151']){
    const record=await load(`data/${recordFilename(id)}`);
    for(const language of ['en','original']){
      const part=record[language].paragraphs.find(p=>tokenize(p.plain).length>=8);if(!part)continue;
      const words=tokenize(part.plain).slice(2,7),query='"'+words.join(' ')+'"';
      const matches=await search(language,query);assert.ok(matches.includes(id),`${id}: ${language} ${query}`);
    }
  }
  assert.deepEqual(await search('en','nonexistentword987zyx'),[]);
  const matches=await search('en','"the love of god"');assert.ok(matches.length>10);
  for(const id of matches.slice(0,15)){const record=await load(`data/${recordFilename(id)}`);assert.ok([...record.en.paragraphs,...record.en.notes].some(p=>(' '+tokenize(p.plain).join(' ')+' ').includes(' the love of god ')));}
});
test('case-distinct catalogue identities have separate generated records',async()=>{
  if(!catalog)return;
  const filenames=catalog.map(r=>recordFilename(r.id).toLowerCase());assert.equal(new Set(filenames).size,catalog.length);
  for(const id of ['BH05388','bh05388','BH03974x']){
    const expected=catalog.find(r=>r.id===id);assert.ok(expected);
    const record=await load('data/'+recordFilename(id));assert.equal(record.id,id);assert.equal(record.hasEnglish,expected.hasEnglish);assert.equal(Boolean(record.en.paragraphs.length),expected.hasEnglish);
  }
});
test('build remains inside GitHub Pages size limit and shards are bounded',async()=>{
  if(!catalog)return;
  let size=0,maxShard=0;
  async function walk(folder){for(const entry of await fs.readdir(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory())await walk(file);else{const bytes=(await fs.stat(file)).size;size+=bytes;if(file.includes(path.sep+'index'+path.sep))maxShard=Math.max(maxShard,bytes);}}}
  // Publication keeps its audits and build cache outside the upload directory.
  // Refuse a stale staging folder from another dataset. Ordinary local builds
  // without staging retain the previous complete-output size check.
  let sizeRoot=out;
  try{const marker=JSON.parse(await fs.readFile(path.join(root,'public-site/publication.json'),'utf8'));assert.equal(marker.dataset,stats.dataset);sizeRoot=path.join(root,'public-site');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  for(const entry of await fs.readdir(sizeRoot,{withFileTypes:true})){
    const file=path.join(sizeRoot,entry.name);
    if(entry.name==='collections')await walk(path.join(sizeRoot,stats.dataset));
    else if(entry.isDirectory())await walk(file);
    else size+=(await fs.stat(file)).size;
  }
  assert.ok(size<1_000_000_000,`Output size ${size}`);assert.ok(maxShard<5_000_000,`Largest shard ${maxShard}`);
  console.log(`Site size: ${(size/1e6).toFixed(1)} MB; largest index shard: ${(maxShard/1000).toFixed(1)} KB`);
});

test('translation word total agrees with the complete English positional index',async()=>{
  let total=0;
  for(let bucket=0;bucket<1024;bucket++){
    const shard=await load('index/en/'+bucket+'.json.gz');
    for(const encoded of Object.values(shard))for(const positions of unpackPosting(Buffer.from(encoded,'base64')).values())total+=positions.length;
  }
  assert.ok(total>0);
  assert.equal(stats.translationWordCount,total);
});
