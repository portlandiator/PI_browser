import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {removedSelections,reconcileGuide,updateGuides,planDeletion} from '../scripts/catalog-deletion.mjs';
import {catalogueFingerprint} from '../scripts/study-guide-catalogue.mjs';
import {selectStudyGuideQuotations} from '../scripts/study-guide-selection.mjs';

const linked=(id,source,status='confirmed')=>({id,status,suppliedIds:[],passage:'p-'+id,candidates:[{source,version:'v1',ranges:[{paragraph:1,start:0,end:5,text:'Text.'}]}]});
const sources={GONE:{id:'GONE',title:'Gone'},KEEP:{id:'KEEP',title:'Kept'}};

test('a deleted item takes the quotations shown from it or citing only it, with their merged copies',()=>{
  const selections=[
    {...linked('shown','GONE'),duplicates:[{id:'copy'}]},
    linked('other','KEEP'),
    {id:'cites',status:'unmatched',suppliedIds:['GONE'],candidates:[]},
    {id:'shared',status:'unmatched',suppliedIds:['GONE','KEEP'],candidates:[]},
    {...linked('elsewhere','KEEP'),suppliedIds:['GONE']},
    {id:'ambiguous',status:'ambiguous',suppliedIds:[],candidates:[{source:'GONE'},{source:'KEEP'}]}
  ];
  assert.deepEqual([...removedSelections('GONE',selections)].sort(),['cites','copy','shown']);
});

test('guides lose emptied readings and surplus questions, and keep everything else',()=>{
  const before={subject:{id:'S'},sources,selections:[linked('a','GONE'),linked('b','KEEP'),linked('c','KEEP'),{id:'u',status:'unmatched',excerpt:'Supplied.',suppliedIds:[],candidates:[],provenance:{sourceCollection:'Evernote_scrape'}}]};
  const after={...before,selections:before.selections.filter(s=>s.id!=='a')};
  const guide={id:'S',slug:'sample',displayTitle:'Sample',order:[{key:'source:GONE',why:'First.'},{key:'source:KEEP',why:'Second.',shortened:['Text.']},{key:'selection:u',why:'Third.'}],questions:['One?','Two?','Three?'],neighbors:[]};
  const {guide:updated,notes}=reconcileGuide(guide,before,after,{item:'GONE'});
  assert.deepEqual(updated.order,guide.order.slice(1));
  assert.deepEqual(updated.questions,['One?']);
  assert.match(notes.join('\n'),/Reading removed: First\./);assert.match(notes.join('\n'),/reduced from 3 to 1/);
  assert.equal(reconcileGuide({...guide,order:[guide.order[0]]},{...before,selections:[before.selections[0]]},{...before,selections:[]},{item:'GONE'}).guide,null);
  // A quotation newly matched to a record keeps the place of the reading it came from.
  const moved={...after,selections:[linked('b','KEEP'),linked('c','KEEP'),linked('u','GONE2')]};
  const result=reconcileGuide(updated,after,{...moved,sources:{...sources,GONE2:{id:'GONE2'}}},{item:'GONE'});
  assert.deepEqual(result.guide.order.map(x=>[x.key,x.why]),[['source:KEEP','Second.'],['source:GONE2','Third.']]);
});

test('a curated guide records removed quotations so its selection still validates',async()=>{
  const record={id:'KEEP',enVersion:'v1',metadata:{},en:{paragraphs:[{plain:'Text.'}]}};
  const selections=Array.from({length:302},(_,i)=>linked(String(i),i===5||i===301?'GONE':'KEEP'));
  const before={subject:{id:'S'},sources,selections},after={...before,selections:selections.filter(s=>s.candidates[0].source!=='GONE')};
  const ids=selections.slice(0,300).map(s=>s.id);
  const review={subject:'S',status:'finalized_before_analysis',selectionBeforeAnalysis:true,target:300,candidateCount:302,selectedCount:300,mandatoryAuthorizedCount:0,candidateFingerprint:catalogueFingerprint(selections),
    selected:ids.map(id=>({id,source:selections[id].candidates[0].source,sourceVersion:'v1',authorizedParagraphs:[],reason:'Chosen.'})),omitted:[{id:'300'},{id:'301'}],importedAuthorityReview:[]};
  const guide={id:'S',slug:'sample',displayTitle:'Sample',selection:{review:'selections/sample.json',ids,sha256:''},order:[{key:'source:KEEP',why:'Kept.'},{key:'source:GONE',why:'Gone.'}],questions:['One?'],neighbors:[]};
  const result=reconcileGuide(guide,before,after,{item:'GONE',review});
  assert.deepEqual(result.review.removedWithCatalogItems,[{id:'5',item:'GONE',chosen:true},{id:'301',item:'GONE',chosen:false}]);
  assert.equal(result.review.selectedCount,299);assert.equal(result.review.candidateCount,300);assert.deepEqual(result.guide.order,[guide.order[0]]);
  const raw=JSON.stringify(result.review);result.guide.selection.sha256=createHash('sha256').update(raw).digest('hex');
  const chosen=await selectStudyGuideQuotations(after,result.guide.selection,{readReview:async()=>raw,readRecord:async()=>record});
  assert.equal(chosen.length,299);
  // Without the record, the shortfall is still rejected.
  const unrecorded={...result.review,removedWithCatalogItems:[]},plain=JSON.stringify(unrecorded);
  await assert.rejects(selectStudyGuideQuotations(after,{...result.guide.selection,sha256:createHash('sha256').update(plain).digest('hex')},{readReview:async()=>plain,readRecord:async()=>record}),/count/);
});

