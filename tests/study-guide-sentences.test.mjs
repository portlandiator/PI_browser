import test from 'node:test';
import assert from 'node:assert/strict';
import reviewedParagraphs from '../study-guides/sentence-paragraphs.json' with {type:'json'};
import {completeSentenceParagraphs,boundaryConcerns,locateSuppliedParagraphs} from '../scripts/study-guide-sentences.mjs';
const record=(...paragraphs)=>({id:'fixture',en:{paragraphs:paragraphs.map(plain=>({plain}))}});
const select=(r,n,phrase)=>({number:n,ranges:[{start:r.en.paragraphs[n-1].plain.indexOf(phrase),end:r.en.paragraphs[n-1].plain.indexOf(phrase)+phrase.length}]});
const texts=(r,result)=>result.paragraphs.map(p=>p.ranges.map(x=>r.en.paragraphs[p.number-1].plain.slice(x.start,x.end)).join(' … '));

test('answers include the complete preceding labeled question without earlier exchanges',()=>{
 const r=record('Question: An earlier question?','Answer: An earlier reply.','Question: Here is a quoted statement. How should it be understood? Is there another meaning?','Answer: The meaning is spiritual. A further thought.');
 const selected=[select(r,4,'The meaning')],before=JSON.stringify({r,selected});
 const result=completeSentenceParagraphs(r,selected);
 assert.deepEqual(texts(r,result),[r.en.paragraphs[2].plain,'Answer: The meaning is spiritual.']);
 assert.deepEqual(result.paragraphs.map(p=>p.number),[3,4]);
 assert.equal(JSON.stringify({r,selected}),before);
 assert.deepEqual(result.issues,[]);
});
test('A. and A: answers retain quoted questions, numbered prompts, and questions without question marks',()=>{
 for(const [q,a] of [['Q. [What is the spiritual life?]','A. Characterize thyself with the characteristics of God.'],['Q: What difference is there?','A: The difference is this.'],['1st question: What is the feast?','Answer: It is a gathering.'],['Question: Please explain this statement.','Answer. The statement has several meanings.']]){
  const r=record(q,a);
  assert.deepEqual(texts(r,completeSentenceParagraphs(r,[select(r,2,a)])),[q,a]);
 }
});
test('inline answers include their immediate question and expansions deduplicate',()=>{
 for(const q of ['Question: What is freedom?','What is freedom?']){
  const r=record('An earlier statement. '+q+' Answer: Freedom begins within. Another thought.');
  const result=completeSentenceParagraphs(r,[select(r,1,'Freedom begins'),select(r,1,'What is freedom?')]);
  assert.deepEqual(texts(r,result),[q+' Answer: Freedom begins within.']);
 }
 const r=record('Q. Why? A. Because. Q. How? A. With care.');
 assert.deepEqual(texts(r,completeSentenceParagraphs(r,[select(r,1,'With care')])),['Q. How? A. With care.']);
});
test('missing questions, imperative Answer, signatures, and intervening replies do not invent context',()=>{
 for(const paragraphs of [['An unrelated paragraph.','Answer: A reply.'],['Q. An earlier question?','An unrelated paragraph.','A. A reply.'],['Q. An earlier question?','Answer: Did you consider this?','Answer: A later reply.'],['A prayer ends here.','A. A.'],['An unrelated paragraph.','Answer the Call of God.']]){
  const r=record(...paragraphs),last=paragraphs.at(-1);
  assert.deepEqual(texts(r,completeSentenceParagraphs(r,[select(r,paragraphs.length,last)])),[last]);
 }
});

