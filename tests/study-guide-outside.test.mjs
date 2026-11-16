import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {relations,copyrightWordLimit,words,firstReadings,guideSections,authorizedRank,sectionShares,proportionalReadings,cutGuide,validateOutsideLibrary,validateOutsidePlan,combinedSequence,decodeEntities,pageText,comparable,findQuotation} from '../scripts/study-guide-outside.mjs';
import {verifyOutsideQuotations} from '../scripts/verify-outside-quotations.mjs';
import {renderOutsidePilot,pilotDocument,guideArticles,citation,eraOf} from '../scripts/build-outside-pilot.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

const quotation=(extra={})=>({text:'No man is an island.',author:'John Donne',work:'Devotions',locator:'Meditation XVII',year:'1624',sortYear:1624,tradition:'English literature',kind:'literature',
  source:{url:'https://example.org/donne',label:'Example library',checked:'2026-11-16',status:'primary'},rights:{status:'public-domain',note:'Published 1624.'},...extra});
const library=(quotations={donne:quotation()})=>({format:1,quotations});
const reading=(key,position,selections=1)=>({key,position,selectionIds:Array.from({length:selections},(_,i)=>key+i),paragraphs:[{authorized:position===1}]});
const plan=(outside,extra={})=>({format:1,slug:'sample',subject:'S',limit:3,rule:'first',readings:2,quotations:3,kept:['a','b'],introduction:'One paragraph.',questions:['One?','Two?','Three?'],outside,...extra});
// A guide of three named sections (two readings each) and one reading after them under a note of its own.
const sectioned=(authorized=[1])=>{
  const compiled=[reading('a',1,2),reading('b',2),reading('c',3),reading('d',4),reading('e',5),reading('f',6),reading('g',7)];
  for(const entry of compiled)entry.paragraphs=[{authorized:authorized.includes(entry.position)}];
  return {id:'S',slug:'sample',displayTitle:'Sample subject',sourceName:'sample',arc:'First part → Second part → Third part',
    order:[['a','one'],['b','one'],['c','two'],['d','two'],['e','three'],['f','three'],['g','added later']].map(([key,why])=>({key,why})),compiled};
};
const place=(id,after,extra={})=>({id,after,responds:[after],relation:'adjacent',why:'It says of one death what the reading says of the whole body of humankind, in a single image.',...extra});

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