test('a corrected record moves chosen quotations to its new version so the selection still validates',async()=>{
  const record={id:'KEEP',enVersion:'v2',metadata:{},en:{paragraphs:[{plain:'Text.'}]}};
  const selections=Array.from({length:301},(_,i)=>linked(String(i),'KEEP'));
  const corrected=selections.map(s=>({...s,candidates:[{...s.candidates[0],version:'v2'}]}));
  const before={subject:{id:'S'},sources,selections},after={...before,selections:corrected};
  const ids=selections.slice(0,300).map(s=>s.id);
  const review={subject:'S',status:'finalized_before_analysis',selectionBeforeAnalysis:true,target:300,candidateCount:301,selectedCount:300,mandatoryAuthorizedCount:0,candidateFingerprint:catalogueFingerprint(selections),
    selected:ids.map(id=>({id,source:'KEEP',sourceVersion:'v1',authorizedParagraphs:[],reason:'Chosen.',authorityEvidence:{kind:'no_authorized_selected_paragraph',sourceVersion:'v1',paragraphs:[]}})),omitted:[{id:'300'}],importedAuthorityReview:[]};
  const guide={id:'S',slug:'sample',displayTitle:'Sample',selection:{review:'selections/sample.json',ids,sha256:''},order:[{key:'source:KEEP',why:'Kept.'}],questions:[],neighbors:[]};
  const raw=r=>JSON.stringify(r),digest=text=>createHash('sha256').update(text).digest('hex');
  // Refreshing only the fingerprint, as before, leaves the old version behind.
  const stale={...review,candidateFingerprint:catalogueFingerprint(corrected)};
  await assert.rejects(selectStudyGuideQuotations(after,{...guide.selection,sha256:digest(raw(stale))},{readReview:async()=>raw(stale),readRecord:async()=>record}),/source authority evidence changed/);
  const result=reconcileGuide(guide,before,after,{item:'KEEP',cause:'catalog item KEEP was corrected',review});
  assert.ok(result.review.selected.every(s=>s.sourceVersion==='v2'&&s.authorityEvidence.sourceVersion==='v2'));
  assert.equal(result.notes.filter(n=>/cites the corrected text of KEEP/.test(n)).length,300);
  const text=raw(result.review),chosen=await selectStudyGuideQuotations(after,{...result.guide.selection,sha256:digest(text)},{readReview:async()=>text,readRecord:async()=>record});
  assert.equal(chosen.length,300);
  // A corrected authorization field can make an omitted quotation mandatory.
  // Include it, renew its authority evidence, and retain the 300-choice limit.
  const changed=structuredClone(after);changed.selections[300].candidates[0].ranges[0].paragraph=2;
  const authority=new Map(changed.selections.map(s=>[s.id,{source:'KEEP',sourceVersion:'v2',authorizedParagraphs:s.id==='300'?[2]:[]}]));
  const promoted=reconcileGuide(guide,before,changed,{item:'KEEP',review,authority,authorized:()=>true});
  assert.ok(promoted.guide.selection.ids.includes('300'));assert.ok(!promoted.guide.selection.ids.includes('299'));
  assert.equal(promoted.review.mandatoryAuthorizedCount,1);
  const updatedRecord={...record,metadata:{Authorized:'Y2'},en:{paragraphs:[{plain:'Text.'},{plain:'Text.'}]}};
  const promotedText=raw(promoted.review);
  assert.equal((await selectStudyGuideQuotations(changed,{...promoted.guide.selection,sha256:digest(promotedText)},{readReview:async()=>promotedText,readRecord:async()=>updatedRecord})).length,300);
});

