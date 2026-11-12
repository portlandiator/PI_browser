import test from 'node:test';
import assert from 'node:assert/strict';
import {artifactName,chooseVerifiedBuild,checkWorkflow} from '../scripts/verified-build.mjs';

const tree='0123456789abcdef0123456789abcdef01234567',name=artifactName(tree);
const artifact=(id,extra={})=>({name,expired:false,created_at:'2026-11-12T10:00:00Z',workflow_run:{id,repository_id:1,head_repository_id:1},...extra});
const run=(extra={})=>({path:checkWorkflow,event:'pull_request',conclusion:'success',repository:{id:1},head_repository:{id:1},...extra});

test('the deployment uses only a build from this repository\'s own pull request check',()=>{
  assert.equal(name,'verified-site-'+tree);
  assert.throws(()=>artifactName('main'));
  assert.deepEqual(chooseVerifiedBuild([artifact(7)],new Map([[7,run()]]),name),{runId:7,name});
  // Tests passed before the upload; later steps may still be running.
  assert.deepEqual(chooseVerifiedBuild([artifact(7)],new Map([[7,run({conclusion:null})]]),name),{runId:7,name});
  for(const [label,artifacts,runs] of [
    ['none',[],new Map()],
    ['expired',[artifact(7,{expired:true})],new Map([[7,run()]])],
    ['another name',[artifact(7,{name:'verified-site-'+'f'.repeat(40)})],new Map([[7,run()]])],
    ['fork artifact',[artifact(7,{workflow_run:{id:7,repository_id:1,head_repository_id:2}})],new Map([[7,run()]])],
    ['fork run',[artifact(7)],new Map([[7,run({head_repository:{id:2}})]])],
    ['another workflow',[artifact(7)],new Map([[7,run({path:'.github/workflows/other.yml'})]])],
    ['another event',[artifact(7)],new Map([[7,run({event:'workflow_dispatch'})]])],
    ['failed run',[artifact(7)],new Map([[7,run({conclusion:'failure'})]])],
    ['unknown run',[artifact(7)],new Map()],
  ])assert.equal(chooseVerifiedBuild(artifacts,runs,name),null,label);
});

test('the newest usable build is chosen',()=>{
  const artifacts=[artifact(7),artifact(9,{created_at:'2026-11-12T12:00:00Z'}),artifact(8,{created_at:'2026-11-12T11:00:00Z'})];
  const runs=new Map([[7,run()],[8,run()],[9,run({conclusion:'failure'})]]);
  assert.equal(chooseVerifiedBuild(artifacts,runs,name).runId,8);
});
