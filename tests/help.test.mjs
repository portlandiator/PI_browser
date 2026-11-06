import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {wordTags,tagLabels} from '../src/dictionary.mjs';
import {helpHtml,helpSections,helpTabsHtml,tagsHelpHtml,colourKeyHtml,sectionColor,tagMeanings} from '../src/help.mjs';

const order=JSON.parse(readFileSync(new URL('../src/subject-order.json',import.meta.url),'utf8'));

test('help has the four sections with stable anchors, linked from its tabs',()=>{
  const html=helpHtml(),tabs=helpTabsHtml();
  const ids=['help-word-study','help-tags','help-pronunciation','help-colours'];
  assert.deepEqual([...html.matchAll(/<section id="(help-[^"]+)"/g)].map(m=>m[1]),ids);
  assert.deepEqual([...tabs.matchAll(/href="#([^"]+)"/g)].map(m=>m[1]),ids);
  assert.equal(helpSections.length,4);
  for(const id of ['guide-transliteration','guide-persian','guide-arabic'])assert.match(html,new RegExp(`<section id="${id}"`));
  for(const text of ['Plain','Bahá’í English','Root','Meaning shift','In the Writings','Authorized translations','Usually renders','Show passages','Uncertain reading','Reviewed by','AI-generated','Words: original','Words: English','Vowel marks','Mark','Hover','Click'])assert.ok(html.includes(text),text);
});

test('the tag list is one list of the ten tags in wordTags order, with tooltip chips and meanings',()=>{
  const html=tagsHelpHtml();
  const chips=[...html.matchAll(/<span class="word-tag tag-([a-z-]+)">([^<]+)<\/span>/g)];
  assert.deepEqual(chips.map(m=>m[1]),wordTags);
  assert.equal(chips.length,10);assert.equal(chips[0][2],'Elevated style');
  assert.deepEqual(chips.map(m=>m[2].replaceAll('&#39;',"'")),wordTags.map(tag=>tagLabels[tag]));
  for(const tag of wordTags)assert.ok(tagMeanings[tag],tag);
  assert.match(html,/underlined/);
  assert.equal((html.match(/<ul class="help-tags">/g)||[]).length,1);
});

test('the colour key has one row per section with the colour most of its subjects share',()=>{
  const subjects=[];
  order.groups.forEach((group,i)=>group.subjects.forEach((name,j)=>subjects.push({name,color:i===8&&j===0?'#2B3514':'#'+(i+1).toString(16).padStart(2,'0')+'AA00'})));
  const html=colourKeyHtml(order.groups,subjects);
  const rows=[...html.matchAll(/<li style="--subject-color:var\(--subject-([a-f\d]{6}),#[a-f\d]{6}\);--subject-bg:var\(--white\)"><span class="help-swatch" aria-hidden="true"><\/span><span class="help-colour-title">([^<]+)<\/span><\/li>/g)];
  assert.equal(order.groups.length,19);assert.equal(rows.length,19);
  assert.deepEqual(rows.map(m=>m[2].replaceAll('&#39;',"'").replaceAll('&amp;','&')),order.groups.map(g=>g.title));
  assert.equal(rows[8][1],'09aa00');
  const byName=new Map([['a',{color:'#ED7D31'}],['b',{color:'#ed7d31'}],['c',{color:'#000000'}]]);
  assert.equal(sectionColor({subjects:['c','a','b']},byName),'#ed7d31');
  assert.equal(sectionColor({subjects:['missing']},byName),null);
});

test('the colour key escapes section titles and ignores invalid colours',()=>{
  const html=colourKeyHtml([{title:'<b>"x"</b>',subjects:['s']}],[{name:'s',color:'red;}</style>'}]);
  assert.match(html,/&lt;b&gt;&quot;x&quot;&lt;\/b&gt;/);
  assert.doesNotMatch(html,/<b>|<\/style>/);
  assert.match(html,/--subject-color:var\(--ink\)/);
});

test('the help page and Subject view link to help, labelled for the subject colours',()=>{
  const page=readFileSync(new URL('../src/help.html',import.meta.url),'utf8');
  assert.match(page,/renderHelpPage\(document\.getElementById\('help-content'\)\)/);
  assert.match(page,/href="\.\/word-study\.css"/);
  const subjects=readFileSync(new URL('../src/subjects.html',import.meta.url),'utf8');
  assert.match(subjects,/<button type="button" class="help-button" id="subject-colours-help" aria-label="Help: subject colours"/);
});
