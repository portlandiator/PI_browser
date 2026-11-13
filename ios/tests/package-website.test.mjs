import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {packageWebsite,safePath,visitorCountModule,withoutVisitorCount} from '../scripts/package-website.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pi-ios-test-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const site=path.join(root,'site'),audit=path.join(root,'audit'),pdfs=path.join(root,'pdfs'),output=path.join(root,'output');
  for(const folder of [site,audit,pdfs])await fs.mkdir(folder);
  const dataset='collections/test/',commit='a'.repeat(40);
  const files={
    'publication.json':JSON.stringify({commit,dataset}), 'index.html':'<script type="module" src="./visitor-count.mjs" data-visitor-page="catalog"></script><h1>Collection</h1><footer><span data-visitor-count>Partial Inventory browser</span></footer>',
    'visitor-count.mjs':await fs.readFile(new URL('../../src/visitor-count.mjs',import.meta.url)),
    'subjects.html':'<h1>Subjects</h1>', 'volume-view.html':'<h1>Volumes</h1>',
    'stats.json':JSON.stringify({dataset,records:29114}), 'volumes.json':JSON.stringify({'1':'pdf-volumes/volume-1.pdf'}),
    'pdf-hosting.json':JSON.stringify({url:'https://example.com/pdfs/'}),
    'study-guides/index.html':'<h1>Guides</h1>', 'study-guides/manifest.json':JSON.stringify({dataset,subjects:{one:'one-pdf.html'}}),
    [dataset+'catalog.json.gz']:gzipSync('[]'), [dataset+'subjects/index.json.gz']:gzipSync(JSON.stringify({subjects:[{id:'one'}]})),
  };
  const inventory=[];
  for(const [name,value]of Object.entries(files)){
    const bytes=Buffer.from(value);await fs.mkdir(path.dirname(path.join(site,name)),{recursive:true});await fs.writeFile(path.join(site,name),bytes);
    inventory.push({path:name,bytes:bytes.length,sha256:sha(bytes)});
  }
  const pdf=Buffer.from('%PDF-1.7\nfixture');await fs.mkdir(path.join(pdfs,'pdf-volumes'));await fs.writeFile(path.join(pdfs,'pdf-volumes/volume-1.pdf'),pdf);
  const pdfManifest=Buffer.from(JSON.stringify({format:1,files:[{path:'pdf-volumes/volume-1.pdf',bytes:pdf.length,sha256:sha(pdf)}]}));
  await fs.writeFile(path.join(pdfs,'pdf-site.json'),pdfManifest);
  const encoded=gzipSync(JSON.stringify(inventory));await fs.writeFile(path.join(audit,'files.json.gz'),encoded);
  await fs.writeFile(path.join(audit,'summary.json'),JSON.stringify({commit,dataset,studyGuides:1,manifestSha256:sha(encoded),publicBytes:inventory.reduce((n,x)=>n+x.bytes,0),pdfSite:{files:1,manifestSha256:sha(pdfManifest)}}));
  return {site,audit,pdfs,output,expectedCommit:commit};
}
test('packages the complete audited release and moves PDF hosting offline',async t=>{
  const args=await fixture(t);const result=await packageWebsite(args);
  assert.equal(result.records,29114);assert.equal(result.volumes,1);
  assert.equal(JSON.parse(await fs.readFile(path.join(args.output,'pdf-hosting.json'))).url,'');
  assert.equal((await fs.readFile(path.join(args.output,'pdf-volumes/volume-1.pdf'))).subarray(0,5).toString(),'%PDF-');
});
test('leaves the website\'s visitor count out of the app',async t=>{
  const args=await fixture(t);
  // The website's module counts a visit through GitHub.
  const published=await fs.readFile(path.join(args.site,visitorCountModule),'utf8');
  assert.match(published,/github\.com/);assert.match(published,/showVisitorCount/);
  await packageWebsite(args);
  // The app's copy is empty: the page loads it, nothing is counted and the footer keeps its wording.
  const packaged=await fs.readFile(path.join(args.output,visitorCountModule),'utf8');
  assert.equal(packaged,withoutVisitorCount);
  assert.doesNotMatch(packaged,/github|fetch|import|export|localStorage/);
  assert.match(await fs.readFile(path.join(args.output,'index.html'),'utf8'),/<span data-visitor-count>Partial Inventory browser<\/span>/);
  // The packaged checksum is that of the empty module, so the app verifies what it ships.
  const listed=JSON.parse(await fs.readFile(path.join(args.output,'offline-files.json'),'utf8')).files.find(file=>file.path===visitorCountModule);
  assert.deepEqual(listed,{path:visitorCountModule,bytes:Buffer.byteLength(withoutVisitorCount),sha256:sha(withoutVisitorCount)});
  // Nothing else in the package can count a visit.
  for(const file of await fs.readdir(args.output,{recursive:true})){
    if(!/\.(?:html|js|mjs)$/.test(file))continue;
    assert.doesNotMatch(await fs.readFile(path.join(args.output,file),'utf8'),/releases\/download|api\.github\.com/,file);
  }
});
test('rejects changed source bytes before publishing any output',async t=>{
  const args=await fixture(t);await fs.writeFile(path.join(args.site,'index.html'),'tampered');
  await assert.rejects(packageWebsite(args),/Length|Hash/);await assert.rejects(fs.access(args.output));
});
test('requires the separate complete PDF set',async t=>{
  const args=await fixture(t);await fs.unlink(path.join(args.pdfs,'pdf-volumes/volume-1.pdf'));
  await assert.rejects(packageWebsite(args));await assert.rejects(fs.access(args.output));
});
test('rejects an audit or PDF release mismatch',async t=>{
  const args=await fixture(t);await fs.appendFile(path.join(args.pdfs,'pdf-site.json'),' ');
  await assert.rejects(packageWebsite(args),/PDF manifest/);
});
test('requires the expected source commit',async t=>{
  const args=await fixture(t);await assert.rejects(packageWebsite({...args,expectedCommit:'b'.repeat(40)}),/Unexpected website commit/);
});
test('never overwrites an installed package',async t=>{
  const args=await fixture(t);await fs.mkdir(args.output);await fs.writeFile(path.join(args.output,'keep'),'original');
  await assert.rejects(packageWebsite(args),/Output already exists/);
  assert.equal(await fs.readFile(path.join(args.output,'keep'),'utf8'),'original');
});
test('rejects traversal, absolute and Windows drive paths',()=>{
  for(const name of ['../outside','/absolute','a/../../outside','C:/secret','a\\secret','a//b','a/./b'])assert.throws(()=>safePath(os.tmpdir(),name));
});
