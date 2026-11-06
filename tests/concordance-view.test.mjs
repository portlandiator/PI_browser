import test from 'node:test';
import assert from 'node:assert/strict';
import {createConcordance,concordanceSectionHtml,markedText,pairedEnglish,passageHtml,passageView} from '../src/concordance-view.mjs';
import {dictionaryKey,candidateKeys} from '../src/dictionary.mjs';
import {concordanceShard} from '../src/concordance.mjs';
import {passagesKey} from '../src/word-study.mjs';

const base='https://example.org/PI_browser/';
const dataset='collections/abc/';
const index={format:1,dataset,shards:256,paragraphs:10,records:2,keys:3};
// Published shard files for a set of entries, recording each fetch.
function source(entries,{indexValue=index}={}){
  const files=new Map(),fetched=[];
  for(const [key,value] of Object.entries(entries)){const n=concordanceShard(key);files.set(n,{...files.get(n),[key]:value});}
  const fetchJson=async url=>{
    const path=String(url).slice(base.length);fetched.push(path);
    if(path==='concordance/index.json')return indexValue;
    return files.get(Number(path.match(/^concordance\/o-(\d+)\.json$/)?.[1]))||null;
  };
  return {fetchJson,fetched};
}
const entry={n:1234,r:[['BH00001',3],['AB00002',1]],w:[['love',.5,10],['God',.4,9],['<b>',.3,2],['a',.1,1],['b',.1,1],['c',.1,1],['seventh',.1,1]]};

test('the tooltip section shows counts and frequent words as statistics, escaped',()=>{
  const html=concordanceSectionHtml({key:'k',matched:'k"x',via:'',entry},{word:'<w>'});
  assert.match(html,/^<section class="word-tooltip-concordance" title=/);
  assert.match(html,/Authorized translations:<\/span> <span class="concordance-count">1,234<span aria-hidden="true"> ¶<\/span><span class="sr-only"> paragraphs<\/span>/);
  assert.match(html,/ · <span class="concordance-often"><span class="sr-only">often appears with <\/span>love, God, &lt;b&gt;, a<\/span><\/p>/);
  assert.doesNotMatch(html,/, b|seventh/);
  assert.match(html,/title="Statistics from authorized paragraphs, not a word-for-word translation"/);
  assert.match(html,/<span class="concordance-note">statistics, not a translation<\/span>/);
  assert.match(html,/<button type="button" class="text-button concordance-open" data-concordance-key="k&quot;x"/);
  assert.doesNotMatch(html,/<w>|<b>/);
  assert.equal(concordanceSectionHtml(null),'');
  const single=concordanceSectionHtml({key:'k',matched:'k',via:'',entry:{n:1,r:[],w:[]}});
  assert.match(single,/>1<span aria-hidden="true"> ¶<\/span><span class="sr-only"> paragraph<\/span>/);
  assert.doesNotMatch(single,/concordance-open|concordance-often/);
});

test('the P shortcut is named only for keyboard-opened tooltips',()=>{
  const result={key:'k',matched:'k',via:'',entry};
  assert.match(concordanceSectionHtml(result,{word:'w'}),/>Show passages<\/button>/);
  assert.doesNotMatch(concordanceSectionHtml(result,{word:'w'}),/aria-keyshortcuts/);
  assert.match(concordanceSectionHtml(result,{word:'w',shortcut:true}),/ aria-keyshortcuts="P">Show passages \(P\)<\/button>/);
  assert.ok(passagesKey({key:'p'})&&passagesKey({key:'P'}));
  for(const event of [{key:'p',ctrlKey:true},{key:'p',metaKey:true},{key:'p',altKey:true},{key:'P',shiftKey:true},{key:'p',isComposing:true},{key:'o'},{key:'Escape'}])assert.ok(!passagesKey(event),JSON.stringify(event));
});

test('a concordance built for another dataset is ignored',async()=>{
  const key=dictionaryKey('نور');
  const stale=source({[key]:entry},{indexValue:{...index,dataset:'collections/old/'}});
  const concordance=createConcordance(base,dataset,stale);
  assert.equal(await concordance.lookup('نور'),null);
  assert.equal(await concordance.ready(),false);
  assert.deepEqual(stale.fetched,['concordance/index.json']);
  const missing=createConcordance(base,dataset,{...stale,fetchJson:async()=>{throw Error('offline');}});
  assert.equal(await missing.lookup('نور'),null);
  const current=createConcordance(base,dataset,source({[key]:entry}));
  assert.deepEqual(await current.lookup('نور'),{key,matched:key,via:'',entry});
});

