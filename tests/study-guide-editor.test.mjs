import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {GuideStore,checkGuide} from '../scripts/study-guide-store.mjs';
import {readZip} from '../scripts/zip-archive.mjs';
import {guideQuotations} from '../scripts/study-guide-quotations.mjs';
import {startGuideEditor,pendingGuideFiles} from '../scripts/edit-study-guide-server.mjs';

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const id='A'.repeat(32),other='B'.repeat(32);
const guide=()=>({id,slug:'sample',displayTitle:'Sample',introduction:'An editorial paragraph citing [1].',arc:'An editorial sequence.',
  selection:{review:'selections/sample.json',sha256:'0'.repeat(64),ids:['one','two','three','free']},
  order:[{key:'source:X1',why:'First.'},{key:'source:X2',why:'Second.'},{key:'source:X3',why:'Third.'},{key:'selection:free',why:'Supplied.'}],
  questions:['What follows?','What changes?','What remains?'],
  neighbors:[{id:other,relationship:'recorded graph neighbor',evidence:['e1']},{id:other,relationship:'editorial exploration',invitation:'Follow this.',evidence:['e2']}],
  references:[{label:'1 · A source',url:'https://example.org/a',note:'Compare.',verified:'Checked 2026-10-11.'}]});

test('reviewed adjacent source questions survive edits and cannot be rewritten',()=>{
  const original=guide();original.order[0].sourceQuestion={sourceVersion:'v1',paragraph:1,text:'Question: Why?'};
  assert.deepEqual(checkGuide(original,structuredClone(original)),original);
  const olderClient=structuredClone(original);delete olderClient.order[0].sourceQuestion;
  assert.deepEqual(checkGuide(original,olderClient).order[0].sourceQuestion,original.order[0].sourceQuestion);
  const changed=structuredClone(original);changed.order[0].sourceQuestion.text='Invented question';
  assert.throws(()=>checkGuide(original,changed),/reviewed source question cannot be changed/);
  const injected=guide();injected.order[1].sourceQuestion=original.order[0].sourceQuestion;
  assert.throws(()=>checkGuide(guide(),injected),/reviewed source question cannot be changed/);
});

test('every published study guide passes the editor checks unchanged',async()=>{
  const guides=(await new GuideStore(projectRoot).files()).flatMap(file=>file.data.subjects);
  assert.ok(guides.length>600);
  for(const guide of guides)assert.deepEqual(checkGuide(guide,structuredClone(guide)),guide,guide.slug);
});

