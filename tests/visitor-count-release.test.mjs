import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {plan,maintain,readHistory,writeNotes,githubRelease,siteAddress,fileLabel,fileBytes,weeksAhead,releaseName} from '../scripts/visitor-counts.mjs';
import {pages,assetName,addWeeks,weekOf,releaseTag,hitUrl,siteRepository} from '../src/visitor-count.mjs';
import {codeDependencies} from '../scripts/deployment-cache.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const site='https://portlandiator.github.io/PI_browser/';
const friday=new Date('2026-11-13T04:30:00Z'),week='2026-11-09';
const pageNames=Object.keys(pages);
let nextId=100;
const file=(page,of,download_count=0)=>({id:nextId++,name:assetName(page,of),download_count});
const weekFiles=(of,counts=[0,0,0,0])=>pageNames.map((page,index)=>file(page,of,counts[index]));

test('the files of this week and the next four are prepared, and none is added twice',()=>{
  assert.equal(weeksAhead,4);
  const first=plan({notes:'',assets:[]},friday,site);
  assert.deepEqual(first.add.map(item=>item.name),[0,1,2,3,4].flatMap(ahead=>pageNames.map(page=>assetName(page,addWeeks(week,ahead)))));
  assert.equal(first.add.length,20);assert.deepEqual(first.remove,[]);
  // Everything is in place: a second run on the same day changes nothing.
  const assets=first.add.map(item=>file(item.page,item.week));
  assert.deepEqual(plan({notes:first.notes,assets},friday,site).add,[]);
  // A week later only the new fifth week is added; the counted files are left alone.
  const next=plan({notes:first.notes,assets},new Date('2026-11-16T00:23:00Z'),site);
  assert.deepEqual(next.add.map(item=>item.name),pageNames.map(page=>assetName(page,'2026-12-14')));
  assert.deepEqual(next.remove,[]);
  // One missing file is added without touching its neighbours.
  const gap=assets.filter(asset=>asset.name!==assetName('volumes','2026-11-23'));
  assert.deepEqual(plan({notes:'',assets:gap},friday,site).add,[{page:'volumes',week:'2026-11-23',name:'volumes-2026-11-23.gif'}]);
});

test('the release notes hold every week\'s totals, newest first',()=>{
  const assets=[...weekFiles('2026-11-02',[120,31,58,44]),...weekFiles(week,[41,7,12,3]),...weekFiles('2026-11-16')];
  const {notes}=plan({notes:'',assets},friday,site);
  assert.match(notes,/\| Week from \| Catalog \| Volumes \| Subjects \| Study guides \|\n\| --- \| ---: \| ---: \| ---: \| ---: \|\n\| 2026-11-09 \(so far\) \| 41 \| 7 \| 12 \| 3 \|\n\| 2026-11-02 \| 120 \| 31 \| 58 \| 44 \|\n/);
  // Weeks that have not begun are not listed.
  assert.doesNotMatch(notes,/2026-11-16/);
  assert(notes.includes(`[Partial Inventory browser](${site})`)&&notes.includes(`(${site}privacy.html)`));
  assert.deepEqual(Object.fromEntries(readHistory(notes)),{[week]:{catalog:41,volumes:7,subjects:12,'study-guides':3},'2026-11-02':{catalog:120,volumes:31,subjects:58,'study-guides':44}});
  // The notes read back to themselves, also after an edit on GitHub's website (CRLF, thousands separators).
  const history=readHistory(notes.replaceAll('\n','\r\n').replace('| 120 |','| 1,120 |'));
  assert.equal(history.get('2026-11-02').catalog,1120);
  assert.equal(writeNotes(readHistory(notes),week,site),notes);
  // A page without a file or a recorded number is shown as unknown, not as zero.
  const partial=plan({notes:'',assets:[file('catalog',week,5)]},friday,site).notes;
  assert.match(partial,/\| 2026-11-09 \(so far\) \| 5 \| – \| – \| – \|/);
  assert.deepEqual(readHistory(partial).get(week),{catalog:5});
  // Text that is not a week of the table is ignored.
  assert.deepEqual([...readHistory('| Week from | Catalog |\n| 2026-11-10 | 5 |\n| total | 9 |\n| 2026-11-02 | x |\nplain text').entries()],[['2026-11-02',{}]]);
  assert.equal(readHistory(undefined).size,0);assert.equal(readHistory('| 2026-11-02 | 5 | 6 | 7 | 8 |').size,0);
});

