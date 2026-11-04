// Publish-Editorial-Decisions: locks, one batched write to the source folders,
// reads that happen once, and exported decisions that are published only once.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {readZip} from '../scripts/zip-archive.mjs';
import {csvText,ItemStore} from '../scripts/item-store.mjs';
import {PendingCatalogEdits,applyLocally,withStage} from '../scripts/catalog-edits.mjs';
import {withLock} from '../scripts/publish-tools.mjs';
import {liveSite,siteFiles} from '../scripts/catalog-deletion.mjs';
import {alreadyPublished,withoutPublished,supersededDecisions,decisionDigests,mergeExportedDecisions} from '../scripts/publish-editorial-decisions.mjs';

const fields=['PIN','Title','Manuscripts','Publications'];
const rows=[{PIN:'AB00001',Title:'First',Manuscripts:'M',Publications:''},{PIN:'AB00002',Title:'Second',Manuscripts:'M',Publications:''},{PIN:'AB00003',Title:'Third',Manuscripts:'',Publications:''}];
async function sources(t){
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'pi-safety-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));
  for(const name of ['metadata - copy','original_texts - copy','translated_texts - copy'])await fs.mkdir(path.join(folder,name));
  await fs.writeFile(path.join(folder,'metadata - copy/items.csv'),csvText(rows,fields));
  for(const id of ['AB00001','AB00002','AB00003'])await fs.writeFile(path.join(folder,'translated_texts - copy',id+'.txt'),'Text of '+id);
  return folder;
}
const edit=(item,changes)=>({action:'edit',savedAt:'s',state:item.state,metadata:{...item.metadata,...changes.metadata},original:item.original,english:changes.english??item.english});

test('several published items reach the source folders in one write with one backup',async t=>{
  const folder=await sources(t),store=new ItemStore(folder);
  const [one,two]=await Promise.all(['AB00001','AB00002'].map(id=>store.load(id)));
  const notes=await applyLocally(folder,{AB00001:edit(one,{metadata:{Title:'First, corrected'}}),AB00002:edit(two,{english:'New text'}),AB00003:{action:'delete',savedAt:'s',state:null},AB00009:{action:'delete',savedAt:'s',state:null}});
  assert.deepEqual(notes.map(n=>n.text.replace(/ Backup: .*/,'')),['Wrote AB00001 to the source folders.','Wrote AB00002 to the source folders.','Removed AB00003 from the source folders.','AB00009 was not in the source folders.']);
  const backups=await fs.readdir(path.join(folder,'.qa/item-backups'));
  assert.equal(backups.length,1);assert.equal(notes[0].backup,notes[2].backup);
  const zip=await readZip(notes[0].backup),manifest=JSON.parse(zip.get('manifest.json'));
  assert.deepEqual(manifest.items,[{id:'AB00001'},{id:'AB00002'},{id:'AB00003',deleted:true}]);
  assert.equal(zip.get('metadata - copy/items.csv').toString(),csvText(rows,fields));
  assert.equal(zip.get('translated_texts - copy/AB00002.txt').toString(),'Text of AB00002');
  assert.equal((await store.load('AB00001')).metadata.Title,'First, corrected');
  assert.equal((await store.load('AB00002')).english,'New text');
  await assert.rejects(store.load('AB00003'),/No source item/);
});

test('an edit is not written over source files changed since it was saved; the others still are',async t=>{
  const folder=await sources(t),store=new ItemStore(folder);
  const [one,two]=await Promise.all(['AB00001','AB00002'].map(id=>store.load(id)));
  await fs.writeFile(path.join(folder,'translated_texts - copy/AB00001.txt'),'Changed by hand');
  const notes=await applyLocally(folder,{AB00001:edit(one,{metadata:{Title:'Mine'}}),AB00002:edit(two,{metadata:{Title:'Also mine'}})});
  assert.equal(notes[0].failed,true);assert.match(notes[0].text,/changed since/);
  assert.match(notes[1].text,/^Wrote AB00002/);
  assert.equal((await store.load('AB00001')).metadata.Title,'First');
  assert.equal(await fs.readFile(path.join(folder,'translated_texts - copy/AB00001.txt'),'utf8'),'Changed by hand');
});

