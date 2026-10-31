import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ItemStore,csvText} from '../scripts/item-store.mjs';
import {readZip} from '../scripts/zip-archive.mjs';
import {CatalogEdits} from '../scripts/catalog-edits.mjs';
import {parseCsv} from '../src/text.mjs';
import {startEditor} from '../scripts/edit-item-server.mjs';

async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pi-item-editor-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  for(const folder of ['metadata - copy','original_texts - copy','translated_texts - copy'])await fs.mkdir(path.join(root,folder));
  const rows=[{PIN:'AB00001',Title:'Quoted "title"',Notes:'Two\nlines',Manuscripts:'M',Publications:''},{PIN:'AB00002',Title:'Unrelated',Notes:'keep, unchanged',Manuscripts:'',Publications:''}];
  const csv=csvText(rows,Object.keys(rows[0]));await fs.writeFile(path.join(root,'metadata - copy/items.csv'),csv);
  await fs.writeFile(path.join(root,'translated_texts - copy/AB00001.txt'),Buffer.from([0x93,0x48,0x69,0x94]));
  await fs.writeFile(path.join(root,'original_texts - copy/AB00001.txt'),'متن اصلی\n\nپاراگراف');
  return {root,rows,csv,store:new ItemStore(root)};
}
test('one-item writes preserve other metadata rows and unchanged source bytes, with recoverable backups',async t=>{
  const {root,rows,csv,store}=await fixture(t),item=await store.load('AB00001');
  assert.equal(item.english,'“Hi”');item.metadata.Title='A <new> title';
  const saved=await store.save(item);assert.ok(saved.backup);
  const fresh=parseCsv(await fs.readFile(path.join(root,'metadata - copy/items.csv'),'utf8'));
  assert.deepEqual(fresh[1],rows[1]);assert.equal(fresh[0].Title,'A <new> title');
  assert.match(saved.backup,/item-backups[\\/][^\\/]+\.zip$/);
  assert.equal((await readZip(saved.backup)).get('metadata - copy/items.csv').toString('utf8'),csv);
  assert.deepEqual([...(await readZip(saved.backup)).keys()],['manifest.json','metadata - copy/items.csv']);
  assert.deepEqual(await fs.readFile(path.join(root,'translated_texts - copy/AB00001.txt')),Buffer.from([0x93,0x48,0x69,0x94]));
  assert.equal((await store.save(saved)).backup,null);
});
test('original and translation writes retain paragraph breaks; removed text remains in its backup',async t=>{
  const {root,store}=await fixture(t),item=await store.load('AB00001');
  item.original='فارسی\n\nجدید';item.english='First paragraph.\n\nSecond. \\footnote{Note.}';
  const saved=await store.save(item);assert.equal(saved.original,item.original);assert.equal(saved.english,item.english);
  saved.original=null;const removed=await store.save(saved);
  assert.equal(removed.original,null);assert.equal((await readZip(removed.backup)).get('original_texts - copy/AB00001.txt').toString('utf8'),item.original);
  await assert.rejects(fs.access(path.join(root,'original_texts - copy/AB00001.txt')));
});
test('a changed item is not overwritten; changes to other items do not block; unsafe input cannot change sources',async t=>{
  const {root,rows,store}=await fixture(t),item=await store.load('AB00001');
  for(const id of ['../secret','AB00001.txt','ab00001'])await assert.rejects(store.load(id));
  await assert.rejects(store.save({...item,metadata:{...item.metadata,PIN:'AB00002'}}));
  await assert.rejects(store.save({...item,metadata:{...item.metadata,Unexpected:'value'}}));
  // Another row changes in the CSV: this item's content is the same, so it still saves.
  await fs.writeFile(path.join(root,'metadata - copy/items.csv'),csvText([rows[0],{...rows[1],Title:'Changed elsewhere'}],Object.keys(rows[0])));
  item.metadata.Title='Mine';assert.ok((await store.save(item)).backup);
  assert.equal(parseCsv(await fs.readFile(path.join(root,'metadata - copy/items.csv'),'utf8'))[1].Title,'Changed elsewhere');
  await fs.appendFile(path.join(root,'translated_texts - copy/AB00001.txt'),'external');
  await assert.rejects(store.save(item),/changed since/);
});
test('saving in the editor records a pending edit and leaves the source files alone',async t=>{
  const {root,csv}=await fixture(t),file=path.join(root,'Downloads/subject-edits.json'),edits=new CatalogEdits(root,{file});
  const item=await edits.load('AB00001');assert.equal(item.pending,null);
  item.metadata.Title='Pending title';item.english='New English.';
  const saved=await edits.save(item);
  assert.deepEqual(saved.pending.changed,['Title','English translation changed']);assert.equal(saved.pending.action,'edit');
  assert.equal(await fs.readFile(path.join(root,'metadata - copy/items.csv'),'utf8'),csv);
  const recorded=JSON.parse(await fs.readFile(file,'utf8')).catalogEdits.items.AB00001;
  assert.equal(recorded.english,'New English.');assert.deepEqual(recorded.unchanged,['original']);
  // Reloading shows the pending version; `state` still describes the source files.
  const again=await edits.load('AB00001');
  assert.equal(again.metadata.Title,'Pending title');assert.equal(again.english,'New English.');assert.equal(again.state,item.state);
  // Saving the source content again clears the pending edit.
  const cleared=await edits.save({...item,metadata:{...item.metadata,Title:'Quoted "title"'},english:'“Hi”'});
  assert.equal(cleared.pending,null);assert.match(cleared.note,/matches the source files/);
  assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')).catalogEdits.items,{});
  await assert.rejects(edits.save({...item,state:'stale'}),/changed since/);
  const marked=await edits.markDeletion('AB00001');assert.equal(marked.pending.action,'delete');
  assert.deepEqual((await edits.list()).items.map(x=>[x.id,x.action]),[['AB00001','delete']]);
  const discarded=await edits.discard('AB00001');assert.equal(discarded.pending,null);assert.equal(discarded.discarded.action,'delete');
  assert.deepEqual((await edits.list()).items,[]);
});
test('the local editor requires its token, exact host and same origin; Unicode survives split chunks',async t=>{
  const {root}=await fixture(t),pendingPath=path.join(root,'Downloads/subject-edits.json'),{server,url,token}=await startEditor({root,open:false,pendingPath});
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=new URL(url).origin;
  assert.equal((await fetch(origin+'/load',{method:'POST',body:'{}'})).status,403);
  assert.equal((await fetch(origin+'/load',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json','X-Editor-Token':token},body:'{}'})).status,403);
  const headers={Origin:origin,'Content-Type':'application/json','X-Editor-Token':token};
  const item=await (await fetch(origin+'/load',{method:'POST',headers,body:JSON.stringify({id:'AB00001'})})).json();
  item.original='سلام 😀';const bytes=Buffer.from(JSON.stringify(item));
  const body=new ReadableStream({start(controller){for(const byte of bytes)controller.enqueue(Uint8Array.of(byte));controller.close();}});
  const response=await fetch(origin+'/save',{method:'POST',headers,body,duplex:'half'});
  assert.equal(response.status,200);const saved=await response.json();assert.equal(saved.original,'سلام 😀');assert.equal(saved.pending.action,'edit');
  assert.equal(await fs.readFile(path.join(root,'original_texts - copy/AB00001.txt'),'utf8'),'متن اصلی\n\nپاراگراف');
  const pending=await (await fetch(origin+'/pending',{method:'POST',headers,body:'{}'})).json();
  assert.deepEqual(pending.items.map(x=>x.id),['AB00001']);assert.equal(pending.file,pendingPath);
  assert.equal(JSON.parse(await fs.readFile(pendingPath,'utf8')).catalogEdits.items.AB00001.original,'سلام 😀');
  // A deletion needs the typed ID; marking it replaces the pending correction.
  for(const body of [{id:'AB00001',confirm:'AB00002'},{id:'AB00001'},{id:'../x',confirm:'../x'}])assert.equal((await fetch(origin+'/delete',{method:'POST',headers,body:JSON.stringify(body)})).status,400);
  const marked=await (await fetch(origin+'/delete',{method:'POST',headers,body:JSON.stringify({id:'AB00001',confirm:'AB00001'})})).json();
  assert.equal(marked.pending.action,'delete');
  const discarded=await (await fetch(origin+'/discard',{method:'POST',headers,body:JSON.stringify({id:'AB00001'})})).json();
  assert.equal(discarded.pending,null);
});
test('a published deletion removes only that item from the local sources, with a backup',async t=>{
  const {root,rows,csv,store}=await fixture(t);
  const backup=await store.remove('AB00001');
  assert.deepEqual(parseCsv(await fs.readFile(path.join(root,'metadata - copy/items.csv'),'utf8')),[rows[1]]);
  for(const folder of ['original_texts - copy','translated_texts - copy'])await assert.rejects(fs.access(path.join(root,folder,'AB00001.txt')));
  const archive=await readZip(backup);
  assert.equal(archive.get('metadata - copy/items.csv').toString('utf8'),csv);
  assert.equal(JSON.parse(archive.get('manifest.json')).deleted,true);
  assert.deepEqual((await fs.readdir(path.join(root,'.qa','item-backups'))).map(name=>path.extname(name)),['.zip']);
  assert.equal(await store.remove('AB00001'),null);
});
