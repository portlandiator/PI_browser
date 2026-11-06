import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parseDictionary,dictionaryKey,dictionaryShard} from '../src/dictionary.mjs';
import {buildDictionaries,readDictionaryCatalog,publishedSourceName} from '../scripts/build-dictionaries.mjs';
import {readReviewSource,editableColumns,filterRows,statusCounts,setDraft,draftFor,draftKey,draftCount,storageKey,reviewedEntry,reviewerStamp,markReviewed,markUncertain,exportTsv,hasContext} from '../src/dictionary-review-core.mjs';

const root=path.resolve(import.meta.dirname,'..');
const tsv='form\tgloss\tstatus\treviewer\nنور\tlight\tReviewed\tSL 2026-11-05\nالهی\tdivine\tUNCERTAIN\t\nمن\tI\t\t\nشود\tbecomes\tunreviewed\t\n';

test('status and reviewer columns parse with aliases and any case',()=>{
  const entries=parseDictionary(tsv,{strict:true});
  assert.deepEqual(entries.map(e=>e.status),['reviewed','uncertain',undefined,'unreviewed']);
  assert.equal(entries[0].reviewer,'SL 2026-11-05');assert.equal(entries[1].reviewer,undefined);
  assert.equal(parseDictionary('form,gloss,Review\nنور,light,reviewed\n')[0].status,'reviewed');
  assert.equal(parseDictionary('form\tgloss\tReview Status\nنور\tlight\tUncertain\n')[0].status,'uncertain');
});

test('invalid status is dropped leniently and rejected strictly; reviewer needs reviewed',()=>{
  const bad='form\tgloss\tstatus\nنور\tlight\tchecked\n';
  assert.equal('status' in parseDictionary(bad)[0],false);
  assert.throws(()=>parseDictionary(bad,{strict:true}),/Row 2 \(نور\): status must be unreviewed, uncertain or reviewed/);
  const reviewer='form\tgloss\tstatus\treviewer\nنور\tlight\tuncertain\tSL\n';
  assert.equal(parseDictionary(reviewer)[0].reviewer,'SL');
  assert.throws(()=>parseDictionary(reviewer,{strict:true}),/reviewer/);
  assert.throws(()=>parseDictionary('form\tgloss\treviewer\nنور\tlight\tSL\n',{strict:true}),/reviewer/);
});

test('sample dictionaries give every row a status, with the uncertain notes marked',async()=>{
  const expected={'sample-volume-164':25,'sample-volume-164-en-fa':18,'sample-volume-164-en-ar':12};
  for(const item of await readDictionaryCatalog(root)){
    if(!(item.id in expected))continue;
    const entries=parseDictionary(await fs.readFile(path.join(root,'dictionaries',item.file),'utf8'),{strict:true});
    assert.ok(entries.every(e=>e.status==='unreviewed'||e.status==='uncertain'),item.id);
    assert.ok(entries.every(e=>!e.reviewer),item.id);
    assert.equal(entries.filter(e=>e.status==='uncertain').length,expected[item.id],item.id);
    assert.ok(entries.filter(e=>/uncertain|نامطمئن|غير مؤكد/i.test(e.notes||'')).every(e=>e.status==='uncertain'),item.id);
    delete expected[item.id];
  }
  assert.deepEqual(expected,{});
});

test('the build publishes review counts and keeps status in the shards',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'pi-dictionary-review-'));
  try{
    await fs.mkdir(path.join(temp,'dictionaries'));
    await fs.writeFile(path.join(temp,'dictionaries','t.tsv'),tsv);
    await fs.writeFile(path.join(temp,'dictionaries','dictionaries.json'),JSON.stringify({dictionaries:[{id:'t',name:'Test',file:'t.tsv'}]}));
    await buildDictionaries(temp,path.join(temp,'out'));
    const index=JSON.parse(await fs.readFile(path.join(temp,'out','dictionaries','index.json'),'utf8'));
    assert.deepEqual(index.dictionaries[0].review,{unreviewed:2,uncertain:1,reviewed:1});
    const key=dictionaryKey('نور'),shard=JSON.parse(await fs.readFile(path.join(temp,'out','dictionaries','t',`o-${dictionaryShard(key)}.json`),'utf8'));
    assert.equal(shard[key][0].status,'reviewed');assert.equal(shard[key][0].reviewer,'SL 2026-11-05');
  }finally{await fs.rm(temp,{recursive:true,force:true});}
});

