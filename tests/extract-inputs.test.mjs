import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractBlocks,parseExtract,mergeExtracts,matchExtract,extractFolders} from '../scripts/extract-inputs.mjs';
import {Matcher,prepareSource} from '../scripts/subject-core.mjs';
const [inventory,evernote]=extractFolders;
test('local input blocks preserve wrapped lines and blank-line numbering',()=>{
  assert.deepEqual(extractBlocks('\uFEFF\r\n First\r\n wrapped\r\n \r\n\r\nSecond\r\n'),[{raw:'First\n wrapped',line:2,ordinal:1},{raw:'Second',line:6,ordinal:2}]);
});
test('terminal exact IDs and Evernote references are separate from match wording',()=>{
  for(const id of ['BH00001','ABU0712','BB00001a','A02490']){
    const s=parseExtract(`Some quotation. ${id} (Title)`,inventory);
    assert.equal(s.excerpt,'Some quotation.');assert.deepEqual(s.suppliedIds,[id]);assert.equal(s.reference,id+' (Title)');
  }
  for(const reference of ['SAQ#27.4 (was SAQ.113)','GWB#022 p051-052, WOB.115','(Shoghi Effendi, 1947, statement)','COC#2301 (8 Aug. 1957 on behalf of Shoghi Effendi)','M63-86 59.6 (24 Jun. 1968 from the Universal House of Justice)']){
    const s=parseExtract('A passage with (an aside) in it. '+reference,evernote);
    assert.equal(s.excerpt,'A passage with (an aside) in it.');assert.equal(s.reference,reference);
  }
  assert.equal(parseExtract('A passage. WOB.115',evernote).outsideAuthor,true);
  assert.equal(parseExtract('A passage. GWB#022 p051, WOB.115',evernote).outsideAuthor,false);
  assert.deepEqual(parseExtract('A passage. (BH01602)',evernote).suppliedIds,['BH01602']);
  assert.equal(parseExtract('A passage. (Mahmud\'s Diary, p.199)',evernote).excerpt,'A passage.');
  assert.equal(parseExtract('A passage. (Pope Francis)',evernote).outsideAuthor,true);
  assert.equal(parseExtract('A passage. SW v14#02 p037',evernote).reference,'SW v14#02 p037');
  assert.equal(parseExtract("A passage. WOB.107 (Baha'u'llah)",evernote).outsideAuthor,false);
  assert.equal(parseExtract("A passage. (From a Tablet of Baha'u'llah, quoted in a letter from the Universal House of Justice)",evernote).outsideAuthor,false);
  assert.equal(parseExtract('A passage. SAQ#82.2 [Compare Plotinus.]',evernote).outsideAuthor,false);
});
test('outside authors cannot inherit a catalogue match even for quoted common wording',()=>{
  const matcher=new Matcher([prepareSource('BH00001','v',[{plain:'These five words match exactly here.'}])]);
  const result=matchExtract(parseExtract('These five words match exactly here. (Shoghi Effendi, 1947)',evernote),matcher);
  assert.equal(result.status,'unmatched');assert.deepEqual(result.candidates,[]);
});
test('ordered omission fragments preserve individual highlights and require unique placement',()=>{
  const matcher=new Matcher([prepareSource('BH00001','v',[{plain:'The first few words with an omitted clause and the final three words.'}])]);
  const result=matchExtract({excerpt:'The first few words... the final three words',suppliedIds:[]},matcher);
  assert.equal(result.status,'normalized');assert.deepEqual(result.candidates[0].ranges.map(r=>r.text),['The first few words','the final three words']);
  const repeated=new Matcher([prepareSource('BH00001','v',[{plain:'The first few words the final three words. The first few words the final three words.'}])]);
  assert.equal(matchExtract({excerpt:'The first few words... the final three words',suppliedIds:[]},repeated).status,'ambiguous');
});
test('Evernote wins duplicates while distinct IDs and distinct extracts survive',()=>{
  const row=(id,sourceCollection,excerpt,suppliedIds=[])=>({id,excerpt,original:excerpt,subject:'topic',suppliedIds,provenance:{sourceCollection},status:'unmatched',candidates:[]});
  const dup=[];
  const result=mergeExtracts([row('a',inventory,'The same words.'),row('b',evernote,'The same words!'),row('c',evernote,'Different wording.')],dup);
  assert.deepEqual(result.map(s=>s.id),['b','c']);assert.equal(result[0].duplicates[0].id,'a');assert.equal(dup.length,1);
  assert.equal(mergeExtracts([row('a',inventory,'Repeated wording',['BH00001']),row('b',inventory,'Repeated wording',['BH00002'])],[]).length,2);
});
