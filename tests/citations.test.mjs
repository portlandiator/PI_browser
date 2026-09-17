import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {countReferences,citationCount} from '../src/citations.mjs';
import {parseCsv} from '../src/text.mjs';

test('citation totals count linked and unlinked entries, not punctuation or empty entries',()=>{
  assert.equal(countReferences(''),0);
  assert.equal(countReferences(' , , '),0);
  assert.equal(countReferences('<a href="https://example.org/a,b?x=1&amp;y=2">Name, Title</a>, , MS1 (pp. 1, 3), PUB2 [vol. 1, 2],'),3);
  assert.equal(citationCount({Manuscripts:'MS1, MS2',Publications:'PUB1',Translations:'T1, T2','Musical interpretations':'<a href="https://example.org">Song</a>',Notes:'Not a citation'}),6);
});

test('generated catalogue citation totals agree with all four source fields',async()=>{
  const stats=JSON.parse(await fs.readFile(new URL('../dist/stats.json',import.meta.url),'utf8'));
  const catalog=JSON.parse(gunzipSync(await fs.readFile(new URL(`../dist/${stats.dataset}catalog.json.gz`,import.meta.url))));
  const dir=new URL('../metadata - copy/',import.meta.url);
  const file=(await fs.readdir(dir)).find(name=>name.endsWith('.csv'));
  const rows=new Map(parseCsv(await fs.readFile(new URL(file,dir),'utf8')).map(row=>[row.PIN,row]));
  for(const record of catalog)assert.equal(record.citationCount,citationCount(rows.get(record.id)||{}),record.id);
  assert.ok(catalog.some(record=>record.citationCount>100));
});
