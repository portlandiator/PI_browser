import test from 'node:test';
import assert from 'node:assert/strict';
import {parseText} from '../src/text.mjs';
import {alignmentSlots,readingSlots,alignmentCounts,readingPosition} from '../src/paragraph-alignment.mjs';

test('four or more internal logical line breaks add exactly one slot for LF, CR and CRLF',()=>{
  for(const newline of ['\n','\r','\r\n']){
    assert.deepEqual(alignmentSlots('First'+newline.repeat(2)+'Second'),[0,1]);
    assert.deepEqual(alignmentSlots('First'+newline.repeat(3)+'Second'),[0,1]);
    assert.deepEqual(alignmentSlots('First'+newline.repeat(4)+'Second'),[0,null,1]);
    assert.deepEqual(alignmentSlots('First'+newline.repeat(12)+'Second'),[0,null,1]);
    assert.deepEqual(alignmentSlots(newline.repeat(6)+'First'+newline.repeat(6)),[0]);
    assert.deepEqual(alignmentSlots(newline.repeat(6)+'First'+newline.repeat(4)+'Second'+newline.repeat(6)),[0,null,1]);
  }
  assert.deepEqual(alignmentSlots('\n\n\n'),[]);
  assert.deepEqual(alignmentSlots('\r\n\r\n\r\n\r\n'),[]);
  assert.deepEqual(alignmentSlots('First\n \n\n\nSecond'),[0,1]);
  assert.deepEqual(alignmentSlots('First\r\n\n\r\r\nSecond'),[0,null,1]);
});

test('alignment leaves source text, notes, paragraph identity and matching positions unchanged',()=>{
  const ordinary=parseText('First \\footnote{Note}\n\nSecond','en');
  const spaced=parseText('First \\footnote{Note}\n\n\n\nSecond','en');
  assert.deepEqual(spaced.paragraphs,ordinary.paragraphs);
  assert.deepEqual(spaced.notes,ordinary.notes);
  assert.deepEqual(readingSlots(ordinary),[0,1]);
  assert.deepEqual(readingSlots(spaced),[0,null,1]);
  assert.equal(readingPosition(spaced,1),2);
  assert.deepEqual(alignmentCounts({en:spaced,original:parseText('اول\n\nدوم\n\nسوم','original')}),{en:3,original:3});
  assert.deepEqual(readingSlots({...spaced,paragraphs:[]}),[]);
});

test('deep links beyond a reading batch include preceding blank alignment slots',()=>{
  const version=parseText(Array.from({length:102},(_,i)=>'Paragraph '+i).join('\n\n\n\n'),'en');
  assert.equal(version.paragraphs.length,102);
  assert.equal(readingPosition(version,99),198);
  assert.equal(readingSlots(version).length,203);
});
