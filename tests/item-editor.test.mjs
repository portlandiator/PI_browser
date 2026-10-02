import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ItemStore,csvText} from '../scripts/item-store.mjs';
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
test('one-item edits preserve other metadata rows and unchanged source bytes, with recoverable backups',async t=>{
  const {root,rows,csv,store}=await fixture(t),item=await store.load('AB00001');
  assert.equal(item.english,'“Hi”');item.metadata.Title='A <new> title';
  const saved=await store.save(item);assert.ok(saved.backup);
  const fresh=parseCsv(await fs.readFile(path.join(root,'metadata - copy/items.csv'),'utf8'));
  assert.deepEqual(fresh[1],rows[1]);assert.equal(fresh[0].Title,'A <new> title');
  assert.equal(await fs.readFile(path.join(saved.backup,'0'),'utf8'),csv);
  assert.deepEqual(await fs.readFile(path.join(root,'translated_texts - copy/AB00001.txt')),Buffer.from([0x93,0x48,0x69,0x94]));
  assert.equal((await store.save(saved)).backup,null);
});
test('original and translation edits retain paragraph breaks; removed text remains in its backup',async t=>{
  const {root,store}=await fixture(t),item=await store.load('AB00001');
  item.original='فارسی\n\nجدید';item.english='First paragraph.\n\nSecond. \\footnote{Note.}';
  const saved=await store.save(item);assert.equal(saved.original,item.original);assert.equal(saved.english,item.english);
  saved.original=null;const removed=await store.save(saved);
  assert.equal(removed.original,null);assert.equal(await fs.readFile(path.join(removed.backup,'1'),'utf8'),item.original);
  await assert.rejects(fs.access(path.join(root,'original_texts - copy/AB00001.txt')));
});
test('conflicting saves, renamed IDs, unexpected fields and unsafe paths cannot change sources',async t=>{
  const {root,store}=await fixture(t),item=await store.load('AB00001');
  for(const id of ['../secret','AB00001.txt','ab00001'])await assert.rejects(store.load(id));
  await assert.rejects(store.save({...item,metadata:{...item.metadata,PIN:'AB00002'}}));
  await assert.rejects(store.save({...item,metadata:{...item.metadata,Unexpected:'value'}}));
  await fs.appendFile(path.join(root,'translated_texts - copy/AB00001.txt'),'external');
  await assert.rejects(store.save(item),/changed since/);
});
test('the local editor requires its token, exact host and same origin; Unicode survives split chunks',async t=>{
  const {root}=await fixture(t),{server,url,token}=await startEditor({root,open:false});
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=new URL(url).origin;
  assert.equal((await fetch(origin+'/load',{method:'POST',body:'{}'})).status,403);
  assert.equal((await fetch(origin+'/load',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json','X-Editor-Token':token},body:'{}'})).status,403);
  const headers={Origin:origin,'Content-Type':'application/json','X-Editor-Token':token};
  const item=await (await fetch(origin+'/load',{method:'POST',headers,body:JSON.stringify({id:'AB00001'})})).json();
  item.original='سلام 😀';const bytes=Buffer.from(JSON.stringify(item));
  const body=new ReadableStream({start(controller){for(const byte of bytes)controller.enqueue(Uint8Array.of(byte));controller.close();}});
  const response=await fetch(origin+'/save',{method:'POST',headers,body,duplex:'half'});
  assert.equal(response.status,200);assert.equal((await response.json()).original,'سلام 😀');
});
