import {test} from 'node:test';
import assert from 'node:assert/strict';
import {groupSelections,groupedParagraphs,renderSourceGroup} from '../src/subject-groups.mjs';

const selection=(id,source,paragraph,start=0,end=3)=>({id,passage:id,suppliedIds:[source],candidates:[{source,ranges:[{paragraph,start,end}]}]});
test('group before pagination, preserving exact source identity and independent unlinked excerpts',()=>{
  const groups=groupSelections([selection('a','BH1',4),selection('b','BH1',2),selection('c','BH1x',1),{id:'d',suppliedIds:['BH1'],candidates:[]}],{});
  assert.deepEqual(groups.map(g=>[g.source,g.selections.length]),[['BH1',2],['BH1x',1],[null,1]]);
  assert.deepEqual(groupedParagraphs(groups[0]).map(p=>p.number),[2,4]);
});
test('overlapping selections share a paragraph and highlights, with one final reference and gap marker',()=>{
  const group=groupSelections([selection('a','BH1',1,0,4),selection('b','BH1',1,2,6),selection('c','BH1',3,0,3)],{})[0];
  assert.deepEqual(groupedParagraphs(group)[0].ranges,[{start:0,end:6}]);
  const record={id:'BH1',author:'Author',metadata:{Title:'Title'},en:{paragraphs:[{plain:'abcdef'}, {},{plain:'ghi'}]},original:{paragraphs:[{plain:'اصل'}, {},{plain:'متن'}]}};
  const html=renderSourceGroup(group,record,'topic');
  assert.equal((html.match(/English paragraph/g)||[]).length,2);
  assert.equal((html.match(/class="passage-citation"/g)||[]).length,2); // One per language, CSS displays one.
  assert.ok(html.includes('<mark>abcdef</mark>'));
  assert.ok(html.includes('Passages omitted'));
  assert.ok(html.includes('id="selection-b"'));
});