test('the build publishes each source file unchanged and names it in the index',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'pi-dictionary-source-'));
  try{
    await fs.mkdir(path.join(temp,'dictionaries'));
    const bytes=Buffer.from('﻿'+tsv.replace(/\n/g,'\r\n'),'utf8');
    await fs.writeFile(path.join(temp,'dictionaries','My File.tsv'),bytes);
    await fs.writeFile(path.join(temp,'dictionaries','c.csv'),'form,gloss\nنور,light\n');
    await fs.writeFile(path.join(temp,'dictionaries','dictionaries.json'),JSON.stringify({dictionaries:[{id:'t',name:'Test',file:'My File.tsv'},{id:'c',name:'CSV',file:'c.csv'}]}));
    await buildDictionaries(temp,path.join(temp,'out'));
    const index=JSON.parse(await fs.readFile(path.join(temp,'out','dictionaries','index.json'),'utf8'));
    assert.deepEqual(index.dictionaries.map(d=>[d.file,d.sourceFile]),[['t.tsv','My File.tsv'],['c.csv','c.csv']]);
    assert.deepEqual(await fs.readFile(path.join(temp,'out','dictionaries','t.tsv')),bytes);
    assert.equal(publishedSourceName({id:'x',file:'x.txt'}),'x.tsv');
  }finally{await fs.rm(temp,{recursive:true,force:true});}
});

const sourceText='form\tlemma\tgloss\tnotes\tstatus\treviewer\nنور\tنور\tlight\t\tunreviewed\t\nالهی\t\tdivine\tuncertain reading\tUncertain\t\n\nمن\t\tI\t\t\t\nشود\t\tbecomes\t\treviewed\tAB 2026-01-02\n';

test('review source keeps rows in order and the status normalized for display',()=>{
  const source=readReviewSource(sourceText);
  assert.deepEqual(source.rows.map(r=>[r.index,r.line,r.entry.form,r.entry.status]),[[0,1,'نور','unreviewed'],[1,2,'الهی','uncertain'],[2,4,'من',''],[3,5,'شود','reviewed']]);
  assert.deepEqual(editableColumns(source),['form','lemma','gloss','notes','status','reviewer']);
  assert.deepEqual(editableColumns(readReviewSource('form\tgloss\nنور\tlight\n')),['form','gloss','status','reviewer']);
  assert.equal(draftKey('نور',0),'0:نور');assert.equal(storageKey('sample'),'pi-dictionary-review:sample');
});

test('filters put uncertain entries first, then unreviewed, and search forms and glosses',()=>{
  const source=readReviewSource(sourceText);
  const forms=options=>filterRows(source,{},options).map(r=>r.entry.form);
  assert.deepEqual(forms(),['الهی','نور','من']);
  assert.deepEqual(forms({filter:'all'}),['الهی','نور','من','شود']);
  assert.deepEqual(forms({filter:'reviewed'}),['شود']);
  assert.deepEqual(forms({filter:'unreviewed'}),['نور','من']);
  assert.deepEqual(forms({filter:'bogus'}),['الهی','نور','من']);
  assert.deepEqual(forms({filter:'all',query:'DIV'}),['الهی']);
  assert.deepEqual(forms({filter:'all',query:'نُور'}),['نور']);
  const drafts=setDraft({},source.rows[1],markReviewed('SL 2026-11-05'));
  assert.deepEqual(filterRows(source,drafts).map(r=>r.entry.form),['نور','من']);
  assert.deepEqual(statusCounts(source,drafts),{unreviewed:2,uncertain:0,reviewed:2});
  assert.deepEqual(statusCounts(source,{}),{unreviewed:2,uncertain:1,reviewed:1});
});

test('drafts keep only changed fields and are guarded by the form',()=>{
  const source=readReviewSource(sourceText),row=source.rows[0];
  let drafts=setDraft({},row,{gloss:'light',notes:'x'});
  assert.deepEqual(drafts,{'0:نور':{notes:'x'}});
  drafts=setDraft(drafts,row,{notes:''});assert.deepEqual(drafts,{});
  drafts=setDraft({},row,markUncertain());assert.deepEqual(drafts,{'0:نور':{status:'uncertain'}});
  assert.equal(draftCount(source,drafts),1);
  assert.equal(draftCount(source,{'0:other':{gloss:'x'}}),0);
  assert.deepEqual(reviewedEntry(row,drafts).status,'uncertain');
  assert.equal(draftFor({'0:other':{gloss:'x'}},row),null);
});

test('reviewer stamp appends the date once',()=>{
  assert.equal(reviewerStamp(' S  L ','2026-11-05'),'S L 2026-11-05');
  assert.equal(reviewerStamp('SL 2026-01-01','2026-11-05'),'SL 2026-11-05');
  assert.equal(reviewerStamp('','2026-11-05'),'');
  assert.equal(reviewerStamp('SL',new Date(2026,10,5)),'SL 2026-11-05');
});

