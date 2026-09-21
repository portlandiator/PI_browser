import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {mayPublishOriginal,publicMetadata} from '../src/original-publication.mjs';
import {recordFilename} from '../src/record-file.mjs';
import {parseCsv,unpackPosting} from '../src/text.mjs';

test('original availability requires a manuscript or publication entry',()=>{
  for(const row of [undefined,{}, {Manuscripts:' , , ',Publications:'\n'}])assert.equal(mayPublishOriginal(row),false);
  for(const row of [{Manuscripts:'MS 1'},{Publications:'<a href="https://example.org/a,b">A, B</a>'}])assert.equal(mayPublishOriginal(row),true);
  const row={PIN:'X','First line (original)':'PRIVATE'};
  assert.equal(publicMetadata(row)['First line (original)'],'');
  assert.equal(row['First line (original)'],'PRIVATE');
});

test('withheld originals are absent from every generated record and original index posting',async()=>{
  const stats=JSON.parse(await fs.readFile('dist/stats.json','utf8'));
  const base='dist/'+stats.dataset;
  const load=async name=>JSON.parse(gunzipSync(await fs.readFile(base+name)));
  const catalog=await load('catalog.json.gz'),blocked=new Set();
  const metadata=new Map(parseCsv(await fs.readFile('metadata - copy/'+(await fs.readdir('metadata - copy')).find(n=>n.endsWith('.csv')),'utf8')).map(row=>[row.PIN,row]));
  for(let i=0;i<catalog.length;i++){
    const row=catalog[i];
    if(mayPublishOriginal(metadata.get(row.id)))continue;
    assert.equal(row.hasOriginal,false,row.id);
    const record=await load('data/'+recordFilename(row.id));
    blocked.add(i);
    assert.deepEqual(record.original.paragraphs,[],row.id);
    assert.deepEqual(record.original.notes,[],row.id);
    assert.equal(record.metadata['First line (original)']||'','',row.id);
  }
  assert.ok(blocked.size>4000);
  for(const name of await fs.readdir(base+'index/original')){
    const shard=await load('index/original/'+name);
    for(const encoded of Object.values(shard))for(const id of unpackPosting(Buffer.from(encoded,'base64')).keys())assert.ok(!blocked.has(id),'Withheld original appears in search index');
  }
});
