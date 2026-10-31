import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {buildInputs,fingerprint,refreshSite,generatedPaths} from '../scripts/deployment-cache.mjs';

// Study guides take their masthead and About dialog from Catalog view.
const page=text=>`<header class="masthead"><a href="./study-guides/index.html">Study guides</a></header>${text}<dialog id="about-dialog"></dialog>`;
async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pi-deployment-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const write=async(name,value)=>{await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),value);};
  for(const [name,value] of Object.entries({
    'data/collection.tar.gz':'source, translation and metadata bytes',
    'data/subject-edits.json':'{}',
    'study-guides/editorial.json':JSON.stringify({subjects:[],method:'Fixture'}),
    'scripts/compilation-pilot.css':'body {}',
    'scripts/compilation-pilot-view.js':'// fixture',
    'scripts/compilation-guide-index.js':'// fixture',
    'scripts/compilation-guide-site.js':'// fixture',
    'scripts/compilation-guide-loader.mjs':'// fixture',
    'src/fonts/eb-garamond.ttf':'font fixture',
    'src/fonts/eb-garamond-italic.ttf':'font fixture',
    'src/fonts/scheherazade-new.ttf':'font fixture',
    'src/fonts/EB-Garamond-OFL.txt':'license fixture',
    'src/fonts/Scheherazade-New-OFL.txt':'license fixture',
    'subject-summaries/A.md':'# A\n\nIntroduction.\n\nConnections.',
    'subject_extracts/Evernote_scrape/A.txt':'Quoted words. Reference',
    'pdf_volumes - copy/volume_01.pdf':'%PDF-1.7 fixture',
    'knowledge_graph_defaults.csv':'The Primal Will',
    'volume_view_defaults.csv':'volume,page\n30,14',
    'period_renaming.csv':'Old,New',
    'subjects - reference.docx':'reference',
    'scripts/build.mjs':"import {parse} from '../src/parser.mjs';",
    'scripts/deployment-cache.mjs':'// cache version',
    'src/parser.mjs':"export {parse} from './normalization.mjs';",
    'src/normalization.mjs':'export const parse = value => value;',
    'src/app.mjs':'// interface',
    'src/theme.css':':root{--subject-000000:#000000}\n:root[data-theme=dark]{--subject-000000:#C9CECA}',
    'src/index.html':page('current interface'),
    'src/style.css':'body {color:green}',
    'README.md':'documentation',
  }))await write(name,value);
  return {root,write};
}

test('interface, documentation and study-guide changes reuse data, but every source and transitive build input invalidates it',async t=>{
  const {root,write}=await fixture(t);
  const initial=await fingerprint(root);
  for(const name of ['src/app.mjs','src/index.html','src/style.css','README.md','study-guides/editorial.json'])await write(name,'changed interface, documentation or study-guide wording');
  assert.equal(await fingerprint(root),initial);
  for(const name of ['subject_extracts/Evernote_scrape/A.txt','subject-summaries/A.md','data/collection.tar.gz','data/subject-edits.json','pdf_volumes - copy/volume_01.pdf','period_renaming.csv','subjects - reference.docx','src/normalization.mjs','scripts/deployment-cache.mjs']){
    const before=await fingerprint(root);
    await fs.appendFile(path.join(root,name),'\n// changed');
    assert.notEqual(await fingerprint(root),before,name);
  }
  const before=await fingerprint(root);
  await write('src/new-parser.mjs','export const extra = 1;');
  await fs.appendFile(path.join(root,'src/normalization.mjs'),"\nexport {extra} from './new-parser.mjs';");
  assert.ok((await buildInputs(root)).includes('src/new-parser.mjs'));
  assert.notEqual(await fingerprint(root),before);
});