test('a reviewed dependent clause includes its main statement and refuses stale source text',()=>{
 const paragraph='When the horizon of the East was covered with immense darkness; when dark clouds were predominate, and when all the heavenly stars were concealed to the eye. His Holiness, Baha\'u\'llah, like unto the sun, shone forth from the horizon of the East and with radiating splendor He illumined the Orient.';
 const r=record('Greeting.','Earlier text.','Earlier context.','Another paragraph.','In the journal write thus:',paragraph,'An unrelated paragraph.');
 r.id='AB00481';r.enVersion='72b4be72377aa974028fe7b371a3f013e84faa8c2612271b6389d4ae0af102ef';
 const selected=[select(r,6,'heavenly stars')],before=JSON.stringify(r);
 const result=completeSentenceParagraphs(r,selected);
 assert.deepEqual(texts(r,result),['In the journal write thus:',paragraph]);
 assert.deepEqual(result.paragraphs.map(p=>p.number),[5,6]);
 assert.equal(JSON.stringify(r),before);
 assert.throws(()=>completeSentenceParagraphs({...r,enVersion:'different'},selected),/Stale reviewed/);
 const changed=structuredClone(r);changed.en.paragraphs[5].plain+=' More words.';
 assert.throws(()=>completeSentenceParagraphs(changed,selected),/Stale reviewed/);
 const ordinary={...r,id:'unreviewed'};
 assert.deepEqual(texts(ordinary,completeSentenceParagraphs(ordinary,selected)),['In the journal write thus:',paragraph.slice(0,paragraph.indexOf(' His Holiness'))]);
});

test('both edges expand to complete source sentences and overlapping expansions appear once',()=>{
 const r=record('An earlier sentence. Here is a complete thought with two selected words. A later sentence.');
 const selected=[select(r,1,'complete'),select(r,1,'selected')];
 const snapshot=JSON.stringify(selected),result=completeSentenceParagraphs(r,selected);
 assert.deepEqual(texts(r,result),['Here is a complete thought with two selected words.']);
 assert.equal(JSON.stringify(selected),snapshot);
 assert.equal(result.changed,true);assert.deepEqual(result.issues,[]);
});
test('reviewed cross-paragraph brackets include their exact continuation and reject changed context',()=>{
 const entry=reviewedParagraphs.entries.find(e=>e.source==='BB00003'&&e.paragraph===1883);
 const paragraphs=Array.from({length:1885},()=> 'Unrelated complete sentence.');
 paragraphs[1882]=entry.text;paragraphs[1883]=entry.continuation.text;
 const r=record(...paragraphs);r.id=entry.source;r.enVersion=entry.sourceVersion;
 const selected=[select(r,1883,'Were it not for the ink')],before=JSON.stringify({r,selected});
 const result=completeSentenceParagraphs(r,selected,[entry]);
 assert.deepEqual(result.paragraphs.map(p=>p.number),[1883,1884]);
 assert.deepEqual(texts(r,result),[entry.text,entry.continuation.text]);
 assert.ok(!result.issues.some(i=>i.issue==='ending contains an unfinished bracketed note'));
 assert.ok(result.issues.some(i=>i.issue==='supplied omission needs review'));
 assert.equal(JSON.stringify({r,selected}),before);
 const changed=structuredClone(r);changed.en.paragraphs[1883].plain+=' Another sentence.';
 assert.throws(()=>completeSentenceParagraphs(changed,selected,[entry]),/Stale reviewed sentence continuation/);
 assert.throws(()=>completeSentenceParagraphs({...r,enVersion:'changed'},selected,[entry]),/Stale reviewed/);
});
test('continuing sentences span paragraphs without changing their words or paragraph identities',()=>{
 const r=record('A first sentence. Though thou didst not succeed','in seeing thy friend, the fragrances','of the garden reached thee. Another sentence.');
 const result=completeSentenceParagraphs(r,[select(r,2,'seeing thy friend')]);
 assert.deepEqual(texts(r,result),['Though thou didst not succeed','in seeing thy friend, the fragrances','of the garden reached thee.']);
 assert.deepEqual(result.paragraphs.map(p=>p.number),[1,2,3]);assert.deepEqual(result.issues,[]);
});

