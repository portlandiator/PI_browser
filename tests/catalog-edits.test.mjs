import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {csvText,ItemStore} from '../scripts/item-store.mjs';
import {PendingCatalogEdits,describeChanges,publishedFiles,prepareCatalogProposal,catalogBody,conflictingEntries,applyLocally,settlePullRequest} from '../scripts/catalog-edits.mjs';
import {proposalCommit} from '../scripts/publish-changes.mjs';
import {publicationTitle} from '../scripts/publish-editorial-decisions.mjs';
import {describeCause} from '../scripts/reconcile-study-guides.mjs';
import {tool} from '../scripts/publish-tools.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const gitPath=await tool('git',root);
const git=(cwd,...args)=>execFileSync(gitPath,['-c','user.name=t','-c','user.email=t@example.org','-c','init.defaultBranch=main',...args],{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const fields=['PIN','Title','Manuscripts','Publications','First line (original)'];
const rows=[{PIN:'AB00001',Title:'First',Manuscripts:'M',Publications:'','First line (original)':'اول'},{PIN:'AB00002',Title:'Second',Manuscripts:'M',Publications:'','First line (original)':''},{PIN:'AB00003',Title:'Third',Manuscripts:'',Publications:'','First line (original)':'سوم'}];

// Source folders as on the editor's computer.
async function sources(stage){
  const folder=path.join(stage,'sources');
  for(const name of ['metadata - copy','original_texts - copy','translated_texts - copy'])await fs.mkdir(path.join(folder,name),{recursive:true});
  await fs.writeFile(path.join(folder,'metadata - copy/items.csv'),csvText(rows,fields));
  await fs.writeFile(path.join(folder,'original_texts - copy/AB00001.txt'),'متن');
  await fs.writeFile(path.join(folder,'translated_texts - copy/AB00001.txt'),Buffer.from([0x93,0x48,0x69,0x94]));
  await fs.writeFile(path.join(folder,'translated_texts - copy/AB00002.txt'),'Second text.');
  await fs.writeFile(path.join(folder,'original_texts - copy/AB00003.txt'),'withheld');
  return folder;
}
async function python(t){
  const command=await tool('python',root);
  try{execFileSync(command,['--version'],{stdio:'ignore'});return command;}catch{t.skip('Python is not available');return null;}
}
const entry=(action,extra={})=>({action,savedAt:'2026-01-01T00:00:00.000Z',state:'saved',...extra});

test('changes are described by metadata column and text',()=>{
  const before={metadata:rows[0],original:'a',english:null};
  assert.deepEqual(describeChanges(before,{metadata:{...rows[0],Title:'New'},original:'a',english:null}),['Title']);
  assert.deepEqual(describeChanges(before,{metadata:rows[0],original:null,english:'e'}),['original text removed','English translation added']);
  assert.deepEqual(describeChanges(before,before),[]);
  assert.deepEqual(publicationTitle({corrections:2,deletions:1,decisions:4}),{title:'Publish 2 catalog corrections, 1 catalog deletion, 4 editorial decisions',kind:'catalog-edits'});
  assert.deepEqual(publicationTitle({decisions:1}),{title:'Publish 1 editorial decision',kind:'editorial-decisions'});
  assert.equal(describeCause({deleted:['AB1'],changed:[]}),'catalog item AB1 was deleted');
  assert.equal(describeCause({deleted:['A','B','C','D','E'],changed:[]}),'catalog items A, B, C and 2 more were deleted');
  assert.equal(describeCause({deleted:[],changed:['AB2']}),'catalog item AB2 was corrected');
});

test('the pending section is written atomically and retained empty without deleting subject decisions',async t=>{
  const stage=await fs.mkdtemp(path.join(os.tmpdir(),'pi-pending-'));t.after(()=>fs.rm(stage,{recursive:true,force:true}));
  const pending=new PendingCatalogEdits(stage,{file:path.join(stage,'Downloads/subject-edits.json')});
  assert.deepEqual(await pending.read(),{format:1,items:{}});
  await pending.set('AB1',entry('edit'));
  assert.equal((await pending.get('AB1')).action,'edit');
  assert.deepEqual((await fs.readdir(path.join(stage,'Downloads'))),['subject-edits.json']);
  await pending.write({format:1,items:{},pullRequest:{number:1}});
  assert.equal((await pending.read()).pullRequest.number,1);
  await pending.update(data=>{delete data.pullRequest;});
  assert.deepEqual((await pending.read()).items,{});
  await fs.writeFile(pending.file,'{"format":2}');
  await assert.rejects(pending.read(),/subject-edits.json file/);
});

test('a previous pull request is settled before publishing again',async t=>{
  const stage=await fs.mkdtemp(path.join(os.tmpdir(),'pi-settle-'));t.after(()=>fs.rm(stage,{recursive:true,force:true}));
  const pending=new PendingCatalogEdits(stage,{file:path.join(stage,'Downloads/subject-edits.json')}),pr={number:5,url:'https://github.com/o/r/pull/5',branch:'maintenance/catalog-edits-1',openedAt:'t',ids:['AB1','AB2']};
  const start=async()=>pending.write({format:1,items:{AB1:entry('edit',{publishedIn:{number:5}}),AB2:entry('delete',{publishedIn:{number:5}}),AB3:entry('edit')},pullRequest:pr});
  const gh=state=>async(command,args)=>{assert.deepEqual(args.slice(0,3),['pr','view','5']);return JSON.stringify({state});};
  await start();
  await assert.rejects(settlePullRequest(pending,{gh:'gh',repository:'o/r',root:stage,execute:gh('OPEN')}),/still open/);
  assert.equal(await settlePullRequest(pending,{gh:'gh',repository:'o/r',root:stage,execute:gh('MERGED')}),'MERGED');
  assert.deepEqual(Object.keys((await pending.read()).items),['AB3']);assert.equal((await pending.read()).pullRequest,undefined);
  await start();
  assert.equal(await settlePullRequest(pending,{gh:'gh',repository:'o/r',root:stage,execute:gh('CLOSED')}),'CLOSED');
  const data=await pending.read();
  assert.deepEqual(Object.keys(data.items),['AB1','AB2','AB3']);assert.equal(data.items.AB1.publishedIn,undefined);
  assert.equal(await settlePullRequest(pending,{gh:'gh',repository:'o/r',root:stage,execute:async()=>{throw Error('no');}}),null);
});

test('published edits reach the source folders with backups; edits made on top of changed files wait',async t=>{
  const stage=await fs.mkdtemp(path.join(os.tmpdir(),'pi-apply-'));t.after(()=>fs.rm(stage,{recursive:true,force:true}));
  const folder=await sources(stage),store=new ItemStore(folder),current=await store.load('AB00001');
  const edit=entry('edit',{state:current.state,fields,metadata:{...rows[0],Title:'Corrected'},original:'متن',english:'“Hi”'});
  assert.deepEqual(await conflictingEntries(folder,{AB00001:edit,AB00002:entry('delete')}),[]);
  const stale={...edit,state:'older'};
  assert.match((await conflictingEntries(folder,{AB00001:stale}))[0].reason,/changed on this computer/);
  const notes=await applyLocally(folder,{AB00001:edit,AB00002:entry('delete'),AB00009:entry('delete')});
  assert.match(notes[0].text,/^Wrote AB00001/);assert.ok(notes[0].backup);
  assert.match(notes[1].text,/^Removed AB00002/);assert.match(notes[2].text,/was not in the source folders/);
  const after=await store.load('AB00001');
  assert.equal(after.metadata.Title,'Corrected');assert.equal(after.english,'“Hi”');
  assert.deepEqual(await fs.readFile(path.join(folder,'translated_texts - copy/AB00001.txt')),Buffer.from([0x93,0x48,0x69,0x94]));
  await assert.rejects(fs.access(path.join(folder,'translated_texts - copy/AB00002.txt')));
  // Already applied (for example after a closed pull request): no conflict, nothing written.
  assert.deepEqual(await conflictingEntries(folder,{AB00001:stale}),[]);
  assert.match((await applyLocally(folder,{AB00001:stale}))[0].text,/already holds/);
});

test('pending edits and deletions become patched archive shards and deletion changes, read from Git objects',async t=>{
  const py=await python(t);if(!py)return;
  const stage=await fs.mkdtemp(path.join(os.tmpdir(),'pi-catalog-'));t.after(()=>fs.rm(stage,{recursive:true,force:true}));
  const folder=await sources(stage),repo=path.join(stage,'repo');
  await fs.mkdir(path.join(repo,'data'),{recursive:true});
  // The archive holds a translation of AB00003 that this computer's folder has since lost.
  await fs.writeFile(path.join(folder,'translated_texts - copy/AB00003.txt'),'Third text.');
  execFileSync(py,[path.join(root,'scripts/archive-sources.py'),'--root',folder,'--output',path.join(repo,'data/collection')],{stdio:'ignore'});
  await fs.rm(path.join(folder,'translated_texts - copy/AB00003.txt'));
  await fs.writeFile(path.join(repo,'data/subject-edits.json'),JSON.stringify({format:1,matches:{},relationships:[]})+'\n');
  // A reviewed quotation refers to AB00001's English text by its version.
  await fs.writeFile(path.join(repo,'data/extract-review-decisions.json'),JSON.stringify({matches:{q1:{status:'confirmed',candidate:{source:'AB00001',version:'0'.repeat(64),ranges:[{paragraph:1,start:0,end:2,text:'Hi'}]}}}})+'\n');
  await fs.writeFile(path.join(repo,'data/subject-extracts-public.json.gz'),gzipSync(JSON.stringify({selections:[],report:{}})));
  git(repo,'init','--quiet');git(repo,'add','.');git(repo,'commit','--quiet','-m','published');
  const start=git(repo,'rev-parse','HEAD');
  const entries={
    // AB00001's original reads differently in this folder and AB00003's translation is missing from it; the editor left both texts as they were.
    AB00001:entry('edit',{fields,metadata:{...rows[0],Title:'Corrected'},original:'متن محلی',english:'“Hi”',unchanged:['original']}),
    AB00002:entry('delete'),
    AB00003:entry('edit',{fields,metadata:rows[2],original:'withheld',english:null,unchanged:['original','english']}),
    AB00009:entry('edit',{fields,metadata:{...rows[0],PIN:'AB00009'},original:null,english:'x'}),
  };
  const files=publishedFiles(repo,gitPath,'HEAD');
  const result=await prepareCatalogProposal({root:repo,git:gitPath,python:py,entries,files,site:async()=>null,stage:path.join(stage,'work')});
  assert.deepEqual(result.edits,[{id:'AB00001',changed:['Title']}]);
  assert.deepEqual(result.deletions.map(d=>[d.id,d.archived,d.published,d.quotations]),[['AB00002',true,false,0]]);
  assert.deepEqual(result.skipped.map(s=>[s.id,Boolean(s.applyOnly)]),[['AB00003',true],['AB00009',false]]);
  assert.match(result.skipped[1].reason,/not in the published catalog/);
  const digit=name=>execFileSync(py,['-c','import hashlib,sys;print(hashlib.sha256(sys.argv[1].encode()).hexdigest()[0])',name],{encoding:'utf8'}).trim();
  const tar=(prefix,id)=>`data/collection/${prefix}-${digit(id+'.txt')}.tar`;
  assert.deepEqual([...result.blobs.keys()].sort(),['data/collection/metadata.tar',tar('translated','AB00002')].sort());
  // The commit holds exactly the patched shards; this folder is untouched.
  const {sha,proposed}=await proposalCommit(repo,[],'Publish catalog edits',{login:'editor',id:7},result.blobs);
  assert.deepEqual(proposed.sort(),[...result.blobs.keys()].sort());
  assert.equal(git(repo,'rev-parse','HEAD'),start);assert.equal(git(repo,'status','--porcelain'),'');
  const archived=async name=>{
    const file=path.join(stage,name.replaceAll('/','__'));
    await fs.writeFile(file,execFileSync(gitPath,['show',`${sha}:${name}`],{cwd:repo,encoding:'buffer',maxBuffer:64*1024*1024}));
    return JSON.parse(execFileSync(py,['-c','import tarfile,json,sys\nt=tarfile.open(sys.argv[1]);print(json.dumps({m.name:t.extractfile(m).read().decode("utf-8","replace") for m in t.getmembers()}))',file],{encoding:'utf8'}));
  };
  const metadata=await archived('data/collection/metadata.tar'),csv=metadata['metadata - copy/items.csv'];
  assert.match(csv,/AB00001,Corrected,M/);assert.doesNotMatch(csv,/AB00002/);assert.match(csv,/AB00003,Third,,,\n/);
  assert.deepEqual(JSON.parse(metadata['metadata - copy/withheld-original-ids.json']),['AB00003']);
  // Texts the editor left alone keep their published bytes, whatever this folder holds.
  assert.equal((await archived(tar('original','AB00001')))['original_texts - copy/AB00001.txt'],'متن');
  assert.equal((await archived(tar('translated','AB00003')))['translated_texts - copy/AB00003.txt'],'Third text.');
  // Changing English text that reviewed quotations refer to waits for their review;
  // the unchanged text kept its published bytes, so the metadata-only edit above went through.
  const second=await prepareCatalogProposal({root:repo,git:gitPath,python:py,entries:{AB00001:entry('edit',{fields,metadata:rows[0],original:'متن',english:'Changed.'})},files:publishedFiles(repo,gitPath,'HEAD'),site:async()=>null,stage:path.join(stage,'work2')});
  assert.deepEqual(second.edits,[]);assert.match(second.skipped[0].reason,/reviewed subject quotations/);assert.equal(second.blobs.size,0);
  // The description names every item and what happens to it.
  const body=catalogBody(result);
  assert.match(body,/\*\*Corrections \(1\):\*\*\n- `AB00001`: Title/);assert.match(body,/\*\*Deletions \(1\):\*\*\n- `AB00002`: no subject compilation quoted it/);
  assert.match(body,/Not included[\s\S]*`AB00009`: not in the published catalog/);
});
