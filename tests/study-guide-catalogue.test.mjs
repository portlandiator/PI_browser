import test from 'node:test';
import assert from 'node:assert/strict';
import {studyGuideSelections,catalogueFingerprint,verifyCatalogueBaseline} from '../scripts/study-guide-catalogue.mjs';
const candidate={source:'BH00001',version:'v1',ranges:[{paragraph:1,start:0,end:5,text:'Words'}]};
test('guides use every verified match, distinguish approximate references, and honor published removals',()=>{
 const rows=[{id:'confirmed',status:'confirmed',passage:'p',candidates:[candidate]},{id:'approximate',status:'approximate',passage:'a',excerpt:'Supplied wording.',candidates:[candidate]},{id:'outside',status:'unmatched',excerpt:'Another author.',provenance:{sourceCollection:'Evernote_scrape'}},{id:'hidden',status:'unmatched',provenance:{sourceCollection:'subjects_inv_length_ordered'}},{id:'removed',status:'rejected',passage:'r',candidates:[candidate]}];
 const result=studyGuideSelections(rows);
 assert.deepEqual(result.map(s=>s.id),['confirmed','approximate','outside']);
 assert.equal(result[0].passage,'p');assert.equal(result[1].passage,undefined);
 assert.equal(result[1].excerpt,'Supplied wording.');assert.equal(result[1].candidates[0],candidate);
 assert.equal(rows[1].passage,'a');
});
test('the catalogue baseline rejects loss of reviewed decisions and changes to quoted source versions',()=>{
 const data={subject:{id:'subject',name:'Subject'},selections:[{id:'selection',status:'confirmed',passage:'p',candidates:[candidate]}]};
 const baseline={subjects:{subject:{fingerprint:catalogueFingerprint(data.selections)}}};
 assert.doesNotThrow(()=>verifyCatalogueBaseline(data,baseline));
 const stale=structuredClone(data);stale.selections[0].status='approximate';
 assert.throws(()=>verifyCatalogueBaseline(stale,baseline),/Reconcile the published matches/);
 const changed=structuredClone(data);changed.selections[0].candidates[0].version='v2';
 assert.throws(()=>verifyCatalogueBaseline(changed,baseline),/versioned source text/);
 assert.throws(()=>verifyCatalogueBaseline({...data,selections:[]},baseline),/Catalogue review data changed/);
});