test('a new paragraph with an omitted opening does not extend a completed sentence',()=>{
 for(const omission of ['[...]','[…]']){
  const r=record('Preserve the life entrusted to you. End.',omission+' was submitted before the Throne. A separate request follows.');
  const selected=[select(r,1,'life entrusted')],before=JSON.stringify({r,selected});
  assert.deepEqual(texts(r,completeSentenceParagraphs(r,selected)),['Preserve the life entrusted to you.']);
  assert.deepEqual(texts(r,completeSentenceParagraphs(r,[select(r,1,'End.')])),['End.']);
  const fragment=completeSentenceParagraphs(r,[select(r,2,'submitted')]);
  assert.deepEqual(texts(r,fragment),[omission+' was submitted before the Throne.']);
  assert.ok(fragment.issues.some(i=>i.issue==='supplied omission needs review'));
  assert.equal(JSON.stringify({r,selected}),before);
 }
});
test('honorifics, initials, and a quoted prayer introduction do not create false cuts',()=>{
 const r=record('Dr. J. Smith said:','“O Lord! Help us understand.” A final sentence.');
 const result=completeSentenceParagraphs(r,[select(r,1,'Smith')]);
 assert.deepEqual(texts(r,result),['Dr. J. Smith said:','“O Lord! Help us understand.”']);
 assert.deepEqual(result.issues,[]);
});

test('a selected exclamatory address includes the following statement without pulling in a later sentence',()=>{
 const r=record('His voice was calling:', '“O people! The doors are open. Come and see.”');
 const result=completeSentenceParagraphs(r,[select(r,1,'voice')]);
 assert.deepEqual(texts(r,result),['His voice was calling:','“O people! The doors are open.']);
 assert.deepEqual(result.issues,[]);
 assert.ok(boundaryConcerns('“O people!').includes('ending is an address without its following statement'));
});
test('a preceding heading or signature is not pulled into a selected complete sentence',()=>{
 const r=record('The light within the lantern','A complete statement follows.','Another statement. ‘Abdu’l-Bahá','This is the chosen ending.');
 const result=completeSentenceParagraphs(r,[select(r,2,'complete'),select(r,4,'chosen')]);
 assert.deepEqual(texts(r,result),['A complete statement follows.','This is the chosen ending.']);
});

test('a quoted oath introduces its following statement rather than ending the excerpt',()=>{
 const r=record('We reached the sea. We heard its voice: "By God! The beloved has come." Then we departed.');
 const result=completeSentenceParagraphs(r,[select(r,1,'heard its voice')]);
 assert.deepEqual(texts(r,result),['We heard its voice: "By God! The beloved has come."']);
 assert.deepEqual(result.issues,[]);
 assert.ok(boundaryConcerns('We heard its voice: "By God!').includes('ending is an address without its following statement'));
});
test('selected introductory labels include the sentence they introduce',()=>{
 const r=record('[One day he was saying:]','He remembered a kindness. Another memory followed.');
 const result=completeSentenceParagraphs(r,[select(r,1,'saying')]);
 assert.deepEqual(texts(r,result),['[One day he was saying:]','He remembered a kindness.']);
 assert.deepEqual(result.issues,[]);
});
test('a repeated divine address carries its actual petition, including after a quoted introduction',()=>{
 const r=record('An earlier sentence. Say before the tomb: "My God, my God! I ask for pardon and mercy. Grant us peace."');
 const result=completeSentenceParagraphs(r,[select(r,1,'Say before the tomb')]);
 assert.deepEqual(texts(r,result),['Say before the tomb: "My God, my God! I ask for pardon and mercy.']);
 assert.deepEqual(result.issues,[]);
 assert.ok(boundaryConcerns('My God, my God!').includes('ending is an address without its following statement'));
 const ordinary=record('The crowd applauded! Another statement follows.');
 assert.deepEqual(texts(ordinary,completeSentenceParagraphs(ordinary,[select(ordinary,1,'applauded')])),['The crowd applauded!']);
});
test('inline numbered lists continue through their sentence instead of stopping at an item number',()=>{
 const sentence='He was described in three respects: 1. Sinless, 2. Possessor of knowledge and 3. a teacher with authority?';
 const r=record('An earlier sentence. '+sentence+' A later sentence.');
 const result=completeSentenceParagraphs(r,[select(r,1,'three respects')]);
 assert.deepEqual(texts(r,result),[sentence]);
 assert.deepEqual(result.issues,[]);
 const ordinary=record('The number is 1. Another sentence follows.');
 assert.deepEqual(texts(ordinary,completeSentenceParagraphs(ordinary,[select(ordinary,1,'number')])),['The number is 1.']);
});
test('source fragments are retained and flagged; footnotes after a stop are accepted',()=>{
 const r=record('...a fragment that has no available ending');
 const result=completeSentenceParagraphs(r,[select(r,1,'fragment')]);
 assert.deepEqual(texts(r,result),[r.en.paragraphs[0].plain]);
 assert.ok(result.issues.some(x=>x.issue==='ending lacks a sentence terminator'));
 assert.deepEqual(boundaryConcerns('A complete sentence.[1]'),[]);
 assert.ok(boundaryConcerns('A complete sentence! [cf.').includes('ending contains an unfinished bracketed note'));
 assert.ok(!boundaryConcerns('A complete sentence! [cf. another passage]').includes('ending contains an unfinished bracketed note'));
 assert.deepEqual(boundaryConcerns('A [supplied] word ends here.'),[]);
});
test('a selected bracketed report stays complete without consuming unrelated paragraphs',()=>{
 const r=record('[The reported setting. The report continues.] A later statement.');
 const result=completeSentenceParagraphs(r,[select(r,1,'reported setting')]);
 assert.deepEqual(texts(r,result),['[The reported setting. The report continues.]']);
 assert.deepEqual(result.issues,[]);
 const incomplete=record('[A report without its closing mark.','A different paragraph. A later note [1].');
 const retained=completeSentenceParagraphs(incomplete,[select(incomplete,1,'report')]);
 assert.deepEqual(texts(incomplete,retained),['[A report without its closing mark.']);
 assert.ok(retained.issues.some(x=>x.issue==='ending contains an unfinished bracketed note'));
});

