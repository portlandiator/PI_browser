import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {beginCollectionUpdate,pruneCollections} from '../scripts/collection-storage.mjs';
import {installBuiltSite} from '../scripts/install-built-site.mjs';

async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pi-storage-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const write=async(name,value)=>{const target=path.join(root,'dist',name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,value);};
  for(const name of ['stats.json','build-state.json','study-guides/manifest.json'])await write(name,JSON.stringify({dataset:'collections/current/'}));
  for(const name of ['catalog.json.gz','metadata-schema.json','subjects/index.json.gz','records/AB1.json.gz'])await write('collections/current/'+name,'current '+name);
  await write('collections/obsolete/records/AB1.json.gz','old record');
  await write('collections/unfinished/partial','interrupted build');
  return {root,write,collections:path.join(root,'dist/collections')};
}

test('cleanup retains the current collection bytes and removes only obsolete generated collections',async t=>{
  const {root,write,collections}=await fixture(t);
  await fs.mkdir(path.join(root,'data/collection'),{recursive:true});
  await fs.writeFile(path.join(root,'data/collection/source.tar'),'immutable source');
  await write('app.mjs','interface');
  const before=await fs.readFile(path.join(collections,'current/records/AB1.json.gz'));
  const result=await pruneCollections(root);
  assert.deepEqual(result.removed.sort(),['obsolete','unfinished']);
  assert.deepEqual(await fs.readdir(collections),['current']);
  assert.deepEqual(await fs.readFile(path.join(collections,'current/records/AB1.json.gz')),before);
  assert.equal(await fs.readFile(path.join(root,'data/collection/source.tar'),'utf8'),'immutable source');
  assert.equal(await fs.readFile(path.join(root,'dist/app.mjs'),'utf8'),'interface');
  assert.deepEqual((await pruneCollections(root)).removed,[]);
  await assert.rejects(fs.access(path.join(root,'dist/.collection-update.lock')));
});

test('missing or conflicting references and incomplete active data leave every generation intact',async t=>{
  for(const [name,value] of [
    ['stats.json','{}'],
    ['stats.json',JSON.stringify({dataset:'../outside/'})],
    ['stats.json',JSON.stringify({dataset:'collections/missing/'})],
    ['build-state.json',JSON.stringify({dataset:'collections/obsolete/'})],
    ['study-guides/manifest.json',JSON.stringify({dataset:'collections/obsolete/'})],
  ])await t.test(name+' '+value,async t=>{
    const {root,write,collections}=await fixture(t);await write(name,value);
    await assert.rejects(pruneCollections(root));
    assert.deepEqual((await fs.readdir(collections)).sort(),['current','obsolete','unfinished']);
    await assert.rejects(fs.access(path.join(root,'dist/.collection-update.lock')));
  });
  const {root,collections}=await fixture(t);
  await fs.unlink(path.join(collections,'current/catalog.json.gz'));
  await assert.rejects(pruneCollections(root));
  assert.deepEqual((await fs.readdir(collections)).sort(),['current','obsolete','unfinished']);
});

test('linked directories are rejected before any obsolete generation is deleted',async t=>{
  const {root,collections}=await fixture(t);
  const outside=await fs.mkdtemp(path.join(os.tmpdir(),'pi-outside-'));
  t.after(()=>fs.rm(outside,{recursive:true,force:true}));
  await fs.writeFile(path.join(outside,'keep'),'outside bytes');
  await fs.symlink(outside,path.join(collections,'unfinished/link'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(pruneCollections(root),/Unsafe collection/);
  assert.deepEqual((await fs.readdir(collections)).sort(),['current','obsolete','unfinished']);
  assert.equal(await fs.readFile(path.join(outside,'keep'),'utf8'),'outside bytes');
});

test('an active writer blocks cleanup and subsequent updates resume after it closes',async t=>{
  const {root,collections}=await fixture(t);
  const update=await beginCollectionUpdate(root);
  try{
    await assert.rejects(pruneCollections(root),/Another collection build/);
    await assert.rejects(beginCollectionUpdate(root),/Another collection build/);
    assert.deepEqual((await fs.readdir(collections)).sort(),['current','obsolete','unfinished']);
  }finally{await update.close();}
  await update.close();
  await assert.rejects(update.prune(),/already closed/);
  assert.equal((await pruneCollections(root)).removed.length,2);
});

test('installing a tested updater build retires previous datasets under the shared lock',async t=>{
  const {root,collections}=await fixture(t);
  const stage=await fixture(t);
  await pruneCollections(stage.root);
  await fs.rename(path.join(stage.collections,'current'),path.join(stage.collections,'updated'));
  for(const name of ['stats.json','build-state.json','study-guides/manifest.json'])await stage.write(name,JSON.stringify({dataset:'collections/updated/'}));
  await stage.write('app.mjs','updated interface');
  const source=path.join(stage.root,'dist'),update=await beginCollectionUpdate(root);
  try{await assert.rejects(installBuiltSite(root,source),/Another collection build/);}
  finally{await update.close();}
  assert.deepEqual((await installBuiltSite(root,source)).removed.sort(),['current','obsolete','unfinished']);
  assert.deepEqual(await fs.readdir(collections),['updated']);
  assert.equal(await fs.readFile(path.join(root,'dist/app.mjs'),'utf8'),'updated interface');
  assert.equal(await fs.readFile(path.join(collections,'updated/records/AB1.json.gz'),'utf8'),'current records/AB1.json.gz');
  const stagedUpdate=await beginCollectionUpdate(stage.root);
  try{await assert.rejects(installBuiltSite(root,source),/Staged build is still locked/);}
  finally{await stagedUpdate.close();}
  await assert.rejects(installBuiltSite(root,path.join(root,'dist')),/outside the destination/);
  await assert.rejects(installBuiltSite(root,path.join(stage.root,'missing')));
  assert.deepEqual(await fs.readdir(collections),['updated']);
  await assert.rejects(fs.access(path.join(root,'dist/.collection-update.lock')));
});
