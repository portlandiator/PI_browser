import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parseDictionary,dictionaryKey,candidateKeys,indexEntries,lookupWord,textLanguage,textWords,wordAt,interlinearTokens,shardDictionary,dictionaryShard,reverseKeys} from '../src/dictionary.mjs';
import {interlinearCells,reviewLabelHtml,dictionaryDialogHtml,tooltipHtml,interlinearBlockHtml,interlinearColumnsHtml,boundedCache,studyMode,glossStyle,tooltipMode} from '../src/word-study.mjs';
import {buildDictionaries,readDictionaryCatalog} from '../scripts/build-dictionaries.mjs';

const root=path.resolve(import.meta.dirname,'..');
const tsv='form\tlemma\tlang\ttranslit\tgloss\tdefinition\tnotes\nاحبّای\tاحبّاء\tfa/ar\taḥibbáy\tbeloved-ones\tplural of ḥabíb\t\nالهی\tالهی\tfa/ar\tiláhí\tdivine\tof God\t\nتربیت\tتربیت\tfa/ar\ttarbíyat\teducation\ttraining\t\nمن\tمن\tfa\tman\tI\tPersian pronoun\t\nمن\tمِن\tar\tmin\tfrom\tArabic preposition\t\nشود\tشدن\tfa\tshavad\tbecomes\tsubjunctive of shudan\t\nمی\tمی\tfa\tmí\t(continuous)\tverbal prefix\t\n';
const lookup=entries=>{const index=indexEntries(entries,'test');const dictionary={id:'test'};return word=>lookupWord(word,[dictionary],(_,side,key)=>index[side].get(key)||[]);};

test('dictionary files parse as TSV or CSV with named columns',()=>{
  const entries=parseDictionary(tsv);
  assert.equal(entries.length,7);
  assert.deepEqual(entries[0],{form:'احبّای',lemma:'احبّاء',lang:'fa/ar',translit:'aḥibbáy',gloss:'beloved-ones',definition:'plural of ḥabíb'});
  const csv=parseDictionary('﻿Headword,Meaning,Pronunciation\n"نور","light, radiance",núr\nlove,محبت,maḥabbat\n');
  assert.deepEqual(csv,[{form:'نور',gloss:'light, radiance',translit:'núr',lang:'fa/ar'},{form:'love',gloss:'محبت',translit:'maḥabbat',lang:'en'}]);
  assert.throws(()=>parseDictionary('form\tlemma\nنور\tنور\n'),/needs a gloss/);
  assert.throws(()=>parseDictionary('word,gloss\n'),/No dictionary entries/);
});

test('lookup keys ignore diacritics, letter variants and joiners like search does',()=>{
  assert.equal(dictionaryKey('احبّای'),dictionaryKey('احبای'));
  assert.equal(dictionaryKey('علي'),dictionaryKey('علی'));
  assert.equal(dictionaryKey('می‌شود'),'میشود');
  assert.equal(dictionaryKey('Bahá’u’lláh,'),'bahaullah');
});

test('exact entries win; affixed forms are found through a removed prefix or suffix and say so',async()=>{
  const find=lookup(parseDictionary(tsv));
  const exact=await find('احبّای');
  assert.equal(exact.via,'');assert.equal(exact.entries[0].gloss,'beloved-ones');
  const homographs=await find('من');
  assert.deepEqual(homographs.entries.map(e=>e.gloss),['I','from']);
  const suffixed=await find('تربیتها');
  assert.equal(suffixed.matched,'تربیت');assert.match(suffixed.via,/ها/);
  const prefixed=await find('والهی');
  assert.equal(prefixed.entries[0].gloss,'divine');assert.match(prefixed.via,/و/);
  const parts=await find('می‌شود');
  assert.equal(parts.via,'parts');assert.deepEqual(parts.entries.map(e=>e.gloss),['(continuous)','becomes']);
  assert.deepEqual((await find('ناشناخته')).entries,[]);
});

