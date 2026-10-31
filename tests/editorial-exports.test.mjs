import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {editorialFile,editorialExports} from '../scripts/editorial-exports.mjs';
import {PendingCatalogEdits,legacyPendingFile} from '../scripts/catalog-edits.mjs';
import {mergeExportedDecisions} from '../scripts/publish-editorial-decisions.mjs';

const draft=()=>({format:1,matches:{},relationships:[],reviewedSubjects:{}});
const item={action:'edit',savedAt:'2026-01-01',state:'source revision',original:'private original',english:'New text'};
async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pi-editorial-export-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const file=path.join(root,'Downloads/subject-edits.json');
  await fs.mkdir(path.dirname(file));
  return {root,file,pending:new PendingCatalogEdits(root,{file})};
}

test('the editor and publisher default to the same Downloads file',()=>{
  assert.equal(editorialFile,path.join(os.homedir(),'Downloads','subject-edits.json'));
  assert.equal(new PendingCatalogEdits(os.tmpdir()).file,editorialFile);
});

test('saving and discarding catalog edits preserve subject decisions and never publish pending source texts as decisions',async t=>{
  const {file,pending}=await fixture(t);
  const original={...draft(),matches:{keep:{status:'rejected'}},reviewedSubjects:{topic:true}};
  await fs.writeFile(file,JSON.stringify(original));
  await pending.set('AB1',item);
  const exported=JSON.parse(await fs.readFile(file,'utf8'));
  assert.deepEqual(exported.matches,original.matches);assert.deepEqual(exported.reviewedSubjects,original.reviewedSubjects);
  assert.deepEqual(exported.catalogEdits.items.AB1,item);
  const {merged}=mergeExportedDecisions(draft(),await editorialExports({pendingPath:file}),new Set(['topic']));
  assert.deepEqual(merged,original);
  assert.ok(!JSON.stringify(merged).includes('private original'));
  await pending.remove('AB1');
  assert.deepEqual((await pending.read()).items,{});
  assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')).matches,original.matches);
});

test('legacy edits and their publication status survive migration without resurfacing after discard',async t=>{
  const {root,file,pending}=await fixture(t),legacy=path.join(root,legacyPendingFile);
  const data={format:1,items:{AB1:{...item,publishedIn:{number:42},applied:{backup:'backup.zip'}}},pullRequest:{number:42,ids:['AB1']}};
  await fs.mkdir(path.dirname(legacy));await fs.writeFile(legacy,JSON.stringify(data));
  await fs.writeFile(file,JSON.stringify({...draft(),matches:{keep:{status:'rejected'}}}));
  assert.deepEqual(await pending.read(),data);
  await pending.write(await pending.read());
  assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')).catalogEdits,data);
  assert.deepEqual(JSON.parse(await fs.readFile(legacy,'utf8')),data);
  await pending.update(value=>{delete value.items.AB1;delete value.pullRequest;});
  assert.deepEqual(await pending.read(),{format:1,items:{}});
});

test('a catalog save cannot make older canonical subject decisions override a newer numbered export',async t=>{
  const {file,pending}=await fixture(t),numbered=file.replace('.json',' (2).json');
  await fs.writeFile(file,JSON.stringify({...draft(),matches:{oldOnly:{status:'rejected'}},reviewedSubjects:{topic:false}}));
  await fs.utimes(file,new Date('2026-01-01'),new Date('2026-01-01'));
  await fs.writeFile(numbered,JSON.stringify({...draft(),matches:{newOnly:{status:'rejected'}},reviewedSubjects:{topic:true}}));
  await fs.utimes(numbered,new Date('2026-01-02'),new Date('2026-01-02'));
  await pending.set('AB1',item);
  const exports=await editorialExports({pendingPath:file});
  assert.deepEqual(exports.map(value=>value.file),[file,numbered]);
  const {merged,summary}=mergeExportedDecisions(draft(),exports,new Set(['topic']));
  assert.deepEqual(Object.keys(merged.matches),['oldOnly','newOnly']);assert.equal(merged.reviewedSubjects.topic,true);
  assert.equal(summary.newPassages,2);assert.equal(summary.reviewProgress,1);
  const explicit=await editorialExports({pendingPath:file,file:numbered});
  assert.equal(explicit.at(-1).file,numbered);
});

test('invalid existing exports are never overwritten and a fresh catalog export is publishable',async t=>{
  const {file,pending}=await fixture(t);
  assert.deepEqual(await editorialExports({pendingPath:file}),[]);
  await pending.set('AB1',item);
  assert.deepEqual(mergeExportedDecisions(draft(),await editorialExports({pendingPath:file}),new Set()).merged,draft());
  const invalid='{"format":1,"unrecognized":"preserve me"}';await fs.writeFile(file,invalid);
  await assert.rejects(pending.set('AB2',item),/has not been changed/);
  assert.equal(await fs.readFile(file,'utf8'),invalid);
  await fs.writeFile(file,JSON.stringify({...draft(),catalogEdits:{format:2,items:{}}}));
  await assert.rejects(pending.read(),/does not understand/);
});