test('editorial wording and order can change; reviewed structure cannot',()=>{
  const original=guide(),edit=()=>structuredClone(original);
  let g=edit();g.order.reverse();g.order.push(g.order.shift());g.displayTitle='New title';
  assert.deepEqual(checkGuide(original,g).order.map(x=>x.key),['source:X3','source:X2','source:X1','selection:free']);
  g=edit();g.order.reverse();assert.throws(()=>checkGuide(original,g),/must come before the supplied quotations/);
  g=edit();g.order.pop();assert.throws(()=>checkGuide(original,g),/exactly once/);
  g=edit();g.order[1].key='source:X1';assert.throws(()=>checkGuide(original,g),/exactly once/);
  g=edit();g.order[0].why=' ';assert.throws(()=>checkGuide(original,g),/note for reading 1/);
  // Kept sentences of a shortened reading move with it. New kept sentences, or
  // a newly omitted reading, need a check against the source text first.
  const shortened=edit();shortened.order[1].shortened=['Kept sentence.'];
  g=structuredClone(shortened);g.order.reverse();g.order.push(g.order.shift());
  assert.deepEqual(checkGuide(shortened,g).order[1].shortened,['Kept sentence.']);
  g=structuredClone(shortened);g.order[1].shortened=['Another sentence.'];assert.throws(()=>checkGuide(shortened,g),/could not be checked/);
  assert.deepEqual(checkGuide(shortened,g,{verified:new Set(['source:X2'])}).order[1].shortened,['Another sentence.']);
  g=structuredClone(shortened);delete g.order[1].shortened;assert.equal(checkGuide(shortened,g).order[1].shortened,undefined);
  g=edit();g.order[0].shortened=['Added.'];assert.throws(()=>checkGuide(original,g),/could not be checked/);
  g=edit();g.order[0].shortened=[];assert.throws(()=>checkGuide(original,g,{verified:new Set(['source:X1'])}),/kept sentences of reading 1 are invalid/);
  g=edit();g.order[0].extra=1;assert.throws(()=>checkGuide(original,g),/moved, shortened, left out/);
  // Leaving out a reading lowers the question limit; putting it back needs no check.
  g=edit();g.order[0].omitted=true;assert.throws(()=>checkGuide(original,g),/Leaving out reading 1 could not be checked/);
  const verified={verified:new Set(['source:X1','source:X2','source:X3','selection:free'])};
  assert.throws(()=>checkGuide(original,g,verified),/exactly 2 questions/);
  g.questions.pop();assert.equal(checkGuide(original,g,verified).order[0].omitted,true);
  g.order[1].omitted=true;assert.throws(()=>checkGuide(original,g,verified),/exactly 1 question/);
  g.questions=['What follows?'];const omitted=checkGuide(original,g,verified);
  g=structuredClone(omitted);delete g.order[0].omitted;delete g.order[1].omitted;g.questions=original.questions;assert.deepEqual(checkGuide(omitted,g).order,original.order);
  g=edit();g.order[0].omitted=false;assert.throws(()=>checkGuide(original,g,verified),/either left out or not/);
  g=edit();for(const x of g.order)x.omitted=true;g.questions=[];assert.throws(()=>checkGuide(original,g,verified),/At least one reading/);
  g=edit();g.questions=['One?'];assert.throws(()=>checkGuide(original,g),/exactly 3 questions/);
  g=edit();g.questions.push('Four?');assert.throws(()=>checkGuide(original,g),/exactly 3 questions/);
  g=edit();g.questions[1]=g.questions[0];assert.throws(()=>checkGuide(original,g),/identical/);
  g=edit();g.introduction='Two\n\nparagraphs';assert.throws(()=>checkGuide(original,g),/single paragraph/);
  g=edit();g.introduction='Cites [2].';assert.throws(()=>checkGuide(original,g),/cites \[2\]/);
  g=edit();g.questions[0]=g.arc;assert.throws(()=>checkGuide(original,g),/must not repeat/);
  g=edit();g.selection.ids.pop();assert.throws(()=>checkGuide(original,g),/“selection” cannot be changed/);
  g=edit();g.slug='renamed';assert.throws(()=>checkGuide(original,g),/“slug” cannot be changed/);
  g=edit();g.neighbors[0].evidence=[];assert.throws(()=>checkGuide(original,g),/Only the invitation/);
  g=edit();g.neighbors.pop();assert.throws(()=>checkGuide(original,g),/added or removed/);
  // Invitations are optional: add one, or clear one to remove it.
  g=edit();g.neighbors[0].invitation='New path.';g.neighbors[1].invitation='';
  assert.deepEqual(checkGuide(original,g).neighbors,[{...original.neighbors[0],invitation:'New path.'},{id:other,relationship:'editorial exploration',evidence:['e2']}]);
  // References: http(s) only; a verification note stays with the address it checked.
  g=edit();g.references.push({label:'2 · More',url:'https://example.org/b',note:'Another.'});g.introduction='Cites [1] and [2].';assert.equal(checkGuide(original,g).references.length,2);
  g=edit();g.references[0].url='javascript:alert(1)';delete g.references[0].verified;assert.throws(()=>checkGuide(original,g),/http or https/);
  g=edit();g.references[0].url='https://example.org/changed';assert.throws(()=>checkGuide(original,g),/verification note/);
  g=edit();g.references=[];g.introduction='No citations.';assert.deepEqual(checkGuide(original,g).references,[]);
});

async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pi-guide-editor-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'study-guides'));
  const editorial={format:1,method:'Fixture',subjects:[{...guide(),slug:'first',id:other}]};
  const batch={batchNumber:2,subjects:[guide()]};
  await fs.writeFile(path.join(root,'study-guides/editorial.json'),JSON.stringify(editorial,null,2)+'\n');
  // A Windows checkout may have CRLF line endings; saving keeps them.
  await fs.writeFile(path.join(root,'study-guides/second-batch.json'),(JSON.stringify(batch,null,2)+'\n').replaceAll('\n','\r\n'));
  return {root,editorial,batch,store:new GuideStore(root)};
}

