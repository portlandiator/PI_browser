import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parseDictionary,dictionaryKey,dictionaryShard} from '../src/dictionary.mjs';
import {buildDictionaries,readDictionaryCatalog} from '../scripts/build-dictionaries.mjs';

const root=path.resolve(import.meta.dirname,'..');
const tsv='form\tgloss\tstatus\treviewer\nنور\tlight\tReviewed\tSL 2026-11-05\nالهی\tdivine\tUNCERTAIN\t\nمن\tI\t\t\nشود\tbecomes\tunreviewed\t\n';

test('status and reviewer columns parse with aliases and any case',()=>{
  const entries=parseDictionary(tsv,{strict:true});
  assert.deepEqual(entries.map(e=>e.status),['reviewed','uncertain',undefined,'unreviewed']);
  assert.equal(entries[0].reviewer,'SL 2026-11-05');assert.equal(entries[1].reviewer,undefined);
  assert.equal(parseDictionary('form,gloss,Review\nنور,light,reviewed\n')[0].status,'reviewed');
  assert.equal(parseDictionary('form\tgloss\tReview Status\nنور\tlight\tUncertain\n')[0].status,'uncertain');
});

test('invalid status is dropped leniently and rejected strictly; reviewer needs reviewed',()=>{
  const bad='form\tgloss\tstatus\nنور\tlight\tchecked\n';
  assert.equal('status' in parseDictionary(bad)[0],false);
  assert.throws(()=>parseDictionary(bad,{strict:true}),/Row 2 \(نور\): status must be unreviewed, uncertain or reviewed/);
  const reviewer='form\tgloss\tstatus\treviewer\nنور\tlight\tuncertain\tSL\n';
  assert.equal(parseDictionary(reviewer)[0].reviewer,'SL');
  assert.throws(()=>parseDictionary(reviewer,{strict:true}),/reviewer/);
  assert.throws(()=>parseDictionary('form\tgloss\treviewer\nنور\tlight\tSL\n',{strict:true}),/reviewer/);
});

test('sample dictionaries give every row a status, with the uncertain notes marked',async()=>{
  const expected={'sample-volume-164':25,'sample-volume-164-en-fa':18,'sample-volume-164-en-ar':12};
  for(const item of await readDictionaryCatalog(root)){
    if(!(item.id in expected))continue;
    const entries=parseDictionary(await fs.readFile(path.join(root,'dictionaries',item.file),'utf8'),{strict:true});
    assert.ok(entries.every(e=>e.status==='unreviewed'||e.status==='uncertain'),item.id);
    assert.ok(entries.every(e=>!e.reviewer),item.id);
    assert.equal(entries.filter(e=>e.status==='uncertain').length,expected[item.id],item.id);
    assert.ok(entries.filter(e=>/uncertain|نامطمئن|غير مؤكد/i.test(e.notes||'')).every(e=>e.status==='uncertain'),item.id);
    delete expected[item.id];
  }
  assert.deepEqual(expected,{});
});

test('the build publishes review counts and keeps status in the shards',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'pi-dictionary-review-'));
  try{
    await fs.mkdir(path.join(temp,'dictionaries'));
    await fs.writeFile(path.join(temp,'dictionaries','t.tsv'),tsv);
    await fs.writeFile(path.join(temp,'dictionaries','dictionaries.json'),JSON.stringify({dictionaries:[{id:'t',name:'Test',file:'t.tsv'}]}));
    await buildDictionaries(temp,path.join(temp,'out'));
    const index=JSON.parse(await fs.readFile(path.join(temp,'out','dictionaries','index.json'),'utf8'));
    assert.deepEqual(index.dictionaries[0].review,{unreviewed:2,uncertain:1,reviewed:1});
    const key=dictionaryKey('نور'),shard=JSON.parse(await fs.readFile(path.join(temp,'out','dictionaries','t',`o-${dictionaryShard(key)}.json`),'utf8'));
    assert.equal(shard[key][0].status,'reviewed');assert.equal(shard[key][0].reviewer,'SL 2026-11-05');
  }finally{await fs.rm(temp,{recursive:true,force:true});}
});
