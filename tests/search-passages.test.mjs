import test from 'node:test';
import assert from 'node:assert/strict';
import {parseText,parseQuery,matchPostings,packPosting,unpackPosting,matchRanges} from '../src/text.mjs';
import {indexedUnits,matchingUnits,matchingPassages,passageExcerpts,resultExcerpts,excerptHtml} from '../src/search-passages.mjs';

const record=(en='',original='')=>({en:parseText(en,'en'),original:parseText(original,'original')});
function index(records,language='en'){
  const postings=new Map(),ends=new Map();
  records.forEach((record,doc)=>{
    ends.set(doc,[]);
    for(const unit of indexedUnits(record[language])){
      ends.get(doc).push(unit.end);
      unit.words.forEach((word,i)=>{
        if(!postings.has(word))postings.set(word,new Map());
        if(!postings.get(word).has(doc))postings.get(word).set(doc,[]);
        postings.get(word).get(doc).push(unit.start+i);
      });
    }
  });
  return {postings:new Map([...postings].map(([word,list])=>[word,unpackPosting(packPosting(list))])),ends};
}
function find(records,query,language='en'){
  const {postings,ends}=index(records,language),groups=parseQuery(query);
  return matchPostings(groups,postings).filter(doc=>matchingUnits(groups,postings,doc,ends.get(doc)).length);
}

test('all words and phrases must share one paragraph, with complete phrase order and whole words',()=>{
  const records=[record('love\n\nGod'),record('God and love'),record('beloved God'),record('love of God\n\npeace'),record('peace and love of God'),record('God of love peace')];
  assert.deepEqual(find(records,'love God'),[1,3,4,5]);
  assert.deepEqual(find(records,'"love of God" peace'),[4]);
  assert.deepEqual(find(records,'"love of God" "and peace"'),[]);
  assert.deepEqual(find([record('love of God and peace')],'"love of God" "and peace"'),[0]);
  assert.deepEqual(find([record('love\n\nlove'),record('love love')],'"love love"'),[1]);
  assert.deepEqual(find([record('love of\n\nGod')],'"love of God"'),[]);
  assert.deepEqual(find([record('love\n\nGod')],'love-God'),[]);
  assert.deepEqual(find([record('love God')],'love love God'),[0]);
});

test('paragraph, footnote and nested-note text cannot combine; a complete note is searchable',()=>{
  const records=[record('love \\footnote{God}'),record('Text \\footnote{love} \\footnote{God}'),record('Text \\footnote{love \\footnote{God}}'),record('Text \\footnote{love of God}'),record('love \\footnote{independent} of God')];
  assert.deepEqual(find(records,'love God'),[3,4]);
  assert.deepEqual(find(records,'"love of God"'),[3,4]);
  assert.deepEqual(matchingPassages(records[3],'love God').map(m=>m.id),['note-en-1']);
  assert.deepEqual(matchingPassages(record('Text \\footnote{outer \\footnote{love God}}'),'love God').map(m=>m.id),['note-en-2']);
});

test('same-language matching preserves normalization, blanks and source paragraph identities',()=>{
  const records=[record('love','God'),record('','كِتاب\n\nاللَّه'),record('','كِتاب اللَّه ١۲ می\u200cشود'),record('love\n\n\n\nGod'),record('love God')];
  assert.deepEqual(find(records,'love God'),[4]);
  assert.deepEqual(find(records,'کتاب الله','original'),[2]);
  assert.deepEqual(find(records,'"کتاب الله" 12 "می شود"','original'),[2]);
  assert.deepEqual(matchingPassages(records[2],'"کتاب الله" 12').map(m=>m.id),['p-original-1']);
  const withBlank=record('other\n\n\n\nlove God');
  assert.deepEqual(matchingPassages(withBlank,'love God').map(m=>m.id),['p-en-2']);
});

test('snippets cover every hit and complete phrase, including distant hits and both languages',()=>{
  const text='love '+('filler '.repeat(100))+'love of God '+('filler '.repeat(100))+'love';
  const excerpts=passageExcerpts(text,'love');
  assert.equal(excerpts.length,3);
  assert.equal(excerpts.join(' ').match(/love/g).length,3);
  const phrase=Array.from({length:40},()=> 'love').join(' ');
  assert.ok(passageExcerpts(phrase,`"${phrase}"`)[0].includes(phrase));
  const many=record(Array.from({length:51},(_,i)=>`love God ${i}`).join('\n\n'),'love God');
  const all=resultExcerpts(many,'love God');
  assert.equal(all.length,52);assert.equal(all.at(-1).language,'original');assert.equal(all[50].index,50);
  assert.equal(resultExcerpts(record('love\n\nGod\n\nlove God'),'love God').length,1);
});

test('snippet markup escapes source content, uses RTL and highlights normalized compatibility text',()=>{
  const html=excerptHtml({language:'original',kind:'notes',index:2,text:'كِتاب <script>& "quote"'},'کتاب');
  assert.match(html,/dir="rtl"/);assert.match(html,/Footnote 3/);assert.match(html,/<mark>كِتاب<\/mark>/);
  assert.ok(!html.includes('<script>'));assert.match(html,/&lt;script&gt;&amp;/);
  // NFKD expands this Arabic ligature into multiple search tokens.
  assert.ok(matchRanges('ﷺ','"صلى الله عليه وسلم"').length);
  assert.equal(resultExcerpts(record('','ﷺ'),'"صلى الله عليه وسلم"').length,1);
});

test('indexed unit matches and displayed matches agree for every query in a mixed fixture',()=>{
  const records=[record('love of God\n\npeace love\n\nGod peace'),record('love peace \\footnote{God peace}'),record('love love God \\footnote{love of God}'),record('','كِتاب الله\n\nكِتاب حق')];
  for(const language of ['en','original'])for(const query of ['love','love God','"love of God" peace','"love love" God','God peace','کتاب حق','"کتاب الله"','', '---']){
    const {postings,ends}=index(records,language);
    records.forEach((record,doc)=>{
      const actual=matchingUnits(parseQuery(query),postings,doc,ends.get(doc));
      const expected=matchingPassages(record,query,[language]).map(m=>m.kind==='paragraphs'?m.index:record[language].paragraphs.length+m.index);
      assert.deepEqual(actual,expected,`${language}: ${query}, ${doc}`);
    });
  }
  assert.throws(()=>matchingUnits(parseQuery('love'),new Map(),0),/boundaries/);
});
