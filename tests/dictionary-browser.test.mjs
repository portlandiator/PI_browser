import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDictionary} from '../src/dictionary.mjs';
import {prepareEntry,parseSearch,matchRank,posGroup,filterItems,sortMatches,groupByLemma,frequencyOf,stateFromParams,stateToParams,stateQuery,defaultState,neededDictionaries,rowHtml,detailHtml,foldLatin,rootKey,sortChoices,englishHeadwords} from '../src/dictionary-browser-core.mjs';

const tsv=`form	vocalized	lemma	lang	translit	pos	root	gloss	rendering	tags	modern	modern_translit	modern_gloss	shift	definition	usage	notes	status	reviewer
امر	أَمْر	امر	ar	amr	noun	ء-م-ر	command	the-Cause	bahai,meaning-shift	دستور	dastúr	order	In the Writings mostly the Cause of God.	A command; an affair.	The Cause of God.		reviewed	SL 2026-11-05
احباء	أَحِبّاء	حبیب	ar	aḥibbá’	noun pl.	ح-ب-ب	loved ones	the-friends	elevated,bahai					Beloved ones; the believers.			uncertain
محبت	مَحَبَّت	محبت	fa	maḥabbat	noun	ح-ب-ب	love	love	literary					Love, affection.
حبیب		حبیب	ar	ḥabíb	adj.	ح-ب-ب	beloved		literary					Beloved.	The Beloved.
در		در	fa	dar	prep.		in	in						In, inside.
کرد		کردن	fa	kard	verb 3sg past		did							He did.
<b>x</b>		<b>x</b>	fa	"><i>	noun		<script>alert(1)</script>							Tag test.`;
const english=`form	lemma	lang	translit	gloss	definition	notes	status	reviewer
cause	cause	en	کاز	امر	سبب.		unreviewed
beloved	beloved	en	بِلَوِد	محبوب	دوست‌داشته.		unreviewed	`;
const items=[...parseDictionary(tsv).map((entry,row)=>prepareEntry(entry,'core',row,'en')),...parseDictionary(english).map((entry,row)=>prepareEntry(entry,'en-fa',row,'fa'))];
const by=form=>items.find(item=>item.entry.form===form);
const forms=list=>list.map(item=>item.entry.form);
const run=(params,frequency=null)=>{const state=stateFromParams(params);return forms(sortMatches(filterItems(items,state),state.sort,frequency));};

test('Persian/Arabic search ignores vowel marks and letter variants and matches the start of a word',()=>{
  assert.equal(matchRank(by('امر'),parseSearch('امر')),0);
  assert.equal(matchRank(by('امر'),parseSearch('أَمْر')),0,'vowelled and hamza spelling');
  assert.equal(matchRank(by('حبیب'),parseSearch('حبيب')),0,'Arabic yeh finds Persian yeh');
  assert.equal(matchRank(by('محبت'),parseSearch('محب')),2,'prefix');
  assert.equal(matchRank(by('احباء'),parseSearch('حبیب')),1,'lemma');
  assert.equal(matchRank(by('در'),parseSearch('امر')),-1);
  assert.deepEqual(run('q=حب'),['احباء','حبیب'],'a lemma prefix also matches (احباء has lemma حبیب)');
  assert.deepEqual(run('q=حبیب'),['حبیب','احباء'],'the form as written before a lemma match');
});

test('transliteration search ignores accents, dots, ayn marks and case',()=>{
  assert.equal(foldLatin('Aḥibbá’'),'ahibba');
  assert.equal(matchRank(by('احباء'),parseSearch('ahibba')),3);
  assert.equal(matchRank(by('احباء'),parseSearch('ahib')),4);
  assert.equal(matchRank(by('احباء'),parseSearch('hibb')),5);
  assert.equal(matchRank(by('محبت'),parseSearch('MAHAB')),4);
  assert.deepEqual(run('q=amr'),['امر']);
});

