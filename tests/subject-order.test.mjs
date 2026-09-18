import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseCsv} from '../src/text.mjs';

test('canonical order preserves every authoritative subject and reference version',()=>{
  const order=JSON.parse(readFileSync(new URL('../src/subject-order.json',import.meta.url)));
  const names=parseCsv(readFileSync(new URL('../14-colors_and_hyperlinks.csv',import.meta.url),'utf8')).map(row=>row.subject);
  assert.deepEqual([...order.subjects].sort(),names.sort());
  assert.equal(new Set(order.subjects).size,names.length);
  assert.equal(order.sha256,createHash('sha256').update(readFileSync(new URL('../subjects - reference.docx',import.meta.url))).digest('hex'));
  assert.deepEqual(order.subjects.slice(0,3),['transcendence; unknowability of God','absolute freedom; independence of God',"God's love for His own Essence"]);
});
