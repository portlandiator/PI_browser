import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {authorizedPairs,buildConcordance,concordanceShard,concordanceShards,displayForm,englishStopwords} from '../src/concordance.mjs';
import {dictionaryKey} from '../src/dictionary.mjs';
import {shardKey} from '../src/text.mjs';
import {writeConcordance} from '../scripts/build-concordance.mjs';

const version=(texts,alignment)=>({paragraphs:texts.map(plain=>({html:plain,plain})),notes:[],...(alignment?{alignment}:{})});
const record=(id,{authorized='Y',en,original,citationCount,publishable=true,enAlignment,originalAlignment})=>({id,citationCount,hasEnglish:true,hasOriginal:true,metadata:{Authorized:authorized,Manuscripts:publishable?'MS 1':'',Publications:''},en:version(en,enAlignment),original:version(original,originalAlignment)});
const entry=(result,word)=>{const key=dictionaryKey(word);return result.shards[concordanceShard(key)][key];};

const records=[
  record('BH001',{citationCount:5,en:['The light of glory shines','Glory and light abide','Unauthorized glory'],original:['نور بهاء','بهاء نور','بهاء'],authorized:'Y 1-2'}),
  record('AB002',{citationCount:9,en:['Glory upon glory, the light','Servants of glory','Blank slot'],original:['بهاء نور بهاء','عباد بهاء','بهاء'],enAlignment:[0,1,null,2],originalAlignment:[0,1,2,null]}),
  record('BB003',{en:['Glory everywhere'],original:['بهاء'],authorized:''}),
  record('BB004',{en:['Glory','Glory'],original:['بهاء'],authorized:'Y'}),
  record('BB005',{en:['Glory'],original:['بهاء'],publishable:false}),
];

test('authorized pairs follow ranges, layouts and publication rules',()=>{
  assert.deepEqual(authorizedPairs(records[0]).map(p=>[p.englishNumber,p.originalNumber]),[[1,1],[2,2]]);
  assert.deepEqual(authorizedPairs(records[1]).map(p=>[p.englishNumber,p.originalNumber]),[[1,1],[2,2]]);
  for(const skipped of records.slice(2))assert.deepEqual(authorizedPairs(skipped),[]);
  assert.deepEqual(authorizedPairs({...records[0],hasOriginal:false}),[]);
});

test('concordance counts paragraphs, orders references and scores co-occurrence',()=>{
  const result=buildConcordance(records);
  assert.deepEqual(result.index,{paragraphs:4,records:2,keys:3,englishKeys:5});
  assert.equal(result.shards.length,concordanceShards);
  const glory=entry(result,'بهاء');
  assert.equal(glory.n,4);
  assert.deepEqual(glory.r,[['AB002',1],['AB002',2],['BH001',1],['BH001',2]]);
  // glory appears in all 4 pairs: dice 1; light in 3: 2*3/(4+3)
  assert.deepEqual(glory.w,[['glory',1,4],['light',0.857,3]]);
  const light=entry(result,'نور');
  assert.equal(light.n,3);
  assert.deepEqual(light.w,[['light',1,3],['glory',0.857,3]]);
  const servants=entry(result,'عباد');
  assert.deepEqual(servants,{n:1,r:[['AB002',2]],w:[]});
  for(const {w} of [glory,light])for(const [word] of w)assert.ok(!englishStopwords.has(word));
  assert.ok(['the','and','upon','unto','verily'].every(word=>englishStopwords.has(word)));
});

test('references and words are capped deterministically',()=>{
  const letters=n=>String.fromCharCode(...[...String(n).padStart(2,'0')].map(d=>97+Number(d)));
  const many=Array.from({length:30},(_,i)=>record(`X${String(i).padStart(3,'0')}`,{citationCount:i%3,en:Array.from({length:2},(_,j)=>`alpha beta${letters(j)} gamma${letters(i)} word${letters(i)}${letters(j)} 2020`),original:['کلمه','کلمه']}));
  const result=buildConcordance(many);
  const word=entry(result,'کلمه');
  assert.equal(word.n,60);assert.equal(word.r.length,40);
  const sorted=many.flatMap(r=>[1,2].map(n=>[r.id,n,r.citationCount])).sort((a,b)=>b[2]-a[2]||(a[0]<b[0]?-1:a[0]>b[0]?1:0)||a[1]-b[1]).slice(0,40).map(([id,n])=>[id,n]);
  assert.deepEqual(word.r,sorted);
  assert.equal(word.w.length,8);
  assert.deepEqual(word.w.slice(0,3),[['alpha',1,60],['betaaa',0.667,30],['betaab',0.667,30]]);
  assert.ok(word.w.slice(3).every(([,dice,joint])=>joint===2&&dice===Math.round(2000*2/62)/1000));
  assert.equal(word.w[3][0],'gammaaa');
  assert.ok(word.w.every(([,,joint])=>joint>=2));
});

