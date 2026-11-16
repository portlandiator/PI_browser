import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {relations,copyrightWordLimit,words,firstReadings,guideSections,guideStretches,authorizedRank,sectionShares,proportionalReadings,stretchReadings,ruleFor,cutGuide,questionRange,validateOutsideLibrary,validateOutsidePlan,planReadings,combinedSequence,readOutside,decodeEntities,pageText,comparable,findQuotation} from '../scripts/study-guide-outside.mjs';
import {verifyOutsideQuotations,guideQuotationIds,recordChecks} from '../scripts/verify-outside-quotations.mjs';
import {outsideGuideBody,guideArticles,citation} from '../scripts/outside-guide-page.mjs';
import {parseArguments,cutPassage,passageContext,articleParagraphs,guideView,guideParts,startPlan,currentCut,briefText,findQuotations,quotationEntry,placeQuotation,planSummary,planProblems,previewDocument,overviewRows,eraOf} from '../scripts/outside-guide.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

const quotation=(extra={})=>({text:'No man is an island.',author:'John Donne',work:'Devotions',locator:'Meditation XVII',year:'1624',sortYear:1624,tradition:'English literature',kind:'literature',
  source:{url:'https://example.org/donne',label:'Example library',checked:'2026-11-16',status:'primary'},rights:{status:'public-domain',note:'Published 1624.'},...extra});