test('saving rewrites only the edited guide, keeps line endings, and backs up the previous file',async t=>{
  const {root,editorial,batch,store}=await fixture(t);
  const list=await store.list();
  assert.deepEqual(list.map(g=>[g.slug,g.file,g.curated]),[['first','study-guides/editorial.json',true],['sample','study-guides/second-batch.json',true]]);
  const loaded=await store.load('sample');assert.deepEqual(loaded.questionLimits,[3,3]);
  const edited=structuredClone(loaded.guide);edited.introduction='Revised “wording” citing [1].';[edited.order[0],edited.order[1]]=[edited.order[1],edited.order[0]];
  const saved=await store.save('sample',loaded.revision,edited);
  assert.ok(saved.backup);assert.notEqual(saved.revision,loaded.revision);
  const text=await fs.readFile(path.join(root,'study-guides/second-batch.json'),'utf8');
  assert.ok(!/[^\r]\n/.test(text));
  const expected=structuredClone(batch);expected.subjects[0].introduction=edited.introduction;expected.subjects[0].order=edited.order;
  assert.deepEqual(JSON.parse(text),expected);
  assert.match(saved.backup,/^\.qa[\\/]guide-backups[\\/][^\\/]+\.zip$/);
  assert.equal((await readZip(path.join(root,saved.backup))).get('study-guides/second-batch.json').toString('utf8'),(JSON.stringify(batch,null,2)+'\n').replaceAll('\n','\r\n'));
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root,'study-guides/editorial.json'),'utf8')),editorial);
  // A stale revision or invalid edit writes nothing.
  await assert.rejects(store.save('sample',loaded.revision,edited),/changed since you opened it/);
  await assert.rejects(store.save('sample',saved.revision,{...saved.guide,questions:[]}),/exactly 3 questions/);
  assert.equal(await fs.readFile(path.join(root,'study-guides/second-batch.json'),'utf8'),text);
  assert.equal((await store.save('sample',saved.revision,saved.guide)).backup,null);
  await assert.rejects(store.load('../x'),/Choose a study guide/);
});

test('quotation previews follow the guide builder’s grouping and reviewed selection',async()=>{
  const sel=(id,source,text,status='exact')=>({id,status,passage:source?'p':undefined,candidates:source?[{source,version:'v',ranges:[{paragraph:1,start:0,end:text.length,text}]}]:[]});
  const data={subject:{id,name:'Sample'},sources:{X1:{},X2:{},X3:{}},selections:[sel('one','X1','First words'),sel('one-b','X1','Later words'),sel('two','X2','Second'),sel('three','X3','Third'),sel('dropped','X3','Not chosen'),
    {id:'free',status:'unmatched',excerpt:'A supplied quotation.',original:'A supplied quotation. Ref.',reference:'Ref.',candidates:[],provenance:{}}]};
  const g=guide();g.selection.ids=['one','one-b','two','three','free'];
  const read=async name=>name==='subjects/index.json.gz'?{subjects:[{id:other,name:'Other subject'}]}:data;
  const preview=await guideQuotations(g,read);
  assert.equal(preview.changed,'');
  assert.deepEqual(preview.entries['source:X1'],{source:'X1',linked:true,quotations:2,text:'First words … Later words'});
  assert.equal(preview.entries['source:X3'].text,'Third');
  assert.equal(preview.entries['selection:free'].reference,'Ref.');
  assert.equal(preview.neighbors[other],'Other subject');
  g.selection.ids.push('dropped');g.order.splice(2,1);
  assert.match((await guideQuotations(g,read)).changed,/no longer match/);
});

test('the local editor requires its private link and publishes only saved guide files',async t=>{
  const {root}=await fixture(t);
  const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'});
  git('init','-q');git('add','.');git('-c','user.name=t','-c','user.email=t@example.org','commit','-qm','fixture');
  assert.deepEqual(await pendingGuideFiles(root),[]);
  const {server,url,token}=await startGuideEditor({root,open:false,site:'http://127.0.0.1:9/'});
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=new URL(url).origin,headers={Origin:origin,'Content-Type':'application/json','X-Editor-Token':token};
  assert.equal((await fetch(origin+'/list',{method:'POST',body:'{}'})).status,403);
  assert.equal((await fetch(origin+'/list',{method:'POST',headers:{...headers,Origin:'https://example.com'},body:'{}'})).status,403);
  const page=await (await fetch(origin+'/')).text();assert.match(page,/site='http:\/\/127\.0\.0\.1:9\/'/);
  const call=async(name,body)=>{const response=await fetch(origin+'/'+name,{method:'POST',headers,body:JSON.stringify(body)});return {status:response.status,value:await response.json()};};
  assert.equal((await call('list',{})).value.guides.length,2);
  const loaded=(await call('load',{slug:'sample'})).value;
  assert.match(loaded.preview.error,/previews are unavailable/);
  loaded.guide.arc='A revised arc.';
  assert.equal((await call('save',{slug:'sample',revision:loaded.revision,guide:loaded.guide})).status,200);
  assert.deepEqual((await call('status',{})).value.pending,['study-guides/second-batch.json']);
  assert.match((await call('save',{slug:'sample',revision:loaded.revision,guide:loaded.guide})).value.error,/changed since/);
});
