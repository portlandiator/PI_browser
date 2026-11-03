import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {newestDataset} from '../scripts/reconcile-study-guides.mjs';
test('reconciliation reads the new subjects after a failed build, ahead of restored stats',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pi-reconcile-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  for(const [name,time] of [['published',100],['corrected',200]]){
    const dir=path.join(root,'dist/collections',name,'subjects');await fs.mkdir(dir,{recursive:true});
    const file=path.join(dir,'index.json.gz');await fs.writeFile(file,'fixture');await fs.utimes(file,time,time);
  }
  await fs.writeFile(path.join(root,'dist/stats.json'),JSON.stringify({dataset:'collections/published/'}));
  assert.equal(await newestDataset(root),path.join(root,'dist/collections/corrected'));
});
