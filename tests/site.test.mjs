import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const script=readFileSync(new URL('../src/site.js',import.meta.url),'utf8');
function setup(saved, blocked=false,href='https://example.org/PI_browser/subjects.html',absent=[]){
  const events={},clicks={},root={dataset:{}},values=new Map(saved?[['pi-theme',saved]]:[]),attributes={};
  const element=id=>absent.includes(id)?null:({addEventListener:(event,fn)=>{clicks[id+':'+event]=fn;},setAttribute:(key,value)=>{attributes[id+':'+key]=value;}});
  let redirected;
  runInNewContext(script,{
    URL,location:{href},history:{replaceState:(_state,_title,url)=>{redirected=String(url);}},
    document:{documentElement:root,getElementById:element,querySelector:()=>element('meta'),addEventListener:(event,fn)=>{events[event]=fn;}},
    window:{addEventListener:(event,fn)=>{events[event]=fn;}},
    localStorage:{getItem:key=>{if(blocked)throw Error('Blocked');return values.get(key);},setItem:(key,value)=>{if(blocked)throw Error('Blocked');values.set(key,value);}}
  });
  events.DOMContentLoaded();return {events,clicks,root,values,attributes,redirected};
}
test('theme persists across pages, switches both ways, and follows other tabs',()=>{
  const page=setup();assert.equal(page.root.dataset.theme,'light');
  page.clicks['theme-toggle:click']();assert.equal(page.attributes['theme-toggle:aria-checked'],'true');
  const next=setup(page.values.get('pi-theme'));assert.equal(next.root.dataset.theme,'dark');
  next.clicks['theme-toggle:click']();assert.equal(next.values.get('pi-theme'),'light');
  page.events.storage({key:'pi-theme',newValue:'light'});assert.equal(page.attributes['theme-toggle:aria-checked'],'false');
});
test('theme control still works when browser storage is blocked',()=>{
  const page=setup(undefined,true);page.clicks['theme-toggle:click']();assert.equal(page.root.dataset.theme,'dark');
});
test('pages without the About dialog still show and switch the theme',()=>{
  // The policy, support and visitor-graph pages have a theme switch but no dialog.
  const absent=['about-dialog','about-open','footer-about','about-close','about-stats'];
  for(const name of ['privacy.html','support.html','visitors.html']){
    const html=readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
    assert(html.includes('<script src="./site.js"></script>')&&html.includes('id="theme-toggle"')&&!html.includes('about-dialog'),name);
  }
  const page=setup('dark',false,'https://example.org/PI_browser/visitors.html',absent);
  // Opened in the dark theme, the switch says so at once.
  assert.equal(page.root.dataset.theme,'dark');
  assert.equal(page.attributes['theme-toggle:aria-checked'],'true');assert.equal(page.attributes['meta:content'],'#151d19');
  page.clicks['theme-toggle:click']();
  assert.equal(page.attributes['theme-toggle:aria-checked'],'false');assert.equal(page.values.get('pi-theme'),'light');
  assert.deepEqual(Object.keys(page.clicks),['theme-toggle:click']);
});
test('catalog, subject and volume pages share header geometry and About content',()=>{
  const pages=['index.html','subjects.html','relationships.html','passages.html','volume-view.html'].map(name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8'));
  const header=html=>html.match(/<header class="masthead">[\s\S]*?<\/header>/)[0].replace(/ class="active"| aria-current="page"/g,'');
  for(const page of pages.slice(1))assert.equal(header(pages[0]),header(page));
  for(const page of pages.slice(1))assert.equal(pages[0].match(/<dialog[\s\S]*?<\/dialog>/)[0],page.match(/<dialog[\s\S]*?<\/dialog>/)[0]);
});

test('merged subject bookmarks preserve reading preferences and anchors',()=>{
 const page=setup(undefined,false,'https://example.org/PI_browser/subjects.html?subject=5A637BBBB913426BA5FEBBC58E0A6BF2-09862a80&mode=en#selection');
 const url=new URL(page.redirected);assert.equal(url.searchParams.get('subject'),'5A637BBBB913426BA5FEBBC58E0A6BF2');assert.equal(url.searchParams.get('mode'),'en');assert.equal(url.hash,'#selection');
});

test('on the study guides the masthead and the footer both open the About dialog',()=>{
  const guideScript=readFileSync(new URL('../scripts/compilation-guide-site.js',import.meta.url),'utf8');
  const listeners={},opened=[],stats={textContent:''};
  const dialog={dataset:{stats:'../about-stats.mjs'},showModal:()=>opened.push('opened'),close:()=>opened.push('closed'),getBoundingClientRect:()=>({left:0,right:10,top:0,bottom:10})};
  const elements={'about-dialog':dialog,'about-stats':stats};
  runInNewContext(guideScript,{
    URL,location:{href:'https://example.org/PI_browser/study-guides/index.html'},localStorage:{setItem(){},getItem:()=>null},
    document:{documentElement:{dataset:{theme:'light'}},getElementById:id=>elements[id]||null,querySelector:()=>null,addEventListener:(type,listener)=>{listeners[type]=listener;}},
    addEventListener(){},
  });
  // A click may land on the button itself or on text inside it.
  const click=id=>listeners.click({target:{id:'',closest:()=>({id})},clientX:5,clientY:5});
  click('about-open');click('footer-about');
  assert.deepEqual(opened,['opened','opened']);
  click('about-close');assert.deepEqual(opened,['opened','opened','closed']);
  // Any other button leaves the dialog alone.
  click('guide-sort');assert.equal(opened.length,3);
});