test('English search matches words of the gloss, rendering, definition, usage, modern meaning and shift',()=>{
  assert.deepEqual(run('q=Cause'),['cause','امر'],'English headword first, then the Persian entry by its rendering');
  assert.deepEqual(run('q=affection'),['محبت']);
  assert.deepEqual(run('q=order'),['امر'],'modern gloss');
  assert.deepEqual(run('q=mostly'),['امر'],'meaning shift note');
  assert.deepEqual(run('q=belov').sort(),['beloved','احباء','حبیب'].sort(),'the last word may be a word start (beloved, Beloved ones; English headword by prefix)');
  assert.deepEqual(run('q=lov ones'),[],'only the last word may be partial');
  assert.deepEqual(run('q=the believers'),['احباء']);
});

test('parts of speech fall into coarse groups',()=>{
  const cases={'noun':'noun','noun pl.':'noun','verbal noun (form IV)':'noun','prep. + noun':'particle','conj.':'particle','particle':'particle','adj.':'adjective','active participle (form VIII)':'adjective','elative adj.':'adjective','adj. (divine name)':'adjective','verb 3sg past':'verb','adv.':'adverb','adverb':'adverb','pronoun':'pronoun','pron. 3sg':'pronoun','proper noun':'proper','numeral':'other','':'other'};
  for(const [pos,group] of Object.entries(cases))assert.equal(posGroup(pos),group,pos);
});

test('each filter narrows the entries',()=>{
  assert.deepEqual(run('dict=en-fa').sort(),['beloved','cause']);
  assert.deepEqual(run('lang=fa'),['<b>x</b>','در','کرد','محبت'].sort(new Intl.Collator('fa').compare));
  assert.deepEqual(run('lang=en').sort(),['beloved','cause']);
  assert.deepEqual(run('tag=meaning-shift'),['امر']);
  assert.deepEqual(run('tag=literary,meaning-shift').sort(),['امر','حبیب','محبت'].sort(),'tags are any-of');
  assert.deepEqual(run('pos=verb'),['کرد']);
  assert.deepEqual(run('pos=particle'),['در']);
  assert.deepEqual(run('status=uncertain'),['احباء']);
  assert.deepEqual(run('status=reviewed'),['امر']);
  assert.equal(run('status=unreviewed').length,items.length-2,'an empty status counts as unreviewed');
  assert.deepEqual(run('modern=1'),['امر']);
  assert.deepEqual(run('shifted=1'),['امر']);
  assert.deepEqual(run('usage=1').sort(),['امر','حبیب'].sort());
  assert.deepEqual(run('root=ح-ب-ب').sort(),['احباء','حبیب','محبت'].sort());
  assert.deepEqual(run('root=ح-ب'),[],'roots match exactly');
  assert.equal(rootKey('ح-ب-ب'),rootKey('ح - ب - ب'));
  assert.deepEqual(run('root=ح-ب-ب&lang=ar&q=hab').sort(),['حبیب'],'filters combine');
});

test('a word family groups its entries by lemma',()=>{
  const state=stateFromParams('root=ح-ب-ب&sort=root');
  const groups=groupByLemma(sortMatches(filterItems(items,state),state.sort));
  assert.deepEqual(groups.map(group=>[group.lemma,forms(group.items)]),[['حبیب',['احباء','حبیب']],['محبت',['محبت']]]);
});

test('sort orders: Persian alphabet, root, frequency and English',()=>{
  const fa=new Intl.Collator('fa').compare;
  const alpha=run('lang=ar');assert.deepEqual(alpha,[...alpha].sort(fa));
  assert.deepEqual(run('sort=root').slice(0,3),['امر','احباء','حبیب'],'by root, then lemma; ء before ح');
  assert.deepEqual(run('sort=root').slice(-1)[0]!=='امر',true);
  const counts=new Map([['محبت',40],['امر',150],['حبیب',3]]);
  const frequency=item=>frequencyOf(item.entry.form,counts);
  assert.deepEqual(run('lang=ar&sort=frequency',frequency).slice(0,2),['امر','حبیب']);
  assert.deepEqual(run('lang=fa&sort=frequency',frequency)[0],'محبت');
  assert.equal(frequencyOf('محبتی',counts),40,'counted with a suffix removed, as the tooltip counts');
  assert.equal(frequencyOf('cause',counts),0);
  assert.deepEqual(run('sort=frequency').slice(0,2),run('').slice(0,2),'alphabetical until frequencies load');
  assert.deepEqual(run('dict=en-fa&sort=english'),['beloved','cause']);
  assert.deepEqual(run('lang=ar&sort=english'),['حبیب','امر','احباء'],'Persian/Arabic entries by gloss: beloved, command, loved ones');
  assert.deepEqual(run('q=cause&sort=english'),['cause','امر'],'better matches come first');
});