test('English words find original-language entries through their glosses',async()=>{
  const find=lookup(parseDictionary(tsv));
  assert.deepEqual(reverseKeys({gloss:'beloved-ones'}),['beloved']);
  assert.deepEqual(reverseKeys({gloss:'(object-marker)'}),[]);
  assert.deepEqual(reverseKeys({gloss:'A'}),[]);
  const ranked=indexEntries(parseDictionary('form\tgloss\nلأحبّائه\tto-his-beloved\nمحبوب\tbeloved\n'),'t').english.get('beloved');
  assert.deepEqual(ranked.map(e=>e.form),['محبوب','لأحبّائه']);
  const result=await find('Divine');
  assert.equal(result.side,'english');assert.equal(result.entries[0].form,'الهی');assert.equal(result.entries[0].reverse,true);
  assert.deepEqual(interlinearCells(result),{pronunciation:'',gloss:'الهی',target:'الهی',partial:false});
  const english=await lookup(parseDictionary('form\ttranslit\tgloss\tdefinition\ngod\tگاد\tخدا\tاسم: آفریدگار\n'))('God');
  assert.deepEqual(interlinearCells(english),{pronunciation:'گاد',gloss:'خدا',target:'خدا',partial:false});
  const persianTip=tooltipHtml(english,()=>null);
  assert.match(persianTip,/class="word-tooltip-definition" dir="rtl" lang="fa">اسم: آفریدگار/);
  assert.match(persianTip,/word-tooltip-translit in-script" dir="rtl" lang="fa">گاد/);
  const plural=await find('educations');
  assert.equal(plural.entries[0].form,'تربیت');assert.equal(interlinearCells(plural).partial,true);
});

test('words, offsets and interlinear columns keep punctuation with the text',()=>{
  const text='O loved ones of God! The “Merciful”, Bahá’u’lláh.';
  assert.deepEqual(textWords(text).map(w=>w.text),['O','loved','ones','of','God','The','Merciful','Bahá’u’lláh']);
  assert.equal(wordAt(text,4).text,'loved');assert.equal(wordAt(text,1).text,'O');assert.equal(wordAt(text,20),null);
  assert.deepEqual(interlinearTokens('«ای احبّای الهی!» و')[0],{word:'ای',lead:'«',trail:''});
  assert.deepEqual(interlinearTokens('«ای احبّای الهی!» و').map(t=>t.trail),['','','!»','']);
});

test('interlinear and tooltip markup escape dictionary and source text',async()=>{
  const find=lookup(parseDictionary('form\tgloss\tdefinition\nالهی\t<b>divine</b>\t"of God" & more\n'));
  const html=tooltipHtml(await find('الهی'),()=>({name:'Test <dict>',aiGenerated:true,kind:'published'}));
  assert.doesNotMatch(html,/<b>|<dict>/);assert.match(html,/&lt;b&gt;divine/);assert.match(html,/AI-generated/);
  const empty=tooltipHtml(await find('<script>'),()=>null);
  assert.match(empty,/No dictionary entry/);assert.doesNotMatch(empty,/<script>/);
  const block=interlinearBlockHtml({top:{plain:'<i>نور</i>'},topLanguage:'original',number:3,numberHtml:'',bottomLanguage:'en',bottomHtml:'Light',bottomId:'p-en-3'});
  assert.match(block,/id="p-original-3"/);assert.match(block,/id="p-en-3"/);assert.doesNotMatch(block,/<i>/);
  assert.match(interlinearBlockHtml({top:{plain:'نور'},topLanguage:'original',number:1,numberHtml:'',bottomLanguage:'en',bottomHtml:undefined}),/No English paragraph is paired/);
  assert.equal(studyMode('original'),'original');assert.equal(studyMode('javascript:'),'');
});

test('lazy interlinear blocks keep their ids and plain text until built, and lookups are cached within a bound',()=>{
  const lazy=interlinearBlockHtml({top:{plain:'<i>نور</i> الهی'},topLanguage:'original',number:3,numberHtml:'',bottomLanguage:'en',bottomHtml:'Light',bottomId:'p-en-3',lazy:true});
  assert.match(lazy,/data-lazy/);assert.match(lazy,/id="p-original-3"/);assert.match(lazy,/id="p-en-3"/);
  assert.doesNotMatch(lazy,/class="ilw"/);assert.match(lazy,/class="ilw-pending" lang="fa">&lt;i&gt;نور&lt;\/i&gt; الهی</);assert.match(lazy,/tabindex="0"/);
  const columns=interlinearColumnsHtml('نور الهی',true);
  assert.equal((columns.match(/class="ilw"/g)||[]).length,2);assert.equal((columns.match(/tabindex="0"/g)||[]).length,1);
  assert.equal(interlinearBlockHtml({top:{plain:'نور الهی'},topLanguage:'original',number:1,numberHtml:'',bottomLanguage:'en',bottomHtml:null}).includes(columns),true);
  const cache=boundedCache(2);cache.set('a',1);cache.set('b',2);cache.get('a');cache.set('c',3);
  assert.equal(cache.get('b'),undefined);assert.equal(cache.get('a'),1);assert.equal(cache.get('c'),3);assert.equal(cache.size,2);
});

test('published dictionaries are sharded by lookup key and listed with their labels',async()=>{
  const shards=shardDictionary(parseDictionary(tsv),'test');
  const key=dictionaryKey('الهی');
  assert.equal(shards.original[dictionaryShard(key)][key][0].gloss,'divine');
  assert.equal(shards.english[dictionaryShard('divine')].divine[0].reverse,true);
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'pi-dictionaries-'));
  try{
    await fs.mkdir(path.join(temp,'dictionaries'));
    await fs.writeFile(path.join(temp,'dictionaries','t.tsv'),tsv);
    await fs.writeFile(path.join(temp,'dictionaries','dictionaries.json'),JSON.stringify({dictionaries:[{id:'t',name:'Test',file:'t.tsv',aiGenerated:true}]}));
    assert.deepEqual(await buildDictionaries(temp,path.join(temp,'out')),[{id:'t',entries:7}]);
    const index=JSON.parse(await fs.readFile(path.join(temp,'out','dictionaries','index.json'),'utf8'));
    assert.equal(index.dictionaries[0].aiGenerated,true);
    const n=dictionaryShard(key);assert.ok(index.dictionaries[0].shards.original.includes(n));
    assert.equal(JSON.parse(await fs.readFile(path.join(temp,'out','dictionaries','t',`o-${n}.json`),'utf8'))[key][0].translit,'iláhí');
    await fs.writeFile(path.join(temp,'dictionaries','dictionaries.json'),JSON.stringify({dictionaries:[{id:'../x',name:'Bad',file:'t.tsv'}]}));
    await assert.rejects(buildDictionaries(temp,path.join(temp,'out')),/Invalid dictionary id/);
  }finally{await fs.rm(temp,{recursive:true,force:true});}
});

