import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {readExtractInputs,extractFolders} from '../scripts/extract-inputs.mjs';
test('deleted selections never re-enter the import and notes survive without altering source files',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pi-extract-decisions-'));
  t.after(async()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));await fs.rm(root,{recursive:true,force:true});});
  await fs.mkdir(path.join(root,'data'));await fs.writeFile(path.join(root,'data/extract-subject-aliases.json'),'{}');
  for(const folder of extractFolders)await fs.mkdir(path.join(root,'subject_extracts',folder),{recursive:true});
  const file=path.join(root,'subject_extracts/Evernote_scrape/Topic.txt'),text='Remove this quotation.\n\nKeep this quotation. GWB#005';await fs.writeFile(file,text);
  const subjects=[{id:'topic',name:'Topic',row:2,url:'https://example.org'}];
  const first=await readExtractInputs(root,subjects),[deleted,kept]=first.bySubject.get('topic');
  const second=await readExtractInputs(root,subjects,{deletedIds:[deleted.id],notes:{[kept.id]:'use Reference'}});
  assert.deepEqual(second.bySubject.get('topic').map(s=>s.id),[kept.id]);assert.equal(second.bySubject.get('topic')[0].reviewNote,'use Reference');
  assert.deepEqual(second.report.deletedSelections,[deleted.id]);assert.equal(second.report.blocks.Evernote_scrape,2);assert.equal(await fs.readFile(file,'utf8'),text);
  assert.notEqual(first.version,second.version);
});

test('public archive preserves identities without raw files and contains no excluded quotation',async t=>{
  const {gzipSync}=await import('node:zlib');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pi-public-extracts-'));
  t.after(async()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));await fs.rm(root,{recursive:true,force:true});});
  await fs.mkdir(path.join(root,'data'));
  const subjects=[{id:'topic',name:'Topic'}],kept={id:'a'.repeat(24),subject:'topic',raw:'Retained quote',provenance:{sourceCollection:'subjects_inv_length_ordered'}},deleted='b'.repeat(24);
  const archive={format:1,report:{blocks:{subjects_inv_length_ordered:2},deletedSelections:[deleted],duplicates:[]},selections:[kept]};
  const file=path.join(root,'data/subject-extracts-public.json.gz');
  await fs.writeFile(file,gzipSync(JSON.stringify(archive)));
  const inputs=await readExtractInputs(root,subjects,{deletedIds:[deleted],notes:{[kept.id]:'retained'}});
  assert.equal(inputs.bySubject.get('topic')[0].id,kept.id);assert.equal(inputs.bySubject.get('topic')[0].reviewNote,'retained');assert.deepEqual(inputs.report.deletedSelections,[deleted]);
  const later=await readExtractInputs(root,subjects,{deletedIds:[deleted,kept.id]});assert.equal(later.bySubject.get('topic').length,0);assert.equal(later.report.deletedSelections.length,2);
  archive.selections.push({...kept,id:deleted,raw:'Excluded quote'});await fs.writeFile(file,gzipSync(JSON.stringify(archive)));
  await assert.rejects(readExtractInputs(root,subjects),/Excluded quotation remains/);
});
