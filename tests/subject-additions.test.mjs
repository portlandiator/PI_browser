import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {additionId,additionKey,additionExcerpt,validateMatchEdits,confirmedCandidate} from '../src/passage-review-core.mjs';
import {emptyDraft,mergeDrafts,validateDraft} from '../src/relationship-review-core.mjs';
import {additionsFile,additionIdSync,parseAdditions,planAdditions,subjectTable,additionsBody} from '../scripts/subject-additions.mjs';
import {readExtractInputs} from '../scripts/extract-inputs.mjs';
import {planDeletion} from '../scripts/catalog-deletion.mjs';
import {mergeDecisions,withoutPublished,additionDigests,publicationTitle} from '../scripts/publish-editorial-decisions.mjs';
import {describeCause} from '../scripts/reconcile-study-guides.mjs';
import {catalogueFingerprint} from '../scripts/study-guide-catalogue.mjs';

const version='a'.repeat(64),subject='B'.repeat(32);
const record={id:'BH00001',enVersion:version,en:{paragraphs:[{plain:'First sentence here. Second sentence there.'},{plain:'Another paragraph of text.'}]}};
const candidate=confirmedCandidate({source:'BH00001',version,ranges:[{paragraph:1,start:0,end:20},{paragraph:2,start:0,end:17}]},record);
const csv=`subject,hyperlink,color\nTopic,https://example.org/#?category=${subject},#112233\n`;

test('an added passage has one identity in the browser and the publisher',async()=>{
  const id=await additionId(subject,candidate);
  assert.match(id,/^[a-f\d]{24}$/);
  assert.equal(id,additionIdSync(subject,candidate));
  assert.equal(additionKey(subject,candidate),additionKey(subject,{...candidate,version:'b'.repeat(64)}),'the version is not part of the identity');
  assert.notEqual(id,additionIdSync('C'.repeat(32),candidate));
  assert.equal(additionExcerpt(candidate),'First sentence here. … Another paragraph');
});

test('drafts carry added passages, check them, and keep them out of the published decisions',()=>{
  const id=additionIdSync(subject,candidate),addition={subject,candidate,note:'Belongs here.'};
  const local={...emptyDraft(),additions:{[id]:addition}};
  validateMatchEdits(local);
  assert.deepEqual(mergeDrafts(emptyDraft(),local).additions,{[id]:addition});
  assert.deepEqual(mergeDrafts({format:1,matches:{},relationships:[]},local).additions,{[id]:addition},'older drafts without additions merge');
  assert.throws(()=>validateMatchEdits({...emptyDraft(),additions:{bad:addition}}),/Invalid added passage/);
  assert.throws(()=>validateMatchEdits({...emptyDraft(),additions:{[id]:{...addition,candidate:{...candidate,ranges:[]}}}}),/source version and ranges/);
  assert.throws(()=>validateMatchEdits({...emptyDraft(),additions:{[id]:{...addition,candidate:{...candidate,ranges:[{paragraph:1,start:0,end:5}]}}}}),/quoted text/);
  assert.throws(()=>validateDraft({...emptyDraft(),additions:{[id]:{...addition,subject:'unknown'}}},new Set([subject])),/unknown subject/);
  const published={format:1,matches:{},relationships:[]};
  const {merged}=mergeDecisions(published,local,new Set([subject]));
  assert.ok(!('additions' in merged));
  assert.equal(publicationTitle({additions:2}).kind,'passage-additions');
  assert.equal(publicationTitle({additions:2,deletions:1}).kind,'catalog-edits');
  assert.equal(publicationTitle({additions:1,decisions:2}).title,'Publish 1 added passage, 2 editorial decisions');
  const [digest]=additionDigests(local);
  assert.deepEqual(withoutPublished(local,[digest]).additions,{});
  assert.deepEqual(withoutPublished(local,['other']).additions,{[id]:addition});
});