test('the sample dictionary covers every original word form of Volume 164 and is labelled AI-generated',async()=>{
  const [sample]=await readDictionaryCatalog(root);
  assert.equal(sample.id,'sample-volume-164');assert.equal(sample.aiGenerated,true);
  const entries=parseDictionary(await fs.readFile(path.join(root,'dictionaries',sample.file),'utf8'));
  assert.ok(entries.length>=2355);
  for(const entry of entries){assert.ok(entry.translit,`${entry.form} has a pronunciation`);assert.ok(entry.gloss,`${entry.form} has a gloss`);assert.ok(entry.vocalized,`${entry.form} has a vocalized form`);}
});

test('dictionaries know the language they translate into',async()=>{
  const {dictionaryTarget}=await import('../src/dictionary.mjs');
  assert.equal(dictionaryTarget(parseDictionary(tsv)),'en');
  assert.equal(dictionaryTarget(parseDictionary('form\tgloss\tdefinition\ngod\tخدا\tاسم: آفریدگار یکتا\nfriend\tدوست\tکسی که\n')),'fa');
  assert.equal(dictionaryTarget(parseDictionary('form\tgloss\tdefinition\ngod\tالله\tاسم: الخالق\nfriend\tصديق\tشخص تربطك به مودة\n')),'ar');
  const {glossTarget}=await import('../src/word-study.mjs');
  assert.equal(glossTarget('ar'),'ar');assert.equal(glossTarget('x'),'fa');
});

