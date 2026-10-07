import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {gunzipSync} from 'node:zlib';
import {mergeShard} from '../scripts/incremental-build.mjs';
import {packPosting,unpackPosting} from '../src/text.mjs';
import {csvText} from '../scripts/item-store.mjs';
const exec=promisify(execFile),project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('shard replacement removes obsolete tokens and preserves other documents and position order',()=>{
  const before={old:Buffer.from(packPosting(new Map([[1,[2]],[3,[9]]]))).toString('base64'),stay:Buffer.from(packPosting(new Map([[2,[5]]]))).toString('base64')};
  const merged=mergeShard(before,new Map([['old',new Map([[0,[1]],[1,[7]]])],['new',new Map([[1,[8]]])]]),new Set([1]));
  assert.deepEqual([...merged.get('old')],[[0,[1]],[1,[7]],[3,[9]]]);
  assert.deepEqual(unpackPosting(packPosting(merged.get('old'))),merged.get('old'));assert.deepEqual([...merged.get('stay')],[[2,[5]]]);
});

test('incremental metadata, original, translation and availability corrections match clean full builds',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pi-incremental-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const write=async(name,value)=>{await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),value);};
  await write('knowledge_graph_defaults.csv','The Primal Will');
  await write('volume_view_defaults.csv','volume,page\n30,14');
  await fs.cp(path.join(project,'src'),path.join(root,'src'),{recursive:true});
  await fs.cp(path.join(project,'scripts'),path.join(root,'scripts'),{recursive:true});
  // Keep real corpus/index/metadata building; isolate subject matching and PDF volume data.
  await write('scripts/build-subjects.mjs',`import fs from 'node:fs/promises';import path from 'node:path';import {gzipSync,gunzipSync} from 'node:zlib';
export async function buildSubjects(root,out,dataset){const base=path.join(out,dataset,'subjects');await fs.mkdir(base,{recursive:true});const catalog=JSON.parse(gunzipSync(await fs.readFile(path.join(out,dataset,'catalog.json.gz'))));const zip=(file,value)=>fs.writeFile(path.join(base,file),gzipSync(JSON.stringify(value)));await zip('index.json.gz',{subjects:[{id:'subject'}]});await zip('subject.json.gz',{sources:Object.fromEntries(catalog.map(r=>[r.id,r]))});await fs.writeFile(path.join(root,'subject-import-report.json'),'{}');}`);
  await write('data/collection.tar.gz','fingerprint fixture');await write('data/subject-extracts-public.json.gz','fixture');
  await write('data/withheld-pdf-volumes.json','{}');await write('subject-summaries/A.md','fixture');
  await write('subjects - reference.docx','fixture');await write('period_renaming.csv','Old,New\nold,Period\n');
  await write('pdf_volumes - copy/volume_01 - Title.pdf','%PDF-1.7 fixture');
  const rows=[{PIN:'AB1',Title:'First',Period:'old',Volume:'1',Manuscripts:'M',Publications:'',Translations:'',Notes:'',Subjects:'','First line (original)':'اول'},{PIN:'AB2',Title:'Second',Period:'old',Volume:'1',Manuscripts:'M',Publications:'',Translations:'',Notes:'',Subjects:'','First line (original)':'دوم'}];
  const metadata=()=>write('metadata - copy/items.csv',csvText(rows,Object.keys(rows[0])));
  await metadata();await write('original_texts - copy/AB1.txt','اول متن');await write('original_texts - copy/AB2.txt','دوم متن');
  await write('translated_texts - copy/AB1.txt','One first phrase.\n\nAnother paragraph.');await write('translated_texts - copy/AB2.txt','One shared word.');
  const build=async incremental=>exec(process.execPath,['scripts/build.mjs'],{cwd:root,env:{...process.env,PI_INCREMENTAL:incremental?'1':'0'},maxBuffer:1024*1024});
  async function output(){
    const stats=JSON.parse(await fs.readFile(path.join(root,'dist/stats.json'))),files=new Map();
    const base=path.join(root,'dist',stats.dataset);
    async function walk(folder=''){for(const entry of await fs.readdir(path.join(base,folder),{withFileTypes:true})){const name=path.join(folder,entry.name);if(entry.isDirectory())await walk(name);else files.set(name,await fs.readFile(path.join(base,name)));}}
    await walk();delete stats.dataset;return {stats,files};
  }
  await build(false);
  const changes=[
    async()=>{rows[0].Title='Corrected';rows[0].Translations='T1, T2';await metadata();},
    async()=>write('original_texts - copy/AB1.txt','تازه متن\n\nدیگر'),
    async()=>write('translated_texts - copy/AB1.txt','Changed repeated repeated.\n\nNew \\footnote{Note words.}'),
    async()=>{rows[0].Manuscripts='';await metadata();},
  ];
  for(const [i,change] of changes.entries()){
    await change();const result=await build(true);assert.match(result.stdout,/Build mode: incremental; regenerated 1 records/);
    assert.match(result.stdout,new RegExp('subject rebuild: '+(i===2?'true':'false')));
    const partial=await output();await build(false);const full=await output();
    assert.deepEqual(partial.stats,full.stats);
    assert.deepEqual([...partial.files.keys()].sort(),[...full.files.keys()].sort());
    for(const [name,bytes] of partial.files){const read=value=>JSON.parse(name.endsWith('.gz')?gunzipSync(value):value.toString());assert.deepEqual(read(bytes),read(full.files.get(name)),`Change ${i}: ${name}`);}
  }
  await write('translated_texts - copy/AB3.txt','Added ID.');
  assert.match((await build(true)).stdout,/Build mode: full/,'Changing IDs must not reuse numeric postings');
  await fs.appendFile(path.join(root,'src/text.mjs'),'\n// parser change');
  assert.match((await build(true)).stdout,/Build mode: full/,'Parser changes must invalidate reuse');
});
