import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDraft,validateDraft,mergeDrafts,effectiveEdges,relativeType,changeConnection,sharedEvidence} from '../src/relationship-review-core.mjs';

test('review export preserves published and local passage decisions and canonicalizes connections',()=>{
  const base={...emptyDraft(),matches:{old:{status:'confirmed'}},relationships:[{source:'a',target:'b',type:'related',status:'accepted'}]};
  const local={...emptyDraft(),matches:{new:{status:'rejected'}},relationships:[{source:'b',target:'a',type:'related',status:'rejected'}],reviewedSubjects:{a:true}};
  const merged=mergeDrafts(base,local);
  assert.deepEqual(Object.keys(merged.matches),['old','new']);assert.equal(merged.relationships.length,1);assert.equal(merged.relationships[0].status,'rejected');assert.equal(merged.reviewedSubjects.a,true);
  assert.deepEqual(validateDraft(JSON.parse(JSON.stringify(merged)),new Set(['a','b'])),merged);
});
test('editing relation types removes the old public relation and preserves correct inverses',()=>{
  const previous={source:'b',target:'a',type:'broader',status:'imported'};
  assert.equal(relativeType(previous,'a'),'narrower');
  const local=changeConnection(emptyDraft(),{source:'a',target:'b',type:'related',status:'accepted',note:'Conceptual'},previous);
  const edges=effectiveEdges([previous],local);assert.equal(edges.length,2);assert.equal(edges.find(e=>e.type==='broader').status,'rejected');assert.equal(edges.find(e=>e.type==='related').status,'accepted');
  const inverse=changeConnection(emptyDraft(),{source:'a',target:'b',type:'narrower',status:'accepted'},previous);
  assert.equal(inverse.relationships.length,1);
});
test('import validates IDs, self-links, statuses and progress before saving',()=>{
  const ids=new Set(['a','b']);
  for(const edge of [{source:'a',target:'a',type:'related',status:'accepted'},{source:'a',target:'unknown',type:'related',status:'accepted'},{source:'a',target:'b',type:'related',status:'suggested'}])assert.throws(()=>validateDraft({...emptyDraft(),relationships:[edge]},ids));
  assert.throws(()=>validateDraft({...emptyDraft(),reviewedSubjects:{unknown:true}},ids));
  assert.throws(()=>validateDraft({...emptyDraft(),matches:[]},ids));
});
test('imported links win duplicate proposals and saved decisions override both',()=>{
  const base={source:'a',target:'b',type:'related'};
  const edges=[{...base,status:'imported'},{...base,status:'suggested',score:.1}];
  assert.equal(effectiveEdges(edges,emptyDraft())[0].status,'imported');
  assert.equal(effectiveEdges(edges,{...emptyDraft(),relationships:[{...base,status:'rejected'}]})[0].status,'rejected');
});
test('evidence requires overlapping source offsets and bounds the examples',()=>{
  const selection=(source,paragraph,start,end,text)=>({passage:'p',candidates:[{source,ranges:[{paragraph,start,end,text}]}]});
  const left={selections:[selection('A',1,0,10,'abcdefghij'),selection('A',2,0,3,'abc')]};
  const right={selections:[selection('A',1,5,15,'fghijklmno'),selection('A',1,5,15,'fghijklmno'),selection('A',2,5,8,'xyz'),selection('B',1,0,10,'abcdefghij')]};
  assert.deepEqual(sharedEvidence(left,right),{total:1,examples:[{source:'A',paragraph:1,passage:'p',text:'fghij'}]});
  assert.deepEqual(sharedEvidence(left,right,0),{total:1,examples:[]});
});
