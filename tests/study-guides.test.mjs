import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {loadStudyGuides,studyGuideButton} from '../src/study-guide.mjs';
import {buildStudyGuides} from '../scripts/build-compilation-pilot.mjs';
import {recordFilename} from '../src/record-file.mjs';

const id='A'.repeat(32),dataset='collections/fixture/';
test('only safe guides for the current dataset are offered; unavailable guides do not break reading',async()=>{
  const request=body=>async()=>({ok:true,json:async()=>body});
  const manifest={format:1,dataset,subjects:{[id]:'courage-pdf.html',['B'.repeat(32)]:'../../other.html'}};
  const guides=await loadStudyGuides(dataset,request(manifest));
  assert.deepEqual(guides,{[id]:'courage-pdf.html'});
  assert.match(studyGuideButton(guides,id),/href="\.\/study-guides\/courage-pdf.html" target="_blank" rel="noopener"/);
  assert.equal(studyGuideButton(guides,'missing'),'');
  assert.deepEqual(await loadStudyGuides('collections/new/',request(manifest)),{});
  assert.deepEqual(await loadStudyGuides(dataset,async()=>{throw Error('Unavailable');}),{});
});

async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pi-study-guides-')),out=path.join(root,'dist');
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const write=async(name,value)=>{const file=path.join(root,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,value);};
  const zip=(name,value)=>write('dist/'+dataset+name,gzipSync(JSON.stringify(value)));
  const config={id,slug:'sample',displayTitle:'Sample',introduction:'One editorial paragraph.',arc:'An editorial sequence.',order:[{key:'source:FIXTURE00001',why:'A source quotation.'},{key:'selection:unlinked',why:'An independent supplied quotation.'}],questions:['How might these passages inform one another?'],neighbors:[],references:[]};
  const selection={id:'linked',status:'confirmed',passage:'p',suppliedIds:['FIXTURE00001'],candidates:[{source:'FIXTURE00001',version:'v1',ranges:[{paragraph:1,start:0,end:6,text:'<Word>'}]}]};
  const data={subject:{id,name:'Sample'},sources:{FIXTURE00001:{citationCount:1}},selections:[selection,{...structuredClone(selection),id:'overlap'},{id:'unlinked',status:'unmatched',excerpt:'A supplied quotation.',original:'A supplied quotation. Its reference.',reference:'Its reference.',candidates:[],suppliedIds:[],provenance:{sourceCollection:'Evernote_scrape'}}]};
  const saveConfig=()=>write('study-guides/editorial.json',JSON.stringify({subjects:[config],method:'Fixture'}));
  await saveConfig();
  await zip('subjects/index.json.gz',{subjects:[data.subject],edges:[]});
  const saveData=()=>zip('subjects/'+id+'.json.gz',data);
  await saveData();
  await zip('data/'+recordFilename('FIXTURE00001'),{id:'FIXTURE00001',enVersion:'v1',author:'Author',metadata:{Authorized:'Y'},en:{paragraphs:[{plain:'<Word> in context.'}]},original:{paragraphs:[]},paired:false});
  for(const name of ['eb-garamond.ttf','eb-garamond-italic.ttf','scheherazade-new.ttf','EB-Garamond-OFL.txt','Scheherazade-New-OFL.txt'])await write('dist/fonts/'+name,'Fixture');
  await write('scripts/compilation-pilot.css','body {}');await write('scripts/compilation-pilot-view.js','// fixture');
  return {root,out,config,data,saveConfig,saveData,zip};
}

