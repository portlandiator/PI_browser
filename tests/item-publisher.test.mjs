import test from 'node:test';
import assert from 'node:assert/strict';
import {run,watchDeployment} from '../scripts/publish-item.mjs';

test('publisher keeps successful JSON separate from stderr and retains failure diagnostics',async()=>{
  const json=await run(process.execPath,['-e',"console.error('warning');console.log(JSON.stringify({id:1}))"],process.cwd(),true);
  assert.deepEqual(JSON.parse(json),{id:1});
  await assert.rejects(run(process.execPath,['-e',"console.error('Authentication expired');process.exit(1)"],process.cwd(),true),/Authentication expired/);
});

test('a failed deployment identifies the check and preserves the uploaded versus live distinction',async()=>{
  const execute=async(_command,args)=>{
    if(args[1]==='watch')throw Error('gh failed');
    return JSON.stringify({status:'completed',conclusion:'failure',jobs:[{name:'build',steps:[{name:'Verify generated collection',conclusion:'failure'}]}]});
  };
  await assert.rejects(watchDeployment('gh',123,process.cwd(),execute),error=>{
    assert.match(error.message,/correction was uploaded/);
    assert.match(error.message,/build: Verify generated collection/);
    assert.match(error.message,/actions\/runs\/123/);
    assert.match(error.message,/Do not re-enter/);
    return true;
  });
});