test('export applies drafts and leaves every other line byte for byte',()=>{
  const source=readReviewSource(sourceText);
  assert.equal(exportTsv(source,{}),sourceText);
  const drafts=setDraft(setDraft({},source.rows[1],markReviewed('SL 2026-11-05')),source.rows[1],{gloss:'godly\twith\ttabs'});
  const out=exportTsv(source,drafts),before=sourceText.split('\n'),after=out.split('\n');
  assert.equal(after.length,before.length);
  assert.deepEqual(after.map((line,i)=>line===before[i]?'':i).filter(Boolean),[2]);
  assert.equal(after[2],'الهی\t\tgodly with tabs\tuncertain reading\treviewed\tSL 2026-11-05');
  assert.equal(parseDictionary(out,{strict:true})[1].status,'reviewed');
  const crlf=readReviewSource('﻿'+sourceText.replace(/\n/g,'\r\n'));
  assert.equal(exportTsv(crlf,{}),'﻿'+sourceText.replace(/\n/g,'\r\n'));
  assert.ok(exportTsv(crlf,drafts).startsWith('﻿form\t')&&exportTsv(crlf,drafts).includes('\r\nالهی\t\tgodly with tabs\tuncertain reading\treviewed\tSL 2026-11-05\r\n'));
});

test('export adds missing status columns in the published column order',()=>{
  const source=readReviewSource('gloss\tform\textra\nlight\tنور\tkeep me\ndivine\tالهی\t\n');
  const drafts=setDraft({},source.rows[0],markReviewed('SL 2026-11-05'));
  assert.equal(exportTsv(source,drafts),'form\tgloss\tstatus\treviewer\textra\nنور\tlight\treviewed\tSL 2026-11-05\tkeep me\nالهی\tdivine\t\t\t\n');
  const csv=readReviewSource('form,gloss\nنور,"light, bright"\n');
  assert.equal(exportTsv(csv,{}),'form\tgloss\nنور\tlight, bright\n');
});

test('the published sample dictionary round-trips unchanged and reports its counts',async()=>{
  const text=await fs.readFile(path.join(root,'dictionaries','sample-volume-164.tsv'),'utf8');
  const source=readReviewSource(text);
  assert.equal(exportTsv(source,{}),text);
  assert.deepEqual(statusCounts(source,{}),{unreviewed:2347,uncertain:25,reviewed:0});
  assert.equal(filterRows(source,{})[0].entry.status,'uncertain');
  assert.ok(hasContext(source.rows[0].entry));assert.equal(hasContext({form:'light'}),false);
});

test('part of speech, root, tags, modern and usage are editable when the file has them, and bad tags fail the check',()=>{
  const text='form\tgloss\tpos\troot\ttags\tmodern\tusage\nاحبّای\tbeloved-ones\tnoun pl.\tح-ب-ب\tbahai\tدوستان\tThe believers.\n';
  const source=readReviewSource(text);
  assert.deepEqual(editableColumns(source),['form','pos','root','gloss','tags','modern','usage','status','reviewer']);
  assert.deepEqual(source.rows[0].entry,{form:'احبّای',gloss:'beloved-ones',pos:'noun pl.',root:'ح-ب-ب',tags:'bahai',modern:'دوستان',usage:'The believers.'});
  const drafts=setDraft({},source.rows[0],{tags:'bahai,archaic',usage:'The believers, the friends.'});
  const out=exportTsv(source,drafts);
  assert.equal(out,'form\tgloss\tpos\troot\ttags\tmodern\tusage\nاحبّای\tbeloved-ones\tnoun pl.\tح-ب-ب\tbahai,archaic\tدوستان\tThe believers, the friends.\n');
  assert.equal(parseDictionary(out,{strict:true})[0].tags,'bahai,archaic');
  assert.throws(()=>parseDictionary(exportTsv(source,setDraft({},source.rows[0],{tags:'bahai, holy'})),{strict:true}),/unknown tag "holy"/);
  const added=exportTsv(readReviewSource('form\tgloss\nنور\tlight\n'),{'0:نور':{tags:'mystical'}});
  assert.equal(added,'form\tgloss\ttags\nنور\tlight\tmystical\n');
  assert.ok(!editableColumns(source).includes('register'),'no register field without a register column');
  assert.ok(editableColumns(readReviewSource('form\tgloss\tregister\nامر\tcause\televated\n')).includes('register'),'legacy files keep theirs');
});