test('the build reads added passages beside the archive and honours deletions',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pi-additions-build-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'data'));
  const subjects=[{id:subject,name:'Topic'}],imported={id:'c'.repeat(24),subject,raw:'Imported quote',provenance:{sourceCollection:'Evernote_scrape'}};
  await fs.writeFile(path.join(root,'data/subject-extracts-public.json.gz'),gzipSync(JSON.stringify({format:1,report:{blocks:{Evernote_scrape:1},deletedSelections:['d'.repeat(24)],duplicates:[]},selections:[imported]})));
  const added=id=>({raw:'Added words. BH00001',original:'Added words. BH00001',excerpt:'Added words.',reference:'BH00001',suppliedIds:['BH00001'],outsideAuthor:false,id,subject,reviewNote:'Added.',provenance:{sourceCollection:'editorial',sourceFilename:additionsFile},preserveBoundaries:true});
  const one='1'.repeat(24),two='2'.repeat(24);
  await fs.writeFile(path.join(root,additionsFile),JSON.stringify({format:1,selections:[added(one),added(two)]}));
  const inputs=await readExtractInputs(root,subjects,{deletedIds:['d'.repeat(24),two],notes:{[one]:'noted'}});
  assert.deepEqual(inputs.bySubject.get(subject).map(s=>s.id),[imported.id,one]);
  assert.equal(inputs.bySubject.get(subject)[1].reviewNote,'noted');
  assert.equal(inputs.report.additions,1);assert.deepEqual(inputs.report.deletedSelections,['d'.repeat(24),two]);
  // The import totals stay consistent: blocks less deletions equal the selections built.
  assert.deepEqual(inputs.report.blocks,{Evernote_scrape:1,additions:2});
  assert.equal(Object.values(inputs.report.blocks).reduce((a,b)=>a+b,0)-1,inputs.bySubject.get(subject).length,'one deleted addition; the archive fixture lists its own exclusion without a block');
  const without=await readExtractInputs(root,subjects,{deletedIds:['d'.repeat(24)]});
  assert.notEqual(without.version,inputs.version);
  assert.throws(()=>parseAdditions(JSON.stringify({format:1,selections:[added('d'.repeat(24))]}),subjects,{},new Set(['d'.repeat(24)])),/Excluded quotation remains/);
  assert.throws(()=>parseAdditions(JSON.stringify({format:1,selections:[{...added(one),provenance:{sourceCollection:'Evernote_scrape'}}]}),subjects),/Invalid subject addition/);
  assert.throws(()=>parseAdditions(JSON.stringify({format:1,selections:[added(one),added(one)]}),subjects),/Invalid subject addition/);
});

test('the publisher turns checked additions into selections and confirmed decisions, once each',async()=>{
  const subjects=subjectTable(csv);
  assert.deepEqual([...subjects.keys()],[subject]);assert.equal(subjects.get(subject).row,2);
  const id=additionIdSync(subject,candidate);
  const existing={id:'e'.repeat(24),status:'exact',excerpt:'Already quoted wording.',suppliedIds:['BH00001'],candidates:[{source:'BH00001',version,ranges:[{paragraph:2,start:0,end:17,text:'Another paragraph'}]}]};
  const rejected={id:'f'.repeat(24),status:'rejected',excerpt:'Second sentence there.',suppliedIds:[],candidates:[]};
  const compilation={subject:{id:subject,name:'Topic'},selections:[existing,rejected],sources:{}};
  const site=async name=>name==='data/BH00001.json.gz'?record:name===`subjects/${subject}.json.gz`?compilation:null;
  const files={[additionsFile]:'{\r\n  "format": 1,\r\n  "selections": []\r\n}\r\n'};
  const read=async name=>files[name]===undefined?null:Buffer.from(files[name]);
  const rejectedWording=confirmedCandidate({source:'BH00001',version,ranges:[{paragraph:1,start:21,end:43}]},record);
  const stale={source:'BH00001',version:'b'.repeat(64),ranges:[{paragraph:1,start:0,end:5,text:'First'}]};
  const additions={
    [id]:{subject,candidate,note:'Belongs here.',addedAt:'2026-11-10T00:00:00.000Z'},
    ['9'.repeat(24)]:{subject,candidate:{...candidate,ranges:[candidate.ranges[0]]}},
    [additionIdSync(subject,stale)]:{subject,candidate:stale},
    [additionIdSync(subject,{source:'BH00001',ranges:[{paragraph:2,start:0,end:17}]})]:{subject,candidate:{source:'BH00001',version,ranges:[{paragraph:2,start:0,end:17,text:'Another paragraph'}]}},
    [additionIdSync(subject,rejectedWording)]:{subject,candidate:rejectedWording},
    [additionIdSync('unknown',candidate)]:{subject:'unknown',candidate},
    [additionIdSync(subject,{source:'BH00002',ranges:[{paragraph:1,start:0,end:3}]})]:{subject,candidate:{source:'BH00002',version,ranges:[{paragraph:1,start:0,end:3,text:'Abc'}]}},
  };
  const plan=await planAdditions({additions,subjects,site,read});
  assert.deepEqual(plan.added.map(s=>s.id),[id]);
  const selection=plan.added[0];
  assert.equal(selection.excerpt,'First sentence here. … Another paragraph');
  assert.equal(selection.raw,'First sentence here. … Another paragraph  BH00001');
  assert.deepEqual(selection.suppliedIds,['BH00001']);assert.equal(selection.reviewNote,'Belongs here.');assert.equal(selection.preserveBoundaries,true);
  assert.equal(selection.provenance.sourceCollection,'editorial');assert.equal(selection.provenance.subjectRow,2);assert.equal(selection.provenance.candidateId,`BH00001@${version}:en:1`);assert.equal(selection.provenance.addedAt,'2026-11-10T00:00:00.000Z');
  assert.equal(plan.matches[id].status,'confirmed');assert.equal(plan.matches[id].candidate.ranges[1].text,'Another paragraph');assert.equal(plan.matches[id].candidate.method,'editorial');
  assert.deepEqual(plan.done,[id]);
  assert.deepEqual(plan.skipped.map(s=>s.reason.split(/[;.]/)[0]),['its identity does not match its subject and ranges','Source version differs','the subject already quotes this passage (selection eeeeeeeeeeeeeeeeeeeeeeee)','the subject has this wording as a rejected quotation (selection ffffffffffffffffffffffff)','its subject is not in the subject list','the website has no record BH00002']);
  assert.ok(plan.text.includes('\r\n')&&plan.text.endsWith('\r\n'));
  const written=JSON.parse(plan.text);assert.equal(written.selections.length,1);assert.deepEqual(written.selections[0],selection);
  assert.deepEqual(plan.summary,[{id,subject:'Topic',source:'BH00001',paragraphs:[1,2],excerpt:selection.excerpt}]);
  const body=additionsBody(plan);assert.match(body,/Passages added to subject compilations \(1\)/);assert.match(body,/Topic: `BH00001` ¶1, 2/);assert.match(body,/not included/);
  // Published already: nothing to add, but recorded as done so the export stops proposing it.
  files[additionsFile]=plan.text;
  const again=await planAdditions({additions:{[id]:additions[id]},subjects,site,read});
  assert.equal(again.text,null);assert.deepEqual(again.done,[id]);assert.equal(again.skipped[0].reason,'already published.');
  const live=await planAdditions({additions:{[id]:additions[id]},subjects,site:async name=>name===`subjects/${subject}.json.gz`?{...compilation,selections:[{...existing,id}]}:site(name),read:async()=>null});
  assert.deepEqual(live.done,[id]);assert.equal(live.added.length,0);
});

