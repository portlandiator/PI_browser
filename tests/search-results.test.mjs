import test from 'node:test';
import assert from 'node:assert/strict';
import {parseText} from '../src/text.mjs';
import {matchingPassages} from '../src/search-passages.mjs';
import {searchHighlightRanges,searchHighlightHtml} from '../src/search-highlights.mjs';
import {groupedResultPassages,resultPassagePage,resultMetadataHtml,resultMode} from '../src/search-results.mjs';

const record=(en='',original='')=>({metadata:{Manuscripts:'M'},en:parseText(en,'en'),original:parseText(original,'original')});
const marks=(text,query)=>searchHighlightRanges(text,query).map(([a,b])=>text.slice(a,b));

test('stop words remain required for retrieval but are not highlighted inside phrases',()=>{
  assert.deepEqual(marks('The love of God, a gift and an answer.','"the love of God" a an and'),['love','God']);
  assert.deepEqual(marks('The love of God','"the love of God"'),['love','God']);
  assert.deepEqual(marks('a an the and of','a an the and of'),[]);
  assert.equal(matchingPassages(record('love God'),'"the love of God"').length,0);
  const model=groupedResultPassages(record('a an the'),'"a an the"');
  const page=resultPassagePage(model,'"a an the"','en');
  assert.equal(page.total,1);assert.match(page.html,/a an the/);assert.ok(!page.html.includes('<mark>'));
});

test('Arabic and Persian function words normalize without stripping attached word prefixes',()=>{
  assert.deepEqual(marks('إِنَّ في هذا كِتاب و من الله','"ان فی هذا کتاب" و من الله'),['كِتاب','الله']);
  assert.deepEqual(marks('این یک کتاب است و آن برای همه','این یک کتاب است و آن برای همه'),['کتاب','همه']);
  assert.deepEqual(marks('الکتاب کتابخانه','الکتاب کتاب'),['الکتاب']);
  assert.match(searchHighlightHtml('<img> the love & God','the love God'),/&lt;img&gt; the <mark>love<\/mark> &amp; <mark>God<\/mark>/);
});

test('distant matches are grouped once per paragraph with every occurrence retained',()=>{
  const text='love '+('filler '.repeat(100))+'love '+('filler '.repeat(100))+'love';
  const model=groupedResultPassages(record(text+'\n\nlove'),'love');
  assert.equal(model.independent.en.length,2);assert.equal(model.independent.en[0].texts.length,3);
  const page=resultPassagePage(model,'love','en');
  assert.equal(page.total,2);assert.equal((page.html.match(/English · Paragraph 1/g)||[]).length,1);
  assert.equal((page.html.match(/<mark>love<\/mark>/g)||[]).length,4);
  assert.match(page.html,/ … /);
});

test('parallel rows include counterparts and merge matches from both languages in source order',()=>{
  const model=groupedResultPassages(record('love\n\nsecond love','اصل love\n\nدوم'),'love');
  assert.equal(model.pairs.length,2);assert.equal(model.pairs[0].en.matched,true);assert.equal(model.pairs[0].original.matched,true);
  assert.equal(model.pairs[1].original.matched,false);assert.deepEqual(model.pairs[1].original.texts,['دوم']);
  const parallel=resultPassagePage(model,'love','parallel');
  assert.equal(parallel.total,2);assert.ok(parallel.html.indexOf('English · Paragraph 1')<parallel.html.indexOf('Original · Paragraph 1'));
  assert.match(parallel.html,/dir="rtl"/);
  const original=resultPassagePage(model,'love','original');
  assert.equal(original.total,2);assert.match(original.html,/دوم/);assert.ok(!original.html.includes('English ·'));
});

test('pairing uses blank alignment slots rather than fabricated paragraph-number matches',()=>{
  const model=groupedResultPassages(record('first\n\n\n\nlove','اول\n\nدوم\n\nسوم'),'love');
  assert.equal(model.pairs.length,1);assert.equal(model.pairs[0].en.index,1);assert.equal(model.pairs[0].original.index,2);
  const blank=groupedResultPassages(record('first\n\n\n\nlast','اول\n\nlove\n\nسوم'),'love');
  assert.equal(blank.pairs[0].en,undefined);assert.equal(blank.pairs[0].original.index,1);
});

test('unequal versions and footnotes stay independent, and denied originals never appear',()=>{
  const unequal=groupedResultPassages(record('love\n\nlove','love'),'love');
  assert.equal(unequal.pairs.length,0);assert.match(unequal.notice,/counts differ/);
  assert.match(resultPassagePage(unequal,'love').html,/result-independent/);
  const counterpart=groupedResultPassages(record('love\n\nlove','اصل متن'),'love');
  assert.equal(counterpart.independent.original.length,1);
  assert.equal(counterpart.independent.original[0].matched,false);
  assert.match(resultPassagePage(counterpart,'love','original').html,/اصل متن/);
  const notes=groupedResultPassages(record('love \\footnote{love note}','love \\footnote{love other}'),'love');
  assert.equal(notes.pairs.length,1);assert.equal(notes.independent.en.length,1);assert.equal(notes.independent.original.length,1);
  assert.match(resultPassagePage(notes,'love').html,/Footnote 1/);
  const denied=record('love','private love');denied.metadata={};
  const page=resultPassagePage(groupedResultPassages(denied,'love'),'love');
  assert.ok(!page.html.includes('private'));assert.match(page.html,/Original text unavailable/);
});

test('progressive rendering retains all grouped paragraphs and language-only empty states are explicit',()=>{
  const model=groupedResultPassages(record(Array.from({length:31},(_,i)=>`love ${i}`).join('\n\n')),'love');
  const initial=resultPassagePage(model,'love','en',8),complete=resultPassagePage(model,'love','en',32);
  assert.deepEqual([initial.shown,initial.total,initial.hasMore],[8,31,true]);
  assert.deepEqual([complete.shown,complete.total,complete.hasMore],[31,31,false]);
  assert.match(complete.html,/Paragraph 31/);
  assert.match(resultPassagePage(model,'love','original').html,/Original text unavailable/);
  assert.equal(resultMode('original'),'original');assert.equal(resultMode('invalid'),'parallel');assert.equal(resultMode(null,'en'),'en');
});

test('result metadata contains only date and volume, with escaped source labels',()=>{
  assert.equal(resultMetadataHtml({date:'1240? <x>',volume:'7',citationCount:33,place:'Tehran',hasEnglish:true}),'<span>1240? &lt;x&gt;</span><span>Vol. 7</span>');
  assert.equal(resultMetadataHtml({}),'<span>Date not recorded</span>');
});
