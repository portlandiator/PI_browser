import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parseDictionary,dictionaryTarget,explainsEnglish,isOriginalScript,lookupWord,indexEntries,withExplanations,wordTags} from '../src/dictionary.mjs';
import {createDictionaryStore} from '../src/dictionary-store.mjs';
import {interlinearCells,tooltipHtml,kjvHtml} from '../src/word-study.mjs';
import {prepareEntry,detailHtml} from '../src/dictionary-browser-core.mjs';
import {reviewColumns,readReviewSource,editableColumns} from '../src/dictionary-review-core.mjs';
import {buildDictionaries,readDictionaryCatalog} from '../scripts/build-dictionaries.mjs';

const root=path.resolve(import.meta.dirname,'..');
const columns=['form','lemma','lang','pos','gloss','tags','shift','definition','usage','notes','status','reviewer','kjv','kjv_text'];
const reference=/^(?:[1-3] )?[A-Z][a-z]+(?: of [A-Z][a-z]+)? \d+:\d+$/;

async function readTsv(file){
  const text=await fs.readFile(path.join(root,'dictionaries',file),'utf8');
  assert.ok(!text.startsWith('﻿')&&!text.includes('\r')&&text.endsWith('\n'));
  const [header,...lines]=text.slice(0,-1).split('\n');
  const names=header.split('\t');
  return {text,names,rows:lines.map((line,i)=>{const values=line.split('\t');assert.equal(values.length,names.length,`line ${i+2}: column count`);return Object.fromEntries(names.map((name,j)=>[name,values[j]]));})};
}

test('the archaic English dictionary is listed as AI-generated, explaining English in modern English',async()=>{
  const item=(await readDictionaryCatalog(root)).find(entry=>entry.id==='archaic-english');
  assert.ok(item);
  assert.equal(item.file,'archaic-english.tsv');
  assert.equal(item.aiGenerated,true);
  assert.equal(item.target,'modern');
  assert.ok(item.about.length>=3&&item.about.length<=4);
  assert.match(item.source,/https:\/\/ebible\.org\/Scriptures\/eng-kjv_vpl\.zip/);
  assert.equal(dictionaryTarget(parseDictionary((await readTsv(item.file)).text)),'modern');
});