test('deleting a catalog item removes the passages added from it',async()=>{
  const id=additionIdSync(subject,candidate);
  const before={subject:{id:subject,name:'Topic'},sources:{},selections:[{id,subject,status:'confirmed',excerpt:'First',suppliedIds:['BH00001'],passage:'p',candidates:[candidate]},{id:'k'.repeat(24),subject,status:'confirmed',excerpt:'Kept',suppliedIds:['BH00002'],passage:'q',candidates:[{source:'BH00002',version,ranges:[{paragraph:1,start:0,end:3,text:'Abc'}]}]}]};
  const files={
    'data/subject-extracts-public.json.gz':gzipSync(JSON.stringify({selections:[before.selections[1]],report:{}})),
    [additionsFile]:JSON.stringify({format:1,selections:[{id,subject,excerpt:'First',suppliedIds:['BH00001'],provenance:{sourceCollection:'editorial'}}]},null,2)+'\n',
    'data/extract-review-decisions.json':'{}\n','data/subject-edits.json':JSON.stringify({format:1,matches:{[id]:{status:'confirmed',candidate}},relationships:[]})+'\n',
    'study-guides/catalogue-baseline.json':JSON.stringify({format:1,subjects:{[subject]:{fingerprint:catalogueFingerprint(before.selections),publicSelections:2}}})+'\n'
  };
  const site=async name=>name===`subjects/${subject}.json.gz`?before:name==='subjects/passages/BH00001.json.gz'?{passages:{p:{subjects:[subject]}}}:null;
  const plan=await planDeletion({id:'BH00001',read:async name=>files[name]===undefined?null:Buffer.from(files[name]),list:async()=>['catalogue-baseline.json'],site});
  assert.deepEqual(plan.removedIds,[id]);
  assert.deepEqual(JSON.parse(plan.changes.get(additionsFile)).selections,[]);
  assert.deepEqual(JSON.parse(plan.changes.get('data/subject-edits.json')).matches,{});
  // The addition lived only in its file, so the archive and its exclusion list are untouched.
  assert.ok(!plan.changes.has('data/subject-extracts-public.json.gz'));assert.ok(!plan.changes.has('data/extract-review-decisions.json'));
  assert.equal(describeCause({deleted:[],changed:[],added:[id]}),'a passage was added to a subject compilation');
  assert.equal(describeCause({deleted:[],changed:[],added:[id,id]}),'2 passages were added to subject compilations');
  assert.equal(describeCause({deleted:['X'],changed:[],added:[id]}),'catalog item X was deleted');
});
