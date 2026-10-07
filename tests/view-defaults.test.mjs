import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {parseDefaults,randomDefault,volumeStart,defaultFiles} from '../src/view-defaults.mjs';

test('default CSVs preserve the first subject, quoted commas, BOMs and volume/page pairs',()=>{
  assert.deepEqual(parseDefaults('subject','\uFEFFThe Primal Will\r\n"human soul as mirror; divine light, attributes within"\r\n'),['The Primal Will','human soul as mirror; divine light, attributes within']);
  assert.deepEqual(parseDefaults('volume','volume,page\n30,14\n179,114'),[{volume:'30',page:14},{volume:'179',page:114}]);
  assert.throws(()=>parseDefaults('volume','volume,page\n2,0'));
  assert.throws(()=>parseDefaults('subject',''));
});

test('random choices span the list and explicit reading links bypass rotation',()=>{
  const entries=[{volume:'2',page:14},{volume:'179',page:114}];
  assert.deepEqual(volumeStart(new URLSearchParams(),entries,()=>0),entries[0]);
  assert.deepEqual(volumeStart(new URLSearchParams('layout=spread'),entries,()=>0.999),entries[1]);
  const forbidden=()=>{throw Error('Explicit links must not select a default');};
  assert.deepEqual(volumeStart(new URLSearchParams('volume=98&page=22'),[],forbidden),{volume:'98',page:'22'});
  assert.deepEqual(volumeStart(new URLSearchParams('volume=2'),[],forbidden),{volume:'2',page:1});
  assert.deepEqual(volumeStart(new URLSearchParams('page=7'),[],forbidden),{volume:'30',page:'7'});
  assert.equal(randomDefault(['first','last'],()=>0.999),'last');
  assert.throws(()=>randomDefault([]));
});

test('every configured subject and volume exists, and both CSVs are deployed unchanged',async()=>{
  const stats=JSON.parse(await fs.readFile('dist/stats.json','utf8'));
  const index=JSON.parse(gunzipSync(await fs.readFile(`dist/${stats.dataset}subjects/index.json.gz`)));
  const volumes=JSON.parse(await fs.readFile('dist/volumes.json','utf8'));
  for(const [kind,file] of Object.entries(defaultFiles)){
    const source=await fs.readFile(file,'utf8');
    assert.equal(await fs.readFile('dist/'+file,'utf8'),source);
    for(const entry of parseDefaults(kind,source)){
      if(kind==='subject')assert.ok(index.subjects.some(subject=>subject.name===entry),entry);
      else assert.ok(Object.hasOwn(volumes,entry.volume),entry.volume);
    }
  }
});
