import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {relations,copyrightWordLimit,words,firstReadings,validateOutsideLibrary,validateOutsidePlan,combinedSequence,decodeEntities,pageText,comparable,findQuotation} from '../scripts/study-guide-outside.mjs';
import {verifyOutsideQuotations} from '../scripts/verify-outside-quotations.mjs';
import {renderOutsidePilot,pilotDocument,guideArticles,citation,eraOf} from '../scripts/build-outside-pilot.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

const quotation=(extra={})=>({text:'No man is an island.',author:'John Donne',work:'Devotions',locator:'Meditation XVII',year:'1624',sortYear:1624,tradition:'English literature',kind:'literature',
  source:{url:'https://example.org/donne',label:'Example library',checked:'2026-11-16',status:'primary'},rights:{status:'public-domain',note:'Published 1624.'},...extra});
const library=(quotations={donne:quotation()})=>({format:1,quotations});
const reading=(key,position,selections=1)=>({key,position,selectionIds:Array.from({length:selections},(_,i)=>key+i),paragraphs:[{authorized:position===1}]});
const plan=(outside,extra={})=>({format:1,slug:'sample',subject:'S',limit:3,readings:2,quotations:3,introduction:'One paragraph.',questions:['One?','Two?','Three?'],outside,...extra});
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
    [[place('donne','c')],/outside the guide's first/],
    [[place('donne','a',{responds:['b']})],/must follow one of the readings/],
    [[place('donne','a',{responds:[]})],/must name the readings/],
    [[place('donne','a',{relation:'similar'})],/unknown relation/],
    [[place('donne','a',{why:'Too short.'})],/reason a reader can use/],
    [[place('donne','a')],/written for the guide's first 5 readings/,{readings:5}],
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
  const guide={id:'S',slug:'sample',displayTitle:'Sample subject',sourceName:'sample',arc:'First part → Second part → Third part',
    order:[{key:'a',why:'one'},{key:'b',why:'two'},{key:'c',why:'three'}],compiled:[reading('a',1,2),reading('b',2),reading('c',3)]};
  const pageHtml=`<main>${[1,2,3].map(article).join('')}</main>`;
  assert.equal(guideArticles(pageHtml).size,3);
  const lib=library({donne:quotation({text:'No <man> is an island & entire'}),verse:quotation({text:'Line one, / line two',verse:true,translator:'King James Version',translationYear:'1611',rights:{status:'in-copyright',note:'Author d. 1990.'},caveat:'Attribution doubted.'})});
  const rendered=renderOutsidePilot({guide,pageHtml,plan:plan([place('donne','a'),place('verse','b',{responds:['b','a'],relation:'complement'})],{leftOut:[{saying:'A saying',attributed:'Someone',reason:'No source.'}]}),library:lib,base:'https://example.org/site/',collection:'collections/x/',collectionGuides:[300,2,150]});
  assert.deepEqual(rendered.counts,{readings:2,quotations:3,outside:2,sequence:4});
  const ids=[...rendered.main.matchAll(/<article class="quotation[^"]*" id="reading-(\d+)"( data-kind="(\w+)")/g)].map(m=>m[1]+m[3]);
  assert.deepEqual(ids,['1guide','2outside','3guide','4outside']);
  assert.match(rendered.main,/aria-label="Reading 3">03<\/span><div class="quote-body"><blockquote><p>Reading 2</);
  assert.ok(rendered.main.includes('href="https://example.org/site/?id=R1"')&&!rendered.main.includes('href="../'));
  assert.ok(rendered.main.includes('No &lt;man&gt; is an island &amp; entire')&&!rendered.main.includes('<man>'));
  assert.match(rendered.main,/complement · with <a href="#reading-3">03<\/a>, <a href="#reading-1">01<\/a>/);
  assert.match(rendered.main,/<span class="line">Line one,<\/span><span class="line">line two<\/span>/);
  assert.ok(rendered.main.includes('Note on the text: Attribution doubted.')&&rendered.main.includes('Rights: in copyright, brief quotation. Author d. 1990.'));
  // Two of the guide's three sections are kept; the third is named as cut.
  assert.ok(rendered.main.includes('>First part</h3>')&&rendered.main.includes('>Second part</h3>')&&!rendered.main.includes('>Third part</h3>'));
  assert.match(rendered.main,/2 of its 3 sections/);
  // Section table: readings kept of those in the section, the guide's quotations, outside quotations.
  assert.ok(rendered.main.includes('<th scope="row">First part</th><td>1 of 1</td><td>2</td><td>1</td>')&&rendered.main.includes('<th scope="row">Second part</th><td>1 of 1</td><td>1</td><td>1</td>'));
  // Collection-wide: a limit of 3 keeps 3 + 2 + 3 of 452 quotations and shortens two guides.
  assert.match(rendered.main,/Across all 3 study guides the same rule would keep 8 of 452 quotations, shortening 2 guides/);
  assert.match(rendered.main,/1 of the guide’s 1 paragraphs in authorized translation are kept/);assert.match(rendered.main,/fall away entirely are: Third part/);
  assert.ok(rendered.main.includes('A saying'));
  assert.match(citation(lib.quotations.verse),/Meditation XVII, 1624, King James Version, 1611 -- <a href="https:\/\/example\.org\/donne"/);
  assert.match(citation(quotation({translator:'Edward Rehatsek',translationYear:'1888'})),/translated by Edward Rehatsek, 1888/);
  assert.match(citation(quotation({translator:'Joshua Kulp'})),/1624, translated by Joshua Kulp -- /);
  assert.equal(eraOf(-450),'Before the common era');assert.equal(eraOf(1624),'1500 – 1799');assert.equal(eraOf(2004),'2000 onward');
  const page=pilotDocument(rendered),fragment=pilotDocument(rendered,true);
  assert.ok(page.startsWith('<!doctype html>')&&fragment.startsWith('<title>Sample subject pilot</title>')&&!fragment.includes('<body'));
  // A page whose readings differ from the compiled guide is refused.
  assert.throws(()=>renderOutsidePilot({guide,pageHtml:`<main>${article(1)}</main>`,plan:plan([place('donne','a')]),library:lib,base:'x/',collection:'c'}),/rebuild the guides/);
  assert.throws(()=>renderOutsidePilot({guide,pageHtml,plan:plan([place('donne','a')],{quotations:2}),library:lib,base:'x/',collection:'c'}),/the cut now keeps 3/);
});

test('the committed library and plans are consistent with the guides they accompany',async()=>{
  const directory=path.join(root,'study-guides','outside'),json=async file=>JSON.parse(await fs.readFile(file,'utf8'));
  const lib=validateOutsideLibrary(await json(path.join(directory,'quotations.json')));
  const guides=new Map();
  for(const name of await fs.readdir(path.join(root,'study-guides')))if(name==='editorial.json'||name.endsWith('-batch.json'))
    for(const guide of (await json(path.join(root,'study-guides',name))).subjects)guides.set(guide.slug,guide);
  const used=new Set();
  for(const name of (await fs.readdir(directory)).filter(name=>name!=='quotations.json')){
    const outside=await json(path.join(directory,name)),guide=guides.get(outside.slug);
    assert.equal(name,outside.slug+'.json');assert.equal(guide?.id,outside.subject);
    // Without a built collection, the cut is checked as the plan records it: the first readings of the guide's order.
    const readings=guide.order.filter(entry=>!entry.omitted).slice(0,outside.readings).map((entry,i)=>({key:entry.key,position:i+1,selectionIds:[]}));
    validateOutsidePlan(outside,lib,readings);
    // An equal number: one outside quotation for each of the guide's quotations kept.
    assert.equal(outside.outside.length,outside.quotations,outside.slug);
    for(const placement of outside.outside)used.add(placement.id);
  }
  assert.deepEqual(Object.keys(lib.quotations).filter(id=>!used.has(id)),[],'every library quotation is placed in a guide');
});
