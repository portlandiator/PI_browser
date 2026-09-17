import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recordFilename} from '../src/record-file.mjs';

test('generated filenames preserve case-distinct source IDs on Windows',()=>{
  const ids=['BH05388','bh05388','BH03974x','BH03974X','MAF0001 trans','BH03636_start'];
  assert.equal(new Set(ids.map(id=>recordFilename(id).toLowerCase())).size,ids.length);
  assert.equal(recordFilename('BH05388'),'BH05388.json.gz');
  assert.equal(recordFilename('bh05388'),'~62~6805388.json.gz');
});
import {parseCsv,parseText,renderInline,normalize,tokenize,packPosting,unpackPosting,matchPostings,parseQuery,shardKey,matchRanges} from '../src/text.mjs';

test('CSV preserves quoted commas, escaped quotes, and multiline metadata',()=>{
  const rows=parseCsv('ID,Title,Abstract\r\nAB1,"Title, one","A ""quote""\nnext line"\r\nAB2,,\r\n');
  assert.deepEqual(rows,[{ID:'AB1',Title:'Title, one',Abstract:'A "quote"\nnext line'},{ID:'AB2',Title:'',Abstract:''}]);
  assert.throws(()=>parseCsv('ID,Title\n1,"bad'));
});
test('nested braces, HTML, italics and footnotes are rendered safely',()=>{
  const result=parseText('Love \\footnote{A \\textit{deep {nested} note} & <script>alert(1)</script>} remains.\n\nNext.','en');
  assert.equal(result.paragraphs.length,2);
  assert.equal(result.paragraphs[0].plain,'Love  remains.');
  assert.match(result.notes[0].html,/<em>deep \{nested\} note<\/em>/);
  assert.ok(!result.notes[0].html.includes('<script>'));
  assert.match(result.paragraphs[0].html,/ref-en-1/);
  assert.match(result.notes[0].html,/&lt;script&gt;/);
});
test('transliteration accents and unknown commands preserve content',()=>{
  assert.equal(renderInline('\\d{H}aq\\={i}qa \\textquoteleft Ali').plain,'Ḥaqīqa ‘ Ali');
  assert.equal(renderInline('\\unknown{keep this}').plain,'\\unknown{keep this}');
  assert.equal(renderInline('\\footnote{unclosed').plain,'\\footnote{unclosed');
});
test('normalization handles diacritics, Arabic/Persian variants, digits and ZWNJ',()=>{
  assert.equal(normalize('كِتاب يحيى ١۲'),'کتاب یحیی 12');
  assert.deepEqual(tokenize('می\u200cشود'),['می','شود']);
  assert.deepEqual(tokenize('Bahá’u’lláh'),['baha','u','llah']);
  assert.equal(shardKey('کتاب'),shardKey(normalize('كِتاب')));
});
test('posting codec preserves large deltas and repeated positions',()=>{
  const input=new Map([[0,[0,4,10000]],[129,[2,99999]],[29000,[7,9]]]);
  assert.deepEqual(unpackPosting(packPosting(input)),input);
  assert.throws(()=>unpackPosting(Uint8Array.of(128)));
});
test('phrase search enforces order, repeated words, and gaps',()=>{
  const postings=new Map([['love',new Map([[0,[0]],[1,[3]],[2,[0]],[3,[0,1]]])],['of',new Map([[0,[1]],[1,[2]],[2,[2]]])],['god',new Map([[0,[2]],[1,[1]],[2,[3]]])]]);
  assert.deepEqual(matchPostings(parseQuery('"love of god"'),postings),[0]);
  assert.deepEqual(matchPostings(parseQuery('love god'),postings),[0,1,2]);
  assert.deepEqual(matchPostings(parseQuery('"love love"'),postings),[3]);
  assert.deepEqual(matchPostings(parseQuery('loved'),postings),[]);
  assert.deepEqual(matchPostings(parseQuery('"love of god" missing'),postings),[]);
});
test('original-language exact phrases use the same token normalization',()=>{
  const postings=new Map([['کتاب',new Map([[7,[0]],[8,[2]]])],['الله',new Map([[7,[1]],[8,[0]]])]]);
  assert.deepEqual(matchPostings(parseQuery('"كِتاب اللَّه"'),postings),[7]);
});
test('phrase highlighting marks the phrase rather than every common word',()=>{
  const text='The heart, the love of God, and the soul.';
  const ranges=matchRanges(text,'"the love of god"');
  assert.deepEqual(ranges.map(([a,b])=>text.slice(a,b)),['the love of God']);
  assert.deepEqual(matchRanges('كِتاب اللَّه','"کتاب الله"'),[[0,12]]);
});