test('supplied context requires unique literal wording in source order',()=>{
 const r=record('Before this, a sufficiently long quoted passage begins here and ends here. A final sufficiently long quoted passage follows here.');
 const excerpt='a sufficiently long quoted passage begins ... A final sufficiently long quoted passage follows';
 const selected=locateSuppliedParagraphs(r,excerpt);
 assert.deepEqual(texts(r,completeSentenceParagraphs(r,selected)),[r.en.paragraphs[0].plain]);
 assert.throws(()=>locateSuppliedParagraphs(r,excerpt.replace('begins','starts')),/missing/);
 assert.throws(()=>locateSuppliedParagraphs(record(r.en.paragraphs[0].plain,r.en.paragraphs[0].plain),excerpt),/ambiguous/);
 assert.throws(()=>locateSuppliedParagraphs(r,'short'),/Insufficient/);
});

test('a trailing attribution does not make a complete quotation a fragment or hide an omission',()=>{
 assert.deepEqual(boundaryConcerns('A complete sentence. (Carl Sagan, in "The Varieties of Scientific Experience")'),[]);
 assert.deepEqual(boundaryConcerns('Then our souls do exist. "So it seems." (Plato, Phaedo 70e, 71d)'),[]);
 assert.ok(boundaryConcerns('An unfinished sentence (A cited book)').includes('ending lacks a sentence terminator'));
 assert.ok(boundaryConcerns('A complete sentence. Another fragment (A cited book)').includes('ending lacks a sentence terminator'));
 assert.ok(boundaryConcerns('A supplied omission... (A cited book)').includes('boundary contains an omission'));
 assert.ok(boundaryConcerns('"O people! (A cited book)').includes('ending is an address without its following statement'));
});

test('named Answer headings restore the adjacent question but never cross another answer',()=>{
 const r=record('Question asked by Mrs. Dixon:','Will you ever return to America again?','Answer by Abdul Baha:',"It is in God's hands. Pray for me to return.");
 const selected=[select(r,4,"God's hands")],before=JSON.stringify({r,selected});
 assert.deepEqual(texts(r,completeSentenceParagraphs(r,selected)),['Will you ever return to America again?','Answer by Abdul Baha:',"It is in God's hands."]);
 assert.equal(JSON.stringify({r,selected}),before);
 const intervening=record('Question: What is the meaning?','Answer by Abdul Baha: Have you considered this?','Answer: The later reply.');
 assert.deepEqual(texts(intervening,completeSentenceParagraphs(intervening,[select(intervening,3,'later')])),['Answer: The later reply.']);
 const imperative=record('What should we do?','Answer by showing kindness to others.');
 assert.deepEqual(texts(imperative,completeSentenceParagraphs(imperative,[select(imperative,2,'kindness')])),['Answer by showing kindness to others.']);
});
