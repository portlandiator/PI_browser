import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseCsv} from '../src/text.mjs';
import {sourceExternalUrl,metadataParts,renderMetadata,metadataSearchText,safeExternalUrl,describeFields,matchesMetadata,facetSummary} from '../src/metadata.mjs';

test('metadata retains link labels, query strings and fragments safely',()=>{
  const source='See <a href="https://example.org/book?a=1&amp;b=2#page=8" onclick="bad()"><em>Source A</em></a>, https://example.org/other.';
  const html=renderMetadata(source);
  assert.match(html,/href="https:\/\/example.org\/book\?a=1&amp;b=2#page=8"/);
  assert.match(html,/>Source A<\/a>/);assert.match(html,/rel="noopener noreferrer"/);
  assert.match(html,/href="https:\/\/example.org\/other"/);
  assert.ok(!html.includes('onclick'));assert.ok(!html.includes('<em>'));
  assert.ok(metadataSearchText(source).includes('Source A https://example.org/book?a=1&b=2#page=8'));
});
test('metadata never renders scripts or dangerous link protocols',()=>{
  const html=renderMetadata('<script>alert(1)</script><a href="jav&#x61;script:alert(1)">Bad</a><a href="data:text/html,evil">Bad 2</a><img src=x onerror=alert(1)>');
  assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('<a '));
  for(const url of ['javascript:alert(1)','data:text/html,bad','file:///C:/private','//evil.test','https://good.test/\nbad'])assert.equal(safeExternalUrl(url),null);
});
test('facets combine selected values with OR and other conditions with AND',()=>{
  assert.ok(matchesMetadata('Per',{values:['Per','Ara']}));assert.ok(matchesMetadata('Ara',{values:['Per','Ara']}));assert.ok(!matchesMetadata('mixed',{values:['Per','Ara']}));
  assert.ok(matchesMetadata('‘Akká',{text:'akka'}));assert.ok(matchesMetadata('',{presence:'missing'}));assert.ok(!matchesMetadata('unknown',{presence:'missing'}));
  assert.ok(matchesMetadata('1250',{min:'1000',max:'2000'}));assert.ok(!matchesMetadata('unknown',{min:'0'}));assert.ok(!matchesMetadata('500',{min:'1000'}));
  assert.ok(matchesMetadata('Source https://example.org',{text:'example.org',presence:'present'}));
});
test('facet counts use candidate documents and retain zero-count selections',()=>{
  const values=['Ara','Per','Per','','mixed'];
  const summary=facetSummary(values,[0,1,3],{selected:['mixed']});
  assert.equal(summary.present,2);assert.equal(summary.missing,1);
  assert.deepEqual(Object.fromEntries(summary.options.map(x=>[x.value,x.count])),{mixed:0,Ara:1,Per:1});
  assert.equal(facetSummary(values,[0,1,2,3,4],{query:'pe'}).options[0].count,2);
});
const metadataFolder=new URL('../metadata - copy/',import.meta.url);
const files=fs.readdirSync(metadataFolder).filter(n=>n.endsWith('.csv'));
const rows=parseCsv(fs.readFileSync(new URL(files[0],metadataFolder),'utf8'));
test('all source fields are represented and PINs are unique',()=>{
  assert.equal(files.length,1);assert.equal(rows.length,29028);assert.equal(new Set(rows.map(row=>row.PIN)).size,rows.length);
  const fields=describeFields(rows);assert.equal(fields.length,18);assert.deepEqual(fields.map(f=>f.name),Object.keys(rows[0]));
  assert.equal(fields.find(f=>f.name==='Word count').kind,'number');assert.equal(fields.find(f=>f.name==='Language').kind,'categorical');assert.equal(fields.find(f=>f.name==='Subjects').populated,0);
});
test('every supplied web anchor is retained; local file references remain visible',()=>{
  let total=0;
  for(const row of rows)for(const value of Object.values(row)){
    const source=[...value.matchAll(/<a\s+href="([^"]+)"[^>]*>/gi)].map(m=>m[1]);
    const retained=metadataParts(value).filter(part=>part.url).map(part=>part.url);
    assert.deepEqual(retained,source.map(sourceExternalUrl).filter(Boolean),row.PIN); for(const href of source.filter(h=>/^[a-z]:\\/i.test(h)))assert.ok(metadataSearchText(value).includes(href));total+=source.length;
    const html=renderMetadata(value);assert.equal((html.match(/target="_blank"/g)||[]).length,retained.length+(metadataParts(value).filter(p=>!p.url).reduce((n,p)=>n+(p.text.match(/https?:\/\//g)||[]).length,0)));
  }
  assert.equal(total,59347);
});