test('the URL state round-trips and rejects unknown values',()=>{
  const state={...defaultState(),q:'امر',dict:['core','en-fa'],lang:'fa/ar',tag:['bahai','meaning-shift'],pos:'noun',status:'uncertain',modern:true,shifted:true,usage:true,root:'ح-ب-ب',sort:'frequency',page:3,entry:'core:12'};
  assert.deepEqual(stateFromParams(stateToParams(state)),state);
  assert.deepEqual(stateFromParams(new URL(`http://x/d.html${stateQuery(state)}`).search),state);
  assert.equal(stateQuery(defaultState()),'');
  // about=1 opens the About box of the one chosen dictionary.
  assert.equal(stateFromParams('dict=core&about=1').about,true);
  assert.equal(stateQuery({...defaultState(),dict:['core'],about:true}),'?dict=core&about=1');
  assert.equal(stateQuery({...defaultState(),dict:['core','en-fa'],about:true}),'?dict=core%2Cen-fa');
  assert.deepEqual(stateFromParams('lang=xx&tag=bogus,archaic&pos=thing&status=done&sort=random&page=-4&entry=<b>'),{...defaultState(),tag:['archaic']});
  const index=[{id:'core',target:'en'},{id:'en-fa',target:'fa'},{id:'en-ar',target:'ar'}];
  assert.deepEqual(neededDictionaries(index,defaultState()).map(item=>item.id),['core','en-fa','en-ar']);
  assert.deepEqual(neededDictionaries(index,{...defaultState(),lang:'en'}).map(item=>item.id),['en-fa','en-ar']);
  assert.deepEqual(neededDictionaries(index,{...defaultState(),lang:'fa',dict:['core','en-ar']}).map(item=>item.id),['core']);
});