test('archaic English entries: one per Latin form, valid tags, shift only with meaning-shift, KJV excerpts only with a reference',async()=>{
  const {text,names,rows}=await readTsv('archaic-english.tsv');
  assert.deepEqual(names,columns);
  assert.equal(parseDictionary(text,{strict:true}).length,rows.length);
  assert.ok(rows.length>=300&&rows.length<=800,`${rows.length} entries`);
  assert.equal(new Set(rows.map(row=>row.form)).size,rows.length);
  for(const row of rows){
    const at=`${row.form}`;
    assert.match(row.form,/^[a-z][a-z'-]*$/,at);
    assert.equal(row.lang,'en',at);
    assert.ok(row.lemma&&row.pos&&row.gloss&&row.definition,at);
    for(const value of Object.values(row))assert.ok(!isOriginalScript(value),at);
    const tags=row.tags.split(',');
    assert.ok(row.tags&&tags.every(tag=>wordTags.includes(tag)),at);
    assert.ok(tags.includes('archaic')||tags.includes('literary'),at);
    assert.equal(tags.includes('meaning-shift'),!!row.shift,at);
    if(row.shift)assert.match(row.shift,/^Here.*Today/,at);
    assert.ok(['unreviewed','uncertain'].includes(row.status),at);
    assert.equal(row.reviewer,'',at);
    assert.ok(!row.kjv_text||row.kjv,`${at}: kjv_text without kjv`);
    if(row.kjv){
      assert.match(row.kjv,reference,at);
      assert.ok(row.kjv_text.split(/\s+/).length<=15,at);
      assert.match(row.kjv_text,new RegExp(`(^|[^a-z])${row.form}($|[^a-z])`,'i'),at);
      assert.ok(!/[[\]¶]/.test(row.kjv_text),at);
    }
  }
  const forms=new Set(rows.map(row=>row.form));
  for(const form of ['thou','thee','thy','thine','ye','hath','doth','art','shalt','wilt','divers','verily','wherefore','whence','whither','lo','behold','nay','yea','ere','peradventure','betwixt','unto','wherein','whereby','vouchsafe','bestow','travail','becometh','beareth','knowest','didst'])assert.ok(forms.has(form),form);
  const divers=rows.find(row=>row.form==='divers');
  assert.equal(divers.gloss,'various');assert.ok(divers.tags.includes('meaning-shift'));assert.equal(divers.kjv,'Matthew 4:24');
});

test('kjv and kjv_text parse with aliases; an excerpt needs a reference',()=>{
  const [entry]=parseDictionary('Form\tGloss\tBible\tKJV text\ndivers\tvarious\tMatthew 4:24\ttaken with divers diseases\n',{strict:true});
  assert.equal(entry.kjv,'Matthew 4:24');assert.equal(entry.kjv_text,'taken with divers diseases');
  assert.equal(parseDictionary('form\tgloss\tkjv verse\tkjv excerpt\nhath\thas\tJob 1:21\tthe LORD hath taken away\n')[0].kjv_text,'the LORD hath taken away');
  assert.throws(()=>parseDictionary('form\tgloss\tkjv_text\ndivers\tvarious\ttaken with divers diseases\n',{strict:true}),/kjv_text needs a kjv reference/);
  assert.equal(parseDictionary('form\tgloss\tkjv_text\ndivers\tvarious\ttaken with divers diseases\n')[0].kjv_text,undefined);
  assert.equal(dictionaryTarget(parseDictionary('form\tgloss\nhath\thas\n')),'modern');
});

const archaic='form\tlemma\tlang\tpos\tgloss\ttags\tshift\tdefinition\tusage\tkjv\tkjv_text\ndivers\tdivers\ten\tadj.\tvarious\tarchaic,meaning-shift\tHere: various. Today: people who dive.\tSeveral different.\tMostly before plural nouns: “…divers peoples…”.\tMatthew 4:24\ttaken with divers diseases <b>\nhath\thave\ten\tverb 3sg pres.\thas\tarchaic\t\tHas.\t\t\t\nknowest\tknow\ten\tverb 2sg pres.\tknow\tarchaic\t\tYou know.\t\t\t\n';
const persian='form\ttranslit\tgloss\tdefinition\ndivers\tدایوِرز\tگوناگون\tچند نوع\nknow\tنو\tدانستن\tآگاه بودن\n';

test('the tooltip explains an archaic English word first, with its modern meaning and King James line, escaped',()=>{
  const explained={word:'divers',key:'divers',side:'english',matched:'divers',via:'',entries:parseDictionary(archaic).slice(0,1).map(entry=>({...entry,dictionary:'archaic'}))};
  const usual={word:'divers',key:'divers',side:'english',matched:'divers',via:'',entries:parseDictionary(persian).slice(0,1).map(entry=>({...entry,dictionary:'fa'}))};
  const result=withExplanations(usual,explained);
  assert.equal(result.entries[0].dictionary,'archaic');assert.equal(result.entries[1].dictionary,'fa');
  assert.ok(explainsEnglish(result.entries[0]));assert.ok(!explainsEnglish(result.entries[1]));
  const html=tooltipHtml(result,id=>({name:id,kind:'published',aiGenerated:true}));
  assert.match(html,/<span class="word-tooltip-gloss-label">Modern:<\/span> various/);
  assert.match(html,/Meaning shift:/);
  assert.match(html,/In the translations:/);
  assert.match(html,/King James Bible:<\/span> “…taken with divers diseases &lt;b&gt;…” — <span class="word-tooltip-kjv-ref">Matthew 4:24<\/span>/);
  assert.ok(!/<b>/.test(html));
  assert.match(html,/1 more/);
  assert.equal(kjvHtml({kjv_text:'x'}),'');
  assert.equal(withExplanations(usual,{...explained,entries:[]}),usual);
});

test('the dictionary browser and review page show the King James columns',()=>{
  const [entry]=parseDictionary(archaic);
  const html=detailHtml(prepareEntry(entry,'archaic',0,'modern'),{name:'Archaic',aiGenerated:true});
  assert.match(html,/<dt>King James Bible<\/dt><dd>“…taken with divers diseases &lt;b&gt;…” — Matthew 4:24<\/dd>/);
  assert.match(html,/<dt>In the translations<\/dt>/);
  assert.ok(reviewColumns.includes('kjv')&&reviewColumns.includes('kjv_text'));
  const source=readReviewSource(archaic);
  assert.ok(editableColumns(source).includes('kjv_text'));
});

test('a modern-English dictionary never supplies the Words: English row, and its entries come first only when explaining',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'pi-archaic-'));
  const realFetch=globalThis.fetch,storage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{value:{getItem:()=>null,setItem(){}},configurable:true,writable:true});
  try{
    await fs.mkdir(path.join(temp,'dictionaries'));
    await fs.writeFile(path.join(temp,'dictionaries','a.tsv'),archaic);
    await fs.writeFile(path.join(temp,'dictionaries','p.tsv'),persian);
    // The archaic dictionary is listed first, so ordering alone would let it win.
    await fs.writeFile(path.join(temp,'dictionaries','dictionaries.json'),JSON.stringify({dictionaries:[{id:'archaic',name:'Archaic',file:'a.tsv',aiGenerated:true,target:'modern'},{id:'fa',name:'Persian',file:'p.tsv',aiGenerated:true}]}));
    const out=path.join(temp,'out');
    await buildDictionaries(temp,out);
    const index=JSON.parse(await fs.readFile(path.join(out,'dictionaries','index.json'),'utf8'));
    assert.deepEqual(index.dictionaries.map(item=>item.target),['modern','fa']);
    globalThis.fetch=async url=>{try{const text=await fs.readFile(path.join(out,new URL(url).pathname));return {ok:true,json:async()=>JSON.parse(text)};}catch{return {ok:false,json:async()=>({})};}};
    const store=createDictionaryStore('http://localhost/');
    for(const target of ['fa','ar','']){
      const usual=await store.lookup('divers',{target});
      assert.equal(interlinearCells(usual).gloss,'گوناگون',target);
      assert.ok(usual.entries.every(entry=>entry.dictionary==='fa'));
    }
    assert.equal(interlinearCells(await store.lookup('hath',{target:'fa'})).gloss,'');
    const known=await store.lookup('knowest',{target:'fa'});
    assert.equal(known.via,'est');assert.equal(interlinearCells(known).gloss,'دانستن');
    const explained=await store.lookup('Divers',{target:'fa',explain:true});
    assert.deepEqual(explained.entries.map(entry=>entry.dictionary),['archaic','fa']);
    assert.equal(explained.entries[0].kjv,'Matthew 4:24');
    const knowest=await store.lookup('knowest',{target:'fa',explain:true});
    assert.equal(knowest.via,'');assert.equal(knowest.entries[0].gloss,'know');assert.equal(knowest.entries[1].foundAs,'know');
    // Explanations are exact: no ending is removed to find them.
    assert.deepEqual((await store.lookup('hathed',{target:'fa',explain:true})).entries,[]);
    // Original-script words are unaffected.
    assert.deepEqual((await store.lookup('الهی',{target:'fa',explain:true})).entries,[]);
  }finally{globalThis.fetch=realFetch;if(storage)Object.defineProperty(globalThis,'localStorage',storage);else delete globalThis.localStorage;await fs.rm(temp,{recursive:true,force:true});}
});

test('exact lookups do not remove endings',async()=>{
  const {english}=indexEntries(parseDictionary(persian),'fa');
  const get=async(dictionary,side,key)=>side==='english'?english.get(key)||[]:[];
  assert.equal((await lookupWord('knowing',['fa'],get)).entries.length,1);
  assert.equal((await lookupWord('knowing',['fa'],get,{exact:true})).entries.length,0);
});
