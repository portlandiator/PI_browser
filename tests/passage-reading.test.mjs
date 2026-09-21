import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readingPreferences} from '../src/passage-reading.mjs';

test('passage links override saved reading preferences',()=>{
  assert.deepEqual(readingPreferences(new URLSearchParams('mode=original&size=120'),{mode:'en',scale:.9}),{mode:'original',scale:1.2});
  assert.deepEqual(readingPreferences(new URLSearchParams(),{mode:'en',scale:1.1}),{mode:'en',scale:1.1});
});
test('invalid reading settings fall back safely and sizes stay in range',()=>{
  assert.deepEqual(readingPreferences(new URLSearchParams('mode=bad&size=NaN')),{mode:'parallel',scale:1});
  assert.equal(readingPreferences(new URLSearchParams('size=300')).scale,1.35);
  assert.equal(readingPreferences(new URLSearchParams('size=10')).scale,.85);
});