test('Continue exploring follows public graph connections in both directions and updates older guides',async t=>{
  const f=await fixture(t),b='B'.repeat(32),c='C'.repeat(32),d='D'.repeat(32),e='E'.repeat(32),u='F'.repeat(32);
  const subjects=[f.data.subject,...[[b,'Linked guide'],[c,'Connected <subject>'],[d,'Suggested'],[e,'Rejected'],[u,'Editorial only']].map(([id,name])=>({id,name}))];
  const edges=[{source:id,target:b,type:'related',status:'imported'},{source:c,target:id,type:'broader',status:'accepted'},{source:b,target:id,type:'related',status:'imported'},{source:id,target:d,type:'related',status:'suggested'},{source:id,target:e,type:'related',status:'rejected'},{source:id,target:id,type:'related',status:'imported'}];
  f.config.neighbors=[{id:u,relationship:'editorial exploration',invitation:'Unconnected invitation.',evidence:['linked']},{id:b,relationship:'recorded neighbor',invitation:'A verified connected invitation.',evidence:['linked']}];
  await f.saveConfig();
  for(const subject of subjects.slice(1))await f.zip('subjects/'+subject.id+'.json.gz',{...f.data,subject});
  await fs.writeFile(path.join(f.root,'study-guides/second-batch.json'),JSON.stringify({batchNumber:2,subjects:[{...f.config,id:b,slug:'connected',displayTitle:'Connected',neighbors:[]}]}));
  await f.zip('subjects/index.json.gz',{subjects,edges});
  await buildStudyGuides(f.root,f.out,dataset);
  const read=async()=>fs.readFile(path.join(f.out,'study-guides/sample-pdf.html'),'utf8');
  let pdf=await read(),links=pdf.match(/<ul class="connected-subjects">([\s\S]*?)<\/ul>/)[1];
  assert.equal((links.match(/<li>/g)||[]).length,2);
  assert.match(links,/href="connected-pdf.html"/);
  assert.ok(links.includes(`href="../subjects.html?subject=${c}"`));
  assert.match(links,/Connected &lt;subject&gt;/);
  assert.match(links,/A verified connected invitation/);
  assert.doesNotMatch(pdf,/Unconnected invitation|Editorial only|Suggested|Rejected/);
  const regular=await fs.readFile(path.join(f.out,'study-guides/sample.html'),'utf8');
  assert.doesNotMatch(regular,/Continue exploring|connected-subjects/);
  const exported=JSON.parse(await fs.readFile(path.join(f.out,'study-guides/compiled.json'),'utf8'));
  assert.deepEqual(exported.subjects.find(s=>s.id===id).connectedSubjects,[b,c]);
  // A changed published graph must update the already-authored guide on rebuild.
  await f.zip('subjects/index.json.gz',{subjects,edges:[{source:id,target:u,type:'related',status:'accepted'}]});
  await buildStudyGuides(f.root,f.out,dataset);
  pdf=await read();links=pdf.match(/<ul class="connected-subjects">([\s\S]*?)<\/ul>/)[1];
  assert.ok(links.includes(`subject=${u}`));assert.doesNotMatch(links,/connected-pdf.html|Connected &lt;subject&gt;/);
  await f.zip('subjects/index.json.gz',{subjects,edges:[]});
  await buildStudyGuides(f.root,f.out,dataset);
  assert.doesNotMatch(await read(),/Continue exploring|connected-subjects/);
});

test('guide build preserves all selections, merges overlaps, escapes text, and confines essays and questions to the PDF view',async t=>{
  const f=await fixture(t);
  f.config.references.push({label:'A comparative passage',url:'https://example.org/reading',note:'Consider the different meanings of a shared image.'});
  await f.saveConfig();
  const validation=await buildStudyGuides(f.root,f.out,dataset);
  assert.equal(validation.subjects[0].selections,3);
  assert.equal(validation.subjects[0].readingEntries,2);
  const read=name=>fs.readFile(path.join(f.out,'study-guides',name),'utf8');
  const regular=await read('sample.html'),pdf=await read('sample-pdf.html');
  assert.doesNotMatch(regular,/One editorial paragraph|How might these passages/);
  assert.match(pdf,/One editorial paragraph/);assert.match(pdf,/How might these passages/);
  assert.equal(validation.subjects[0].comparativeReadings,1);
  assert.doesNotMatch(regular,/Comparative reading|different meanings of a shared image/);
  assert.match(pdf,/href="https:\/\/example.org\/reading"/);
  assert.ok(pdf.indexOf('Comparative reading')<pdf.indexOf('<section id="questions"'));
  assert.match(pdf,/&lt;Word&gt;/);assert.doesNotMatch(pdf,/<Word>/);
  assert.match(pdf,/A supplied quotation\./);
  const compiled=JSON.parse(await read('compiled.json')).subjects[0].compiled;
  assert.deepEqual(compiled.flatMap(g=>g.selectionIds).sort(),['linked','overlap','unlinked']);
  assert.equal(compiled[0].paragraphs[0].text,'<Word> in context.');
  assert.deepEqual(compiled[0].selectedParagraphs,[{number:1,ranges:[{start:0,end:6}]}]);
  assert.equal(compiled[0].sentenceContextExpanded,true);
  const review=JSON.parse(await read('sentence-review.json'));
  assert.equal(review.entriesChecked,2);
  assert.equal(review.expandedEntries,1);
  assert.match(regular,/href="\.\.\/subjects.html\?subject=A+&amp;print=1"/);
  assert.match(pdf,/href="\.\.\/subjects.html\?subject=A+"/);
});

