import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseCsv} from '../src/text.mjs';
import {compareSelections} from '../src/subject-list.mjs';

test('canonical order preserves every authoritative subject and reference version',()=>{
  const order=JSON.parse(readFileSync(new URL('../src/subject-order.json',import.meta.url)));
  const names=parseCsv(readFileSync(new URL('../14-colors_and_hyperlinks.csv',import.meta.url),'utf8')).map(row=>row.subject);
  assert.deepEqual([...order.subjects].sort(),names.sort());
  assert.equal(new Set(order.subjects).size,names.length);
  assert.equal(order.sha256,createHash('sha256').update(readFileSync(new URL('../subjects - reference.docx',import.meta.url))).digest('hex'));
  assert.deepEqual(order.subjects.slice(0,3),['transcendence; unknowability of God','absolute freedom; independence of God',"God's love for His own Essence"]);
  assert.equal(order.groups.length,19);
  assert.equal(order.groups[0].title,'I.A. God and the realm of the Divine Will');
  assert.equal(order.groups.at(-1).id,'V.C.');
  assert.deepEqual(order.groups.flatMap(group=>group.subjects),order.subjects);
  assert.ok(order.groups.every(group=>group.subjects.length>0));
});

test('passages sort by source citation count before pagination, with deterministic ties',()=>{
  const selection=(id,source,paragraph)=>({id,candidates:[{source,ranges:[{paragraph}]}],suppliedIds:[]});
  const rows=[selection('low','A',1),selection('later','B',8),selection('tie','C',1),selection('earlier','B',2),{id:'missing',candidates:[],suppliedIds:[]}];
  const sources={A:{citationCount:2},B:{citationCount:20},C:{citationCount:20}};
  rows.sort((a,b)=>compareSelections(a,b,sources));
  assert.deepEqual(rows.map(row=>row.id),['earlier','later','tie','low','missing']);
  assert.deepEqual(rows.slice(0,2).map(row=>row.id),['earlier','later']);
});
