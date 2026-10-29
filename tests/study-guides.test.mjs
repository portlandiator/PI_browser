import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {loadStudyGuides,loadGuideOpening,studyGuideButton,studyGuideQuotation,fitQuotation} from '../src/study-guide.mjs';
import {buildStudyGuides} from '../scripts/build-compilation-pilot.mjs';
import {recordFilename} from '../src/record-file.mjs';
import {catalogueFingerprint} from '../scripts/study-guide-catalogue.mjs';

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

test('Subject view shows a guide’s first quotation in quotation marks with its catalog number, linked to the guide, only for the current dataset',async()=>{
  const requested=[],request=body=>async url=>{requested.push(url);return {ok:true,json:async()=>body};};
  const guides={[id]:'courage-pdf.html'},paragraphs=['<First> reading.','… Second paragraph.'],opening={format:1,dataset,paragraphs,source:'AB<1>'};
  const loaded=await loadGuideOpening(guides,dataset,id,request(opening));
  assert.deepEqual(loaded,{paragraphs,authorized:[false,false],source:'AB<1>'});assert.deepEqual(requested,[`./study-guides/openings/${id}.json`]);
  assert.equal(await loadGuideOpening({},dataset,id,request(opening)),null);assert.equal(requested.length,1);
  assert.equal(await loadGuideOpening(guides,dataset,id,request({...opening,paragraphs:[]})),null);
  assert.equal(await loadGuideOpening(guides,dataset,id,request({...opening,paragraphs:[3]})),null);
  assert.deepEqual(await loadGuideOpening(guides,dataset,id,request({...opening,source:undefined})),{paragraphs,authorized:[false,false],source:''});
  // Only paragraphs the build declares authorized are blue.
  const marked=await loadGuideOpening(guides,dataset,id,request({...opening,authorized:[false,true,true]}));
  assert.deepEqual(marked.authorized,[false,true]);
  assert.deepEqual((await loadGuideOpening(guides,dataset,id,request({...opening,authorized:['yes',1]}))).authorized,[false,false]);
  assert.match(studyGuideQuotation(guides,marked,id),/<blockquote><p>“&lt;First&gt; reading\.<\/p><p class="authorized-translation">… Second paragraph\.” <span/);
  const html=studyGuideQuotation(guides,loaded,id);
  assert.match(html,/^<a class="subject-guide-quotation" href="\.\/study-guides\/courage-pdf.html" target="_blank" rel="noopener"/);
  assert.match(html,/<blockquote><p>“&lt;First&gt; reading\.<\/p><p>… Second paragraph\.” <span class="quotation-source">AB&lt;1&gt;<\/span><\/p><\/blockquote>/);
  assert.match(studyGuideQuotation(guides,{paragraphs:['Only.'],source:''},id),/<blockquote><p>“Only\.”<\/p><\/blockquote>/);
  assert.equal(studyGuideQuotation({},loaded,id),'');
  assert.equal(studyGuideQuotation(guides,null,id),'');
  assert.equal(await loadGuideOpening(guides,'collections/new/',id,request(opening)),null);
  assert.equal(await loadGuideOpening(guides,dataset,id,async()=>{throw Error('Unavailable');}),null);
});

