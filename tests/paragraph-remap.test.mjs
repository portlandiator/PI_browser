import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {paragraphRangeRemapper} from '../scripts/remap-paragraph-ranges.mjs';
const candidate=(bytes,ranges)=>({source:'T',version:createHash('sha256').update(bytes).digest('hex'),ranges});
test('newline migration preserves repeated occurrence and splits spanning highlights',()=>{
 const before=Buffer.from('Same words. Same words. Last phrase.'),after=Buffer.from('Same words. \r\n\r\nSame words. \r\n\r\nLast phrase.');
 const remap=paragraphRangeRemapper('T',before,after);
 const result=remap(candidate(before,[{paragraph:1,start:12,end:36,text:'Same words. Last phrase.'}]));
 assert.deepEqual(result.ranges.map(({paragraph,start,end,text})=>({paragraph,start,end,text})),[{paragraph:2,start:0,end:11,text:'Same words.'},{paragraph:3,start:0,end:12,text:'Last phrase.'}]);
 assert.ok(result.ranges.every(r=>r.paragraphId===`T@${result.version}:en:${r.paragraph}`));
});
test('migration rejects wording changes, stale versions and invalid offsets',()=>{
 const before=Buffer.from('First. Second.'),after=Buffer.from('First.\n\n Second.');
 assert.throws(()=>paragraphRangeRemapper('T',before,Buffer.from('First. Other.')),/beyond newlines/);
 const remap=paragraphRangeRemapper('T',before,after),c=candidate(before,[{paragraph:1,start:7,end:14,text:'Second.'}]);
 assert.equal(remap(c).ranges[0].paragraph,2);
 assert.throws(()=>remap({...c,version:'stale'}),/stale/);
 assert.throws(()=>remap({...c,ranges:[{paragraph:1,start:7,end:15,text:'Second.'}]}),/coordinates/);
});
