import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedTranslation,correctDecisionFile,planTranslationCorrection} from '../scripts/approved-translation-corrections.mjs';
import {validateConfirmedMatch} from '../scripts/subject-core.mjs';
import {reconcileGuide} from '../scripts/catalog-deletion.mjs';
import {textSha} from '../scripts/sentence-paragraphs.mjs';

function fixture(before,after,ranges){
  const correction=approvedTranslation('BH00001',Buffer.from(before),Buffer.from(after));
  const candidate={source:'BH00001',version:correction.old.version,ranges};
  return {correction,candidate};
}
test('rewritten fragments retain complete corrected paragraph context and decision evidence',()=>{
  const {correction,candidate}=fixture('We seek peace today.','We seek lasting peace today.',[{paragraph:1,start:8,end:13,text:'peace'}]);
  const data={matches:{q:{status:'confirmed',evidence:'Earlier source review',candidate}}};
  const result=correctDecisionFile(data,correction);
  assert.equal(result.updated,1);assert.equal(result.data.matches.q.evidence,data.matches.q.evidence);
  assert.equal(result.data.matches.q.candidate.ranges[0].text,'We seek lasting peace today.');
  assert.equal(data.matches.q.candidate.version,correction.old.version);
  validateConfirmedMatch(result.data.matches.q.candidate,new Map([['BH00001',correction.next]]));
});
test('supplied fragments locate corrected wording uniquely without an approximate match',()=>{
  const old='Earlier words in an old translation.';
  const {correction,candidate}=fixture(old,'The new wording is faithful. Extra context. A second sentence to quote.',[{paragraph:1,start:0,end:old.length,text:old}]);
  const renewed=correction.candidate(candidate,'The new wording is faithful. ... A second sentence to quote.');
  assert.deepEqual(renewed.ranges.map(r=>r.text),['The new wording is faithful.','A second sentence to quote.']);
});
test('split paragraphs, changed offsets, and UTF-16 characters remain valid',()=>{
  const before='A bright 🌟 shines. The stars guide us.',after='A brilliant 🌟 shines.\n\nThe stars guide everyone.';
  const {correction,candidate}=fixture(before,after,[{paragraph:1,start:0,end:before.length,text:before}]);
  const renewed=correction.candidate(candidate);
  assert.equal(renewed.ranges.length,2);
  validateConfirmedMatch(renewed,new Map([['BH00001',correction.next]]));
});
test('retranslated neighboring paragraphs cannot pull a quotation into later repeated wording',()=>{
  const a='Direct all your energies to teaching the Cause of God. Let him who findeth himself worthy of this most exalted station arise to render this service; otherwise, let him choose for himself a deputy to manifest this Cause whereby every firm edifice hath been shaken, the mountains have been crushed, and souls have been thunderstruck.';
  const b='Center your energies in the propagation of the Faith of God. Whoso is worthy of so high a calling, let him arise and promote it. Whoso is unable, it is his duty to appoint him who will, in his stead, proclaim this Revelation, whose power hath caused the foundations of the mightiest structures to quake, every mountain to be crushed into dust, and every soul to be dumbfounded.';
  const next='Were the station of this Day to be revealed, they would seek after a single moment thereof with a hundred thousand lives, let alone the earth and its treasures.';
  const changed='Should the greatness of this Day be revealed in its fullness, every man would forsake a myriad lives in his longing to partake, though it be for one moment, of its great glory—how much more this world and its corruptible treasures!';
  const {correction,candidate}=fixture(a+'\n\n'+next,b+'\n\n'+changed,[{paragraph:1,start:0,end:218,text:a.slice(0,218)}]);
  assert.deepEqual(correction.candidate(candidate).ranges.map(r=>[r.paragraph,r.text]),[[1,b]]);
});
test('reconciliation replaces stale literal shortenings and reveals newly authorized readings',()=>{
  const candidate={source:'BH00001',version:'old',ranges:[{paragraph:1,start:0,end:4,text:'Old.'}]};
  const s={id:'q',status:'confirmed',passage:'old',candidates:[candidate]};
  const before={selections:[s],sources:{BH00001:{id:'BH00001'}}};
  const after={...before,selections:[{...s,passage:'new',candidates:[{...candidate,version:'new',correction:{fromVersion:'old'}}]}]};
  const guide={slug:'test',displayTitle:'Test',order:[{key:'source:BH00001',why:'Read.',shortened:['Old.'],omitted:true}],questions:[]};
  const result=reconcileGuide(guide,before,after,{item:'BH00001',authorized:()=>true});
  assert.equal(result.guide.order[0].shortened,undefined);assert.equal(result.guide.order[0].omitted,undefined);
  assert.deepEqual(guide.order[0].shortened,['Old.']);
});
test('stale or malformed references are data errors, never blindly relabeled',()=>{
  const {correction,candidate}=fixture('Old words.','New words.',[{paragraph:1,start:0,end:10,text:'Old words.'}]);
  assert.throws(()=>correction.candidate({...candidate,version:'0'.repeat(64)}),/Stale/);
  assert.throws(()=>correction.candidate({...candidate,ranges:[{paragraph:1,start:0,end:10,text:'wrong'}]}),/Invalid confirmed range/);
});
test('a removed quotation is retired, while unrelated decisions remain unchanged',()=>{
  const {correction,candidate}=fixture('Removed quotation.\n\nKeep this paragraph.','Keep this paragraph.',[{paragraph:1,start:0,end:18,text:'Removed quotation.'}]);
  const other={status:'rejected'};
  const result=correctDecisionFile({matches:{q:{status:'confirmed',candidate},other}},correction);
  assert.deepEqual([...result.removed],['q']);assert.deepEqual(result.data.matches.other,other);
});
test('automatic matches and sentence context travel with a correction; rejected decisions stay rejected',async()=>{
  const before='We seek peace today.',after='We seek lasting peace today.';
  const {correction,candidate}=fixture(before,after,[{paragraph:1,start:0,end:before.length,text:before}]);
  const values=new Map([
    ['data/subject-edits.json',{format:1,matches:{rejected:{status:'rejected'}},relationships:[]}],
    ['study-guides/sentence-paragraphs.json',{format:1,reasons:[],entries:[{source:'BH00001',sourceVersion:correction.old.version,paragraph:1,text:before,reason:'Reviewed context'}]}],
    ['study-guides/editorial.json',{subjects:[{order:[{key:'source:BH00001',shortened:['We seek peace today.']}]}]}],
  ]);
  const selection={id:'q',status:'exact',candidates:[candidate],duplicates:[{id:'rejected'}]};
  const result=await planTranslationCorrection({id:'BH00001',before:Buffer.from(before),after:Buffer.from(after),read:async name=>values.has(name)?Buffer.from(JSON.stringify(values.get(name))):null,list:async()=>['editorial.json'],site:async name=>name.includes('/passages/')?{passages:{p:{subjects:['subject']}}}:{selections:[selection]}});
  const edits=JSON.parse(result.changes.get('data/subject-edits.json'));
  assert.equal(edits.matches.q.candidate.version,correction.next.version);assert.equal(edits.matches.rejected.status,'rejected');
  assert.equal(JSON.parse(result.changes.get('study-guides/sentence-paragraphs.json')).sources.BH00001.version,correction.next.version);
  assert.equal(result.changes.has('study-guides/editorial.json'),false);
  const compact={format:2,reasons:['An unrelated review','Reviewed context'],sources:{OTHER:{version:'v1',paragraphs:[[1,'0'.repeat(16),0]]},BH00001:{version:correction.old.version,paragraphs:[[1,textSha(before),1]]}}};
  values.set('study-guides/sentence-paragraphs.json',compact);
  const again=await planTranslationCorrection({id:'BH00001',before:Buffer.from(before),after:Buffer.from(after),read:async name=>values.has(name)?Buffer.from(JSON.stringify(values.get(name))):null,list:async()=>[],site:async()=>null});
  const renewed=JSON.parse(again.changes.get('study-guides/sentence-paragraphs.json'));
  assert.deepEqual(renewed.reasons,compact.reasons);assert.deepEqual(renewed.sources.OTHER,compact.sources.OTHER);
});