test('a quotation taller than the graph keeps the most whole words that fit, ending in an ellipsis before its catalog number',()=>{
  // One pixel of height per character of the rendered paragraphs.
  const quote={innerHTML:'',getBoundingClientRect(){return {height:this.innerHTML.replace(/<[^>]+>/g,'').length};}};
  const opening={paragraphs:['One two three.','Four five, six seven.'],source:'AB1'},cite=' <span class="quotation-source">AB1</span>';
  assert.equal(fitQuotation(quote,opening,100),false);assert.equal(quote.innerHTML,`<p>“One two three.</p><p>Four five, six seven.”${cite}</p>`);
  assert.equal(fitQuotation(quote,opening,0),false);assert.equal(quote.innerHTML,`<p>“One two three.</p><p>Four five, six seven.”${cite}</p>`);
  assert.equal(fitQuotation(quote,opening,30),true);assert.equal(quote.innerHTML,`<p>“One two three.</p><p>Four five…”${cite}</p>`);
  assert.equal(fitQuotation(quote,opening,12),true);assert.equal(quote.innerHTML,`<p>“One…”${cite}</p>`);
  assert.equal(fitQuotation(quote,{paragraphs:['<a> b c'],source:''},5),true);assert.equal(quote.innerHTML,'<p>“&lt;a&gt;…”</p>');
  // A shortened quotation keeps each remaining paragraph's authorization colour.
  const counted={innerHTML:'',getBoundingClientRect(){return {height:this.innerHTML.replace(/<[^>]+>/g,'').length};}};
  assert.equal(fitQuotation(counted,{...opening,authorized:[true,false]},30),true);assert.equal(counted.innerHTML,`<p class="authorized-translation">“One two three.</p><p>Four five…”${cite}</p>`);
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
  await write('scripts/compilation-pilot.css','body {}');await write('scripts/compilation-pilot-view.js','// fixture');await write('scripts/compilation-guide-index.js','// fixture');await write('scripts/compilation-guide-site.js','// fixture');await write('src/index.html',await fs.readFile(new URL('../src/index.html',import.meta.url)));await write('src/theme.css',await fs.readFile(new URL('../src/theme.css',import.meta.url)));
  return {root,out,config,data,saveConfig,saveData,zip};
}

test('selected guide uses its reviewed IDs while the original subject and full guides retain coverage',async t=>{
 const f=await fixture(t);
 f.data.selections.splice(2,0,...Array.from({length:298},(_,i)=>({...structuredClone(f.data.selections[0]),id:'extra'+i})));
 await f.zip('data/'+recordFilename('FIXTURE00001'),{id:'FIXTURE00001',enVersion:'v1',metadata:{Authorized:'Y2'},en:{paragraphs:[{plain:'<Word> in context.'},{plain:'Other authorized wording.'}]},original:{paragraphs:[]}});
 await f.saveData();
 const selected=f.data.selections.filter(s=>s.id!=='extra0'),review={subject:id,status:'finalized_before_analysis',selectionBeforeAnalysis:true,target:300,candidateCount:301,selectedCount:300,mandatoryAuthorizedCount:0,candidateFingerprint:catalogueFingerprint(f.data.selections),selected:selected.map(s=>({id:s.id,source:s.candidates[0]?.source,sourceVersion:s.candidates[0]?.version,authorizedParagraphs:[],reason:'Chosen relevance.'})),omitted:[{id:'extra0'}],importedAuthorityReview:[{id:'unlinked',finding:'Supplied original checked.',url:'https://example.org/source',authorization:'English original.'}]};
 const raw=JSON.stringify(review),reviewPath=path.join(f.root,'study-guides/selections/sample.json');await fs.mkdir(path.dirname(reviewPath));await fs.writeFile(reviewPath,raw);
 f.config.selection={review:'selections/sample.json',sha256:createHash('sha256').update(raw).digest('hex'),ids:selected.map(s=>s.id)};await f.saveConfig();
 const validation=await buildStudyGuides(f.root,f.out,dataset);
 assert.equal(validation.subjects[0].selections,300);assert.equal(validation.subjects[0].readingEntries,2);assert.equal(validation.subjects[0].candidateSelections,301);
 const html=await fs.readFile(path.join(f.out,'study-guides/sample-pdf.html'),'utf8');assert.match(html,/300 chosen quotations from 301/);
 const regular=await fs.readFile(path.join(f.out,'study-guides/sample.html'),'utf8');assert.doesNotMatch(regular,/All currently public selections are retained|complete sample/);
 const index=await fs.readFile(path.join(f.out,'study-guides/index.html'),'utf8');assert.doesNotMatch(index,/retain all 300/);assert.match(index,/<span class="guide-count">300 out of 301 quotations<\/span>/);
 const unchanged=JSON.parse((await import('node:zlib')).gunzipSync(await fs.readFile(path.join(f.out,dataset,'subjects/'+id+'.json.gz'))));assert.deepEqual(unchanged,f.data);
 const compiled=JSON.parse(await fs.readFile(path.join(f.out,'study-guides/compiled.json'))).subjects[0];assert.deepEqual(compiled.compiled.flatMap(g=>g.selectionIds).sort(),selected.map(s=>s.id).sort());
 // Invalid selection reviews stop before replacing a previously built page.
 f.config.selection.ids[0]='unknown';await f.saveConfig();await assert.rejects(buildStudyGuides(f.root,f.out,dataset),/unknown ID/);assert.equal(await fs.readFile(path.join(f.out,'study-guides/sample-pdf.html'),'utf8'),html);
 delete f.config.selection;await f.saveConfig();assert.equal((await buildStudyGuides(f.root,f.out,dataset)).subjects[0].selections,301);
});

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
  // The first reading is published for Subject view as unescaped plain text.
  assert.deepEqual(JSON.parse(await read(`openings/${id}.json`)),{format:1,dataset,paragraphs:['<Word> in context.'],authorized:[true],source:'FIXTURE00001'});
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

test('the overview lists one line per guide, by centrality and then title, with a sort control',async t=>{
  const f=await fixture(t),subjects=[f.data.subject];
  for(const [batchNumber,name,letter] of [[3,'third','B'],[4,'fourth','C']]){
    const config={...f.config,id:letter.repeat(32),slug:name,displayTitle:name+' guide'};
    subjects.push({id:config.id,name,...(name==='third'?{color:'#D32B1E'}:{})});
    await fs.writeFile(path.join(f.root,'study-guides',name+'-batch.json'),JSON.stringify({batchNumber,subjects:[config]}));
    await fs.writeFile(path.join(f.out,dataset,'subjects',config.id+'.json.gz'),gzipSync(JSON.stringify({...f.data,subject:{id:config.id,name}})));
  }
  const b='B'.repeat(32),c='C'.repeat(32);
  await f.zip('subjects/index.json.gz',{subjects,edges:[{source:b,target:id,type:'related',status:'imported'},{source:b,target:c,type:'related',status:'imported'}]});
  await fs.writeFile(path.join(f.root,'src/subject-order.json'),JSON.stringify({groups:[{id:'I.',title:'I.',subjects:['fourth']},{id:'II.',title:'II.',subjects:['third']}]}));
  const validation=await buildStudyGuides(f.root,f.out,dataset);
  assert.deepEqual(validation.subjects.map(s=>s.name),['fourth','Sample','third']);
  const overview=await fs.readFile(path.join(f.out,'study-guides/index.html'),'utf8');
  const rows=overview.match(/<ol class="guide-list" id="guide-list">([\s\S]*?)<\/ol>/)[1].match(/<li[\s\S]*?<\/li>/g);
  assert.deepEqual(rows.map(r=>r.match(/href="([a-z]+)-pdf\.html"/)[1]),['third','fourth','sample']);
  assert.match(rows[0],/data-centrality="2"/);assert.match(rows[0],/data-thematic="1"/);assert.match(rows[1],/data-thematic="0"/);assert.match(rows[2],/data-thematic="2"/);
  assert.match(rows[0],/<span class="guide-title">third guide<\/span><span class="guide-count">3 quotations<\/span>/);
  // Each guide title takes its subject's colour, with Subject view's day and night shades.
  assert.match(rows[0],/<li [^>]*style="--subject-color:var\(--subject-d32b1e,#d32b1e\);/);assert.match(rows[1],/style="--subject-color:var\(--ink\);/);
  const css=await fs.readFile(path.join(f.out,'study-guides/pilot.css'),'utf8');assert.match(css,/^:root\{--subject-d32b1e:#D32B1E;/m);assert.match(css,/^:root\[data-theme=dark\]\{--subject-d32b1e:#F16B60;/m);
  assert.doesNotMatch(overview,/guide-subject/);
  assert.match(overview,/<p class="lead">Passages curated for thematic exploration\.<\/p>/);
  // The masthead is Catalog view's, rebased, with Study guides as the current view.
  assert.match(overview,/<header class="masthead">[\s\S]*<a class="brand" href="\.\.\/"[\s\S]*<nav aria-label="Main navigation"><a href="\.\.\/">Catalog<\/a><a href="\.\.\/volume-view\.html">Volumes<\/a><a href="\.\.\/subjects\.html">Subjects<\/a><a href="index\.html" class="active" aria-current="page">Study guides<\/a><button id="about-open"[\s\S]*id="theme-toggle"[\s\S]*<\/header>/);
  assert.match(overview,/<dialog id="about-dialog" data-stats="\.\.\/about-stats\.mjs"/);assert.match(overview,/<script src="site\.js" defer>/);
  const guide=await fs.readFile(path.join(f.out,'study-guides/third-pdf.html'),'utf8');
  assert.match(guide,/<h1>third guide<\/h1><p class="guide-subtitle">third<\/p>/);
  assert.match(overview,/<select id="guide-sort"><option value="centrality" selected>Graph centrality<\/option><option value="thematic">Thematic<\/option><option value="alphabetical">Alphabetical<\/option><option value="quotations">Number of quotations<\/option><\/select>/);
  assert.match(overview,/src="guide-index.js"/);assert.match(overview,/localStorage\.getItem\('pi-theme'\)/);
  assert.match(overview,/<h1 class="overview-title">Ways into deeper reading<\/h1>/);
  assert.doesNotMatch(overview,/· New|class="sample"|These guides contain|class="intro-note"|About these study guides/);
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

test('a shortened reading shows only its kept whole sentences, verbatim, and keeps the full passage as context',async t=>{
  const f=await fixture(t),plain='<Word> in context. A middle sentence. The essential idea.',second='A following paragraph.';
  await f.zip('data/'+recordFilename('FIXTURE00001'),{id:'FIXTURE00001',enVersion:'v1',metadata:{Authorized:'Y2'},en:{paragraphs:[{plain},{plain:second}]},original:{paragraphs:[]},paired:false});
  f.data.selections[0].candidates[0].ranges=[{paragraph:1,start:0,end:plain.length,text:plain},{paragraph:2,start:0,end:second.length,text:second}];
  f.data.selections[1].candidates[0].ranges=[{paragraph:1,start:0,end:6,text:'<Word>'}];
  f.data.selections[2].excerpt='First supplied sentence. Second supplied sentence. Third supplied sentence.';
  await f.saveData();
  f.config.order[0].shortened=['<Word> in context.','The essential idea.',second];
  f.config.order[1].shortened=['Second supplied sentence. Third supplied sentence.'];
  await f.saveConfig();
  await buildStudyGuides(f.root,f.out,dataset);
  const read=name=>fs.readFile(path.join(f.out,'study-guides',name),'utf8');
  const pdf=await read('sample-pdf.html');
  assert.match(pdf,/<blockquote><p>&lt;Word&gt; in context\. … The essential idea\.<\/p><p class="authorized">A following paragraph\.<\/p><\/blockquote>/);
  assert.match(await read('sample.html'),/<mark>&lt;Word&gt; in context\.<\/mark> A middle sentence\. <mark>The essential idea\.<\/mark>/);
  assert.match(pdf,/<blockquote><p>Second supplied sentence\. Third supplied sentence\.<\/p><\/blockquote>/);
  const compiled=JSON.parse(await read('compiled.json')).subjects[0].compiled;
  assert.equal(compiled[0].shortened,true);assert.equal(compiled[0].paragraphs[0].text,'<Word> in context. … The essential idea.');
  // Kept wording must be verbatim whole sentences of the passage, in order.
  for(const [kept,message] of [[['A middle'],/sentence boundaries/],[['The essential idea.','<Word> in context.'],/out of order/],[['An invented sentence.'],/not in the passage/],[[plain,second],/whole passage/]]){
    f.config.order[0].shortened=kept;await f.saveConfig();
    await assert.rejects(buildStudyGuides(f.root,f.out,dataset),message);
  }
  // A passage with an authorized translation keeps authorized wording.
  f.config.order[0].shortened=['The essential idea.'];await f.saveConfig();
  await assert.rejects(buildStudyGuides(f.root,f.out,dataset),/omits its authorized wording/);
});

test('an omitted reading is left out of the guide but stays covered, and authorized wording cannot be omitted',async t=>{
  const f=await fixture(t);
  f.config.order[1].omitted=true;f.config.questions=[];await f.saveConfig();
  const validation=await buildStudyGuides(f.root,f.out,dataset);
  assert.equal(validation.subjects[0].readingEntries,1);assert.equal(validation.subjects[0].omittedEntries,1);
  const pdf=await fs.readFile(path.join(f.out,'study-guides/sample-pdf.html'),'utf8');
  assert.doesNotMatch(pdf,/A supplied quotation/);assert.doesNotMatch(pdf,/reading-2/);
  const exported=JSON.parse(await fs.readFile(path.join(f.out,'study-guides/compiled.json'),'utf8')).subjects[0];
  assert.deepEqual(exported.compiled.map(x=>x.key),['source:FIXTURE00001']);
  assert.deepEqual(exported.omitted,[{key:'selection:unlinked',selectionIds:['unlinked']}]);
  // Questions follow the readings shown.
  f.config.questions=['A question?'];await f.saveConfig();
  await assert.rejects(buildStudyGuides(f.root,f.out,dataset),/fewer than quotations/);
  // The linked passage is authorized, so it cannot be left out.
  f.config.questions=[];f.config.order[1].omitted=undefined;f.config.order[0].omitted=true;await f.saveConfig();
  await assert.rejects(buildStudyGuides(f.root,f.out,dataset),/Omitted reading has authorized wording: sample reading 1/);
  f.config.order[0].omitted='yes';await f.saveConfig();
  await assert.rejects(buildStudyGuides(f.root,f.out,dataset),/Invalid omitted reading/);
  f.config.order[0].omitted=true;f.config.order[1].omitted=true;await f.saveConfig();
  await assert.rejects(buildStudyGuides(f.root,f.out,dataset),/Every reading is omitted/);
});

test('the editor lists a reading’s whole sentences and rebuilds kept sentences exactly as the build checks them',async t=>{
  const f=await fixture(t),plain='<Word> in context. A middle sentence. The essential idea.',second='A following paragraph.';
  await f.zip('data/'+recordFilename('FIXTURE00001'),{id:'FIXTURE00001',enVersion:'v1',metadata:{Authorized:'Y2'},en:{paragraphs:[{plain},{plain:second}]},original:{paragraphs:[]},paired:false});
  f.data.selections[0].candidates[0].ranges=[{paragraph:1,start:0,end:plain.length,text:plain},{paragraph:2,start:0,end:second.length,text:second}];
  f.data.selections[1].candidates[0].ranges=[{paragraph:1,start:0,end:6,text:'<Word>'}];
  await f.saveData();
  const {readingPassage,shortenedFrom}=await import('../scripts/study-guide-passage.mjs');
  const {gunzipSync}=await import('node:zlib');
  const read=async name=>JSON.parse(gunzipSync(await fs.readFile(path.join(f.out,dataset,name))));
  const guide={...f.config,order:[{...f.config.order[0],shortened:['<Word> in context.',second]},f.config.order[1]]};
  delete guide.selection;
  const reading=await readingPassage({guide,key:'source:FIXTURE00001',read});
  assert.deepEqual(reading.sentences.map(s=>[s.text,s.kept,s.authorized]),[['<Word> in context.',true,false],['A middle sentence.',false,false],['The essential idea.',false,false],[second,true,true]]);
  assert.equal(reading.mandatory,true);
  assert.deepEqual(shortenedFrom(reading.sentences,[0,1,3]),['<Word> in context. A middle sentence.',second]);
  assert.equal(shortenedFrom(reading.sentences,[0,1,2,3]),undefined);
  reading.check(shortenedFrom(reading.sentences,[1,2,3]));
  assert.throws(()=>reading.check(shortenedFrom(reading.sentences,[1,2])),/authorized translation/);
  const supplied=await readingPassage({guide,key:'selection:unlinked',read});
  assert.deepEqual(supplied.sentences.map(s=>s.text),['A supplied quotation.']);assert.equal(supplied.mandatory,false);
});


test('explicitly reviewed word boundaries survive guide rendering and source context remains available',async t=>{
 const f=await fixture(t);
 for(const s of f.data.selections.filter(s=>s.passage)){
  s.preserveBoundaries=true;
  s.candidates[0].ranges=[{paragraph:1,start:7,end:9,text:'in'}];
 }
 await f.saveData();await buildStudyGuides(f.root,f.out,dataset);
 const compiled=JSON.parse(await fs.readFile(path.join(f.out,'study-guides/compiled.json'))).subjects[0].compiled[0];
 assert.equal(compiled.paragraphs[0].text,'in');
 const {readingPassage}=await import('../scripts/study-guide-passage.mjs');
 const {gunzipSync}=await import('node:zlib');
 const read=async name=>JSON.parse(gunzipSync(await fs.readFile(path.join(f.out,dataset,name))));
 const preview=await readingPassage({guide:f.config,key:'source:FIXTURE00001',read});
 assert.deepEqual(preview.sentences.map(s=>s.text),['in']);
 assert.equal(compiled.sentenceContextExpanded,false);
 assert.deepEqual(compiled.paragraphs[0].ranges,[{start:7,end:9}]);
 // Source context is in the regular view; the PDF view, which hides it, is published without it.
 const html=await fs.readFile(path.join(f.out,'study-guides/sample.html'),'utf8');
 assert.match(html,/<mark>in<\/mark> context\./);
 assert.doesNotMatch(await fs.readFile(path.join(f.out,'study-guides/sample-pdf.html'),'utf8'),/class="context"/);
});
