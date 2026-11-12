import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {prepareSource,Matcher,digest} from '../scripts/subject-core.mjs';
import {matchExtract} from '../scripts/extract-inputs.mjs';
import {trackedMatcher,reusableMatches,loadMatchCache,saveMatchCache,matchCacheFile} from '../scripts/subject-match-cache.mjs';

const corpus={
  AB1:'The lamp of unity shines brightly upon every assembled heart today.\n\nAnother paragraph speaks of gardens, rivers and nightingales in the morning.',
  AB2:'Justice is the best beloved of all things in the sight of the Lord.\n\nBe generous in prosperity and thankful in adversity, always.',
  AB3:'A treatise on medicine describes remedies, herbs and moderation in diet carefully.',
  BH1:'Knowledge is as wings to the life of the soul, and a ladder for its ascent.\n\nThe lamp of unity shines brightly within this other tablet as well.',
};
const selections=[
  {excerpt:'Justice is the best beloved of all things in the sight',suppliedIds:[]},               // one exact location
  {excerpt:'The lamp of unity shines brightly',suppliedIds:[]},                                     // repeated wording
  {excerpt:'The lamp of unity shines brightly',suppliedIds:['AB1']},                                // restricted to a supplied ID
  {excerpt:'Be generous in prosperity and thankful in adversity',suppliedIds:['AB2','ZZ9']},        // one supplied ID missing
  {excerpt:'gardens and rivers with nightingales singing every morning gladly',suppliedIds:[]},     // approximate, whole collection
  {excerpt:'remedies and herbs with great moderation of diet',suppliedIds:['AB3']},                 // approximate, supplied
  {excerpt:'Knowledge is as wings ... a ladder for its ascent',suppliedIds:[]},                     // omission-separated fragments
  {excerpt:'wings to the life of the soul',suppliedIds:[],outsideAuthor:true},                      // never searched
  {excerpt:'A wholly absent sentence about astronomy and telescopes',suppliedIds:[]},               // unmatched
  {excerpt:'...',suppliedIds:[]},                                                                   // no words
];
const key=s=>JSON.stringify([s.excerpt,s.suppliedIds,s.outsideAuthor]);
const prepare=texts=>Object.entries(texts).sort().map(([id,text])=>prepareSource(id,digest(text),text.split('\n\n').map(plain=>({plain}))));
function matchAll(texts,memo=new Map()){
  const sources=prepare(texts),map=new Map(sources.map(s=>[s.id,s]));
  let index,built=0;
  const tracked=trackedMatcher(map,()=>index??=(built++,new Matcher(sources)));
  const entries=new Map();let matched=0;
  for(const selection of selections){
    let entry=memo.get(key(selection));
    if(!entry){entry=tracked.run(matcher=>matchExtract(selection,matcher));matched++;}
    entries.set(key(selection),entry);
  }
  return {entries,matched,built,versions:new Map(sources.map(s=>[s.id,s.version])),map};
}
const results=entries=>new Map([...entries].map(([k,entry])=>[k,entry.match]));

test('reused matches equal a complete matching after every kind of text change',()=>{
  const first=matchAll(corpus);
  const changes={
    'unrelated text edited':{...corpus,AB3:corpus.AB3+' An appendix lists further preparations.'},
    'quoted text edited':{...corpus,AB2:corpus.AB2.replace('best beloved','most beloved')},
    'quoted paragraph moved':{...corpus,AB1:'A new opening paragraph.\n\n'+corpus.AB1},
    'wording now appears in a second text':{...corpus,AB3:corpus.AB3+'\n\nJustice is the best beloved of all things in the sight of the Lord.'},
    'approximate wording becomes exact':{...corpus,AB3:corpus.AB3+'\n\nThere were gardens and rivers with nightingales singing every morning gladly.'},
    'missing supplied text added':{...corpus,ZZ9:'Be generous in prosperity and thankful in adversity, they said.'},
    'text removed':Object.fromEntries(Object.entries(corpus).filter(([id])=>id!=='BH1')),
    'rare word becomes common':{...corpus,AB2:corpus.AB2+'\n\nNightingales, nightingales and gardens.',BH1:corpus.BH1+'\n\nGardens of nightingales.'},
  };
  for(const [name,texts] of Object.entries(changes)){
    const complete=matchAll(texts);
    const reusable=reusableMatches({versions:Object.fromEntries(first.versions),entries:first.entries},complete.versions,complete.map);
    const partial=matchAll(texts,reusable.entries);
    assert.deepEqual(results(partial.entries),results(complete.entries),name);
    assert.ok(reusable.changed.size>0,name);
    assert.ok(partial.matched<selections.length,name+': something is always reused');
  }
});

test('an unchanged collection reuses every match without indexing it',()=>{
  const first=matchAll(corpus);
  const reusable=reusableMatches({versions:Object.fromEntries(first.versions),entries:first.entries},first.versions,first.map);
  assert.equal(reusable.changed.size,0);
  const again=matchAll(corpus,reusable.entries);
  assert.equal(again.matched,0);assert.equal(again.built,0);
  assert.deepEqual(results(again.entries),results(first.entries));
});

test('an unrelated edit repeats only the collection-wide approximate searches',()=>{
  const first=matchAll(corpus),texts={...corpus,AB3:corpus.AB3+' An appendix lists further preparations.'};
  const now=matchAll(texts);
  const reusable=reusableMatches({versions:Object.fromEntries(first.versions),entries:first.entries},now.versions,now.map);
  const repeated=selections.filter(s=>!reusable.entries.has(key(s))).map(s=>s.excerpt);
  assert.deepEqual(repeated,['gardens and rivers with nightingales singing every morning gladly','remedies and herbs with great moderation of diet','A wholly absent sentence about astronomy and telescopes']);
});

test('the saved matches come back exactly, and only for the same matching code',async t=>{
  const out=await fs.mkdtemp(path.join(os.tmpdir(),'pi-matches-'));
  t.after(()=>fs.rm(out,{recursive:true,force:true}));
  assert.equal(await loadMatchCache(out,'code'),null);
  const first=matchAll(corpus);
  assert.ok([...first.entries.values()].some(e=>'reason' in e.match&&e.match.reason===undefined),'fixture has undefined properties');
  await saveMatchCache(out,'code',first.versions,first.entries);
  const loaded=await loadMatchCache(out,'code');
  assert.deepEqual(loaded.versions,Object.fromEntries(first.versions));
  assert.deepEqual([...loaded.entries],[...first.entries]);
  for(const [k,entry] of first.entries)assert.deepEqual(Object.keys(loaded.entries.get(k).match).sort(),Object.keys(entry.match).sort());
  assert.equal(await loadMatchCache(out,'other code'),null);
  const bytes=await fs.readFile(matchCacheFile(out));
  await fs.writeFile(matchCacheFile(out),bytes.subarray(0,bytes.length>>1));
  assert.equal(await loadMatchCache(out,'code'),null,'a truncated file is not used');
});
