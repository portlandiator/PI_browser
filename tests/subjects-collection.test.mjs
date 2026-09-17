import {recordFilename} from '../src/record-file.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
const stats=JSON.parse(await fs.readFile('dist/stats.json','utf8'));
const load=async name=>JSON.parse(gunzipSync(await fs.readFile('dist/'+stats.dataset+name)));
test('full subject import preserves rows, statuses, source versions and highlight boundaries',async()=>{
  const index=await load('subjects/index.json.gz');assert.equal(index.subjects.length,661);assert.equal(new Set(index.subjects.map(s=>s.id)).size,661);assert.equal(index.report.processedSubjects,661);for(const id of index.report.missingCategories)assert.ok(index.report.sourceExceptions[id]);
  assert.equal(Object.values(index.report.counts).reduce((a,b)=>a+b,0),index.report.selections);
  const records=new Map(),seen=new Set(),passageIds=new Set();let count=0,accepted=0;
  for(const subject of index.subjects){const data=await load(`subjects/${subject.id}.json.gz`);assert.equal(data.subject.id,subject.id);assert.equal(subject.selections,data.selections.length);
    for(const s of data.selections){count++;assert.ok(!seen.has(s.id));seen.add(s.id);assert.equal(s.subject,subject.id);assert.ok(s.raw);assert.ok(s.provenance.subjectUrl);if(!s.passage){assert.ok(!['exact','normalized','confirmed'].includes(s.status));continue;}accepted++;passageIds.add(s.passage);assert.ok(['exact','normalized','confirmed'].includes(s.status));const c=s.candidates[0];if(!records.has(c.source))records.set(c.source,await load(`data/${recordFilename(c.source)}`));const r=records.get(c.source);assert.equal(r.enVersion,c.version);for(const range of c.ranges){const p=r.en.paragraphs[range.paragraph-1];assert.ok(p,`${s.id}: ${c.source} paragraph ${range.paragraph}, record ${r.id} has ${r.en.paragraphs.length}`);assert.ok(range.start>=0&&range.end>range.start&&range.end<=p.plain.length);assert.equal(p.plain.slice(range.start,range.end),range.text);assert.equal(range.paragraphId,`${c.source}@${c.version}:en:${range.paragraph}`);}assert.ok(s.otherSubjects.includes(subject.id));}
  }
  assert.equal(count,index.report.selections);assert.ok(index.report.selections>100000);
  const files=new Set((await fs.readdir('dist/'+stats.dataset+'subjects/passages')).map(f=>f.replace('.json.gz','')));assert.deepEqual(files,passageIds);assert.equal(passageIds.size,index.report.passages);assert.equal(accepted-passageIds.size,index.report.duplicateRanges);
  for(const id of [...passageIds].slice(0,30)){const passage=await load('subjects/passages/'+id+'.json.gz');assert.equal(passage.id,id);assert.ok(passage.subjects.length);assert.ok(passage.selections.every(s=>seen.has(s.id)&&passage.subjects.includes(s.subject)));}
  for(const edge of index.edges){assert.ok(index.subjects.some(s=>s.id===edge.source));assert.ok(index.subjects.some(s=>s.id===edge.target));if(edge.status==='suggested'){assert.ok(edge.score>0&&edge.score<=1);assert.ok(edge.sharedParagraphs>=2);}}
});