test('a plan places each quotation once, after a reading it was chosen for, within the cut',()=>{
  const readings=[reading('a',1,2),reading('b',2)],lib=library({donne:quotation(),other:quotation()});
  assert.ok(validateOutsidePlan(plan([place('donne','a'),place('other','b',{responds:['b','a'],relation:'contrast'})]),lib,readings));
  for(const [outside,message,extra] of [
    [[place('missing','a')],/unknown quotation/],
    [[place('donne','a'),place('donne','b')],/placed twice/],
    [[place('donne','c')],/reading that the cut does not keep/],
    [[place('donne','a',{responds:['b']})],/must follow one of the readings/],
    [[place('donne','a',{responds:[]})],/must name the readings/],
    [[place('donne','a',{relation:'similar'})],/unknown relation/],
    [[place('donne','a',{why:'Too short.'})],/reason a reader can use/],
    [[place('donne','a')],/must list the readings it was written for/,{readings:5}],
    [[place('donne','a')],/must list the readings it was written for/,{kept:undefined}],
    [[place('donne','a')],/must list the readings it was written for/,{kept:['a','a']}],
    [[place('donne','a')],/written for 2 readings of the guide, but the cut now keeps 2, and they differ from reading 2 of the cut; review the plan/,{kept:['a','c']}],
    [[place('donne','a')],/written for 1 readings of the guide, but the cut now keeps 2; review/,{kept:['a'],readings:1}],
    [[place('donne','a')],/unknown rule/,{rule:'every-third'}],
    [[place('donne','a')],/how many of the guide's quotations/,{quotations:4}],
    [[place('donne','a')],/single introductory paragraph/,{introduction:'Two\nparagraphs.'}],
    [[place('donne','a')],/three to six questions/,{questions:['One?']}]
  ])assert.throws(()=>validateOutsidePlan(plan(outside,extra),lib,readings),message);
  assert.deepEqual(Object.keys(relations),['adjacent','contrast','complement']);
});

test('outside quotations follow their reading in plan order',()=>{
  const readings=[reading('a',1),reading('b',2)],lib=library({one:quotation(),two:quotation(),three:quotation()});
  const sequence=combinedSequence(readings,plan([place('two','b'),place('one','a'),place('three','a')]),lib);
  assert.deepEqual(sequence.map(item=>item.reading?.key||item.placement.id),['a','one','three','b','two']);
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

test('the pilot page numbers one sequence, sets outside quotations apart and escapes their text',()=>{
  const article=n=>`<article class="quotation" id="reading-${n}"><span class="sequence" aria-label="Reading position ${n}">0${n}</span><div class="quote-body"><blockquote><p>Reading ${n}</p></blockquote><div class="citation"><a href="../?id=R${n}">R${n}</a></div></div></article>`;
  const guide=sectioned(),pageHtml=`<main>${[1,2,3,4,5,6,7].map(article).join('')}</main>`;
  assert.equal(guideArticles(pageHtml).size,7);
  const lib=library({donne:quotation({text:'No <man> is an island & entire'}),verse:quotation({text:'Line one, / line two',verse:true,translator:'King James Version',translationYear:'1611',rights:{status:'in-copyright',note:'Author d. 1990.'},caveat:'Attribution doubted.'})});
  // Other guides of the collection: one within the limit, one over it whose readings each have their own note.
  const small={...sectioned(),compiled:[reading('x',1)],order:[{key:'x',why:'only'}]},loose={...sectioned(),arc:'Begin here, then go on.'};
  const first=plan([place('donne','a'),place('verse','b',{responds:['b','a'],relation:'complement'})],{limit:4,readings:3,quotations:4,kept:['a','b','c'],leftOut:[{saying:'A saying',attributed:'Someone',reason:'No source.'}]});
  const rendered=renderOutsidePilot({guide,pageHtml,plan:first,library:lib,base:'https://example.org/site/',collection:'collections/x/',collectionGuides:[guide,small,loose]});
  assert.deepEqual(rendered.counts,{readings:3,quotations:4,outside:2,sequence:5});
  const ids=main=>[...main.matchAll(/<article class="quotation[^"]*" id="reading-(\d+)"( data-kind="(\w+)")/g)].map(m=>m[1]+m[3]);
  assert.deepEqual(ids(rendered.main),['1guide','2outside','3guide','4outside','5guide']);
  assert.match(rendered.main,/aria-label="Reading 3">03<\/span><div class="quote-body"><blockquote><p>Reading 2</);
  assert.ok(rendered.main.includes('href="https://example.org/site/?id=R1"')&&!rendered.main.includes('href="../'));
  // Each reading leads back to its place in the published guide.
  assert.ok(rendered.main.includes('<a href="https://example.org/site/study-guides/sample-pdf.html#reading-2">Reading 2 of 7 in the published guide ↗</a></p></div></article>'));
  assert.ok(rendered.main.includes('No &lt;man&gt; is an island &amp; entire')&&!rendered.main.includes('<man>'));
  assert.match(rendered.main,/complement · with <a href="#reading-3">03<\/a>, <a href="#reading-1">01<\/a>/);
  assert.match(rendered.main,/<span class="line">Line one,<\/span><span class="line">line two<\/span>/);
  assert.ok(rendered.main.includes('Note on the text: Attribution doubted.')&&rendered.main.includes('Rights: in copyright, brief quotation. Author d. 1990.'));
  // Two of the guide's three sections are kept; the third is named as cut.
  assert.ok(rendered.main.includes('id="section-1">First part</h3>')&&rendered.main.includes('id="section-2">Second part</h3>')&&!rendered.main.includes('>Third part</h3>'));
  assert.match(rendered.main,/cut to its first 4 \(3 readings; 2 of its 3 sections\)/);
  // Section table: readings kept of those in the section, quotations kept, those of them authorized, outside quotations.
  for(const row of ['First part</th><td>2 of 2</td><td>3 of 3</td><td>2</td><td>2</td>','Second part</th><td>1 of 2</td><td>1 of 2</td><td>0</td><td>0</td>','Third part</th><td>0 of 2</td><td>0 of 2</td><td>0</td><td>0</td>','After the named sections</th><td>0 of 1</td><td>0 of 1</td><td>0</td><td>0</td>'])
    assert.ok(rendered.main.includes('<th scope="row">'+row),row);
  // Collection-wide: a limit of 4 keeps at most 4 + 1 + 4 of 17 quotations and shortens two guides.
  assert.match(rendered.main,/Across all 3 study guides a limit of 4 would keep at most 9 of 17 quotations, shortening 2 guides, and would call for as many again from outside: 9 quotations to find, check and place\.<\/p>/);
  assert.match(rendered.main,/1 of the guide’s 1 paragraphs in authorized translation are kept/);
  assert.match(rendered.main,/fall away entirely are: Third part\. A further 1 reading \(1 quotation\) stands after the last named section, outside any of them, and lies beyond the cut\./);
  assert.ok(rendered.main.includes('A saying'));
  assert.match(citation(lib.quotations.verse),/Meditation XVII, 1624, King James Version, 1611 -- <a href="https:\/\/example\.org\/donne"/);
  assert.match(citation(quotation({translator:'Edward Rehatsek',translationYear:'1888'})),/translated by Edward Rehatsek, 1888/);
  assert.match(citation(quotation({translator:'Joshua Kulp'})),/1624, translated by Joshua Kulp -- /);
  assert.equal(eraOf(-450),'Before the common era');assert.equal(eraOf(1624),'1500 – 1799');assert.equal(eraOf(2004),'2000 onward');
  const page=pilotDocument(rendered),fragment=pilotDocument(rendered,true);
  assert.ok(page.startsWith('<!doctype html>')&&fragment.startsWith('<title>Sample subject pilot</title>')&&!fragment.includes('<body'));
  // A page whose readings differ from the compiled guide is refused, and so is a plan written for another cut.
  assert.throws(()=>renderOutsidePilot({guide,pageHtml:`<main>${article(1)}</main>`,plan:first,library:lib,base:'x/',collection:'c'}),/rebuild the guides/);
  assert.throws(()=>renderOutsidePilot({guide,pageHtml,plan:{...first,quotations:3},library:lib,base:'x/',collection:'c'}),/the cut now keeps 4/);
  assert.throws(()=>renderOutsidePilot({guide,pageHtml,plan:{...first,kept:['a','b','d']},library:lib,base:'x/',collection:'c'}),/differ from reading 3 of the cut/);
});

test('the pilot page of a proportional cut shows every section and says how the cut was made',()=>{
  const article=n=>`<article class="quotation" id="reading-${n}"><span class="sequence" aria-label="Reading position ${n}">0${n}</span><div class="quote-body"><blockquote><p>Reading ${n}</p></blockquote></div></article>`;
  const guide=sectioned([1,4]),pageHtml=`<main>${[1,2,3,4,5,6,7].map(article).join('')}</main>`,lib=library({donne:quotation(),other:quotation()});
  const loose={...sectioned(),arc:'Begin here, then go on.'},small={...sectioned(),compiled:[reading('x',1)],order:[{key:'x',why:'only'}]};
  const proportional=plan([place('donne','a'),place('other','e',{responds:['e','d']})],{limit:4,rule:'proportional',readings:3,quotations:4,kept:['a','d','e']});
  const rendered=renderOutsidePilot({guide,pageHtml,plan:proportional,library:lib,base:'https://example.org/site/',collection:'collections/x/',collectionGuides:[guide,small,loose]});
  assert.deepEqual(rendered.counts,{readings:3,quotations:4,outside:2,sequence:5});
  // Readings 1, 4 and 5 of the guide, in that order, each under its section's name.
  assert.deepEqual([...rendered.main.matchAll(/<h3 class="section-label" id="section-(\d)">([^<]+)<\/h3><article class="quotation" id="reading-(\d)" data-kind="guide">[\s\S]*?<p>Reading (\d)<\/p>/g)].map(m=>m.slice(1).join('|')),['1|First part|1|1','2|Second part|3|4','3|Third part|4|5']);
  assert.match(rendered.main,/with <a href="#reading-4">04<\/a>, <a href="#reading-3">03<\/a>/);
  assert.match(rendered.main,/cut to 4 \(3 readings\), drawn from all three of its sections in proportion to their length; within a section, readings wholly in authorized translation were taken first\. 3 of the 4 are in readings wholly in authorized translation\./);
  for(const row of ['First part</th><td>1 of 2</td><td>2 of 3</td><td>2</td><td>1</td>','Second part</th><td>1 of 2</td><td>1 of 2</td><td>1</td><td>0</td>','Third part</th><td>1 of 2</td><td>1 of 2</td><td>0</td><td>1</td>','After the named sections</th><td>0 of 1</td><td>0 of 1</td><td>0</td><td>0</td>'])
    assert.ok(rendered.main.includes('<th scope="row">'+row),row);
  assert.match(rendered.main,/The cut keeps 3 of the guide’s 7 readings and 4 of its 8 quotations\. Each section’s share is reckoned from its number of quotations: First part, 2 of 3; Second part, 1 of 2; Third part, 1 of 2\./);
  assert.match(rendered.main,/A further 1 reading \(1 quotation\) stands after the last named section, outside any of them, and is not drawn on\. 2 of the guide’s 2 paragraphs in authorized translation are kept, and 1 paragraph of the cut is a provisional translation\./);
  // Of the two guides over the limit, one has named sections; its cut holds 4 quotations, 3 of them authorized.
  assert.match(rendered.main,/shortening 2 guides, and would call for as many again from outside: 9 quotations to find, check and place\. Named sections like this guide’s are found in only 1 of those 2; .* In the 1 the rule would keep 4 quotations, 3 of them in readings wholly in authorized translation, and in 0 of the 1 every section’s share can be filled from authorized translations alone\.<\/p>/);
  // Where every kept reading is authorized, the page says so.
  const all=renderOutsidePilot({guide:sectioned([1,3,5]),pageHtml,plan:{...proportional,kept:['a','c','e'],outside:[place('donne','a')]},library:lib,base:'x/',collection:'c'});
  assert.match(all.main,/Every one of the 4 is an authorized translation\./);assert.match(all.main,/and the cut holds no provisional translation\./);
  assert.ok(!all.main.includes('Across all'));
});

test('the committed library and plans are consistent in themselves',async t=>{
  const directory=path.join(root,'study-guides','outside'),json=async file=>JSON.parse(await fs.readFile(file,'utf8'));
  const lib=validateOutsideLibrary(await json(path.join(directory,'quotations.json')));
  const guides=new Map();
  for(const name of await fs.readdir(path.join(root,'study-guides')))if(name==='editorial.json'||name.endsWith('-batch.json'))
    for(const guide of (await json(path.join(root,'study-guides',name))).subjects)guides.set(guide.slug,guide);
  for(const name of (await fs.readdir(directory)).filter(name=>name!=='quotations.json')){
    const outside=await json(path.join(directory,name));
    assert.equal(name,outside.slug+'.json');
    // The plan is checked against the readings it lists for itself.
    validateOutsidePlan(outside,lib,(outside.kept||[]).map((key,i)=>({key,position:i+1,selectionIds:[]})));
    // An equal number: one outside quotation for each of the guide's quotations kept.
    assert.equal(outside.outside.length,outside.quotations,outside.slug);
    // The pilot must never hold up work on the guide itself: a guide that has changed since
    // the plan was written is reported here and refused only when the pilot page is built.
    const guide=guides.get(outside.slug),order=guide?.id===outside.subject?guide.order.filter(entry=>!entry.omitted).map(entry=>entry.key):[];
    const places=outside.kept.map(key=>order.indexOf(key));
    if(places.some((place,i)=>place<0||(i&&place<=places[i-1])))t.diagnostic(`${outside.slug}: the guide has changed since this plan was written; review the plan before building the pilot page`);
  }
});
