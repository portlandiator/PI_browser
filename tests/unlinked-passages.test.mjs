import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicSelections,unlinkedPassage} from '../src/subject-list.mjs';

test('unlinked selections follow every linked passage before pagination, regardless of candidate citations',()=>{
  const rows=[{id:'outside',excerpt:'Other author',candidates:[],suppliedIds:[]},{id:'tentative',candidates:[{source:'A',ranges:[]}],suppliedIds:[]},{id:'linked',passage:'p',candidates:[{source:'B',ranges:[{paragraph:1}]}],suppliedIds:[]}];
  const sorted=publicSelections(rows,{A:{citationCount:100},B:{citationCount:1}});
  assert.deepEqual(sorted.map(s=>s.id),['linked','outside','tentative']);
  assert.equal(sorted.slice(0,1)[0].id,'linked');
  assert.equal(rows[0].id,'outside');
});
test('unlinked excerpts are escaped, use reading-mode classes, and never link a tentative source',()=>{
  const html=unlinkedPassage({excerpt:'Other author\n<script>alert(1)</script>',candidates:[{source:'BH00001'}]});
  assert.ok(html.includes('Other author\n&lt;script&gt;'));
  assert.ok(html.includes('class="passage-translation"'));
  assert.ok(html.includes('class="passage-original"'));
  assert.ok(html.includes('dir="ltr" lang="en">Original text unavailable'));
  assert.ok(!html.includes('<a '));
  assert.ok(!html.includes('BH00001'));
});