test('co-occurring words are shown in their usual spelling',()=>{
  const result=buildConcordance([
    record('AB010',{en:['‘Abdu’l-Bahá served the Cause and the friends','Friends of ‘Abdu’l-Bahá in the Cause','The Cause of Abdu’l-Bahá; the friends'],original:['مولی امر','مولی امر','مولی امر']}),
  ]);
  const w=entry(result,'امر').w;
  assert.deepEqual(w.map(([word])=>word).sort(),['Cause','friends','‘Abdu’l-Bahá'].sort());
  assert.deepEqual(w.find(([word])=>word==='‘Abdu’l-Bahá'),['‘Abdu’l-Bahá',1,3]);
  assert.deepEqual(entry(result,'مولی').w,w);
  // Ties go to the first spelling seen; one lower-case occurrence lowers it.
  assert.equal(displayForm(new Map([['Abhá',2],['Abha',2]])),'Abhá');
  assert.equal(displayForm(new Map([['Glory',5],['glory',1]])),'glory');
  assert.equal(displayForm(new Map([['‘Akká',1]])),'‘Akká');
});

test('shard function is stable',()=>{
  const key=dictionaryKey('بهاء');
  assert.equal(concordanceShard(key),shardKey(key)%256);
  assert.equal(concordanceShard('امر'),concordanceShard('امر'));
  assert.ok(concordanceShard(key)>=0&&concordanceShard(key)<256);
});

test('writeConcordance publishes index and shards from a dataset',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'concordance-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const out=path.join(root,'dist'),dataset='collections/test-1/',data=path.join(out,dataset,'data');
  await fs.mkdir(data,{recursive:true});
  for(const item of records.slice(0,2))await fs.writeFile(path.join(data,`${item.id}.json.gz`),gzipSync(JSON.stringify(item)));
  await fs.mkdir(path.join(out,'concordance'),{recursive:true});await fs.writeFile(path.join(out,'concordance','o-999.json'),'stale');
  const summary=await writeConcordance(root,out,dataset);
  assert.equal(summary.paragraphs,4);
  const index=JSON.parse(await fs.readFile(path.join(out,'concordance','index.json'),'utf8'));
  assert.deepEqual(index,{format:1,dataset,shards:256,english:true,paragraphs:4,records:2,keys:3,englishKeys:5});
  const english=JSON.parse(await fs.readFile(path.join(out,'concordance',`e-${concordanceShard('glory')}.json`),'utf8'));
  assert.equal(english.glory.n,4);assert.deepEqual(english.glory.o[0],['بهاء',1,4]);
  const key=dictionaryKey('بهاء');
  const shard=JSON.parse(await fs.readFile(path.join(out,'concordance',`o-${concordanceShard(key)}.json`),'utf8'));
  assert.equal(shard[key].n,4);
  await assert.rejects(fs.access(path.join(out,'concordance','o-999.json')));
  await assert.rejects(writeConcordance(root,out,'../x/'),/Invalid dataset/);
});

test('a word mostly written with a capital keeps it; a mixed one is lower-cased',async()=>{
  const {displayForm}=await import('../src/concordance.mjs');
  assert.equal(displayForm(new Map([['God',9614],['god',3]])),'God');
  assert.equal(displayForm(new Map([['Cause',1125],['cause',652]])),'cause');
  assert.equal(displayForm(new Map([['friends',60]])),'friends');
});

test('the reverse concordance lists English words with the original words found with them',()=>{
  const result=buildConcordance(records);
  const english=word=>result.english[concordanceShard(word)][word];
  assert.equal(result.english.length,concordanceShards);
  // English paragraph numbers, ordered like the forward index (citations, id, number).
  const glory=english('glory');
  assert.equal(glory.n,4);
  assert.deepEqual(glory.r,[['AB002',1],['AB002',2],['BH001',1],['BH001',2]]);
  // بهاء in all 4 pairs: dice 1; نور in 3: 2*3/(4+3). عباد (one pair) is left out.
  assert.deepEqual(glory.o,[['بهاء',1,4],['نور',0.857,3]]);
  assert.deepEqual(english('light').o,[['نور',1,3],['بهاء',0.857,3]]);
  assert.deepEqual(english('servants'),{n:1,r:[['AB002',2]],o:[]});
  // Stopwords and short words have no entry.
  for(const word of ['the','and','of','upon'])assert.equal(english(word),undefined,word);
});

test('the reverse concordance needs a joint count of two, caps and shows usual spellings',()=>{
  const letters=n=>String.fromCharCode(...[...String(n).padStart(2,'0')].map(d=>97+Number(d)));
  // "word" is in 30 pairs; کلمه in all, each other original word in 2 or 3.
  const many=Array.from({length:30},(_,i)=>record(`X${String(i).padStart(3,'0')}`,{citationCount:i%3,en:['word','word'],original:[`کلمهٔ ${'ب'.repeat(2+(i%10))}`,`کلمه ${'ت'.repeat(2+(i%12))}`]}));
  const result=buildConcordance(many),word=result.english[concordanceShard('word')].word;
  assert.equal(word.n,60);assert.equal(word.r.length,40);
  assert.deepEqual(word.r[0],['X002',1]);
  assert.equal(word.o.length,8);
  // The most frequent spelling of کلمه is shown (30 each: the first seen wins).
  assert.deepEqual(word.o[0],['کلمهٔ',1,60]);
  assert.ok(word.o.every(([,,joint])=>joint>=2));
  const few=buildConcordance([record('Y1',{en:['rare word','other word'],original:['الف','باء']})]);
  assert.deepEqual(few.english[concordanceShard('word')].word.o,[]);
});
