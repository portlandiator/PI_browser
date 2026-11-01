import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {reconciliationDataset} from '../scripts/reconcile-study-guides.mjs';

test('reconciliation uses the failed build even when an active or newer-looking collection exists',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pi-reconciliation-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  for(const name of ['active','failed','unrelated']){
    const folder=path.join(root,'dist/collections',name,'subjects');
    await fs.mkdir(folder,{recursive:true});await fs.writeFile(path.join(folder,'index.json.gz'),'fixture');
  }
  await fs.writeFile(path.join(root,'dist/stats.json'),JSON.stringify({dataset:'collections/active/'}));
  const marker=path.join(root,'dist/study-guide-reconciliation.json');
  await fs.writeFile(marker,JSON.stringify({format:1,dataset:'collections/failed/'}));
  assert.equal(await reconciliationDataset(root),path.join(root,'dist/collections/failed'));
  for(const value of [{format:2,dataset:'collections/failed/'},{format:1,dataset:'../outside/'},{format:1,dataset:'collections/failed/../../outside/'}]){
    await fs.writeFile(marker,JSON.stringify(value));await assert.rejects(reconciliationDataset(root),/Invalid study-guide reconciliation dataset/);
  }
  await fs.writeFile(marker,JSON.stringify({format:1,dataset:'collections/missing/'}));
  await assert.rejects(reconciliationDataset(root),{code:'ENOENT'});
  await fs.unlink(marker);
  await assert.rejects(reconciliationDataset(root),/No failed study-guide build/);
});