test('rows and details escape source text and label every field',()=>{
  const bad=by('<b>x</b>');
  const html=rowHtml(bad)+detailHtml(bad,{name:'<i>Dict</i>',aiGenerated:true});
  assert.ok(!html.includes('<b>x')&&!html.includes('<script>')&&!html.includes('"><i>')&&!html.includes('<i>Dict'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  const amr=by('امر'),row=rowHtml(amr,{expanded:true,frequency:1234});
  assert.match(row,/aria-expanded="true"/);
  assert.match(row,/dir="rtl" lang="ar">امر<\/span> <span class="dict-vocalized" dir="rtl" lang="ar">أَمْر/);
  assert.match(row,/amr<\/span> · noun · 1,234 ¶/);
  assert.match(row,/command<\/span> <span class="dict-rendering">\/ Bahá'í English: the-Cause/);
  assert.match(row,/word-tag tag-bahai">Bahá&#39;í term<\/span><span class="word-tag tag-meaning-shift">Meaning shifted/);
  const detail=detailHtml(amr,{name:'Core',aiGenerated:true},{rootHref:root=>`?root=${encodeURIComponent(root)}`});
  for(const label of ['Form','Vowelled spelling','Lemma','Language','Pronunciation','Part of speech','Root','Gloss',"Bahá'í English",'Tags','Modern equivalent','Meaning shift','Definition','In the Writings','Review','Dictionary'])assert.ok(detail.includes(`<dt>${label}</dt>`),label);
  assert.match(detail,/data-root="ء-م-ر"/);
  assert.match(detail,/دستور<\/span> <span class="dict-translit">dastúr<\/span> \(order\)/);
  assert.match(detail,/Reviewed by SL 2026-11-05/);
  assert.match(detail,/Core · <span class="dict-ai">AI-generated/);
  assert.match(detail,/href="\.\/\?q=%D8%A7%D9%85%D8%B1&amp;view=original">Search the Catalog/);
  assert.match(detail,/class="dict-concordance"/);
  const en=detailHtml(by('cause'),{name:'EN'});
  assert.match(en,/view=en">/);assert.match(en,/class="dict-concordance"/);
  assert.match(rowHtml(by('cause')),/dir="rtl" lang="fa" class="dict-translit">کاز/);
  assert.match(detailHtml(by('احباء'),{}),/Uncertain reading/);
  const mixed=prepareEntry({form:'امر',gloss:'command',usage:'Usually امر الله, the Cause.'},'core',0,'en');
  assert.match(detailHtml(mixed,{}),/<dd><span dir="ltr" lang="en">Usually امر الله/,'English text quoting Arabic reads left to right');
});

test('English headwords read from the left and sort as English',()=>{
  const cause=rowHtml(by('cause')),amr=rowHtml(by('امر'));
  assert.match(cause,/^<li class="dict-item dict-item-ltr"/,'an English headword gets the left-to-right row');
  assert.match(cause,/class="dict-word" dir="ltr" lang="en">cause/);
  assert.match(cause,/class="dict-gloss"><span dir="rtl" lang="fa">امر/,'its Persian gloss still reads right to left');
  assert.match(amr,/^<li class="dict-item"/);assert.doesNotMatch(amr,/dict-item-ltr/);
  const numeral=prepareEntry({form:'1332',lang:'fa/ar',gloss:'1332'},'core',9,'en');
  assert.equal(numeral.ltr,false,'a numeral in a Persian/Arabic dictionary keeps the right-to-left row');
  assert.equal(prepareEntry({form:'hath',lemma:'have',gloss:'has'},'archaic',0,'modern').ltr,true);
  const archaic=['Zeal','abide','Abase','10','9'].map((form,row)=>prepareEntry({form,lang:'en',gloss:'x'},'archaic',row,'modern'));
  const sorted=sortMatches(filterItems(archaic,stateFromParams('')),'alpha').map(item=>item.entry.form);
  assert.deepEqual(sorted,['9','10','Abase','abide','Zeal'],'English order, case aside, numbers by value');
  assert.deepEqual(run('').slice(-2),['beloved','cause'],'mixed results: Persian/Arabic headwords first, then English');
});

test('the sort choices fit the chosen dictionaries',()=>{
  const index=[{id:'core',target:'en'},{id:'en-fa',target:'fa'},{id:'archaic',target:'modern'}];
  const pick=params=>neededDictionaries(index,stateFromParams(params));
  assert.equal(englishHeadwords(pick('')),false);
  assert.equal(englishHeadwords(pick('dict=archaic,en-fa')),true);
  assert.equal(englishHeadwords(pick('lang=en')),true);
  assert.deepEqual(sortChoices(pick('')).map(([sort,label])=>label),['Persian/Arabic A–Z','By root','Frequency in authorized translations','English A–Z']);
  assert.deepEqual(sortChoices(pick('dict=archaic')),[['alpha','A–Z']],'English headwords only: plain A–Z');
  assert.deepEqual(sortChoices(pick('dict=archaic'),'english'),[['alpha','A–Z'],['english','English A–Z']],'a sort in use stays listed');
  assert.deepEqual(sortChoices(pick('dict=core,archaic')).length,4);
});

test('the page shares the site masthead and links the review page',()=>{
  const html=readFileSync(new URL('../src/dictionary-browser.html',import.meta.url),'utf8');
  assert.match(html,/<title>Dictionary · Partial Inventory<\/title>/);
  assert.match(html,/href="\.\/word-study\.css"/);
  assert.match(html,/href="\.\/dictionary-review\.html">Review entries/);
  assert.match(html,/<label for="dict-q"/);
});