const library=(quotations={donne:quotation()})=>({format:1,quotations});
const reading=(key,position,selections=1)=>({key,position,selectionIds:Array.from({length:selections},(_,i)=>key+i),source:'SRC'+position,paragraphs:[{authorized:position===1}]});
const plan=(outside,extra={})=>({format:2,slug:'sample',subject:'S',status:'draft',limit:3,rule:'first',readings:2,quotations:3,kept:['a','b'],introduction:'One paragraph.',questions:['One?','Two?','Three?'],outside,...extra});
// A guide of three named sections (two readings each) and one reading after them under a note of its own.
const sectioned=(authorized=[1])=>{
  const compiled=[reading('a',1,2),reading('b',2),reading('c',3),reading('d',4),reading('e',5),reading('f',6),reading('g',7)];
  for(const entry of compiled)entry.paragraphs=[{authorized:authorized.includes(entry.position)}];
  return {id:'S',slug:'sample',displayTitle:'Sample subject',arc:'First part → Second part → Third part',introduction:'The guide’s own introduction.',questions:['Its own question?'],
    order:[['a','one'],['b','one'],['c','two'],['d','two'],['e','three'],['f','three'],['g','added later']].map(([key,why])=>({key,why})),compiled};
};
const place=(id,after,extra={})=>({id,after,responds:[after],relation:'adjacent',why:'It says of one death what the reading says of the whole body of humankind, in a single image.',...extra});
const temporary=async t=>{const folder=await fs.mkdtemp(path.join(os.tmpdir(),'pi-outside-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));return folder;};

test('the first readings stay within the quotation limit and keep reading order',()=>{
  const compiled=[reading('a',1,2),reading('b',2),reading('c',3,2),reading('d',4)];
  assert.deepEqual(firstReadings(compiled,3).readings.map(r=>r.key),['a','b']);
  assert.equal(firstReadings(compiled,3).quotations,3);
  // A reading that would pass the limit ends the cut, even when a later one would fit.
  assert.deepEqual(firstReadings(compiled,4),{readings:compiled.slice(0,2),quotations:3});
  assert.equal(firstReadings(compiled,100).quotations,6);
  assert.throws(()=>firstReadings(compiled,0),/limit/);
});

test('a guide is divided into the sections its arc names, or not at all',()=>{
  const guide=sectioned(),divided=guideSections(guide);
  assert.deepEqual(divided.sections.map(section=>[section.name,section.note,section.readings.map(r=>r.key).join('')]),[['First part','one','ab'],['Second part','two','cd'],['Third part','three','ef']]);
  assert.deepEqual(divided.beyond.map(r=>r.key),['g']);
  // Fewer runs of readings than named parts, a part of one reading, a second block after the parts, or an arc of one sentence: no sections.
  assert.equal(guideSections({...guide,arc:'First → Second → Third → Fourth → Fifth'}),null);
  assert.equal(guideSections({...guide,arc:'First → Second → Third → Fourth'}),null);
  assert.equal(guideSections({...guide,arc:'First → Second'}),null);
  assert.equal(guideSections({...guide,arc:'Begin with one image, then explore another.'}),null);
  assert.equal(guideSections({...guide,order:guide.order.map(item=>({...item,why:'note for '+item.key}))}),null);
});

test('each section has its share of the limit, by largest remainder',()=>{
  assert.deepEqual(sectionShares([35,44,28,48,52,33,30,12],100),[12,16,10,17,18,12,11,4]);
  assert.deepEqual(sectionShares([3,2,2],4),[2,1,1]);
  // On a tie the earlier section has the quotation; a guide within the limit is not cut.
  assert.deepEqual(sectionShares([2,2,2],4),[2,1,1]);
  assert.deepEqual(sectionShares([3,2,2],7),[3,2,2]);assert.deepEqual(sectionShares([3,2,2],50),[3,2,2]);
  assert.throws(()=>sectionShares([3,2],1.5),/limit/);
});

test('the proportional cut takes authorized readings first and keeps reading order',()=>{
  assert.deepEqual([reading('a',1),{paragraphs:[{authorized:true},{authorized:false}]},{paragraphs:[{authorized:false}]},{paragraphs:[]}].map(authorizedRank),[0,1,2,2]);
  // Shares 2, 1, 1: the authorized reading of each section is taken although a provisional one comes first.
  const guide=sectioned([1,4,6]),cut=proportionalReadings(guide,4);
  assert.deepEqual(cut.readings.map(r=>r.key),['a','d','f']);assert.equal(cut.quotations,4);assert.deepEqual(cut.shares,[2,1,1]);
  // No authorized reading: reading order decides. The reading after the named sections is never taken.
  assert.deepEqual(proportionalReadings(sectioned([]),4).readings.map(r=>r.key),['a','c','e']);
  assert.deepEqual(proportionalReadings(sectioned([7]),4).readings.map(r=>r.key),['a','c','e']);
  // An authorized reading too large for what is left of the share is passed over for one that fits.
  assert.deepEqual(proportionalReadings(sectioned([1,2]),3).readings.map(r=>r.key),['b','c','e']);
  // A share that no reading of its section fits passes on to the readings not yet taken, wherever they fit.
  const wide=sectioned([]);wide.compiled[1].selectionIds=['b0','b1'];
  assert.deepEqual(sectionShares([4,2,2],3),[1,1,1]);
  assert.deepEqual(proportionalReadings(wide,3).readings.map(r=>r.key),['c','d','e']);
  const tight=sectioned([]);tight.compiled[2].selectionIds=['c0','c1'];tight.compiled[3].selectionIds=['d0','d1'];
  assert.deepEqual(sectionShares([3,4,2],4),[1,2,1]);
  assert.deepEqual(proportionalReadings(tight,4).readings.map(r=>r.key),['b','c','e']);
  const spare=sectioned([]);spare.compiled[2].selectionIds=['c0','c1','c2'];spare.compiled[3].selectionIds=['d0','d1','d2'];
  // The second section's share of 2 fits neither of its readings of 3, so the first section gives its other reading.
  assert.deepEqual(sectionShares([3,6,2],4),[1,2,1]);
  assert.deepEqual(proportionalReadings(spare,4).readings.map(r=>r.key),['a','b','e']);
  // A guide within the limit is kept whole, apart from what follows its sections.
  assert.deepEqual(proportionalReadings(sectioned(),50).readings.map(r=>r.key),['a','b','c','d','e','f']);
  assert.throws(()=>proportionalReadings({...guide,arc:'One sentence.'},4),/not divided into the sections/);
  assert.deepEqual(cutGuide(guide,{rule:'first',limit:3}).readings.map(r=>r.key),['a','b']);
  assert.deepEqual(cutGuide(guide,{rule:'proportional',limit:4}).readings.map(r=>r.key),['a','d','f']);
  assert.throws(()=>cutGuide(guide,{slug:'sample',rule:'random',limit:4}),/unknown rule/);
});

test('a guide without named sections is cut across equal stretches, and a guide within the limit is kept whole',()=>{
  const compiled=Array.from({length:20},(_,i)=>({...reading('r'+(i+1),i+1),paragraphs:[{authorized:i%2===1}]}));
  const guide={slug:'plain',arc:'Begin here, then go on.',order:compiled.map(entry=>({key:entry.key,why:'note for '+entry.key})),compiled};
  assert.equal(guideSections(guide),null);
  assert.deepEqual(guideStretches(guide).map(stretch=>stretch.readings.map(r=>r.position).join(',')),['1,2','3,4','5,6','7,8','9,10','11,12','13,14','15,16','17,18','19,20']);
  assert.equal(ruleFor(guide,100),'whole');assert.equal(ruleFor(guide,10),'stretches');assert.equal(ruleFor(sectioned(),4),'proportional');assert.equal(ruleFor(sectioned(),8),'whole');
  // One quotation from each stretch: the authorized reading of its two.
  const cut=cutGuide(guide,{slug:'plain',rule:'stretches',limit:10});
  assert.deepEqual(cut.readings.map(r=>r.position),[2,4,6,8,10,12,14,16,18,20]);assert.equal(cut.quotations,10);
  assert.deepEqual(stretchReadings(guide,10).shares,[1,1,1,1,1,1,1,1,1,1]);
  // A reading of several quotations belongs to the stretch its first quotation falls in; empty stretches drop out.
  assert.deepEqual(guideStretches({...guide,compiled:[reading('x',1,7),reading('y',2,2),reading('z',3)]}).map(stretch=>stretch.readings.map(r=>r.key).join('')),['x','y','z']);
  assert.equal(cutGuide(guide,{slug:'plain',rule:'whole',limit:100}).readings.length,20);
  assert.throws(()=>cutGuide(guide,{slug:'plain',rule:'whole',limit:10}),/now holds 20 quotations, more than the limit of 10/);
});

test('a library entry needs a checked source, known rights and brief wording when in copyright',()=>{
  assert.ok(validateOutsideLibrary(library()));
  const long=Array.from({length:copyrightWordLimit+1},()=>'word').join(' ');
  for(const [change,message] of [
    [q=>{q.source.url='http://example.org/x';},/https/],
    [q=>{delete q.source.checked;},/date it was checked/],
    [q=>{q.source.status='hearsay';},/primary or secondary/],
    [q=>{q.rights.status='unknown';},/rights/],
    [q=>{q.rights.status='in-copyright';q.text=long;},/limited to/],
    [q=>{q.rights.status='public-domain-us';q.text=long;},/limited to/],
    [q=>{q.text='two  spaces';},/one line/],
    [q=>{q.text='A line / another';},/verse/],
    [q=>{q.translationYear='1900';},/needs its translator/],
    [q=>{q.source.repair=[['arc']];},/pair of readings/],
    [q=>{q.sortYear='1624';},/sortYear/],
    [q=>{q.kind='rumour';},/kind/],
    [q=>{q.source.strip=['('];},/Invalid regular expression/]
  ]){const q=quotation();change(q);assert.throws(()=>validateOutsideLibrary(library({donne:q})),message);}
  assert.ok(validateOutsideLibrary(library({donne:quotation({text:'A line / another',verse:true})})));
  assert.throws(()=>validateOutsideLibrary(library({'Bad Id':quotation()})),/Invalid quotation id/);
  assert.equal(words('one — two, three’s.'),3);
});

test('a plan places each quotation once, after a reading it keeps; a published plan is complete',()=>{
  const readings=[reading('a',1,2),reading('b',2)],lib=library({donne:quotation(),other:quotation(),third:quotation(),fourth:quotation()});
  const two=[place('donne','a'),place('other','b',{responds:['b','a'],relation:'contrast'})],three=[...two,place('third','b')];
  assert.ok(validateOutsidePlan(plan(two),lib,readings));
  for(const [outside,message,extra] of [
    [[place('missing','a')],/unknown quotation/],
    [[place('donne','a'),place('donne','b')],/placed twice/],
    [[place('donne','c')],/reading that the cut does not keep/],
    [[place('donne','a',{responds:['b']})],/must follow one of the readings/],
    [[place('donne','a',{responds:[]})],/must name the readings/],
    [[place('donne','a',{relation:'similar'})],/unknown relation/],
    [[place('donne','a',{why:'Too short.'})],/reason a reader can use/],
    [[...three,place('fourth','a')],/more outside quotations than the guide's own/],
    [[place('donne','a')],/must list the readings it was written for/,{readings:5}],
    [[place('donne','a')],/must list the readings it was written for/,{kept:undefined}],
    [[place('donne','a')],/must list the readings it was written for/,{kept:['a','a']}],
    [[place('donne','a')],/written for 2 readings of the guide, but the cut now keeps 2, and they differ from reading 2 of the cut; review the plan/,{kept:['a','c']}],
    [[place('donne','a')],/written for 1 readings of the guide, but the cut now keeps 2; review/,{kept:['a'],readings:1}],
    [[place('donne','a')],/unknown rule/,{rule:'every-third'}],
    [[place('donne','a')],/how many of the guide's quotations/,{quotations:4}],
    [[place('donne','a')],/draft or published/,{status:'pilot'}],
    [[place('donne','a')],/Unknown outside-quotation plan/,{format:1}],
    [[place('donne','a')],/single introductory paragraph/,{introduction:'Two\nparagraphs.'}]
  ])assert.throws(()=>validateOutsidePlan(plan(outside,extra),lib,readings),message);
  assert.deepEqual(Object.keys(relations),['adjacent','contrast','complement']);
  // A draft may be unfinished: nothing placed, no introduction, questions written before their readings are chosen.
  assert.ok(validateOutsidePlan(plan([],{introduction:'',questions:[]}),lib,readings));
  assert.ok(validateOutsidePlan(plan([place('donne','a')],{questions:['One?','Two?','Three?','Four?','Five?']}),lib,readings));
  // Published: as many outside quotations as the guide keeps, or a sentence saying why not; an
  // introduction; and questions fewer than the quotations shown.
  const published={status:'published'},why='Nothing else on the passage about islands could be traced to a text that could be checked.';
  assert.ok(validateOutsidePlan(plan(three,published),lib,readings));
  assert.throws(()=>validateOutsidePlan(plan(two,published),lib,readings),/or says why it has fewer/);
  assert.ok(validateOutsidePlan(plan(two,{...published,shortfall:why}),lib,readings));
  assert.throws(()=>validateOutsidePlan(plan(three,{...published,shortfall:why}),lib,readings),/only where there is one/);
  assert.throws(()=>validateOutsidePlan(plan(two,{...published,shortfall:'Too few.'}),lib,readings),/explained in a sentence/);
  assert.throws(()=>validateOutsidePlan(plan([],{...published,questions:['One?']}),lib,readings),/places as many outside quotations/);
  assert.throws(()=>validateOutsidePlan(plan(three,{...published,introduction:''}),lib,readings),/single introductory paragraph/);
  assert.throws(()=>validateOutsidePlan(plan(three,{...published,questions:['One?']}),lib,readings),/expected 3 to 4 questions/);
  assert.deepEqual([1,3,4,200].map(questionRange),[[0,0],[2,2],[3,3],[3,6]]);
});

test('outside quotations follow their reading in plan order, and go with a reading the guide has lost',()=>{
  const readings=[reading('a',1),reading('b',2)],lib=library({one:quotation(),two:quotation(),three:quotation()});
  const sequence=combinedSequence(readings,plan([place('two','b'),place('one','a'),place('three','a')]),lib);
  assert.deepEqual(sequence.map(item=>item.reading?.key||item.placement.id),['a','one','three','b','two']);
  // Without reading a, what followed it is left out and b's quotation no longer names it.
  const later=combinedSequence([readings[1]],plan([place('one','a'),place('two','b',{responds:['b','a']})]),lib);
  assert.deepEqual(later.map(item=>item.reading?.key||item.placement.id),['b','two']);assert.deepEqual(later[1].placement.responds,['b']);
  assert.deepEqual(planReadings({kept:['a','b','x']},[reading('b',1),reading('c',2),reading('a',3)]),{readings:[reading('b',1),reading('a',3)],missing:['x']});
});

test('each guide has one file, and the quotations of all of them make one library',async t=>{
  const folder=await temporary(t),directory=path.join(folder,'study-guides','outside');
  assert.deepEqual([...(await readOutside(folder)).plans.keys()],[]);
  await fs.mkdir(directory,{recursive:true});
  const save=(name,value)=>fs.writeFile(path.join(directory,name),JSON.stringify(value));
  await save('alpha.json',{...plan([],{slug:'alpha'}),library:{donne:quotation()}});
  // The same quotation recorded again for another guide, checked on a later day, is one quotation.
  await save('beta.json',{...plan([],{slug:'beta'}),library:{donne:quotation({source:{...quotation().source,checked:'2026-12-01'}}),other:quotation({text:'Entire of itself.'})}});
  const outside=await readOutside(folder);
  assert.deepEqual([...outside.plans.keys()],['alpha','beta']);assert.deepEqual(Object.keys(outside.library.quotations),['donne','other']);
  assert.deepEqual([...outside.recordedFor],[['donne','alpha'],['other','beta']]);assert.equal(outside.library.quotations.donne.source.checked,'2026-11-16');
  assert.deepEqual(guideQuotationIds({library:{one:{},two:{}},outside:[{id:'two'},{id:'three'}]}),['one','two','three']);
  // A check that found the quotation is dated in every file that records it.
  await recordChecks(folder,[{id:'donne',state:'found'},{id:'other',state:'changed'}],'2027-01-05');
  const dates=async name=>Object.values(JSON.parse(await fs.readFile(path.join(directory,name),'utf8')).library).map(q=>q.source.checked);
  assert.deepEqual(await dates('alpha.json'),['2027-01-05']);assert.deepEqual(await dates('beta.json'),['2027-01-05','2026-11-16']);
  // Two wordings under one id, or a file not named for its guide, stop everything.
  await save('gamma.json',{...plan([],{slug:'gamma'}),library:{other:quotation({text:'A different wording.'})}});
  await assert.rejects(readOutside(folder),/other is recorded differently for beta and for gamma/);
  await save('gamma.json',{...plan([],{slug:'delta'})});
  await assert.rejects(readOutside(folder),/gamma\.json is not named for its guide/);
});

test('page text drops markup, keeps words whole across inline tags and reads JSON replies',()=>{
  assert.equal(decodeEntities('caf&eacute; &ntilde; &#8217; &#x2014; &amp;amp; &unknown;'),'café ñ ’ — &amp; &unknown;');
  assert.equal(comparable(pageText('<html><body><p>Have we <i>not</i> all one fa<span>ther</span>?</p><script>if(a<b)x()</script><div>next&nbsp;line</div></body></html>')),'have we not all one father? next line');
  // A tooltip held in an attribute, with its own angle brackets, is not page text.
  assert.equal(comparable(pageText('<p><span onmouseover="tip(\'<b>one</b>, single\', 250)" title=\'a > b\'>From</span> the One Light<br/>all</p>')),'from the one light all');
  // An apostrophe escaped with a backslash inside a quoted value ends the value, as a browser reads it; the text that follows is kept.
  assert.equal(comparable(pageText('<p><a href=\'/x\' title=\'In one\\\'s thoughts, words, and deeds.\'><img alt="[i]" src="i.png"></a> He says, \'I know.\' Abandoning divisive speech</p>')),"he says, 'i know.' abandoning divisive speech");
  assert.equal(comparable(pageText('{"text":["First <b>part</b>","second part"],"n":3}')),'first part second part');
  assert.equal(comparable(pageText('Plain text\nstays as it is & unchanged')),'plain text stays as it is & unchanged');
  assert.equal(comparable('“A — b”  ‘C’ d--e\n f… g ; h'),'"a-b" \'c\' d-e f... g; h');
});

test('a quotation is found on its page whatever the spacing, quotes, dashes, verse numbers and omissions',()=>{
  const page='<p><sup>10</sup> Have we not all one father? hath not one God created us?</p><p><sup>11</sup> Judah hath dealt treacherously — so it is written.</p>';
  const q=(text,source={})=>quotation({text,source:{...quotation().source,...source}});
  assert.deepEqual(findQuotation(page,q('Have we not all one father? hath not one God created us?')),{found:true,missing:[]});
  assert.equal(findQuotation(page,q('Have we not all one father? hath not one God created us? Judah hath dealt treacherously')).found,false);
  assert.equal(findQuotation(page,q('Have we not all one father? hath not one God created us? Judah hath dealt treacherously--so it is written.',{strip:['\\d+\\s']})).found,true);
  assert.equal(findQuotation(page,q('Have we not all one father? … Judah hath dealt treacherously')).found,true);
  // Parts of an excerpt must come in the order quoted.
  assert.deepEqual(findQuotation(page,q('Judah hath dealt treacherously … Have we not all one father?')).missing,['have we not all one father?']);
  // Capitals set for display, a space before punctuation and a declared scanning error do not hide the wording.
  assert.equal(findQuotation('WE have just enough religion ; the lamps arc different',q('We have just enough religion; the lamps are different',{repair:[['lamps arc','lamps are']]})).found,true);
  assert.equal(findQuotation('the lamps arc different',q('the lamps are different')).found,false);
  assert.equal(findQuotation(page,q('Have we not all one mother?')).found,false);
  assert.equal(findQuotation('Something there is\nthat doesn\'t love a wall,\nThat sends the frozen-ground-swell',q('Something there is / that doesn’t love a wall,',{})).found,true);
  // A marker starts the search after the page's own heading.
  const twice='<title>Unity is strength</title><p>Preface. Unity is weakness.</p><h2>Text</h2><p>Unity is strength.</p>';
  assert.equal(findQuotation(twice,q('Unity is weakness.',{after:'Text'})).found,false);
  assert.equal(findQuotation(twice,q('Unity is strength.',{after:'Text'})).found,true);
  assert.deepEqual(findQuotation(twice,q('Unity is strength.',{after:'Appendix'})).missing,['the marker “Appendix”']);
});

test('verification reads each page once and tells a changed wording from an unreachable page',async()=>{
  const lib=library({one:quotation({text:'No man is an island'}),two:quotation({text:'entire of itself'}),three:quotation({text:'not on the page'}),four:quotation({source:{...quotation().source,url:'https://example.org/gone'}})});
  let reads=0;const lines=[];
  const results=await verifyOutsideQuotations(lib,{log:line=>lines.push(line),read:async q=>{reads++;if(q.source.url.endsWith('gone'))throw Error('HTTP 404');return '<p>No man is an island, entire of itself;</p>';}});
  assert.equal(reads,2);
  assert.deepEqual(results.map(r=>r.state),['found','found','changed','unreachable']);
  assert.match(lines[3],/unreachable four .*HTTP 404/);
  assert.deepEqual((await verifyOutsideQuotations(lib,{ids:['two'],log(){},read:async()=>'entire of itself'})).map(r=>r.id),['two']);
});

const article=(n,label='')=>`${label}<article class="quotation" id="reading-${n}"><span class="sequence" aria-label="Reading position ${n}">0${n}</span><div class="quote-body"><blockquote><p${n===1?' class="authorized"':''}>Reading ${n} &amp; more</p></blockquote><div class="citation"><a href="../?id=R${n}">R${n}</a></div><details class="context"><summary>Read source context</summary><p>Context ${n}</p></details></div></article>`;
const supplied='<p class="section-label">Further quotations · supplied wording and references</p>';

test('the guide’s page numbers one sequence, names its sections, sets outside quotations apart and escapes their text',()=>{
  const guide=sectioned();guide.compiled[6].source=undefined;
  const articles=guideArticles(`<main>${[1,2,3,4,5,6].map(n=>article(n)).join('')}${article(7,supplied)}</main>`);
  assert.equal(articles.size,7);assert.ok(!articles.get(1).includes('Context 1')&&articles.get(7).startsWith(supplied));
  const lib=library({donne:quotation({text:'No <man> is an island & entire'}),verse:quotation({text:'Line one, / line two',verse:true,translator:'King James Version',translationYear:'1611',rights:{status:'in-copyright',note:'Author d. 1990.'},caveat:'Attribution doubted.'}),third:quotation()});
  const outside=[place('donne','a'),place('verse','d',{responds:['d','a'],relation:'complement'}),place('third','g')];
  const kept=plan(outside,{status:'published',limit:5,readings:4,quotations:5,kept:['a','d','e','g'],introduction:'The plan’s <own> introduction.',questions:['First?','Second?','Third?']});
  const links={subject:'../subjects.html?subject=S',complete:'sample.html'};
  const shown=outsideGuideBody({guide,articles,plan:kept,library:lib,subjectName:'sample; subject',links,exploration:'<section class="exploration"><h2>Continue exploring</h2></section>'});
  assert.deepEqual({...shown,html:''},{html:'',readings:4,quotations:5,outside:3,sequence:7,first:1,missing:[],unplaced:0});
  const html=shown.html;
  assert.deepEqual([...html.matchAll(/<article class="quotation[^"]*" id="reading-(\d+)" data-kind="(\w+)"/g)].map(m=>m[1]+m[2]),['1guide','2outside','3guide','4outside','5guide','6guide','7outside']);
  // Readings 1, 4, 5 and 7 of the guide; each named section at the first of its readings that is kept.
  assert.deepEqual([...html.matchAll(/<h3 class="section-label" id="section-(\d)">([^<]+)<\/h3><article class="quotation" id="reading-(\d)" data-kind="guide">[\s\S]*?<p[^>]*>Reading (\d)/g)].map(m=>m.slice(1).join('|')),['1|First part|1|1','2|Second part|3|4','3|Third part|5|5']);
  assert.match(html,/aria-label="Reading 3">03<\/span><div class="quote-body"><blockquote><p>Reading 4 &amp; more</);
  assert.ok(html.includes('<p class="authorized">Reading 1 &amp; more</p>')&&!html.includes('Context'));
  // The supplied quotations are announced once, before the first that is kept.
  assert.equal(html.split(supplied).length,2);assert.ok(html.includes(supplied+'<article class="quotation" id="reading-6" data-kind="guide">'));
  assert.ok(html.includes('No &lt;man&gt; is an island &amp; entire')&&!html.includes('<man>')&&html.includes('The plan’s &lt;own&gt; introduction.')&&!html.includes('The guide’s own introduction'));
  assert.match(html,/Beyond the Bahá’í writings · complement · with <a href="#reading-3">03<\/a>, <a href="#reading-1">01<\/a>/);
  assert.match(html,/<blockquote class="verse"><p><span class="line">Line one,<\/span><span class="line">line two<\/span>/);
  assert.ok(html.includes('Note on the text: Attribution doubted.')&&html.includes('Rights: in copyright, brief quotation. Author d. 1990.'));
  assert.ok(html.startsWith('<h1>Sample subject</h1><p class="guide-subtitle">sample; subject</p><p class="meta compilation-count">5 quotations from the Bahá’í writings · 3 from beyond them · <a href="sample.html">All 8 chosen quotations ↗</a> · <a href="../subjects.html?subject=S">Current subject view ↗</a></p><p class="pdf-label">Editorial introduction (AI generated)</p>'));
  // The filter stands with the readings and counts what it shows.
  assert.match(html,/<div id="readings"><div class="reading-filter"[^>]*><button type="button" class="chip" data-show="all" aria-pressed="true">All 7<\/button><button[^>]*data-show="guide"[^>]*>Bahá’í writings · 4<\/button><button[^>]*>Beyond them · 3<\/button><button[^>]*>Alongside · 2<\/button><button[^>]*>Contrast and complement · 1<\/button><\/div><h3/);
  assert.ok(html.includes('id="print-compilation"')&&html.includes('<a href="#questions">Questions for reflection ↓</a>'));
  // After the readings: further exploration, the questions, and the sources, without word counts or rights.
  assert.match(html,/<\/article><\/div><section class="exploration"><h2>Continue exploring<\/h2><\/section><section id="questions" class="questions">[\s\S]*<li>Third\?<\/li><\/ol><\/section><section class="external-sources"><h2>Behind the external sources<\/h2><details><summary>Every outside quotation, with its source<\/summary>/);
  assert.ok(html.includes('<thead><tr><th>No.</th><th>Source</th><th>Date</th><th>Tradition</th><th>Relation</th><th>With</th><th>Checked</th></tr></thead>'));
  assert.ok(html.includes('<tr><td><a href="#reading-4">04</a></td><td>John Donne, Devotions, Meditation XVII</td><td>1624</td><td>English literature</td><td>complement</td><td>03, 01</td><td>text of the work, 2026-11-16</td></tr>'));
  assert.ok(!/About this pilot|Behind the pilot|<th>Words|<th>Rights/.test(html));
  assert.match(citation(lib.quotations.verse),/Meditation XVII, 1624, King James Version, 1611 -- <a href="https:\/\/example\.org\/donne"/);
  assert.match(citation(quotation({translator:'Edward Rehatsek',translationYear:'1888'})),/translated by Edward Rehatsek, 1888/);
  assert.match(citation(quotation({translator:'Joshua Kulp'})),/1624, translated by Joshua Kulp -- /);
  // A guide kept whole has nothing more to offer elsewhere; a plan without questions has no link to them.
  const whole=outsideGuideBody({guide,articles,plan:plan([place('donne','a')],{kept:guide.compiled.map(r=>r.key),questions:[]}),library:lib,subjectName:'s',links});
  assert.ok(!whole.html.includes('chosen quotations ↗')&&!whole.html.includes('#questions')&&whole.html.includes('8 quotations from the Bahá’í writings · 1 from beyond them'));
});

test('a guide that has changed since its plan was written still has its page, from what remains',()=>{
  const guide=sectioned(),articles=guideArticles(`<main>${[1,2,3,4,5,6,7].map(n=>article(n)).join('')}</main>`),lib=library({donne:quotation(),other:quotation()}),links={subject:'s',complete:'c'};
  // Reading zz is gone, with the quotation that followed it; the other quotation no longer names it.
  const stale=plan([place('donne','zz'),place('other','b',{responds:['b','zz']})],{kept:['zz','b','c'],readings:3});
  const shown=outsideGuideBody({guide,articles,plan:stale,library:lib,subjectName:'s',links});
  assert.deepEqual([shown.readings,shown.outside,shown.first,shown.missing,shown.unplaced],[2,1,2,['zz'],1]);
  assert.match(shown.html,/with <a href="#reading-1">01<\/a><\/p>/);
  assert.equal(outsideGuideBody({guide,articles,plan:{...stale,kept:['zz']},library:lib,subjectName:'s',links}),null);
  assert.throws(()=>outsideGuideBody({guide,articles:new Map(),plan:stale,library:lib,subjectName:'s',links}),/reading 2 has no article/);
});

test('arguments are words and named values, and a name given twice keeps both',()=>{
  assert.deepEqual(parseArguments(['unity','x','--from','a b','--to','c','--from','d','--to','e','--verse','--year','1900']),{plain:['unity','x'],options:{from:['a b','d'],to:['c','e'],verse:true,year:['1900']}});
  assert.throws(()=>parseArguments(['--why']),/--why needs a value/);
});

test('a passage is cut from its page between two phrases, never retyped',()=>{
  const body='<html><body><h1>Song</h1><p>Preface: I celebrate nothing.</p><h2>Text</h2><p><sup>1</sup> I celebrate myself, and sing myself,<br><sup>2</sup> And what I assume you shall assume,<br>For every atom belonging to me as good belongs to you.</p><p>Later -- much\u200b later ; he said &ldquo;so&rdquo;.</p></body></html>';
  assert.equal(cutPassage(body,{segments:[['I celebrate myself','belongs to you.']],strip:['\\d+\\s']}),'I celebrate myself, and sing myself, And what I assume you shall assume, For every atom belonging to me as good belongs to you.');
  assert.equal(cutPassage(body,{segments:[['I celebrate myself','belongs to you.']],strip:['\\d+\\s'],verse:true}),'I celebrate myself, and sing myself, / And what I assume you shall assume, / For every atom belonging to me as good belongs to you.');
  // Below a marker, the phrase of the preface is not taken; parts are joined with the omission mark.
  assert.equal(cutPassage(body,{segments:[['I celebrate','sing myself,'],['For every atom','to you.']],after:'Text'}),'I celebrate myself, and sing myself, … For every atom belonging to me as good belongs to you.');
  assert.equal(cutPassage(body,{segments:[['I celebrate','nothing.']]}),'I celebrate nothing.');
  // A phrase is found whatever its capitals and quotation marks; double hyphens, hidden characters and a space before a semicolon are tidied.
  assert.equal(cutPassage(body,{segments:[['later -','"so".']]}),'Later — much later; he said “so”.');
  assert.throws(()=>cutPassage(body,{segments:[['I celebrate thee','you']]}),/“I celebrate thee” is not on the page/);
  assert.throws(()=>cutPassage(body,{segments:[['I celebrate myself','nothing.']]}),/“nothing\.” does not follow “I celebrate myself”/);
  assert.throws(()=>cutPassage(body,{segments:[['I','you']],after:'Appendix'}),/marker “Appendix” is not on the page/);
  const context=passageContext(body,['sing myself','absent phrase'],12);
  assert.match(context,/“sing myself”: 1 place\n  @\d+: …myself, and sing myself, 2 And what…/);assert.match(context,/“absent phrase”: not on the page/);
});

test('a quotation is recorded with its page, checked against it, and refused when it does not check',()=>{
  const body='<html><body><div>Update</div><p><sup>10 </sup>Now I beseech you, brethren, that ye all speak the same thing, <sup>11 </sup>and that there be no divisions among you.</p><p>One thing,<br>7<br>and another.</p><p>Pickthall: O mankind! Lo! We have created you. Yusuf Ali: O mankind! We created you.</p></body></html>';
  const details={year:['c. 55 CE'],'sort-year':['55'],tradition:['New Testament']};
  const kjv={after:'Update',strip:['\\d+\\s'],entry:{work:'1 Corinthians 1:10',translator:'King James Version',translationYear:'1611',kind:'sacred',rights:{status:'public-domain',note:'Translation of 1611.'}}};
  const entry=quotationEntry('same-thing',body,{url:'https://www.biblegateway.com/passage/?search=x',options:{from:['Now I beseech you'],to:['divisions among you.'],...details},preset:kjv});
  assert.equal(entry.text,'Now I beseech you, brethren, that ye all speak the same thing, and that there be no divisions among you.');
  assert.deepEqual({...entry.source,checked:''},{url:'https://www.biblegateway.com/passage/?search=x',label:'Bible Gateway',checked:'',status:'primary',strip:['\\d+\\s'],after:'Update'});
  assert.match(entry.source.checked,/^\d{4}-\d{2}-\d{2}$/);assert.equal(entry.sortYear,55);assert.equal(entry.translator,'King James Version');assert.ok(!('author' in entry));
  // A verse of the Qur’an stands whole between its translator's name and the next.
  const verse=quotationEntry('created',body,{url:'https://corpus.quran.com/translation.jsp?chapter=49&verse=13',options:{},preset:{after:'Pickthall:',whole:'Yusuf Ali:',entry:{work:'Qur’an 49:13',year:'7th century',sortYear:630,tradition:'Qur’an and hadith',kind:'sacred',rights:{status:'public-domain',note:'Translation published 1930.'}}}});
  assert.equal(verse.text,'O mankind! Lo! We have created you.');assert.equal(verse.source.after,'Pickthall:');
  // A declared scanning error is corrected in the wording and kept with the source; other details are given by name.
  const fixed=quotationEntry('fixed',body,{url:'https://example.org/x',options:{from:['Now I'],to:['same thing'],strip:['\\d+\\s'],fix:['beseech=>beg'],label:['Example'],author:['Paul'],work:['Letter'],year:['55'],'sort-year':['55'],tradition:['New Testament'],kind:['sacred'],rights:['public-domain'],'rights-note':['Old.'],secondary:true,browser:true}});
  assert.equal(fixed.text,'Now I beg you, brethren, that ye all speak the same thing');assert.deepEqual(fixed.source.repair,[['beseech','beg']]);assert.equal(fixed.source.status,'secondary');assert.equal(fixed.source.fetch,'browser');
  const options=extra=>({from:['Now I beseech you'],to:['divisions among you.'],...details,...extra});
  // A pattern that fits the page's own line breaks does not fit the page as the checker reads it, in one line.
  assert.throws(()=>quotationEntry('x',body,{url:'https://www.biblegateway.com/x',options:{from:['One thing'],to:['another.'],strip:['\\n\\d+\\n'],...details},preset:{...kjv,strip:[]}}),/does not check against its page/);
  assert.throws(()=>quotationEntry('x',body,{url:'https://unknown.example/x',options:options({}),preset:kjv}),/Name the site with --label/);
  assert.throws(()=>quotationEntry('x',body,{url:'https://www.biblegateway.com/x',options:options({}),preset:{...kjv,entry:{...kjv.entry,rights:undefined}}}),/Say what the rights are/);
  assert.throws(()=>quotationEntry('x',body,{url:'https://www.biblegateway.com/x',options:{from:['Now'],...details},preset:kjv}),/in pairs/);
  assert.throws(()=>quotationEntry('x',body,{url:'https://www.biblegateway.com/x',options:{...details},preset:kjv}),/Say where the passage starts and ends/);
  assert.throws(()=>quotationEntry('Bad Id',body,{url:'https://www.biblegateway.com/x',options:options({}),preset:kjv}),/Invalid quotation id/);
});

test('a guide is read from its built pages, cut, briefed, given its quotations and checked',async()=>{
  const id='A'.repeat(32),selection={id:'linked',status:'confirmed',passage:'p',suppliedIds:['FIXTURE00001'],candidates:[{source:'FIXTURE00001',version:'v1',ranges:[{paragraph:1,start:0,end:6,text:'<Word>'}]}]};
  const data={subject:{id,name:'Sample'},sources:{FIXTURE00001:{citationCount:1}},selections:[selection,{...structuredClone(selection),id:'overlap'},{id:'unlinked',status:'unmatched',excerpt:'A supplied quotation.',original:'A supplied quotation. Its reference.',reference:'Its reference.',candidates:[],suppliedIds:[],provenance:{sourceCollection:'Evernote_scrape'}}]};
  const guide={id,slug:'sample',displayTitle:'Sample guide',introduction:'Its own introduction.',arc:'An editorial sequence.',order:[{key:'source:FIXTURE00001',why:'A source quotation.'},{key:'selection:unlinked',why:'A supplied quotation.'}],questions:['Its own question?'],neighbors:[],references:[]};
  const pages=`<article class="quotation" id="reading-1"><span class="sequence" aria-label="Reading position 1">01</span><div class="quote-body"><blockquote><p class="authorized">&lt;Word&gt; in context.</p><p>… More.</p></blockquote><div class="citation"><a href="../?id=FIXTURE00001">FIXTURE00001</a></div><details class="context"><summary>Read source context</summary><p>All of it.</p></details></div></article>${supplied}<article class="quotation" id="reading-2"><span class="sequence" aria-label="Reading position 2">02</span><div class="quote-body"><blockquote><p>A supplied quotation.</p></blockquote></div></article>`;
  const built={'stats.json':JSON.stringify({dataset:'collections/x/'}),[`collections/x/subjects/${id}.json.gz`]:gzipSync(JSON.stringify(data)),'collections/x/subjects/index.json.gz':gzipSync(JSON.stringify({subjects:[data.subject],edges:[]})),'study-guides/sample.quotations.html.gz':gzipSync(pages)};
  const files={from:'a test',get:async name=>{if(!(name in built))throw Object.assign(Error('missing '+name),{code:'ENOENT'});return Buffer.from(built[name]);}};
  assert.deepEqual(articleParagraphs(pages),[{authorized:true,text:'<Word> in context.'},{authorized:false,text:'… More.'}]);
  const view=await guideView(guide,files);
  assert.deepEqual(view.compiled.map(entry=>[entry.position,entry.key,entry.selectionIds.length,entry.source,entry.paragraphs.length,entry.text]),[[1,'source:FIXTURE00001',2,'FIXTURE00001',2,'<Word> in context. ¶ … More.'],[2,'selection:unlinked',1,undefined,0,'A supplied quotation.']]);
  assert.equal(view.subjectName,'Sample');assert.ok(!view.articles.get(1).includes('All of it'));
  // A page with other readings than the guide's order means the site and the checkout differ.
  await assert.rejects(guideView({...guide,order:[guide.order[0]]},files),/no longer match|differ/);
  const fresh=startPlan(view);
  assert.deepEqual(fresh,{format:2,slug:'sample',subject:id,status:'draft',limit:100,rule:'whole',readings:2,quotations:3,kept:['source:FIXTURE00001','selection:unlinked'],introduction:'',questions:[],outside:[],library:{}});
  assert.ok(currentCut(view,fresh).same);assert.ok(!currentCut(view,{...fresh,kept:['selection:unlinked']}).same);
  assert.deepEqual(guideParts(view,'whole').map(part=>[part.name,part.readings.length]),[['The whole guide',2]]);
  assert.deepEqual(guideParts(sectioned(),'proportional').map(part=>part.name),['First part','Second part','Third part','After the named sections (not drawn on)']);
  // Readings are named by their numbers in the guide; quotations stay in reading order, the latest last unless it is to come first.
  const lib=library({donne:quotation(),other:quotation({text:'Entire of itself.'}),third:quotation({text:'A piece of the continent.',tradition:'Greek and Roman',sortYear:-300})});
  const why='It says of one death what the reading says of the whole body of humankind, in a single image.';
  let draft=placeQuotation(fresh,view,lib,{id:'donne',after:'2',relation:'adjacent',why});
  draft=placeQuotation(draft,view,lib,{id:'other',after:1,responds:['2'],relation:'contrast',why});
  draft=placeQuotation(draft,view,lib,{id:'third',after:'1',relation:'complement',why,first:true});
  assert.deepEqual(draft.outside.map(p=>[p.id,p.after,p.responds.length]),[['third','source:FIXTURE00001',1],['other','source:FIXTURE00001',2],['donne','selection:unlinked',1]]);
  assert.deepEqual(placeQuotation(draft,view,lib,{id:'third',after:'2',relation:'adjacent',why}).outside.map(p=>p.id),['other','donne','third']);
  assert.throws(()=>placeQuotation(draft,view,lib,{id:'donne',after:'3',relation:'adjacent',why}),/Reading 3 is not among the readings kept/);
  assert.throws(()=>placeQuotation(draft,view,lib,{id:'absent',after:'1',relation:'adjacent',why}),/absent is not recorded/);
  // The brief: what to read, what is placed, and what another guide placed against the same passage.
  const elsewhere={...plan([place('donne','source:FIXTURE00001',{relation:'contrast'})],{slug:'other',kept:['source:FIXTURE00001'],readings:1})};
  const outside={library:lib,plans:new Map([['sample',draft],['other',elsewhere]]),recordedFor:new Map([['donne','other'],['other','sample'],['third','sample']])};
  const brief=briefText(view,draft,outside,'a test');
  assert.match(brief,/^# Sample guide \(sample\): Sample\n\nRead from a test\. The guide holds 3 quotations in 2 readings; the plan \(draft\) keeps 3 in 2 by the rule “whole”/);
  assert.ok(brief.includes('The whole guide: share 3, keeps 3 of 3 quotations (2 of 2 readings); outside placed: 3'));
  assert.ok(brief.includes('[1] source:FIXTURE00001 · 2q · partly authorized\n<Word> in context. ¶ … More.\n  placed here: third (complement), John Donne, Devotions, Meditation XVII\n  placed here: other (in contrast), John Donne, Devotions, Meditation XVII\n  in other: donne (in contrast), John Donne, Devotions, Meditation XVII: It says of one death'));
  assert.ok(brief.includes('[2] selection:unlinked · 1q · supplied quotation\nA supplied quotation.\n  placed here: donne (alongside)')&&brief.includes('Its own introduction.')&&brief.includes('  1. Its own question?'));
  assert.deepEqual(findQuotations(outside,['continent','GREEK']).map(line=>line.split(' · ')[0]),['third']);
  assert.match(findQuotations(outside,['donne'])[0],/^donne · John Donne, Devotions, Meditation XVII, 1624 · English literature · 5w · public domain · placed in sample, other \(recorded for other\)\n   “No man is an island\.”$/);
  // The summary for the pull request, and what stands between the draft and publication.
  const summary=planSummary(view,{...draft,library:{other:lib.quotations.other,third:lib.quotations.third,spare:quotation()}},lib);
  assert.match(summary,/^\*\*Sample guide\*\* \(`sample`\): 3 quotations of the guide’s 3 in 2 readings \(rule: whole\), with 3 quotations from beyond the Bahá’í writings\./);
  assert.ok(summary.includes('- Relation: alongside 1, complement 1, in contrast 1')&&summary.includes('- Tradition or setting: English literature 2, Greek and Roman 1')&&summary.includes('- Written: before the common era 1, 1500–1799 2')&&summary.includes('- Recorded for this guide and not placed: 1'));
  assert.equal(eraOf(-450),'before the common era');assert.equal(eraOf(2004),'2000 onward');
  assert.deepEqual(planProblems(view,draft,lib),{problems:['sample: expected a single introductory paragraph'],notes:[]});
  const finished={...draft,introduction:'One paragraph.',questions:['One?','Two?','Three?']};
  assert.deepEqual(planProblems(view,finished,lib),{problems:[],notes:[]});
  assert.match(planProblems(view,{...finished,kept:['selection:unlinked'],readings:1,quotations:1,outside:finished.outside.slice(2)},lib).problems[0],/now keeps 2 readings that differ from the plan’s 1/);
  assert.deepEqual(planProblems(view,{...finished,outside:finished.outside.filter(p=>p.id==='third')},lib).notes,['1 reading kept has no outside quotation chosen for it (allowed; look once more before publishing).']);
  // A page to look at: the site's stylesheet, without its font files, complete or as a fragment.
  const preview=await previewDocument(root,view,finished,lib,'https://example.org/site/');
  assert.ok(preview.html.startsWith('<!doctype html>')&&preview.html.includes('<div class="pdf-view"><main id="main"><h1>Sample guide</h1>')&&preview.html.includes('href="https://example.org/site/?id=FIXTURE00001"')&&preview.html.includes('href="https://example.org/site/study-guides/sample.html"')===false);
  assert.ok(!preview.html.includes('@font-face')&&preview.html.includes('fonts.googleapis.com')&&preview.html.includes('@media (prefers-color-scheme:dark){:root:not([data-theme=light]){color-scheme:dark;')&&preview.html.includes('.reading-filter .chip'));
  const fragment=await previewDocument(root,view,finished,lib,'https://example.org/site/',true);
  assert.ok(fragment.html.startsWith('<title>Sample guide</title>')&&!fragment.html.includes('<body'));
  assert.deepEqual(overviewRows('<ol><li data-title="Unity &amp; oneness" data-quotations="100" data-total="1320" data-centrality="18" data-thematic="4" style="x"><a href="unityhumanity-pdf.html" title="t"><span>…</span></a></li><li data-title="Courage" data-quotations="12" data-total="12" data-centrality="3" data-thematic="9"><a href="courage-pdf.html"></a></li></ol>'),
    [{title:'Unity & oneness',quotations:100,total:1320,centrality:18,slug:'unityhumanity'},{title:'Courage',quotations:12,total:12,centrality:3,slug:'courage'}]);
});

test('the committed guides are consistent in themselves',async t=>{
  const outside=await readOutside(root),guides=new Map();
  for(const name of await fs.readdir(path.join(root,'study-guides')))if(name==='editorial.json'||name.endsWith('-batch.json'))
    for(const guide of JSON.parse(await fs.readFile(path.join(root,'study-guides',name),'utf8')).subjects)guides.set(guide.slug,guide);
  assert.ok(outside.plans.size>0);
  for(const [slug,plan] of outside.plans){
    // The plan is checked against the readings it lists for itself.
    validateOutsidePlan(plan,outside.library,(plan.kept||[]).map((key,i)=>({key,position:i+1,selectionIds:[]})));
    for(const id of Object.keys(plan.library||{}))assert.match(id,/^[a-z0-9]+(-[a-z0-9]+)*$/);
    // Outside quotations must never hold up work on the guide itself: a guide that has changed
    // since its plan was written is reported here, and the site builds its page from what remains.
    const guide=guides.get(slug),order=guide?.id===plan.subject?guide.order.filter(entry=>!entry.omitted).map(entry=>entry.key):[];
    const places=plan.kept.map(key=>order.indexOf(key));
    if(places.some((place,i)=>place<0||(i&&place<=places[i-1])))t.diagnostic(`${slug}: the guide has changed since this plan was written; review it (node scripts/outside-guide.mjs brief ${slug})`);
  }
});