test('earlier weeks stay in the notes after their files are removed',()=>{
  const earlier=plan({notes:'',assets:[...weekFiles('2026-10-26',[90,20,40,30]),...weekFiles('2026-11-02',[120,31,58,44]),...weekFiles(week,[41,7,12,3])]},friday,site);
  // Files older than last week go once their counts are in the notes; last week's stay for late arrivals.
  assert.deepEqual(earlier.remove.map(item=>item.name),pageNames.map(page=>assetName(page,'2026-10-26')));
  assert.match(earlier.notes,/\| 2026-10-26 \| 90 \| 20 \| 40 \| 30 \|/);
  // The next run no longer sees those files and keeps their row from the notes.
  const after=plan({notes:earlier.notes,assets:[...weekFiles('2026-11-02',[121,31,58,44]),...weekFiles(week,[45,7,12,3])]},friday,site);
  assert.match(after.notes,/\| 2026-11-09 \(so far\) \| 45 \| 7 \| 12 \| 3 \|\n\| 2026-11-02 \| 121 \| 31 \| 58 \| 44 \|\n\| 2026-10-26 \| 90 \| 20 \| 40 \| 30 \|/);
  assert.deepEqual(after.remove,[]);
  // A recorded count is never lowered, for example by a file that was replaced.
  const replaced=plan({notes:earlier.notes,assets:weekFiles('2026-11-02',[2,31,58,44])},friday,site);
  assert.equal(replaced.history.get('2026-11-02').catalog,120);
  // A file whose count GitHub did not give is neither recorded nor removed, and other files are never touched.
  const unknown=plan({notes:'',assets:[{id:1,name:assetName('catalog','2026-10-05')},{id:2,name:'backup.zip',download_count:4},{id:3,name:'catalog-2026-10-06.gif',download_count:4}]},friday,site);
  assert.deepEqual(unknown.remove,[]);assert.equal(unknown.history.has('2026-10-05'),false);
});

// GitHub's side of one release, as the script uses it.
function fakeGitHub({release=null,assets=[]}={}){
  const calls=[];
  const state={release,assets:[...assets],saveNotes:true};
  return {calls,state,
    release:async()=>state.release,
    async createRelease({name,notes}){calls.push('create');state.release={id:7,name,body:notes,upload_url:'https://uploads.github.com/repos/portlandiator/PI_browser/releases/7/assets{?name,label}',html_url:'https://github.com/portlandiator/PI_browser/releases/tag/visitor-counts'};return state.release;},
    assets:async()=>state.assets.map(asset=>({...asset})),
    async addFile(target,{name,label,bytes}){calls.push('add '+name);assert.equal(target.id,state.release.id);assert(label);assert.equal(bytes,fileBytes);assert(!state.assets.some(asset=>asset.name===name),'A counted file must never be replaced');state.assets.push({id:nextId++,name,download_count:0});},
    async setNotes(id,notes){calls.push('notes');if(state.saveNotes)state.release={...state.release,body:notes};return state.release;},
    async removeFile(id){calls.push('remove '+state.assets.find(asset=>asset.id===id).name);state.assets=state.assets.filter(asset=>asset.id!==id);},
  };
}
const quiet=()=>{};

test('the first run creates the release, and a run with nothing to do changes nothing',async()=>{
  const github=fakeGitHub();
  const first=await maintain({github,site,now:friday,log:quiet});
  assert.equal(github.calls[0],'create');assert.equal(github.state.release.name,releaseName);
  assert.equal(first.added.length,20);assert.deepEqual(first.removed,[]);
  assert.match(github.state.release.body,/\| 2026-11-09 \(so far\) \| 0 \| 0 \| 0 \| 0 \|/);
  assert.equal(github.calls.at(-1),'notes');
  github.calls.length=0;
  const second=await maintain({github,site,now:friday,log:quiet});
  assert.deepEqual(github.calls,[]);assert.deepEqual(second.added,[]);
  // Visits arrive: only the notes change.
  github.state.assets.find(asset=>asset.name===assetName('catalog',week)).download_count=9;
  await maintain({github,site,now:new Date('2026-11-14T00:23:00Z'),log:quiet});
  assert.deepEqual(github.calls,['notes']);assert.match(github.state.release.body,/\| 2026-11-09 \(so far\) \| 9 \| 0 \| 0 \| 0 \|/);
});

