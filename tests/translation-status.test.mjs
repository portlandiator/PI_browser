import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizedRanges,isAuthorizedParagraph,catalogueDetails} from '../src/translation-status.mjs';

test('authorization selects single paragraphs, inclusive ranges, and the remaining text',()=>{
  const ranges=authorizedRanges('Y2,4-5,7-9,12-');
  assert.deepEqual(Array.from({length:15},(_,i)=>i+1).filter(n=>isAuthorizedParagraph(ranges,n)),[2,4,5,7,8,9,12,13,14,15]);
  assert.ok(isAuthorizedParagraph(ranges,101));
  for(const n of [1,2,10000])assert.ok(isAuthorizedParagraph(authorizedRanges('Y'),n));
  assert.deepEqual(authorizedRanges(' Y 2, 4 - 5, 12- '),[[2,2],[4,5],[12,Infinity]]);
});

test('missing and malformed declarations never imply authorization',()=>{
  for(const value of [undefined,'','N','Y0','Y5-2','Y1,bad','Y1,','Y-3','Y1.5','Y9007199254740992'])assert.deepEqual(authorizedRanges(value),[]);
  assert.equal(isAuthorizedParagraph(authorizedRanges('Y'),0),false);
});

test('Extract follows Word count and displays Yes or No without mutating metadata',()=>{
  const fields=['PIN','Extract','Authorized','Word count','Subjects','Date','Citation count'].map(name=>({name}));
  const metadata={PIN:'AB1',Extract:'x',Authorized:'Y2-',Subjects:'test'};
  assert.deepEqual(catalogueDetails(fields,metadata),[['PIN','AB1'],['Authorized','Y2-'],['Word count',''],['Extract','Yes'],['Date','']]);
  assert.equal(metadata.Extract,'x');
  assert.equal(catalogueDetails(fields,{Extract:''}).find(([name])=>name==='Extract')[1],'No');
});