test('the pronunciation guide covers transliteration and English for Persian and Arabic speakers',async()=>{
  const {pronunciationGuideHtml}=await import('../src/pronunciation-guide.mjs');
  const html=pronunciationGuideHtml();
  for(const id of ['guide-transliteration','guide-persian','guide-arabic'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/<section id="guide-persian" class="guide-section" lang="fa" dir="rtl">/);
  assert.match(html,/<section id="guide-arabic" class="guide-section" lang="ar" dir="rtl">/);
});

test('the English sample dictionaries cover every English word form of Volume 164 in Persian and in Arabic',async()=>{
  const catalog=await readDictionaryCatalog(root);
  for(const [id,target] of [['sample-volume-164-en-fa','fa'],['sample-volume-164-en-ar','ar']]){
    const item=catalog.find(entry=>entry.id===id);
    assert.equal(item.aiGenerated,true);assert.equal(item.target,target);
    const entries=parseDictionary(await fs.readFile(path.join(root,'dictionaries',item.file),'utf8'));
    assert.ok(entries.length>=2403);
    const {dictionaryTarget}=await import('../src/dictionary.mjs');
    assert.equal(dictionaryTarget(entries),target);
    for(const entry of entries){assert.equal(entry.lang,'en');assert.ok(entry.translit&&entry.gloss&&entry.definition,`${id}: ${entry.form} is complete`);}
  }
});

test('tooltips go where their whole entry fits: below, above, wider, beside, then the larger side',async()=>{
  const {placement}=await import('../src/word-study.mjs');
  const viewport={width:1400,height:1000},word=(top,left=600)=>({top,bottom:top+30,left,right:left+60,width:60,height:30});
  const fixed=(width,height)=>()=>({width,height});
  assert.deepEqual(placement(word(100),viewport,fixed(380,300),()=>{}),{left:440,top:138});
  assert.deepEqual(placement(word(800),viewport,fixed(380,300),()=>{}),{left:440,top:492});
  // Too tall for either side at 380px, fits once widened.
  let wide=false;const measure=()=>wide?{width:600,height:420}:{width:380,height:700};
  assert.deepEqual(placement(word(500),viewport,measure,()=>{wide=true;}),{left:330,top:538});
  // Still too tall above or below: beside the word, within the viewport.
  const beside=placement(word(450),viewport,fixed(600,800),()=>{});
  assert.ok(beside.left>=668&&beside.top>=8&&beside.top+800<=992&&!beside.maxHeight);
  // Taller than the viewport: the larger side, scrolling within it.
  const tall=placement(word(300),viewport,fixed(600,2000),()=>{});
  assert.equal(tall.maxHeight,654);assert.equal(tall.top,338);
  // A phone: no room beside, little above or below, so it covers the word.
  const phone=placement(word(380,150),{width:390,height:844},fixed(374,700),()=>{});
  assert.deepEqual(phone,{left:8,top:8,maxHeight:828});
});

test('vocalized forms add vowel marks to the written letters and appear only for exact matches',async()=>{
  const {sameLetters}=await import('../src/dictionary.mjs');
  assert.ok(sameLetters('نُور','نور'));assert.ok(sameLetters('اِلٰهی','الهی'));assert.ok(!sameLetters('أنوار','نور'));
  const source='form\tvocalized\ttranslit\tgloss\nنور\tنُور\tnúr\tlight\nالهی\tالْهَی\tiláhí\tdivine\nحق\tحَقّ\tḥaqq\ttruth\n';
  assert.throws(()=>parseDictionary(source.replace('الْهَی','اَلْهِيَة'),{strict:true}),/different letters/);
  const lenient=parseDictionary(source.replace('الْهَی','اَلْهِيَة'));
  assert.equal(lenient[1].vocalized,undefined);
  const find=lookup(parseDictionary(source,{strict:true}));
  assert.equal(interlinearCells(await find('نور')).vocalized,'نُور');
  assert.equal(interlinearCells(await find('نورها')).vocalized,'');
  assert.match(tooltipHtml(await find('حق'),()=>null),/word-tooltip-vocalized" dir="rtl" lang="fa" title="With vowel marks">حَقّ/);
  const columns=interlinearBlockHtml({top:{plain:'«نور»'},topLanguage:'original',number:1,numberHtml:'',bottomLanguage:'en',bottomHtml:null});
  assert.match(columns,/«<span class="ilw-text">نور<\/span>»/);
});

test('vowel marks are laid on the letters as written and never change them',async()=>{
  const {applyVowels}=await import('../src/dictionary.mjs');
  const transferable=new Set(['\u064e','\u0650','\u064f','\u0652','\u0651','\u064b','\u064c','\u064d','\u0670']);
  // The result with the transferred marks taken out is the written word, byte for byte.
  const unvowelled=(result,written)=>{
    const out=[],chars=[...written];let i=0;
    for(const char of result){if(i<chars.length&&char===chars[i]){out.push(char);i++;}else if(!transferable.has(char))return null;}
    return out.join('');
  };
  const check=(written,vocalized,expected)=>{const result=applyVowels(written,vocalized);assert.equal(result,expected);assert.equal(unvowelled(result,written),written);};
  // The source's madda and hamza stay; the dictionary's إ never appears.
  check('امآء','إِمَاء','\u0627\u0650\u0645\u064e\u0622\u0621');
  assert.ok(!applyVowels('امآء','إِمَاء').includes('إ'));
  // The written shadda stays once; the fatḥa follows it and sukún reaches ی.
  check('احبّای','اَحِبَّایْ','\u0627\u064e\u062d\u0650\u0628\u0651\u064e\u0627\u06cc\u0652');
  check('الهی','اِلٰهِی','اِلٰهِی');
  check('نور','نَار','نور');
  check('می\u200cشود','مِی\u200cشَوَد','مِی\u200cشَوَد');
  check('رحمة','رَحْمَه','رَحْمَة');
  const rows=parseDictionary(await fs.readFile(path.join(root,'dictionaries','sample-volume-164.tsv'),'utf8')).filter(row=>row.vocalized);
  let vowelled=0;const unaligned=[];
  for(const {form,vocalized} of rows){
    const result=applyVowels(form,vocalized);
    assert.equal(unvowelled(result,form),form,`${form} ${vocalized}`);
    if(result!==form)vowelled++;else unaligned.push(`${form}\t${vocalized}`);
  }
  assert.ok(vowelled>0);
  console.log(`sample-volume-164: ${vowelled} of ${rows.length} rows with a vocalized form get vowels`);
  if(unaligned.length)console.log(`unchanged (${unaligned.length}):\n${unaligned.slice(0,10).join('\n')}`);
});

test('the Bahá\'í English gloss style shows renderings and marks elevated words',()=>{
  const rows=parseDictionary('form\tgloss\tBahai English\tstyle\nامر\tcause\tthe-Cause\tElevated\nخانه\thouse\t\tplain\nبشارت\tgood news\tglad-tidings\tformal\n');
  assert.equal(rows[0].rendering,'the-Cause');assert.equal(rows[0].register,'elevated');
  assert.equal(rows[1].rendering,undefined);assert.equal(rows[1].register,'plain');
  assert.equal(rows[2].rendering,'glad-tidings');assert.equal(rows[2].register,undefined);
  assert.equal(parseDictionary('form,gloss,elevated,register\nانّ,indeed,verily,elevated\n')[0].rendering,'verily');
  assert.equal(parseDictionary("form\tgloss\tbahá'í english\nگردد\tbecomes\tbecometh\n")[0].rendering,'becometh');
  assert.throws(()=>parseDictionary('form\tgloss\tregister\nامر\tcause\tformal\n',{strict:true}),/Row 2 \(امر\): register must be elevated or plain/);
  const entry={form:'امر',gloss:'cause',rendering:'the-Cause',register:'elevated',translit:'amr',dictionary:'test'};
  const result={word:'امر',side:'original',via:'',matched:'امر',entries:[entry]};
  assert.equal(interlinearCells(result).gloss,'cause');
  assert.equal(interlinearCells(result,'plain').gloss,'cause');
  assert.equal(interlinearCells(result,'bahai').gloss,'the-Cause');
  assert.equal(interlinearCells(result,'bahai').elevated,true);
  assert.equal(interlinearCells({...result,entries:[{form:'خانه',gloss:'house',register:'plain'}]},'bahai').gloss,'house');
  assert.equal(interlinearCells({...result,entries:[{form:'خانه',gloss:'house',register:'plain'}]},'bahai').elevated,false);
  assert.equal(interlinearCells({word:'cause',side:'english',via:'',entries:[{...entry,reverse:true}]},'bahai').gloss,'امر');
  const html=tooltipHtml(result,()=>({name:'Test'}));
  assert.match(html,/<div class="word-tooltip-rendering" dir="auto">Bahá'í English: the-Cause<\/div>/);
  assert.match(html,/<span class="word-tooltip-register">elevated style<\/span>/);
  const same=tooltipHtml({...result,entries:[{...entry,rendering:'cause',register:'plain'}]},()=>({name:'Test'}));
  assert.doesNotMatch(same,/word-tooltip-rendering|word-tooltip-register/);
  const escaped=tooltipHtml({...result,entries:[{...entry,rendering:'<b>x</b>'}]},()=>({name:'Test'}));
  assert.ok(escaped.includes('&lt;b&gt;x&lt;/b&gt;')&&!escaped.includes('<b>x</b>'));
  assert.equal(glossStyle('x'),'plain');assert.equal(glossStyle('bahai'),'bahai');
});

test('a purely Persian or Arabic text puts entries in its language first',async()=>{
  assert.equal(textLanguage('Per'),'fa');assert.equal(textLanguage('Ara'),'ar');assert.equal(textLanguage('mixed'),'');assert.equal(textLanguage(' ara '),'ar');assert.equal(textLanguage(undefined),'');
  const dictionary=indexEntries(parseDictionary('form\tgloss\tlang\nمن\tI\tfa\nمن\tfrom\tar\nمن\twhoever\tar\nکتاب\tbook\tfa/ar\n'),'test');
  const get=(d,side,key)=>d[side].get(key)||[];
  const glosses=async prefer=>(await lookupWord('من',[dictionary],get,{prefer})).entries.map(entry=>entry.gloss);
  assert.deepEqual(await glosses('ar'),['from','whoever','I']);
  assert.deepEqual(await glosses('fa'),['I','from','whoever']);
  assert.deepEqual(await glosses(''),['I','from','whoever']);
  const mixed=[{lang:'ar',gloss:'a'},{gloss:'x'},{lang:'fa/ar',gloss:'s'},{lang:'fa',gloss:'f'}];
  assert.deepEqual((await import('../src/dictionary.mjs')).preferLanguage(mixed,'fa').map(e=>e.gloss),['f','s','a','x']);
  const english=async prefer=>(await lookupWord('book',[dictionary],get,{prefer})).entries;
  assert.deepEqual(await english('ar'),await english(''));
  assert.equal(interlinearCells(await lookupWord('من',[dictionary],get,{prefer:'ar'})).gloss,'from');
});

test('Bahá\'í English marks a word only when its rendering differs from the plain gloss',async()=>{
  const {renderingDiffers}=await import('../src/word-study.mjs');
  assert.equal(renderingDiffers({gloss:'sun',rendering:'Sun'}),false);
  assert.equal(renderingDiffers({gloss:'handmaidens',rendering:'handmaidens'}),false);
  assert.equal(renderingDiffers({gloss:'the matter',rendering:'the-matter'}),false);
  assert.equal(renderingDiffers({gloss:'matter',rendering:'the-Cause'}),true);
  assert.equal(renderingDiffers({gloss:'matter'}),false);
  const find=lookup(parseDictionary('form\tgloss\trendering\tregister\nامر\tmatter\tthe-Cause\televated\nشمس\tsun\tSun\televated\n'));
  assert.equal(interlinearCells(await find('امر'),'bahai').elevated,true);
  assert.equal(interlinearCells(await find('شمس'),'bahai').elevated,false);
});

test('tooltips label uncertain and reviewed entries, escaping the reviewer',()=>{
  const result=status=>({word:'نور',side:'original',via:'',matched:'نور',entries:[{form:'نور',gloss:'light',dictionary:'t',...status}]});
  const tip=status=>tooltipHtml(result(status),()=>({name:'Test',aiGenerated:true}));
  assert.match(tip({status:'uncertain'}),/<div class="word-tooltip-head">.*<span class="word-tooltip-status status-uncertain">Uncertain reading<\/span><\/div>/);
  assert.match(tip({status:'reviewed',reviewer:'SL 2026-11-05'}),/<span class="word-tooltip-status status-reviewed">Reviewed by SL 2026-11-05<\/span>/);
  assert.match(tip({status:'reviewed'}),/status-reviewed">Reviewed<\/span>/);
  for(const status of [{},{status:'unreviewed'},{status:''}])assert.doesNotMatch(tip(status),/word-tooltip-status/);
  const hostile=reviewLabelHtml({status:'reviewed',reviewer:'<img src=x onerror=alert(1)> & "q"'});
  assert.ok(hostile.includes('by &lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;')&&!hostile.includes('<img'));
  assert.equal(reviewLabelHtml({status:'Reviewed'}),'');
  const dialog=dictionaryDialogHtml([{id:'sample-volume-164',name:'Sample',kind:'published',entries:2},{id:'mine',name:'Mine',kind:'personal',entries:1}]);
  assert.match(dialog,/href="\.\/dictionary-review\.html\?dict=sample-volume-164">Review entries →<\/a>/);
  assert.equal(dialog.match(/Review entries/g).length,1);
});

test('tooltip mode is click unless hover is chosen',()=>{
  assert.equal(tooltipMode('click'),'click');
  assert.equal(tooltipMode('hover'),'hover');
  for(const value of [undefined,null,'','Hover','focus',1])assert.equal(tooltipMode(value),'click');
});