test('after weeks without a run, counts are recorded before any file is removed',async()=>{
  const github=fakeGitHub();
  await maintain({github,site,now:friday,log:quiet});
  for(const [name,count] of [[assetName('catalog',week),41],[assetName('subjects','2026-11-16'),15],[assetName('study-guides','2026-11-23'),8],[assetName('volumes','2026-11-30'),2]])github.state.assets.find(asset=>asset.name===name).download_count=count;
  github.calls.length=0;
  const result=await maintain({github,site,now:new Date('2026-12-02T00:23:00Z'),log:quiet});
  // Three new weeks ahead, then the notes, then the files of the two weeks before last.
  assert.deepEqual(result.added,['2026-12-14','2026-12-21','2026-12-28'].flatMap(of=>pageNames.map(page=>assetName(page,of))));
  assert.deepEqual(result.removed,[week,'2026-11-16'].flatMap(of=>pageNames.map(page=>assetName(page,of))));
  assert(github.calls.indexOf('notes')>github.calls.findLastIndex(call=>call.startsWith('add ')));
  assert(github.calls.indexOf('notes')<github.calls.findIndex(call=>call.startsWith('remove ')));
  assert.match(github.state.release.body,/\| 2026-11-30 \(so far\) \| 0 \| 2 \| 0 \| 0 \|\n\| 2026-11-23 \| 0 \| 0 \| 0 \| 8 \|\n\| 2026-11-16 \| 0 \| 0 \| 15 \| 0 \|\n\| 2026-11-09 \| 41 \| 0 \| 0 \| 0 \|/);
  assert.equal(github.state.assets.length,24);
  // If GitHub does not keep the new notes, the counted files stay.
  const unsaved=fakeGitHub({release:{id:7,body:'',upload_url:'https://uploads.github.com/x{?name,label}'},assets:[...weekFiles('2026-10-26',[90,20,40,30])]});
  unsaved.state.saveNotes=false;
  await assert.rejects(maintain({github:unsaved,site,now:friday,log:quiet}),/no file was removed/);
  assert(!unsaved.calls.some(call=>call.startsWith('remove ')));
  assert.equal(unsaved.state.assets.filter(asset=>asset.name.includes('2026-10-26')).length,4);
});

test('GitHub is asked through its release API with the workflow\'s token',async()=>{
  const requests=[];
  const answers=[];
  const fetch=async(url,options)=>{requests.push({url,...options});const [status,value]=answers.shift();return {status,ok:status>=200&&status<300,text:async()=>value===undefined?'':JSON.stringify(value)};};
  const github=githubRelease({repository:'portlandiator/PI_browser',token:'secret-token',fetch,api:'https://api.github.com',pause:0});
  answers.push([404,{message:'Not Found'}]);
  assert.equal(await github.release(),null);
  assert.equal(requests[0].url,'https://api.github.com/repos/portlandiator/PI_browser/releases/tags/'+releaseTag);
  assert.equal(requests[0].method,'GET');assert.equal(requests[0].headers.Authorization,'Bearer secret-token');
  // A published release that never becomes the repository's "latest" one.
  answers.push([201,{id:7,upload_url:'https://uploads.github.com/repos/portlandiator/PI_browser/releases/7/assets{?name,label}'}]);
  const created=await github.createRelease({name:releaseName,notes:'notes'});
  assert.deepEqual(JSON.parse(requests[1].body),{tag_name:'visitor-counts',name:'Visitor counts',body:'notes',draft:false,prerelease:false,make_latest:'false'});
  assert.equal(requests[1].method,'POST');assert.equal(requests[1].url,'https://api.github.com/repos/portlandiator/PI_browser/releases');
  // More files than one page of GitHub's list.
  answers.push([200,Array.from({length:100},(_,id)=>({id}))],[200,[{id:100}]]);
  assert.equal((await github.assets(7)).length,101);
  assert.match(requests[2].url,/\/releases\/7\/assets\?per_page=100&page=1$/);assert.match(requests[3].url,/page=2$/);
  answers.push([201,{id:9}]);
  await github.addFile(created,{name:assetName('study-guides',week),label:fileLabel('study-guides',week),bytes:fileBytes});
  assert.equal(requests[4].url,'https://uploads.github.com/repos/portlandiator/PI_browser/releases/7/assets?name=study-guides-2026-11-09.gif&label=Study%20guides%2C%20week%20from%202026-11-09');
  assert.equal(requests[4].headers['Content-Type'],'image/gif');assert.equal(requests[4].body,fileBytes);
  // A one-pixel image, which a browser accepts from another site without complaint.
  assert(fileBytes.length<64);assert.equal(fileBytes.subarray(0,6).toString('latin1'),'GIF89a');assert.deepEqual([fileBytes.readUInt16LE(6),fileBytes.readUInt16LE(8),fileBytes.at(-1)],[1,1,0x3b]);
  // A file another run added meanwhile keeps its count; any other refusal stops the run.
  answers.push([422,{message:'Validation Failed',errors:[{resource:'ReleaseAsset',code:'already_exists',field:'name'}]}]);
  await github.addFile(created,{name:'catalog-2026-11-09.gif',label:'x',bytes:fileBytes});
  answers.push([403,{message:'Resource not accessible by integration'}]);
  await assert.rejects(github.addFile(created,{name:'catalog-2026-11-09.gif',label:'x',bytes:fileBytes}),/GitHub answered 403 to POST https:\/\/uploads\.github\.com\/repos\/portlandiator\/PI_browser\/releases\/7\/assets: Resource not accessible by integration/);
  answers.push([200,{id:7,body:'new'}]);
  assert.deepEqual(await github.setNotes(7,'new'),{id:7,body:'new'});
  assert.equal(requests.at(-1).method,'PATCH');assert.deepEqual(JSON.parse(requests.at(-1).body),{body:'new'});
  answers.push([204]);
  assert.equal(await github.removeFile(55),null);
  assert.equal(requests.at(-1).method,'DELETE');assert.match(requests.at(-1).url,/\/releases\/assets\/55$/);
  // The token never appears in an error.
  answers.push([500,{message:'Server Error'}]);
  await assert.rejects(github.release(),error=>!error.message.includes('secret-token')&&/500/.test(error.message));
  assert.throws(()=>githubRelease({repository:'PI_browser',token:'t',fetch}),/owner\/name/);
  assert.throws(()=>githubRelease({repository:'portlandiator/PI_browser',token:'',fetch}),/GITHUB_TOKEN/);
});

