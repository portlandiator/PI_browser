import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {writeSubjectOutputs} from '../scripts/build-subjects.mjs';
import {relationKey} from '../src/subject-relations.mjs';
import {Matcher,prepareSource,parseSelection,selectionBlocks,hierarchyEdges,validateConfirmedMatch} from '../scripts/subject-core.mjs';
const source=(id,...text)=>prepareSource(id,'v1',text.map(plain=>({plain})));
test('unique exact, normalization and accurate paragraph offsets',()=>{
  const m=new Matcher([source('BH00001','Heading','The soul’s journey, through light and truth.')]);
  const result=m.match({excerpt:'soul’s journey, through light and truth',suppliedIds:['BH00001']});
  assert.equal(result.status,'exact');assert.deepEqual(result.candidates[0].ranges[0],{paragraph:2,paragraphId:'BH00001@v1:en:2',start:4,end:43,text:'soul’s journey, through light and truth'});
  const normalized=m.match({excerpt:'soul s journey through light and truth',suppliedIds:[]});assert.equal(normalized.status,'normalized');assert.equal(normalized.candidates[0].ranges[0].text,'soul’s journey, through light and truth');
});
test('repeated source and paragraph wording stays ambiguous',()=>{
  const text='Blessed are the souls who seek truth';const m=new Matcher([source('A',text,text),source('B',text)]);
  assert.equal(m.match({excerpt:text,suppliedIds:[]}).candidates.length,3);
  assert.equal(m.match({excerpt:text,suppliedIds:['A']}).status,'ambiguous');
});
test('spanning paragraphs preserves separate ranges',()=>{
  const m=new Matcher([source('A','The first sentence ends here.','The next sentence begins now.')]);const r=m.match({excerpt:'sentence ends here The next sentence',suppliedIds:[]});assert.equal(r.status,'normalized');assert.deepEqual(r.candidates[0].ranges.map(x=>x.paragraph),[1,2]);
});
test('omissions and weak word overlap remain approximate and reviewable',()=>{
  const m=new Matcher([source('A','The first sentence ends here. Words omitted from the excerpt. The next sentence begins now.')]);const r=m.match({excerpt:'The first sentence ends here ... The next sentence begins now',suppliedIds:['A']});assert.equal(r.status,'approximate');assert.equal(r.candidates[0].ranges.length,2);assert.ok(!r.candidates[0].ranges.some(r=>r.text.includes('omitted')));
  assert.equal(m.match({excerpt:'first sentence something ends here',suppliedIds:['A']}).status,'approximate');
});
test('missing supplied IDs do not silently search different texts',()=>{assert.equal(new Matcher([source('A','Some source with five simple words')]).match({excerpt:'Some source with five simple words',suppliedIds:['B']}).status,'unmatched');});
test('short unique wording requires review',()=>assert.equal(new Matcher([source('A','only three words')]).match({excerpt:'only three words',suppliedIds:[]}).status,'ambiguous'));
test('HTML blocks retain provenance, decode entities and separate citations/notices',()=>{
  const html='<DIV>=========</DIV><DIV>The AI-selected and translated excerpts follow</DIV><P></P><DIV>Light &amp; truth from the soul <A href="https://bahai-library.com/inventory/ABU1995">ABU1995</A> (citation)</DIV>';
  const blocks=selectionBlocks(html).map(parseSelection);assert.equal(blocks.length,3);assert.equal(blocks[0].kind,'notice');assert.equal(blocks[1].kind,'notice');assert.equal(blocks[2].excerpt,'Light & truth from the soul');assert.deepEqual(blocks[2].suppliedIds,['ABU1995']);assert.ok(blocks[2].raw.includes('(citation)'));
});
test('hierarchy imports direct broader and see-also relations only',()=>{const html='<ul><li id="a"><a>Parent</a><ul><li id="b"><a>Child<span> (3)</span></a><ul><li id="x"><a>[see also Other]</a></li></ul></li></ul></li><li id="c"><a>Other</a></li></ul>';const {edges}=hierarchyEdges(html,[{id:'a'},{id:'b'},{id:'c'}]);assert.deepEqual(edges.map(e=>[e.source,e.target,e.type]),[['b','a','broader'],['b','c','related']]);});
test('inventory link targets preserve full filename identity even when labels run into following text',()=>{const raw='An excerpt with several meaningful words <a href="https://bahai-library.com/inventory/BH03974x">BH03974x</a>Other text';const s=parseSelection({raw,text:raw.replace(/<[^>]*>/g,''),position:1});assert.deepEqual(s.suppliedIds,['BH03974x']);});
test('editorial relation identity handles symmetry and broader/narrower inverses',()=>{assert.equal(relationKey({source:'a',target:'b',type:'related'}),relationKey({source:'b',target:'a',type:'related'}));assert.equal(relationKey({source:'a',target:'b',type:'broader'}),relationKey({source:'b',target:'a',type:'narrower'}));});
test('editorial confirmations validate source versions, bounds, wording and paragraph identity',()=>{
  const sources=new Map([['A',source('A','The original words.')]]),candidate={source:'A',version:'v1',ranges:[{paragraph:1,start:4,end:12,text:'original'}]};
  assert.equal(validateConfirmedMatch(candidate,sources).ranges[0].paragraphId,'A@v1:en:1');
  assert.throws(()=>validateConfirmedMatch({...candidate,version:'v0'},sources),/Stale/);
  assert.throws(()=>validateConfirmedMatch({...candidate,ranges:[]},sources),/Empty/);
  for(const change of [{start:-1},{end:999},{paragraph:2},{text:'invented'}])assert.throws(()=>validateConfirmedMatch({...candidate,ranges:[{...candidate.ranges[0],...change}]},sources),/Invalid/);
});
test('concatenated separately cited excerpts retain their parent block and segments',()=>{
  const first='Here are five words of a first excerpt.',second='Here are five words of another excerpt.';
  const raw=first+'<a href="https://bahai-library.com/inventory/BH10945">BH10945</a>'+second+'<a href="https://bahai-library.com/inventory/AB12825">AB12825</a>';
  const blocks=selectionBlocks('<div>'+raw+'</div>');assert.equal(blocks.length,2);
  assert.deepEqual(blocks.map(b=>b.segment),[1,2]);assert.equal(blocks[0].position,blocks[1].position);assert.ok(blocks.every(b=>b.parentRaw===raw));
  assert.deepEqual(blocks.map(b=>parseSelection(b).excerpt),[first,second]);
  assert.deepEqual(blocks.map(b=>parseSelection(b).suppliedIds),[['BH10945'],['AB12825']]);
});

