import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicSelections,unlinkedPassage} from '../src/subject-list.mjs';

test('unlinked selections follow every linked passage before pagination, regardless of candidate citations',()=>{
  const rows=[{id:'outside',excerpt:'Other author',candidates:[],suppliedIds:[]},{id:'tentative',candidates:[{source:'A',ranges:[]}],suppliedIds:[]},{id:'rejected',status:'rejected',candidates:[],suppliedIds:[]},{id:'linked',passage:'p',candidates:[{source:'B',ranges:[{paragraph:1}]}],suppliedIds:[]}];
  const sorted=publicSelections(rows,{A:{citationCount:100},B:{citationCount:1}});
  assert.deepEqual(sorted.map(s=>s.id),['linked','outside','tentative']);
  assert.equal(sorted.slice(0,1)[0].id,'linked');
  assert.equal(rows[0].id,'outside');
  assert.ok(!sorted.some(s=>s.id==='rejected'));
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

test('unlinked passages retain complete trailing IDs and longer source references',()=>{
  for(const reference of ['ABU0712',"BH00091 (Lawh-i-Haji Mirza Kamalu’d-Din)",'Gleanings, #30 p73; اصلی, Ruhi3a.L16','A longer reference\nwith a second line <untrusted>']){
    const html=unlinkedPassage({excerpt:'Quoted words.',original:'Quoted words.\n'+reference,suppliedIds:[]});
    assert.ok(html.includes('class="passage-citation"'));
    assert.ok(html.includes(reference.replaceAll('<','&lt;').replaceAll('>','&gt;')));
    assert.ok(html.includes('>Quoted words. <span class="passage-citation"'));
    assert.ok(!html.includes('Source ID not linked'));
    assert.ok(!html.includes('passage-reference'));
  }
});

test('inline references and source provenance survive when there is no separate citation',()=>{
  const original='“I and the Father are one.”  John 10:30';
  const html=unlinkedPassage({excerpt:original,original,provenance:{selectionParagraph:14,subjectUrl:'https://loom.loomofreality.org/#?category=example'}});
  assert.ok(html.includes(original));
  assert.ok(html.includes('Source collection · selection 14'));
  assert.ok(html.includes('href="https://loom.loomofreality.org/#?category=example"'));
  const unsafe=unlinkedPassage({excerpt:'Text',provenance:{subjectUrl:'javascript:alert(1)',selectionParagraph:1}});
  assert.ok(!unsafe.includes('href='));
  assert.ok(unsafe.includes('Source collection · selection 1'));
});

test('full imported wording is preserved if excerpt is not its exact prefix',()=>{
  const html=unlinkedPassage({excerpt:'Normalized wording',original:'Original wording and full reference',suppliedIds:['AB00123']});
  assert.ok(html.includes('Original wording and full reference'));
  assert.ok(html.includes('>(AB00123)</span></p>'));
});

test('verified supplied IDs link without implying a paragraph match',()=>{
 const html=unlinkedPassage({excerpt:'Variant.',original:'Variant. BH00001',suppliedIds:['BH00001'],catalogIds:['BH00001']});
 assert.ok(html.includes('href="./?id=BH00001"'));assert.ok(!html.includes('passage='));
});

test('local excerpts without a separated reference do not invent a Loom source link',()=>{
 const html=unlinkedPassage({excerpt:'Full quotation and its inline reference',original:'Full quotation and its inline reference',provenance:{sourceFilename:'subject_extracts/Evernote_scrape/topic.txt',subjectUrl:'https://loom.loomofreality.org/',selectionParagraph:1}});
 assert.ok(html.includes('Full quotation and its inline reference'));assert.ok(!html.includes('<a '));assert.ok(!html.includes('Source collection'));assert.ok(!html.includes('()'));
});

test('only unmatched Inventory extracts are withheld from public selections',()=>{
  const rows=['subjects_inv_length_ordered','Evernote_scrape'].flatMap(sourceCollection=>['exact','approximate','ambiguous','unmatched'].map(status=>({id:sourceCollection+status,status,provenance:{sourceCollection},candidates:[],suppliedIds:[]})));
  const visible=publicSelections(rows,{});
  assert.equal(visible.length,7);
  assert.ok(!visible.some(s=>s.id==='subjects_inv_length_orderedunmatched'));
  assert.ok(visible.some(s=>s.id==='Evernote_scrapeunmatched'));
  assert.equal(rows.length,8);
});
