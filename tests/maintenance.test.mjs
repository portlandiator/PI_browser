import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {githubTarget} from '../scripts/github-target.mjs';
import {mergeDecisions,subjectIds} from '../scripts/publish-editorial-decisions.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('every maintenance launcher runs an existing script with Windows line endings',async()=>{
  const names=(await fs.readdir(path.join(root,'maintenance'))).filter(name=>name.endsWith('.cmd'));
  assert.ok(names.length>=7);
  for(const name of names){
    const text=await fs.readFile(path.join(root,'maintenance',name),'utf8');
    assert.match(text,/^@echo off\r\n/,name);
    assert.ok(!/[^\r]\n/.test(text),name+' must use CRLF line endings');
    const scripts=[...text.matchAll(/%~dp0\.\.\\scripts\\([\w.-]+)/g)].map(m=>m[1]);
    assert.equal(scripts.length,1,name);
    await fs.access(path.join(root,'scripts',scripts[0]));
    const tool=/run-node-tool\.ps1" ([\w.-]+\.mjs)/.exec(text)?.[1];
    if(tool)await fs.access(path.join(root,'scripts',tool));
  }
  await fs.access(path.join(root,'maintenance/README.txt'));
});

test('a renamed repository resolves to its current Pages address',async()=>{
  const calls=[];
  const execute=async(command,args)=>{calls.push([command,...args].join(' '));
    if(args.includes('get-url'))return 'https://github.com/Owner/Old_Name.git';
    if(args[0]==='api')return 'Owner/New_Name';
    throw Error('unexpected');};
  assert.deepEqual(await githubTarget('/repo',{gh:'gh',git:'git.exe',execute}),{repository:'Owner/New_Name',remote:'https://github.com/Owner/New_Name.git',site:'https://owner.github.io/New_Name/',renamedFrom:'Owner/Old_Name'});
  assert.equal(calls[0],'git.exe -C /repo remote get-url origin');
  // Offline or signed out: fall back to the origin address.
  const offline=async(command,args)=>{if(args.includes('get-url'))return 'git@github.com:Owner/Old_Name.git';throw Error('offline');};
  assert.equal((await githubTarget('/repo',{gh:'gh',execute:offline})).site,'https://owner.github.io/Old_Name/');
  assert.equal((await githubTarget('/repo',{execute:offline})).repository,'Owner/Old_Name');
  await assert.rejects(githubTarget('/repo',{execute:async()=>'https://example.org/a/b.git'}),/not a GitHub repository/);
});

test('exported editorial decisions merge without dropping published ones',async()=>{
  const ids=await subjectIds(root),[a,b,c]=[...ids];
  const v='a'.repeat(64),candidate={source:'X1',version:v,ranges:[{paragraph:1,start:0,end:3,text:'abc'}]};
  const published={format:1,matches:{one:{status:'confirmed',candidate},two:{status:'rejected'}},relationships:[{source:a,target:b,type:'related',status:'accepted'}],reviewedSubjects:{[a]:true}};
  const older={format:1,matches:{one:published.matches.one},relationships:[],reviewedSubjects:{}};
  assert.equal(mergeDecisions(published,older,ids).summary.total,0);
  assert.deepEqual(mergeDecisions(published,older,ids).merged,published);
  const incoming={format:1,matches:{...published.matches,three:{status:'rejected'}},relationships:[{source:a,target:b,type:'related',status:'rejected',note:'changed'},{source:a,target:c,type:'related',status:'rejected',note:'n'}],reviewedSubjects:{[a]:true,[b]:true}};
  const {merged,summary}=mergeDecisions(published,incoming,ids);
  assert.deepEqual(summary,{newPassages:1,changedPassages:0,newConnections:1,changedConnections:1,reviewProgress:1,total:4});
  assert.ok(merged.matches.two&&merged.matches.three);
  assert.throws(()=>mergeDecisions(published,{...incoming,relationships:[{source:'missing',target:a,type:'related',status:'accepted'}]},ids),/Invalid connection/);
  assert.throws(()=>mergeDecisions(published,{...incoming,matches:{bad:{status:'maybe'}}},ids),/Invalid passage decision/);
  assert.throws(()=>mergeDecisions(published,{...incoming,matches:{bad:{status:'confirmed',candidate:{source:'X'}}}},ids),/Invalid confirmed passage/);
  assert.throws(()=>mergeDecisions(published,{matches:{}},ids),/format 1/);
});

test('a slow step reports that it is still working, and the tools never start Git’s automatic repack',async()=>{
  const {withProgress,noAutoMaintenance}=await import('../scripts/publish-tools.mjs');
  const lines=[];
  const value=await withProgress('downloading',new Promise(resolve=>setTimeout(()=>resolve('done'),130)),{first:0.03,every:0.04,log:line=>lines.push(line)});
  assert.equal(value,'done');
  assert.ok(lines.length>=2&&lines.every(line=>/still downloading \(\d+ s\)/.test(line)),lines.join('|'));
  const count=lines.length;await new Promise(resolve=>setTimeout(resolve,80));
  assert.equal(lines.length,count,'nothing is printed after the step ends');
  await assert.rejects(withProgress('failing',()=>Promise.reject(Error('stopped')),{log(){}}),/stopped/);
  assert.equal(await withProgress('quick',Promise.resolve(1),{log(){throw Error('not printed');}}),1);
  assert.deepEqual(noAutoMaintenance,['-c','gc.auto=0','-c','maintenance.auto=false']);
  const read=name=>fs.readFile(new URL('../scripts/'+name,import.meta.url),'utf8');
  assert.match(await read('publish-changes.mjs'),/run\(gitPath,\['-C',root,\.\.\.noAutoMaintenance,\.\.\.args\]/);
  const updater=await read('update-collection.ps1');
  for(const command of ["'fetch','origin'","'merge','--ff-only','origin/main'"])assert.ok(updater.includes("'-c','gc.auto=0','-c','maintenance.auto=false',"+command),command);
});
