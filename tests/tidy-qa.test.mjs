import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {zipBuffer,unzipBuffer,readZip} from '../scripts/zip-archive.mjs';
import {planTidy,tidy} from '../scripts/tidy-qa.mjs';
import {tool} from '../scripts/publish-tools.mjs';

const gitPath=await tool('git',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));

test('backup archives round-trip byte for byte and are standard ZIP files',()=>{
  const entries=[{name:'manifest.json',bytes:'{}'},{name:'metadata - copy/é.csv',bytes:Buffer.alloc(50000,'a,b\n')},{name:'empty.txt',bytes:Buffer.alloc(0)},{name:'binary',bytes:Buffer.from([0x93,0,0xff])}];
  const files=unzipBuffer(zipBuffer(entries));
  assert.deepEqual([...files.keys()],entries.map(e=>e.name));
  for(const e of entries)assert.ok(files.get(e.name).equals(Buffer.from(e.bytes)));
  assert.throws(()=>zipBuffer([{name:'../x',bytes:''}]),/Invalid/);
  assert.throws(()=>zipBuffer([{name:'a',bytes:''},{name:'a',bytes:''}]),/repeated/);
});
test('tidying zips old backup folders under their source names and removes unused working copies',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pi-tidy-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const qa=path.join(root,'.qa'),item=path.join(qa,'item-backups','2026-10-02T16-03-29.843Z-b1cd02fd'),guide=path.join(qa,'guide-backups','2026-10-27T22-50-46.069Z-e5baac16');
  await fs.mkdir(item,{recursive:true});await fs.mkdir(guide,{recursive:true});
  await fs.writeFile(path.join(item,'manifest.json'),JSON.stringify({id:'AB1',files:[{name:'metadata - copy\\items.csv',existed:true,changed:true},{name:'original_texts - copy\\AB1.txt',existed:true,changed:true},{name:'translated_texts - copy\\AB1.txt',existed:false,changed:false}]}));
  await fs.writeFile(path.join(item,'0'),'PIN\nAB1\n');await fs.writeFile(path.join(item,'1'),'متن');
  await fs.writeFile(path.join(guide,'editorial.json'),'{"subjects":[]}\r\n');
  const copy=path.join(qa,'item-delete-preview-1','repo');await fs.mkdir(path.join(copy,'data'),{recursive:true});
  for(let i=0;i<5;i++)await fs.writeFile(path.join(copy,'data',i+'.json'),'{}');
  await fs.writeFile(path.join(qa,'pending-catalog-edits.json'),'{}');
  const plan=await planTidy(root,{git:gitPath});
  assert.equal(plan.backups.length,2);assert.deepEqual(plan.leftovers.map(l=>[path.basename(l.folder),l.files,l.keep]),[['item-delete-preview-1',5,[]]]);
  await tidy(plan,{git:gitPath,root,log:()=>{}});
  assert.deepEqual(await fs.readdir(qa),['guide-backups','item-backups','pending-catalog-edits.json']);
  const items=await readZip(item+'.zip');
  assert.deepEqual([...items.keys()].sort(),['manifest.json','metadata - copy/items.csv','original_texts - copy/AB1.txt']);
  assert.equal(items.get('original_texts - copy/AB1.txt').toString('utf8'),'متن');
  assert.equal(JSON.parse(items.get('manifest.json')).files[0].name,'metadata - copy/items.csv');
  assert.equal((await readZip(guide+'.zip')).get('study-guides/editorial.json').toString('utf8'),'{"subjects":[]}\r\n');
  assert.deepEqual(await fs.readdir(path.join(qa,'item-backups')),[path.basename(item)+'.zip']);
});
test('a working copy with commits that are not on a remote is kept',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pi-tidy-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const copy=path.join(root,'.qa','catalog-spelling-pr');await fs.mkdir(copy,{recursive:true});
  const git=(...args)=>execFileSync(gitPath,['-c','user.name=t','-c','user.email=t@example.org','-c','init.defaultBranch=main',...args],{cwd:copy,stdio:'pipe'});
  git('init','-q');await fs.writeFile(path.join(copy,'a.txt'),'a');git('add','a.txt');git('commit','-qm','work');
  const plan=await planTidy(root,{git:gitPath});
  assert.match(plan.leftovers[0].keep.join(),/commits that are not on GitHub/);
  await tidy(plan,{git:gitPath,root,log:()=>{}});
  await fs.access(path.join(copy,'a.txt'));
});
