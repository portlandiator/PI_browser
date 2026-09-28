import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reviewSummary,inQueue,confirmedCandidate,paragraphCandidate,validateMatchEdits,reviewKeyAction} from '../src/passage-review-core.mjs';
import {emptyDraft,mergeDrafts} from '../src/relationship-review-core.mjs';
const version='a'.repeat(64),id='1'.repeat(24);
const record={id:'BH00001',enVersion:version,en:{paragraphs:[{plain:'A 😀 quotation.'},{plain:'Second paragraph.'}]}};
test('review index retains unresolved and decided selections without full corpus text',()=>{
  const summary=reviewSummary('subject',['exact','approximate','ambiguous','unmatched','confirmed','rejected'].map((status,i)=>({id:String(i),status,excerpt:'private long excerpt'})));
  assert.equal(summary.items.length,5);assert.ok(summary.items.every(s=>!Object.hasOwn(s,'excerpt')));
});
test('review shortcuts confirm or reject safely without firing during edits or key repeats',()=>{
  assert.equal(reviewKeyAction({key:'c',altKey:true}), 'confirm');
  assert.equal(reviewKeyAction({key:'R',altKey:true}), 'reject');
  assert.equal(reviewKeyAction({key:'ArrowRight',altKey:true}), 'next');
  assert.equal(reviewKeyAction({key:'ArrowLeft',altKey:true}), 'previous');
  assert.equal(reviewKeyAction({key:'c',altKey:true},{canConfirm:false}), '');
  assert.equal(reviewKeyAction({key:'r',altKey:true},{editable:true}), '');
  assert.equal(reviewKeyAction({key:'r',altKey:true,repeat:true}), '');
  assert.equal(reviewKeyAction({key:'r',altKey:true,ctrlKey:true}), '');
});
test('local decisions leave pending queue, appear in decided queue, and retain connections',()=>{
  const initial={...emptyDraft(),relationships:[{source:'a',target:'b',type:'related',status:'accepted'}]};
  const result=mergeDrafts(initial,{...emptyDraft(),matches:{[id]:{status:'rejected',note:'Wrong source'}}});
  assert.equal(inQueue({id,status:'approximate'},result),false);assert.equal(inQueue({id,status:'approximate'},result,'reviewed'),true);
  assert.deepEqual(result.relationships,initial.relationships);assert.equal(inQueue({id:'other',status:'unmatched'},result),true);
});
test('confirmation rebuilds UTF-16 coordinates and rejects stale or invalid ranges',()=>{
  const candidate={source:record.id,version,ranges:[{paragraph:1,start:2,end:4,text:'untrusted'}]};
  const result=confirmedCandidate(candidate,record);assert.equal(result.ranges[0].text,'😀');assert.equal(result.ranges[0].paragraphId,`${record.id}@${version}:en:1`);
  assert.throws(()=>confirmedCandidate({...candidate,version:'b'.repeat(64)},record),/version/);
  for(const ranges of [[{paragraph:1,start:5,end:3}],[{paragraph:3,start:0,end:1}],[{paragraph:1,start:0,end:999}],[{paragraph:2,start:0,end:4},{paragraph:1,start:0,end:4}],[{paragraph:1,start:0,end:4},{paragraph:1,start:3,end:6}]])assert.throws(()=>confirmedCandidate({...candidate,ranges},record));
});
test('manual lookup builds current ranges and validates imported decisions',()=>{
  const c=paragraphCandidate(record,1,2);assert.equal(c.ranges.length,2);assert.equal(c.ranges[1].text,'Second paragraph.');
  assert.throws(()=>paragraphCandidate(record,2,1));assert.throws(()=>paragraphCandidate(record,1,51));
  validateMatchEdits({...emptyDraft(),matches:{[id]:{status:'confirmed',candidate:c}}});
  assert.throws(()=>validateMatchEdits({...emptyDraft(),matches:{[id]:{status:'confirmed',candidate:{}}}}));
  assert.throws(()=>validateMatchEdits({...emptyDraft(),matches:{[id]:{status:'approved'}}}));
});