test('a source file that cannot be replaced leaves every file as it was',async t=>{
  const folder=await sources(t),store=new ItemStore(folder);
  const one=await store.load('AB00001'),before=await fs.readFile(path.join(folder,'metadata - copy/items.csv'));
  const rename=fs.rename;let calls=0;
  // The second replacement fails (as when another program holds the file).
  fs.rename=async(...args)=>{if(++calls===2)throw Object.assign(Error('locked'),{code:'EIO'});return rename(...args);};
  t.after(()=>{fs.rename=rename;});
  const notes=await applyLocally(folder,{AB00001:edit(one,{metadata:{Title:'Mine'},english:'Mine too'})});
  fs.rename=rename;
  assert.equal(notes[0].failed,true);
  assert.deepEqual(await fs.readFile(path.join(folder,'metadata - copy/items.csv')),before);
  assert.equal(await fs.readFile(path.join(folder,'translated_texts - copy/AB00001.txt'),'utf8'),'Text of AB00001');
  assert.deepEqual((await fs.readdir(path.join(folder,'translated_texts - copy'))).filter(name=>name.endsWith('.tmp')),[]);
});

test('a lock admits one holder and is taken over from a process that has ended',async t=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'pi-lock-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));
  const file=path.join(folder,'tool.lock');
  await withLock(file,async()=>{
    await assert.rejects(withLock(file,async()=>{},{busy:'busy'}),/busy/);
  });
  await assert.rejects(fs.access(file));
  await fs.writeFile(file,JSON.stringify({pid:2147483646,token:'old'}));
  assert.equal(await withLock(file,async()=>'ran'),'ran');
  await assert.rejects(fs.access(file));
});

test('concurrent updates of the pending file keep every change',async t=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'pi-pending-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));
  const pending=new PendingCatalogEdits(folder,{file:path.join(folder,'Downloads/subject-edits.json')});
  await Promise.all(Array.from({length:12},(_,i)=>new PendingCatalogEdits(folder,{file:pending.file}).set('AB0000'+i.toString(16),{action:'delete',savedAt:String(i),state:null})));
  assert.equal(Object.keys((await pending.read()).items).length,12);
});

test('the staging folder is removed when the work fails',async()=>{
  let stage;
  await assert.rejects(withStage(async folder=>{stage=folder;await fs.writeFile(path.join(folder,'shard.tar'),'x');throw Error('stop');}),/stop/);
  await assert.rejects(fs.access(stage));
});

test('each website file is downloaded once per publication, and read in parallel in order',async()=>{
  const requests=[];
  const fetcher=async url=>{
    requests.push(String(url));
    if(String(url).endsWith('stats.json'))return new Response(JSON.stringify({dataset:'collections/abc/'}));
    if(String(url).includes('missing'))return new Response('',{status:404});
    return new Response(gzipSync(JSON.stringify({name:path.basename(new URL(url).pathname)})));
  };
  const site=liveSite('https://example.org/site/',fetcher);
  const first=await siteFiles(site,['subjects/a.json.gz','subjects/b.json.gz','subjects/a.json.gz','subjects/missing.json.gz']);
  assert.deepEqual(first.map(x=>x?.name??null),['a.json.gz','b.json.gz','a.json.gz',null]);
  first[0].name='changed by a caller';
  assert.equal((await site('subjects/a.json.gz')).name,'a.json.gz');
  assert.equal(requests.filter(url=>url.endsWith('stats.json')).length,1);
  assert.equal(requests.filter(url=>url.endsWith('/a.json.gz')).length,1);
});