test('the release, its files and the page agree on names and addresses',()=>{
  assert.equal(siteAddress('Portlandiator/PI_browser'),site);
  // The address a page counts with is the download address of the file the script adds.
  const repository=siteRepository(new URL(siteAddress('portlandiator/PI_browser')));
  const added=plan({notes:'',assets:[]},friday,site).add[0];
  assert.equal(hitUrl(repository,added.page,weekOf(friday)),`https://github.com/portlandiator/PI_browser/releases/download/${releaseTag}/${added.name}`);
  assert.equal(fileLabel('catalog',week),'Catalog, week from 2026-11-09');
});

test('the workflow runs the script daily with only the access it needs',async()=>{
  // A Windows checkout may hold the file with CRLF line endings.
  const workflow=readFileSync(path.join(root,'.github/workflows/visitor-counts.yml'),'utf8').replaceAll('\r\n','\n');
  assert.match(workflow,/\n  schedule:\n    - cron: '\d+ \d+ \* \* \*'\n/);
  assert.match(workflow,/\n  push:\n    branches: \[main\]\n/);assert.match(workflow,/\n  workflow_dispatch:\n/);
  assert.match(workflow,/\npermissions:\n  contents: write\n(?! )/);
  assert.match(workflow,/GITHUB_TOKEN: \$\{\{ github\.token \}\}\n\s+run: node scripts\/visitor-counts\.mjs\n/);
  assert.doesNotMatch(workflow,/pull_request|secrets\./);
  // The sparse checkout holds everything the script imports, and a change to any of it starts a run.
  const needed=await codeDependencies(root,['scripts/visitor-counts.mjs']);
  assert.deepEqual(needed,['scripts/visitor-counts.mjs','src/visitor-count.mjs']);
  const listed=block=>workflow.slice(workflow.indexOf(block)).split('\n').slice(1).map(line=>line.trim().replace(/^- /,'').replaceAll("'",'')).filter(line=>/\.(?:mjs|yml)$/.test(line));
  assert.deepEqual(listed('sparse-checkout: |').slice(0,2).sort(),needed);
  assert.deepEqual(listed('    paths:').slice(0,3).sort(),['.github/workflows/visitor-counts.yml',...needed]);
});

test('counting visitors never changes what the site build produces or reuses',async()=>{
  // Neither module is part of the build, so the deployment cache and its fingerprints are unaffected.
  const build=await codeDependencies(root,['scripts/build.mjs','scripts/deployment-cache.mjs']);
  assert(!build.includes('src/visitor-count.mjs')&&!build.includes('scripts/visitor-counts.mjs'));
  for(const name of ['pages.yml','check-pull-request.yml','ios.yml','ios-testflight.yml','ios-screenshots.yml'])assert.doesNotMatch(readFileSync(path.join(root,'.github/workflows',name),'utf8'),/visitor-counts\.mjs/,name);
});