test('an approximate catalogue reference retains the imported wording and is not called a confirmed quotation',async t=>{
  const f=await fixture(t),s=f.data.selections.find(s=>s.id==='unlinked');
  Object.assign(s,{status:'approximate',passage:'tentative',candidates:[structuredClone(f.data.selections[0].candidates[0])]});
  await f.saveData();await buildStudyGuides(f.root,f.out,dataset);
  const html=await fs.readFile(path.join(f.out,'study-guides/sample-pdf.html'),'utf8');
  assert.match(html,/passage alignment is approximate; supplied wording retained/);
  assert.match(html,/A supplied quotation\./);
  const result=JSON.parse(await fs.readFile(path.join(f.out,'study-guides/compiled.json'),'utf8')).subjects[0].compiled[1];
  assert.equal(result.source,null);assert.equal(result.catalogueReference.status,'approximate');
  assert.equal(result.excerpt,'A supplied quotation.');
});

test('a single quotation group preserves all its selections and has no questions or dead question link',async t=>{
  const f=await fixture(t);
  f.data.selections.pop();f.config.order.pop();f.config.questions=[];
  await f.saveData();await f.saveConfig();
  const validation=await buildStudyGuides(f.root,f.out,dataset);
  assert.equal(validation.subjects[0].selections,2);
  assert.equal(validation.subjects[0].readingEntries,1);
  assert.equal(validation.subjects[0].questions,0);
  const pdf=await fs.readFile(path.join(f.out,'study-guides/sample-pdf.html'),'utf8');
  assert.match(pdf,/One editorial paragraph/);
  assert.doesNotMatch(pdf,/id="questions"|href="#questions"|Questions for reflection/);
  f.config.questions.push('An impermissible question?');await f.saveConfig();
  await assert.rejects(buildStudyGuides(f.root,f.out,dataset),/fewer than quotations/);
});

test('reviewed approximate references can restore exact sentence context without promoting the match',async t=>{
  const f=await fixture(t),s=f.data.selections[2];
  Object.assign(s,{excerpt:'this complete sentence needs its conclusion',original:'this complete sentence needs its conclusion. Printed reference.',status:'approximate',candidates:[structuredClone(f.data.selections[0].candidates[0])]});
  await f.saveData();
  await f.zip('data/'+recordFilename('FIXTURE00001'),{id:'FIXTURE00001',enVersion:'v1',metadata:{},en:{paragraphs:[{plain:'<Word> in context. Before we begin, this complete sentence needs its conclusion.'}]},original:{paragraphs:[]}});
  const context={slug:'sample',key:'selection:unlinked',source:'FIXTURE00001',sourceVersion:'v1',suppliedSha256:createHash('sha256').update(s.original).digest('hex'),referenceBasis:'published-approximate-reference'};
  await fs.writeFile(path.join(f.root,'study-guides/sentence-context.json'),JSON.stringify({entries:[context]}));
  await buildStudyGuides(f.root,f.out,dataset);
  const entry=JSON.parse(await fs.readFile(path.join(f.out,'study-guides/compiled.json'),'utf8')).subjects[0].compiled[1];
  assert.equal(entry.source,null);assert.equal(entry.catalogueReference.status,'approximate');
  assert.equal(entry.excerpt,s.excerpt);assert.equal(entry.paragraphs[0].text,'Before we begin, this complete sentence needs its conclusion.');
  s.status='ambiguous';await f.saveData();
  await assert.rejects(buildStudyGuides(f.root,f.out,dataset),/Stale or uncited sentence context/);
  s.status='approximate';s.candidates[0].source='BH00002';await f.saveData();
  await assert.rejects(buildStudyGuides(f.root,f.out,dataset),/Stale or uncited sentence context/);
});