test('export shares identical passages, preserves associations and applies relationship decisions',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pi-subject-export-'));
  t.after(async()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));await fs.rm(root,{recursive:true,force:true});});
  const out=path.join(root,'dist'),dataset='fixture/';await fs.mkdir(path.join(out,dataset),{recursive:true});
  await fs.writeFile(path.join(out,dataset,'catalog.json.gz'),gzipSync(JSON.stringify([{id:'BH00001',author:'A'}])));
  const subjects=[{id:'a',name:'A'},{id:'b',name:'B'}];
  const candidate={source:'BH00001',version:'v1',ranges:[{paragraph:1,start:0,end:5,text:'alpha'},{paragraph:2,start:0,end:4,text:'beta'}],method:'exact',score:1};
  const bySubject=new Map(subjects.map(s=>[s.id,{subject:s,selections:[{id:s.id+'-selection',subject:s.id,status:'exact',candidates:[structuredClone(candidate)],suppliedIds:['BH00001']}],notices:[]}]));
  const report={counts:{exact:0,normalized:0,approximate:0,ambiguous:0,unmatched:0,confirmed:0,rejected:0}};
  await writeSubjectOutputs({root,out,dataset,subjects,bySubject,report,edits:{relationships:[{source:'b',target:'a',type:'related',status:'rejected',note:'Distinct concepts'}]},hierarchyHtml:'<li id="b"><a>B</a><ul><li id="a"><a>A</a></li></ul></li>'});
  const load=async name=>JSON.parse(gunzipSync(await fs.readFile(path.join(out,dataset,'subjects',name+'.json.gz'))));
  const a=await load('a'),b=await load('b');assert.equal(a.selections[0].passage,b.selections[0].passage);assert.deepEqual(a.selections[0].otherSubjects,['a','b']);
  const p=await load('passages/'+a.selections[0].passage);assert.deepEqual(p.selections,[{id:'a-selection',subject:'a'},{id:'b-selection',subject:'b'}]);
  const index=await load('index');assert.equal(index.report.duplicateRanges,1);assert.equal(index.report.passages,1);assert.equal(index.report.selections,2);assert.equal(index.report.counts.exact,2);
  assert.ok(index.edges.some(e=>e.type==='broader'&&e.status==='imported'));assert.equal(index.edges.filter(e=>e.type==='related').length,1);assert.equal(index.edges.find(e=>e.type==='related').status,'rejected');
});
