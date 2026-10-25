import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {openPullRequest,tool} from '../scripts/publish-item.mjs';
import {prepareRepository,proposalCommit,pullRequestBody} from '../scripts/publish-changes.mjs';
import {decisionsBody} from '../scripts/publish-editorial-decisions.mjs';
import {describeSubjectOrder} from '../scripts/describe-subject-order.mjs';
import {describeGuideChanges} from '../scripts/edit-study-guide-server.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
// The same Git the tools use: another installed Git can be too old for
// init.defaultBranch or have different line-ending settings.
const gitPath=await tool('git',root);
const git=(cwd,...args)=>execFileSync(gitPath,['-c','user.name=t','-c','user.email=t@example.org','-c','init.defaultBranch=main',...args],{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();

test('no maintenance tool pushes to main; each opens a pull request',async()=>{
  for(const name of ['publish-changes.mjs','update-collection.ps1','publish-item.mjs','publish-deletion.mjs']){
    const text=await fs.readFile(path.join(root,'scripts',name),'utf8');
    assert.doesNotMatch(text,/HEAD:main|'origin','main'\)|push','origin','main'|--force/,name);
  }
  assert.match(await fs.readFile(path.join(root,'scripts/update-collection.ps1'),'utf8'),/'pr','create'/);
  assert.match(await fs.readFile(path.join(root,'scripts/update-subject-order.ps1'),'utf8'),/publish-changes\.mjs/);
});

test('maintenance pull requests use their own branch prefix and the given commit',async t=>{
  const stage=await fs.mkdtemp(path.join(os.tmpdir(),'pi-pr-'));t.after(()=>fs.rm(stage,{recursive:true,force:true}));
  const calls=[],bodyFile=path.join(stage,'body.md');
  const execute=async(command,args)=>{calls.push([command,...args]);return command==='gh'?'https://github.com/owner/example/pull/9':'';};
  const result=await openPullRequest({gh:'gh',git:'git.exe',repo:stage,repository:'owner/example',prefix:'maintenance',kind:'study-guides',title:'Edit study guide: A',body:'Body.',ref:'abc123',bodyFile,execute});
  assert.match(result.branch,/^maintenance\/study-guides-\d{14}$/);
  assert.deepEqual(calls[0],['git.exe','push','origin','abc123:refs/heads/'+result.branch]);
  assert.equal(await fs.readFile(bodyFile,'utf8'),'Body.');
  assert.equal(pullRequestBody({body:'Summary.',files:['a.json'],toolName:'Tool.cmd'}),'Summary.\n\nFiles changed:\n- `a.json`\n\nOpened by Tool.cmd (maintenance folder). Merging this pull request publishes the change: the website rebuilds and is checked automatically.\n');
});

test('a proposal commits only the named files and leaves the folder on main; merged files are tidied up',async t=>{
  const stage=await fs.mkdtemp(path.join(os.tmpdir(),'pi-proposal-'));t.after(()=>fs.rm(stage,{recursive:true,force:true}));
  const origin=path.join(stage,'origin.git'),work=path.join(stage,'work'),other=path.join(stage,'other');
  git(stage,'init','--bare','--quiet',origin);
  git(stage,'clone','--quiet',origin,work);
  for(const name of ['a.json','b.json','c.json'])await fs.writeFile(path.join(work,name),'{}\n');
  // Name the branch explicitly: Git before 2.28 ignores init.defaultBranch.
  git(work,'add','.');git(work,'commit','--quiet','-m','start');git(work,'branch','-M','main');git(work,'push','--quiet','origin','HEAD:main');
  git(stage,'--git-dir',origin,'symbolic-ref','HEAD','refs/heads/main');
  const start=git(work,'rev-parse','HEAD');
  await fs.writeFile(path.join(work,'a.json'),'{"a":1}\n');
  await fs.writeFile(path.join(work,'c.json'),'{"unrelated":true}\n');
  await prepareRepository(work,['a.json']);
  const {sha,proposed}=await proposalCommit(work,['a.json'],'Propose a',{login:'editor',id:7});
  assert.deepEqual(proposed,['a.json']);
  assert.equal(git(work,'rev-parse','HEAD'),start);
  assert.equal(git(work,'rev-parse','--abbrev-ref','HEAD'),'main');
  assert.equal(git(work,'diff','--cached','--name-only'),'');
  assert.equal(git(work,'diff','--name-only'),'a.json\nc.json');
  assert.equal(git(work,'show',sha+':a.json'),'{"a":1}');
  assert.equal(git(work,'log','-1','--format=%an <%ae> %s',sha),'editor <7+editor@users.noreply.github.com> Propose a');
  assert.equal(git(work,'rev-parse',sha+'^'),start);
  // The pull request is merged on GitHub, and someone else changes b.json.
  git(work,'push','--quiet','origin',sha+':refs/heads/main');
  git(stage,'clone','--quiet',origin,other);
  await fs.writeFile(path.join(other,'b.json'),'{"b":2}\n');
  git(other,'commit','--quiet','-am','change b');git(other,'push','--quiet','origin','HEAD:main');
  await prepareRepository(work,['b.json']);
  assert.equal(git(work,'rev-parse','HEAD'),git(other,'rev-parse','HEAD'));
  assert.equal(git(work,'diff','--name-only'),'c.json');
  // A local edit to a file GitHub has changed differently is not overwritten.
  await fs.writeFile(path.join(other,'b.json'),'{"b":3}\n');
  git(other,'commit','--quiet','-am','change b again');git(other,'push','--quiet','origin','HEAD:main');
  await fs.writeFile(path.join(work,'b.json'),'{"b":"local"}\n');
  await assert.rejects(prepareRepository(work,['b.json']),/newer versions[\s\S]*b\.json[\s\S]*pull request/);
  assert.equal(await fs.readFile(path.join(work,'b.json'),'utf8'),'{"b":"local"}\n');
});

test('pull request descriptions summarize editorial decisions, subject order and guide edits',()=>{
  const body=decisionsBody({newPassages:2,changedPassages:1,newConnections:3,changedConnections:0,reviewProgress:4,total:10},'subject-edits (2).json');
  assert.match(body,/`subject-edits \(2\)\.json`/);
  assert.match(body,/\| Quoted passages \(confirmed or rejected\) \| 2 \| 1 \|/);
  assert.match(body,/\| Subject connections \| 3 \| 0 \|/);

  const before={groups:[{title:'I.A. One',subjects:['a','b','c']},{title:'I.B. Two',subjects:['d']}]};
  const after={groups:[{title:'I.A. One',subjects:['c','a']},{title:'I.B. Two',subjects:['d','b','e']}]};
  const order=describeSubjectOrder(before,after);
  assert.match(order,/2 headings, 5 subjects/);
  assert.match(order,/Subjects added: e\./);
  assert.match(order,/- b: from "I\.A\. One" to "I\.B\. Two"/);
  assert.match(order,/Order changed within: I\.A\. One\./);
  assert.match(describeSubjectOrder(before,before),/unchanged/);

  const guide={slug:'sample',displayTitle:'Sample',introduction:'Intro.',arc:'Arc.',order:[{key:'x',why:'One.'},{key:'y',why:'Two.'},{key:'z',why:'Three.'}],questions:['Q?'],neighbors:[],references:[]};
  const edited={...structuredClone(guide),introduction:'New intro.',questions:['Q?','R?'],order:[{key:'y',why:'Two, revised.'},{key:'x',why:'One.',shortened:[[0,1]]},{key:'z',why:'Three.',omitted:true}]};
  const untouched={...structuredClone(guide),slug:'other',displayTitle:'Other'};
  assert.deepEqual(describeGuideChanges({subjects:[guide,untouched]},{subjects:[edited,untouched]}),
    ['- **Sample**: introduction; discussion questions; reading order; notes on readings (1 reading); sentences shown (1 reading); left out (1 reading) changed']);
  assert.deepEqual(describeGuideChanges(null,{subjects:[guide]}),['- **Sample**: new guide']);
});

test('temporary checkouts are made outside the project folder',async()=>{
  const {jobFolder}=await import('../scripts/publish-item.mjs');
  const folder=await jobFolder();
  assert.ok(path.relative(root,folder).startsWith('..'),folder);
  for(const name of ['publish-item.mjs','publish-deletion.mjs','publish-changes.mjs']){
    const text=await fs.readFile(path.join(root,'scripts',name),'utf8');
    assert.doesNotMatch(text,/path\.join\(qa,['"](?:item-publish-|pull-request-index-)|path\.join\(qa,prefix/,name);
  }
  assert.match(await fs.readFile(path.join(root,'scripts/update-collection.ps1'),'utf8'),/GetTempPath\(\)\) 'pi-browser-jobs'/);
});