test('unavailable sentence context is flagged without inventing missing wording',async t=>{
  const f=await fixture(t);
  f.data.selections[2].excerpt='...begins within a thought and stops';
  await f.saveData();
  await buildStudyGuides(f.root,f.out,dataset);
  const compiled=JSON.parse(await fs.readFile(path.join(f.out,'study-guides/compiled.json'),'utf8'));
  const entry=compiled.subjects[0].compiled[1];
  assert.equal(entry.excerpt,'...begins within a thought and stops');
  assert.ok(entry.boundaryIssues.includes('ending lacks a sentence terminator'));
  const pdf=await fs.readFile(path.join(f.out,'study-guides/sample-pdf.html'),'utf8');
  assert.match(pdf,/Sentence boundary needs source review/);
});

test('reviewed supplied context preserves unlinked identity and refuses stale wording',async t=>{
  const f=await fixture(t),selection=f.data.selections[2];
  selection.excerpt='this complete sentence needs its conclusion';
  selection.original=selection.excerpt+' FIXTURE00001';selection.reference='FIXTURE00001';selection.suppliedIds=['FIXTURE00001'];
  await f.saveData();
  await fs.writeFile(path.join(f.out,dataset,'data',recordFilename('FIXTURE00001')),gzipSync(JSON.stringify({id:'FIXTURE00001',enVersion:'v1',metadata:{},en:{paragraphs:[{plain:'<Word> in context. Before we begin, this complete sentence needs its conclusion. A following sentence.'}]},original:{paragraphs:[]}})));
  const context={slug:'sample',key:'selection:unlinked',source:'FIXTURE00001',sourceVersion:'v1',suppliedSha256:createHash('sha256').update(selection.original).digest('hex')};
  await fs.writeFile(path.join(f.root,'study-guides/sentence-context.json'),JSON.stringify({entries:[context]}));
  await buildStudyGuides(f.root,f.out,dataset);
  const entry=JSON.parse(await fs.readFile(path.join(f.out,'study-guides/compiled.json'),'utf8')).subjects[0].compiled[1];
  assert.equal(entry.source,null);assert.equal(entry.sentenceContextSource,'FIXTURE00001');
  assert.equal(entry.excerpt,selection.excerpt);assert.equal(entry.reference,'FIXTURE00001');
  assert.equal(entry.paragraphs[0].text,'Before we begin, this complete sentence needs its conclusion.');
  selection.original+=' changed';await f.saveData();
  await assert.rejects(buildStudyGuides(f.root,f.out,dataset),/Stale or uncited sentence context/);
});

test('the latest numbered batch is featured even when its filename sorts earlier',async t=>{
  const f=await fixture(t);
  for(const [batchNumber,name,letter] of [[3,'third','B'],[4,'fourth','C']]){
    const config={...f.config,id:letter.repeat(32),slug:name,displayTitle:name};
    await fs.writeFile(path.join(f.root,'study-guides',name+'-batch.json'),JSON.stringify({batchNumber,subjects:[config]}));
    await fs.writeFile(path.join(f.out,dataset,'subjects',config.id+'.json.gz'),gzipSync(JSON.stringify({...f.data,subject:{id:config.id,name}})));
  }
  const validation=await buildStudyGuides(f.root,f.out,dataset);
  assert.deepEqual(validation.subjects.map(s=>s.name),['fourth','Sample','third']);
  const overview=await fs.readFile(path.join(f.out,'study-guides/index.html'),'utf8');
  const cards=overview.match(/<article class="sample">[\s\S]*?<\/article>/g);
  assert.match(cards[0],/· New/);assert.match(cards[0],/fourth-pdf\.html/);
  assert.doesNotMatch(cards.slice(1).join(''),/· New/);
});

test('build refuses stale source wording, incomplete ordering, and too many questions for grouped quotations',async t=>{
  const f=await fixture(t);
  f.data.selections[0].candidates[0].ranges[0].text='Altered';await f.saveData();
  await assert.rejects(buildStudyGuides(f.root,f.out,dataset),/Quotation mismatch/);
  f.data.selections[0].candidates[0].ranges[0].text='<Word>';await f.saveData();
  f.config.questions.push('A second question?');await f.saveConfig();
  await assert.rejects(buildStudyGuides(f.root,f.out,dataset),/fewer than quotations/);
  f.config.questions.pop();f.config.order.pop();await f.saveConfig();
  await assert.rejects(buildStudyGuides(f.root,f.out,dataset),/every group exactly once/);
});