test('added, removed, and renamed inputs invalidate the cache even with identical contents',async t=>{
  const {root,write}=await fixture(t);
  const initial=await fingerprint(root);
  await write('pdf_volumes - copy/volume_02.pdf','%PDF-1.7 fixture');
  const added=await fingerprint(root);assert.notEqual(added,initial);
  await fs.rename(path.join(root,'pdf_volumes - copy/volume_02.pdf'),path.join(root,'pdf_volumes - copy/volume_03.pdf'));
  assert.notEqual(await fingerprint(root),added);
  await fs.unlink(path.join(root,'pdf_volumes - copy/volume_03.pdf'));
  assert.equal(await fingerprint(root),initial);
});

async function cachedData(write){
  await write('dist/build-state.json','{}');
  await write('dist/stats.json',JSON.stringify({dataset:'collections/example/',records:1}));
  await write('dist/collections/example/catalog.json.gz','catalog bytes');
  await write('dist/collections/example/metadata-schema.json','[]');
  await write('dist/collections/example/subjects/index.json.gz',gzipSync(JSON.stringify({subjects:[],edges:[]})));
  await write('dist/pdf-volumes/volume-1.pdf','PDF bytes');
  await write('dist/volumes.json','{"1":"pdf-volumes/volume-1.pdf"}');
  await write('dist/volume-titles.json','{"1":"Volume 1"}');
}

test('fresh interface overlays cached output without changing dataset URLs or generated bytes',async t=>{
  const {root,write}=await fixture(t);await cachedData(write);
  await write('dist/collections/obsolete/records/old.json.gz','obsolete bytes');
  const protectedFiles=['stats.json','volumes.json','volume-titles.json','collections/example/catalog.json.gz','pdf-volumes/volume-1.pdf'];
  const original=await Promise.all(protectedFiles.map(f=>fs.readFile(path.join(root,'dist',f))));
  const stats=await refreshSite(root);assert.equal(stats.dataset,'collections/example/');
  assert.deepEqual(await fs.readdir(path.join(root,'dist/collections')),['example']);
  assert.equal(await fs.readFile(path.join(root,'dist/index.html'),'utf8'),page('current interface'));
  assert.equal(await fs.readFile(path.join(root,'dist/.nojekyll'),'utf8'),'');
  for(const [i,file] of protectedFiles.entries())assert.deepEqual(await fs.readFile(path.join(root,'dist',file)),original[i]);
  await write('src/index.html',page('new interface'));await refreshSite(root);
  assert.equal(await fs.readFile(path.join(root,'dist/index.html'),'utf8'),page('new interface'));
  assert.ok(!generatedPaths.includes('index.html'));
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root,'dist/study-guides/manifest.json'),'utf8')),{format:1,dataset:stats.dataset,subjects:{}});
});

test('incomplete or unsafe cached data fails before copying the interface',async t=>{
  const {root,write}=await fixture(t);
  await assert.rejects(refreshSite(root));
  await cachedData(write);
  await write('dist/stats.json',JSON.stringify({dataset:'../../'}));
  await assert.rejects(refreshSite(root),/Invalid cached dataset path/);
  await cachedData(write);await write('src/stats.json','must not replace data');
  await write('dist/collections/obsolete/records/old.json.gz','obsolete bytes');
  await assert.rejects(refreshSite(root),/overwrite generated data/);
  assert.deepEqual((await fs.readdir(path.join(root,'dist/collections'))).sort(),['example','obsolete']);
  await assert.rejects(fs.access(path.join(root,'dist/.collection-update.lock')));
  await assert.rejects(fs.access(path.join(root,'dist/index.html')));
});

test('filtered extract archive replaces private raw inputs in deployment fingerprints',async t=>{
  const {root,write}=await fixture(t);
  await write('data/subject-extracts-public.json.gz','filtered public extract fixture');
  const initial=await fingerprint(root),inputs=await buildInputs(root);
  assert.ok(inputs.includes('data/subject-extracts-public.json.gz'));assert.ok(!inputs.some(f=>f.startsWith('subject_extracts/')));
  await write('subject_extracts/Evernote_scrape/A.txt','Private changes must not leak or change the public build');assert.equal(await fingerprint(root),initial);
  await write('data/subject-extracts-public.json.gz','updated filtered extract fixture');assert.notEqual(await fingerprint(root),initial);
});