test('guide files, neighbors, baselines and sentence context are updated together',async()=>{
  const before={subject:{id:'S'},sources,selections:[linked('a','GONE'),linked('b','KEEP')]},after={...before,selections:[linked('b','KEEP')]};
  const guide={id:'S',slug:'sample',displayTitle:'Sample',order:[{key:'source:GONE',why:'First.'},{key:'source:KEEP',why:'Second.'}],questions:[],neighbors:[]};
  const other={id:'T',slug:'other',displayTitle:'Other',order:[{key:'source:KEEP',why:'Only.'}],questions:[],neighbors:[{id:'S',invitation:'Visit.',evidence:['a']},{id:'U',invitation:'Stay.',evidence:['a','x']}]};
  const files={
    'study-guides/first-batch.json':JSON.stringify({batchNumber:1,subjects:[guide,other]},null,2)+'\r\n',
    'study-guides/catalogue-baseline.json':JSON.stringify({format:1,subjects:{S:{fingerprint:catalogueFingerprint(before.selections),publicSelections:2}}},null,2)+'\n',
    'study-guides/sentence-context.json':JSON.stringify({format:1,entries:[{slug:'sample',key:'source:GONE',source:'GONE'},{slug:'other',key:'source:KEEP',source:'KEEP'}]},null,2)+'\n'
  };
  const {changes,guides}=await updateGuides({read:async name=>files[name]===undefined?null:Buffer.from(files[name]),list:async()=>Object.keys(files).map(name=>name.slice('study-guides/'.length)),item:'GONE',subjects:new Map([['S',{before,after}]]),evidenceGone:(_,id)=>id==='a'});
  const batch=changes.get('study-guides/first-batch.json');
  assert(batch.endsWith('}\r\n'));
  const [updated,neighbor]=JSON.parse(batch).subjects;
  assert.deepEqual(updated.order,[guide.order[1]]);
  assert.deepEqual(neighbor.neighbors,[{id:'U',invitation:'Stay.',evidence:['x']}]);
  assert.equal(JSON.parse(changes.get('study-guides/catalogue-baseline.json')).subjects.S.fingerprint,catalogueFingerprint(after.selections));
  assert.deepEqual(JSON.parse(changes.get('study-guides/sentence-context.json')).entries.map(x=>x.slug),['other']);
  assert.deepEqual(guides.map(g=>g.slug),['sample','other']);
});

test('a plan lists the removed quotations; reconciling a guide again after a rebuild records them once',async()=>{
  const before={subject:{id:'S',name:'Sample'},sources,selections:[{...linked('a','GONE'),subject:'S'},{...linked('b','KEEP'),subject:'S'}]};
  const guide={id:'S',slug:'sample',displayTitle:'Sample',order:[{key:'source:GONE',why:'First.'},{key:'source:KEEP',why:'Second.'}],questions:[],neighbors:[]};
  const files={
    'data/subject-extracts-public.json.gz':gzipSync(JSON.stringify({selections:before.selections,report:{}})),
    'data/extract-review-decisions.json':'{}\n','data/subject-edits.json':'{}\n',
    'study-guides/first-batch.json':JSON.stringify({batchNumber:1,subjects:[guide]},null,2)+'\n',
    'study-guides/catalogue-baseline.json':JSON.stringify({format:1,subjects:{S:{fingerprint:catalogueFingerprint(before.selections),publicSelections:2}}},null,2)+'\n'
  };
  const site=async name=>name==='subjects/S.json.gz'?before:name==='subjects/passages/GONE.json.gz'?{passages:{x:{subjects:['S']}}}:null;
  const plan=await planDeletion({id:'GONE',read:async name=>files[name]===undefined?null:Buffer.from(files[name]),list:async()=>['first-batch.json','catalogue-baseline.json'],site});
  assert.deepEqual(plan.removedIds,['a']);assert.equal(plan.quotations,1);
  assert.deepEqual([...plan.changes.keys()].sort(),['data/extract-review-decisions.json','data/subject-extracts-public.json.gz','study-guides/catalogue-baseline.json','study-guides/first-batch.json']);
  // A curated guide reconciled by the plan, then again on GitHub against the rebuilt data.
  const review={subject:'S',status:'finalized_before_analysis',selectionBeforeAnalysis:true,target:2,candidateCount:2,selectedCount:2,mandatoryAuthorizedCount:0,candidateFingerprint:catalogueFingerprint(before.selections),selected:[{id:'a',source:'GONE'},{id:'b',source:'KEEP'}],omitted:[],importedAuthorityReview:[]};
  const curated={...guide,selection:{review:'selections/sample.json',ids:['a','b'],sha256:''}};
  const planned={...before,selections:[before.selections[1]]};
  const first=reconcileGuide(curated,before,planned,{item:'GONE',review});
  assert.deepEqual(first.review.removedWithCatalogItems,[{id:'a',item:'GONE',chosen:true}]);
  const rebuilt={...planned,selections:[{...linked('b','KEEP'),subject:'S',candidates:[{source:'KEEP',version:'v2',ranges:[{paragraph:1,start:0,end:5,text:'Text.'}]}]}]};
  const second=reconcileGuide(first.guide,before,rebuilt,{item:'GONE',cause:'catalog item GONE was deleted',review:first.review});
  assert.deepEqual(second.review.removedWithCatalogItems,[{id:'a',item:'GONE',chosen:true}]);
  assert.equal(second.review.candidateFingerprint,catalogueFingerprint(rebuilt.selections));
  assert.deepEqual(second.guide.order,[guide.order[1]]);
});
