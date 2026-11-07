import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseDictionary,dictionaryKey,wordTags} from '../src/dictionary.mjs';
import {readDictionaryCatalog} from '../scripts/build-dictionaries.mjs';

const root=path.resolve(import.meta.dirname,'..');
const columns=['form','vocalized','lemma','lang','translit','pos','root','gloss','rendering','tags','modern','modern_translit','modern_gloss','shift','definition','usage','notes','status','reviewer'];
const modernTags=['archaic','literary','meaning-shift'];

// The TSV read directly, so the checks do not depend on which columns
// parseDictionary keeps.
async function readTsv(file){
  const text=await fs.readFile(path.join(root,'dictionaries',file),'utf8');
  assert.ok(!text.startsWith('﻿'),`${file} has a byte order mark`);
  assert.ok(!text.includes('\r'),`${file} has CR line endings`);
  assert.ok(text.endsWith('\n'),`${file} lacks a trailing newline`);
  const [header,...lines]=text.slice(0,-1).split('\n');
  const names=header.split('\t');
  const rows=lines.map((line,i)=>{
    const values=line.split('\t');
    assert.equal(values.length,names.length,`${file} line ${i+2}: column count`);
    return Object.fromEntries(names.map((name,j)=>[name,values[j]]));
  });
  return {text,names,rows};
}
// Letters only: combining marks (vowels, shadda, hamza signs) and the
// superscript alef removed, without Unicode normalization.
const vowelLetters=word=>String(word).replace(/[\p{Mn}\u0670]/gu,'');
const tagsOf=row=>row.tags?row.tags.split(','):[];

test('the catalog lists the core-texts sample after the Volume 164 sample, labelled AI-generated',async()=>{
  const catalog=await readDictionaryCatalog(root);
  const ids=catalog.map(item=>item.id);
  const item=catalog.find(entry=>entry.id==='sample-core-texts');
  assert.ok(item);
  assert.equal(item.file,'sample-core-texts.tsv');
  assert.equal(item.aiGenerated,true);
  assert.equal(ids.indexOf('sample-core-texts'),ids.indexOf('sample-volume-164')+1);
});

test('both sample dictionaries have the 19 columns in order',async()=>{
  for(const file of ['sample-volume-164.tsv','sample-core-texts.tsv'])
    assert.deepEqual((await readTsv(file)).names,columns,file);
});

test('the core-texts sample covers its forms without repeating Volume 164 forms',async()=>{
  const core=await readTsv('sample-core-texts.tsv'),volume=await readTsv('sample-volume-164.tsv');
  const forms=new Set(core.rows.map(row=>row.form));
  assert.ok(forms.size>=7876,`only ${forms.size} forms`);
  const volumeKeys=new Set(volume.rows.map(row=>dictionaryKey(row.form)));
  const shared=[...forms].filter(form=>volumeKeys.has(dictionaryKey(form)));
  assert.deepEqual(shared,[]);
  assert.ok(parseDictionary(core.text,{strict:true}).length===core.rows.length);
});

test('core-texts entries are complete, vowelled with the same letters, and unreviewed',async()=>{
  const {rows}=await readTsv('sample-core-texts.tsv');
  for(const [i,row] of rows.entries()){
    const where=`line ${i+2} (${row.form})`;
    assert.equal(vowelLetters(row.vocalized),row.form,`${where}: vocalized letters`);
    for(const column of ['vocalized','translit','pos','gloss','rendering','definition'])assert.ok(row[column].trim(),`${where}: empty ${column}`);
    for(const tag of tagsOf(row))assert.ok(wordTags.includes(tag),`${where}: tag ${tag}`);
    assert.ok(['unreviewed','uncertain'].includes(row.status),`${where}: status ${row.status}`);
    assert.equal(row.reviewer,'',`${where}: reviewer`);
  }
});

test('tags are allowed, modern equivalents only come with archaic, literary or meaning-shift, and no entry is reviewed yet',async()=>{
  for(const file of ['sample-volume-164.tsv','sample-core-texts.tsv']){
    const {rows}=await readTsv(file);
    for(const [i,row] of rows.entries()){
      const where=`${file} line ${i+2} (${row.form})`,tags=tagsOf(row);
      for(const tag of tags)assert.ok(wordTags.includes(tag),`${where}: tag ${tag}`);
      assert.equal(new Set(tags).size,tags.length,`${where}: repeated tag`);
      if(row.modern)assert.ok(tags.some(tag=>modernTags.includes(tag)),`${where}: modern without archaic, literary or meaning-shift`);
      assert.equal(!!row.shift.trim(),tags.includes('meaning-shift'),`${where}: shift must be set exactly when tagged meaning-shift`);
      for(const column of ['modern_translit','modern_gloss'])assert.equal(!!row[column].trim(),!!row.modern.trim(),`${where}: ${column} must be set exactly when modern is`);
      assert.ok(['','unreviewed','uncertain','reviewed'].includes(row.status),`${where}: status ${row.status}`);
      assert.equal(row.reviewer,'',`${where}: reviewer set`);
    }
  }
});