test('an exported decision is proposed until it is published, and never again after that',()=>{
  const ids=new Set(['S1','S2']);
  const candidate=v=>({source:'AB00001',version:v.repeat(64),ranges:[{paragraph:1,start:0,end:4,text:'Text'}]});
  const old={status:'confirmed',candidate:candidate('a')},renewed={status:'confirmed',candidate:candidate('b')};
  const exported={file:'subject-edits.json',value:{format:1,matches:{X:old,Y:{status:'rejected'}},relationships:[]}};
  // Published as exported: recognised as published.
  const published={format:1,matches:{X:old},relationships:[]};
  const done=alreadyPublished(published,[exported]);
  assert.equal(done.length,1);
  assert.deepEqual(Object.keys(withoutPublished(exported.value,done).matches),['Y']);
  // A correction later renews X on GitHub: the old export must not put the old range back.
  const corrected={format:1,matches:{X:renewed},relationships:[]};
  const {merged,summary}=mergeExportedDecisions(corrected,[exported],ids,done);
  assert.deepEqual(merged.matches.X,renewed);assert.equal(summary.newPassages,1);assert.equal(summary.changedPassages,0);
  assert.equal(supersededDecisions(corrected,[exported],done),1);
  // Deciding X again (a different value) is proposed.
  const again={...exported,value:{...exported.value,matches:{X:{status:'rejected'}}}};
  assert.equal(mergeExportedDecisions(corrected,[again],ids,done).merged.matches.X.status,'rejected');
  assert.equal(new Set(decisionDigests(again.value)).size,1);
});

test('writing one item leaves every other byte of the metadata CSV as it was',async t=>{
  const folder=await sources(t),store=new ItemStore(folder),file=path.join(folder,'metadata - copy/items.csv');
  // A BOM, Windows line endings, unquoted cells with surrounding spaces and a blank line.
  const original='﻿PIN,Title,Manuscripts,Publications\r\nAB00001, First ,M,\r\n\r\nAB00002,"Second, ""quoted"" ", M ,\r\nAB00003,Third,,\r\n';
  await fs.writeFile(file,original);
  const two=await store.load('AB00002');
  assert.equal(two.metadata.Title,'Second, "quoted" ');assert.equal(two.metadata.Manuscripts,' M ');
  await applyLocally(folder,{AB00002:edit(two,{metadata:{Title:'Changed'}})});
  assert.equal(await fs.readFile(file,'utf8'),'﻿PIN,Title,Manuscripts,Publications\r\nAB00001, First ,M,\r\n\r\nAB00002,Changed, M ,\r\nAB00003,Third,,\r\n');
  const one=await store.load('AB00001');
  await applyLocally(folder,{AB00001:{action:'delete',savedAt:'s',state:null},AB00004:{...edit({...one,metadata:{...one.metadata,PIN:'AB00004'}},{}),state:'x'}});
  assert.equal(await fs.readFile(file,'utf8'),'﻿PIN,Title,Manuscripts,Publications\r\n\r\nAB00002,Changed, M ,\r\nAB00003,Third,,\r\n');
});

test('an edit saved by an earlier version, which trimmed metadata, still applies over the same source files',async t=>{
  const folder=await sources(t),store=new ItemStore(folder),file=path.join(folder,'metadata - copy/items.csv');
  await fs.writeFile(file,'PIN,Title,Manuscripts,Publications\nAB00001, First ,M,\nAB00002,Second,M,\n');
  const current=await store.load('AB00001'),trimmed={...current,metadata:{...current.metadata,Title:'First'}};
  const {itemState}=await import('../scripts/item-store.mjs');
  const legacy={action:'edit',savedAt:'s',state:itemState(trimmed),metadata:{...trimmed.metadata,Title:'Corrected'},original:current.original,english:current.english};
  const [note]=await applyLocally(folder,{AB00001:legacy});
  assert.match(note.text,/^Wrote AB00001/);
  assert.equal(await fs.readFile(file,'utf8'),'PIN,Title,Manuscripts,Publications\nAB00001,Corrected,M,\nAB00002,Second,M,\n');
});
