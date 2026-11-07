import test from 'node:test';
import assert from 'node:assert/strict';
import {createConcordance,concordanceNoneHtml,concordanceSectionHtml,concordanceTools,englishPassageHtml,englishSectionHtml,fillTransliterations,markedText,pairedEnglish,pairedOriginal,passageHtml,passageView} from '../src/concordance-view.mjs';
import {dictionaryKey,candidateKeys} from '../src/dictionary.mjs';
import {concordanceShard} from '../src/concordance.mjs';
import {passagesKey} from '../src/word-study.mjs';

const base='https://example.org/PI_browser/';
const dataset='collections/abc/';
const index={format:1,dataset,shards:256,paragraphs:10,records:2,keys:3};
// Published shard files for a set of entries, recording each fetch.
function source(entries,{indexValue=index,english={}}={}){
  const files=new Map(),fetched=[];
  for(const [prefix,list] of [['o',entries],['e',english]])for(const [key,value] of Object.entries(list)){const file=`${prefix}-${concordanceShard(key)}`;files.set(file,{...files.get(file),[key]:value});}
  const fetchJson=async url=>{
    const path=String(url).slice(base.length);fetched.push(path);
    if(path==='concordance/index.json')return indexValue;
    return files.get(path.match(/^concordance\/([oe]-\d+)\.json$/)?.[1])||null;
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

const divers={n:46,r:[['AB00016',2],['BH00002',7]],o:[['مختلفه',0.219,15],['متعدّده',0.143,5],['<b>',0.12,4],['الوان',0.1,3],['سبل',0.1,3]]};

test('the English section shows counts and likely original words as statistics, escaped',()=>{
  const html=englishSectionHtml({key:'divers',matched:'divers',via:'',entry:divers,english:true},{word:'<divers>'});
  assert.match(html,/^<section class="word-tooltip-concordance concordance-english-section" title="Statistics from authorized paragraphs, not a word-for-word translation">/);
  assert.match(html,/In authorized translations:<\/span> <span class="concordance-count">Found in 46 paragraphs<\/span>/);
  assert.match(html,/Usually renders: <span class="concordance-source-item" title="Found together in 15 of 46 paragraphs"><span class="concordance-source" dir="rtl" lang="fa" data-concordance-source="مختلفه">مختلفه<\/span><span class="concordance-translit" dir="ltr"><\/span><\/span>/);
  assert.match(html,/data-concordance-source="&lt;b&gt;">&lt;b&gt;</);
  assert.ok(html.includes('الوان')&&!html.includes('سبل'),'four at most');
  assert.match(html,/<span class="concordance-note">statistics from authorized paragraphs, not a word-for-word translation<\/span>/);
  assert.match(html,/aria-label="Show passages with &lt;divers&gt;">Show passages<\/button>/);
  assert.doesNotMatch(html,/<b>|<divers>/);
  assert.match(englishSectionHtml({key:'k',matched:'k',via:'',entry:{n:1,r:[['A',1]],o:[]}}),/Found in 1 paragraph<\/span>/);
  assert.doesNotMatch(englishSectionHtml({key:'k',matched:'k',via:'',entry:{n:1,r:[['A',1]],o:[]}}),/Usually renders/);
  assert.equal(englishSectionHtml(null),'');
});

test('transliterations are filled from the dictionaries, when there are any',async()=>{
  const html=englishSectionHtml({key:'divers',matched:'divers',via:'',entry:divers});
  // A minimal element tree for the section.
  const items=[...html.matchAll(/data-concordance-source="([^"]*)"/g)].map(match=>{const target={textContent:'',classList:{contains:name=>name==='concordance-translit'}};return {dataset:{concordanceSource:match[1]},nextElementSibling:target};});
  const root={querySelectorAll:()=>items};
  const store={lookup:async word=>word==='مختلفه'?{entries:[{reverse:true,translit:'x'},{translit:'mukhtalifih'}]}:word==='الوان'?Promise.reject(Error('x')):{entries:[]}};
  assert.equal(await fillTransliterations(root,store),true);
  assert.deepEqual(items.map(item=>item.nextElementSibling.textContent),[' mukhtalifih','','','']);
  assert.equal(await fillTransliterations(root,null),false);
  assert.equal(await fillTransliterations(root,store,()=>false),false);
});

test('English lookups use the e- shards, fall back to simple stems and need the english index flag',async()=>{
  const fake=source({},{english:{divers,shade:{n:3,r:[],o:[]}},indexValue:{...index,english:true}});
  const concordance=createConcordance(base,dataset,fake);
  assert.deepEqual(await concordance.lookupEnglish('Divers'),{key:'divers',matched:'divers',via:'',entry:divers,english:true});
  const shades=await concordance.lookupEnglish('shades');
  assert.equal(shades.matched,'shade');assert.equal(shades.via,'s');assert.equal(shades.english,true);
  assert.ok(fake.fetched.includes(`concordance/e-${concordanceShard('divers')}.json`));
  assert.ok(!fake.fetched.some(path=>/\/o-/.test(path)));
  assert.equal(await concordance.lookupEnglish('نور'),null);
  assert.equal((await concordance.lookupAny('divers')).english,true);
  const old=createConcordance(base,dataset,source({},{english:{divers}}));
  assert.equal(await old.lookupEnglish('divers'),null);
  // The tooltip tools choose the section for each direction.
  const tools=concordanceTools(()=>concordance);
  assert.equal(tools.english,true);
  assert.match(tools.sectionHtml(await tools.lookup('divers'),{word:'divers'}),/Usually renders/);
  assert.match(tools.sectionHtml({key:'k',matched:'k',via:'',entry},{word:'w'}),/Authorized translations:<\/span> <span class="concordance-count">1,234/);
  assert.equal(await concordanceTools(()=>null).lookup('divers'),null);
});

test('a word with no result says so only once the lookup has completed',async()=>{
  const fake=source({[dictionaryKey('نور')]:entry},{english:{divers},indexValue:{...index,english:true}});
  const concordance=createConcordance(base,dataset,fake),tools=concordanceTools(()=>concordance);
  // Found words keep their sections.
  assert.equal((await concordance.lookupStatus('divers')).entry,divers);
  assert.match(tools.sectionHtml(await tools.lookup('divers'),{word:'divers'}),/Found in 46 paragraphs/);
  // Not found in any authorized paragraph (the shard file is absent: 404 is an empty shard).
  const diver=await tools.lookup('diver');
  assert.deepEqual(diver,{word:'diver',english:true,missing:true});
  const none=tools.sectionHtml(diver,{word:'diver'});
  assert.match(none,/^<section class="word-tooltip-concordance concordance-none" title="No authorized-translation paragraph of this collection contains this word"><p class="concordance-line"><span class="concordance-heading">In authorized translations:<\/span> <span class="concordance-count">not found<\/span><\/p><\/section>$/);
  assert.doesNotMatch(none,/concordance-open|Show passages/);
  const original=await tools.lookup('ناموجود');
  assert.deepEqual(original,{word:'ناموجود',english:false,missing:true});
  assert.match(tools.sectionHtml(original,{word:'ناموجود'}),/<span class="concordance-heading">Authorized translations:<\/span> <span class="concordance-count">not found<\/span>/);
  // Words the reverse concordance never counts: stopwords and words under three letters.
  for(const word of ['the','of','unto','Hath'])assert.deepEqual(await tools.lookup(word),{word,english:true,unindexed:true},word);
  assert.match(tools.sectionHtml(await tools.lookup('the')),/not counted \(very common or short word\)/);
  assert.equal((await tools.lookup('shades')).missing,true,'a word counted under a stem is looked up');
  // No section while the data is unusable: no concordance, another dataset, no English index, punctuation.
  assert.equal(await concordanceTools(()=>null).lookup('diver'),null);
  assert.equal(await createConcordance(base,dataset,source({},{indexValue:{...index,dataset:'collections/old/'}})).lookupStatus('نور'),null);
  assert.equal(await createConcordance(base,dataset,source({})).lookupStatus('diver'),null);
  assert.equal(await concordance.lookupStatus('—'),null);
  assert.equal(concordanceNoneHtml(null),'');assert.equal(concordanceSectionHtml(null),'');assert.equal(englishSectionHtml(null),'');
  // A shard that fails to load rejects instead of reading as "not found", and is fetched again next time.
  let fail=true;
  const flaky=createConcordance(base,dataset,{fetchJson:async url=>{if(String(url).endsWith('index.json'))return {...index,english:true};if(fail)throw Error('offline');return null;}});
  await assert.rejects(flaky.lookupStatus('diver'),/offline/);
  fail=false;
  assert.equal((await flaky.lookupStatus('diver')).missing,true);
});

test('English passages mark the word in English and likely sources in the original',()=>{
  const record={id:'AB1',title:'T',en:{paragraphs:[{plain:'Intro.'},{plain:'Divers shades of <thought>, divers ways.'}]},original:{paragraphs:[{plain:'اول'},{plain:'افکار مختلفه و سبل متعدّده'}]}};
  assert.equal(pairedOriginal(record,2).plain,'افکار مختلفه و سبل متعدّده');
  const sources=['مختلفه','متعدّده'].map(dictionaryKey);
  const html=englishPassageHtml(record,['AB1',2],'divers',sources,'?id=AB1&paragraph=2');
  assert.match(html,/<p class="concordance-english" dir="ltr" lang="en" data-word-text><mark>Divers<\/mark> shades of &lt;thought&gt;, <mark>divers<\/mark> ways\.<\/p><p class="concordance-original"/);
  assert.match(html,/افکار <mark class="likely-source">مختلفه<\/mark> و سبل <mark class="likely-source">متعدّده<\/mark>/);
  const original=englishPassageHtml(record,['AB1',2],'divers',sources,'#','original');
  assert.match(original,/likely-source/);assert.doesNotMatch(original,/Divers/);
  const words=englishPassageHtml(record,['AB1',2],'divers',sources,'#','words');
  assert.match(words,/<span class="ilw ilw-likely" tabindex="-1" data-word="مختلفه">/);
  assert.match(words,/<span class="ilw" tabindex="0" data-word="افکار">/);
  assert.match(words,/english-cell" dir="ltr" lang="en"><p><mark>Divers<\/mark> shades/);
  const unequal={...record,original:{paragraphs:[{plain:'اول'}]}};
  assert.match(englishPassageHtml(unequal,['AB1',2],'divers',sources,'#'),/<mark>Divers<\/mark>.*No original paragraph is paired/);
  assert.match(englishPassageHtml(unequal,['AB1',2],'divers',sources,'#','words'),/No original paragraph is paired/);
  assert.match(englishPassageHtml(record,['AB1',9],'divers',sources,'#'),/could not be loaded/);
  assert.equal(markedText('a <b> c',new Set(['b']),'x'),'a &lt;<mark class="x">b</mark>&gt; c');
});
