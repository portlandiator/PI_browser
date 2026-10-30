import test from 'node:test';
import assert from 'node:assert/strict';
import {paragraphReference,paragraphUrl,paragraphTarget} from '../src/paragraph-links.mjs';
import {parseText} from '../src/text.mjs';

test('readable references use positive source paragraph numbers and explicit languages',()=>{
  assert.deepEqual(paragraphReference('12'),{number:12,language:'en'});
  assert.deepEqual(paragraphReference('01'),{number:1,language:'en'});
  assert.deepEqual(paragraphReference('12','original'),{number:12,language:'original'});
  for(const number of ['',0,-1,'1.5','1e2','12junk',' 12','12-14',Infinity,'9007199254740992']){
    assert.equal(paragraphReference(number),null,String(number));
  }
  assert.equal(paragraphReference(12,'both'),null);
});

test('share URLs retain the project subpath and exact record identity without browsing state',()=>{
  assert.equal(paragraphUrl('/PI_browser/','BH00001',paragraphReference(12)),'/PI_browser/?id=BH00001&paragraph=12');
  const url=new URL(paragraphUrl('/PI_browser/index.html','AB00292 (2)',paragraphReference(5,'original')),'https://example.org');
  assert.equal(url.pathname,'/PI_browser/index.html');
  assert.deepEqual([...url.searchParams],[['id','AB00292 (2)'],['paragraph','5'],['lang','original']]);
  assert.equal(paragraphUrl('/PI_browser/','bh05388',paragraphReference(1)),'/PI_browser/?id=bh05388&paragraph=1');
});

test('targets beyond the first batch account for blank slots without changing paragraph identity',()=>{
  const en=parseText(Array.from({length:102},(_,i)=>'Paragraph '+(i+1)).join('\n\n\n\n'),'en');
  const original=parseText('اول\n\nدوم','original');
  const record={en,original};
  assert.deepEqual(paragraphTarget(record,paragraphReference(100)),{id:'p-en-100',visibleParagraphs:200});
  assert.deepEqual(paragraphTarget(record,paragraphReference(102)),{id:'p-en-102',visibleParagraphs:300});
  assert.deepEqual(paragraphTarget(record,paragraphReference(2,'original')),{id:'p-original-2',visibleParagraphs:100});
  assert.equal(paragraphTarget(record,paragraphReference(3,'original')),null);
  assert.equal(paragraphTarget(record,paragraphReference(103)),null);
  assert.equal(paragraphTarget(record,null),null);
});

test('missing and withheld versions never redirect to the other language',()=>{
  const record={en:parseText('English','en'),original:parseText('','original')};
  assert.equal(paragraphTarget(null,paragraphReference(1)),null);
  assert.equal(paragraphTarget(record,paragraphReference(1,'original')),null);
  assert.deepEqual(paragraphTarget(record,paragraphReference(1)),{id:'p-en-1',visibleParagraphs:100});
  assert.equal(paragraphTarget({en:record.original,original:record.original},paragraphReference(1)),null);
});