test('lookup falls back through candidate keys',async()=>{
  const word='والکتاب',stem=candidateKeys(word).find(candidate=>candidate.stripped==='وال–');
  assert.ok(stem);
  const concordance=createConcordance(base,dataset,source({other:entry,[stem.key]:entry}));
  const result=await concordance.lookup(word);
  assert.equal(result.key,dictionaryKey(word));
  assert.equal(result.matched,stem.key);
  assert.equal(result.via,'وال–');
  assert.equal(await concordance.lookup('ناموجود'),null);
  assert.match(concordanceSectionHtml(result),/\(counted as <span dir="auto">/);
});

test('the shard cache is bounded and least recently used shards are evicted',async()=>{
  // 70 words in 70 different shards.
  const words=[],seen=new Set();
  for(let i=0;words.length<70;i++){const word=`w${i}`,n=concordanceShard(word);if(!seen.has(n)){seen.add(n);words.push(word);}}
  const fake=source(Object.fromEntries(words.map(word=>[word,{n:1,r:[],w:[]}])));
  const concordance=createConcordance(base,dataset,fake);
  for(const [i,word] of words.entries()){assert.ok(await concordance.lookup(word));if(i===60)await concordance.lookup(words[0]);}
  const fetches=word=>fake.fetched.filter(path=>path===`concordance/o-${concordanceShard(word)}.json`).length;
  assert.equal(fake.fetched.filter(path=>path==='concordance/index.json').length,1);
  await concordance.lookup(words[69]);assert.equal(fetches(words[69]),1);
  await concordance.lookup(words[0]);assert.equal(fetches(words[0]),1);
  await concordance.lookup(words[1]);assert.equal(fetches(words[1]),2);
});

test('passages mark the word and show the paired authorized English paragraph',()=>{
  const key=dictionaryKey('نور');
  assert.equal(markedText('نورِ <نور> و منور',key),'<mark>نورِ</mark> &lt;<mark>نور</mark>&gt; و منور');
  const record={id:'BH1',title:'A <title>',en:{paragraphs:[{plain:'First.'},{plain:'The light <of> God.'}]},original:{paragraphs:[{plain:'اول'},{plain:'نور خدا'}]}};
  assert.equal(pairedEnglish(record,2).plain,'The light <of> God.');
  const html=passageHtml(record,['BH1',2],key,'?id=BH1&paragraph=2&lang=original');
  assert.match(html,/href="\?id=BH1&amp;paragraph=2&amp;lang=original"/);
  assert.match(html,/A &lt;title&gt;/);
  assert.match(html,/<p class="concordance-original" dir="rtl" lang="fa" data-word-text><mark>نور<\/mark> خدا<\/p>/);
  assert.match(html,/The light &lt;of&gt; God\./);
  const unequal={...record,en:{paragraphs:[{plain:'Only one.'}]}};
  assert.equal(pairedEnglish(unequal,2),null);
  assert.match(passageHtml(unequal,['BH1',2],key,'#'),/No English paragraph is paired/);
  assert.match(passageHtml(record,['BH1',9],key,'#'),/could not be loaded/);
});

test('passages show in Parallel, Original or Words view',()=>{
  const key=dictionaryKey('نور');
  const record={id:'BH1',title:'T',en:{paragraphs:[{plain:'First.'},{plain:'The light <of> God.'}]},original:{paragraphs:[{plain:'اول'},{plain:'نور خدا'}]}};
  assert.equal(passageView('words'),'words');assert.equal(passageView('original'),'original');
  assert.equal(passageView('other'),'parallel');assert.equal(passageView(undefined),'parallel');
  assert.equal(passageHtml(record,['BH1',2],key,'#','unknown'),passageHtml(record,['BH1',2],key,'#'));
  const original=passageHtml(record,['BH1',2],key,'#','original');
  assert.match(original,/<mark>نور<\/mark> خدا/);
  assert.doesNotMatch(original,/The light|No English paragraph/);
  const words=passageHtml(record,['BH1',2],key,'#','words');
  assert.match(words,/class="concordance-link"/);
  assert.match(words,/<span class="ilw ilw-match" tabindex="0" data-word="نور">/);
  assert.match(words,/<span class="ilw" tabindex="-1" data-word="خدا">/);
  assert.doesNotMatch(words,/<mark>| id="/);
  assert.match(words,/class="paragraph-cell interlinear-free english-cell" dir="ltr" lang="en"><p>The light &lt;of&gt; God\.<\/p>/);
  const unequal={...record,en:{paragraphs:[{plain:'Only one.'}]}};
  assert.match(passageHtml(unequal,['BH1',2],key,'#','words'),/No English paragraph is paired/);
});
