import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const script=readFileSync(new URL('../src/site.js',import.meta.url),'utf8');
// has(id) says whether the page has that element; getElementById returns null when it does not.
function setup(saved, blocked=false,href='https://example.org/PI_browser/subjects.html',has=()=>true){
  const events={},clicks={},root={dataset:{}},values=new Map(saved?[['pi-theme',saved]]:[]),attributes={};
  const element=id=>({addEventListener:(event,fn)=>{clicks[id+':'+event]=fn;},setAttribute:(key,value)=>{attributes[id+':'+key]=value;}});
  let redirected;
  runInNewContext(script,{
    URL,location:{href},history:{replaceState:(_state,_title,url)=>{redirected=String(url);}},
    document:{documentElement:root,getElementById:id=>has(id)?element(id):null,querySelector:()=>element('meta'),addEventListener:(event,fn)=>{events[event]=fn;}},
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
const aboutIds=['about-dialog','about-close','about-open','footer-about'];
test('pages without the About dialog load without error and show the saved theme on the switch',()=>{
  // privacy.html and support.html have the masthead switch but no About dialog or buttons.
  const load=saved=>setup(saved,false,'https://example.org/PI_browser/privacy.html',id=>!aboutIds.includes(id));
  let page;assert.doesNotThrow(()=>{page=load('dark');});
  assert.equal(page.root.dataset.theme,'dark');assert.equal(page.attributes['theme-toggle:aria-checked'],'true');assert.equal(page.attributes['meta:content'],'#151d19');
  page.clicks['theme-toggle:click']();assert.equal(page.attributes['theme-toggle:aria-checked'],'false');assert.equal(page.values.get('pi-theme'),'light');
  const light=load();assert.equal(light.attributes['theme-toggle:aria-checked'],'false');assert.equal(light.attributes['meta:content'],'#f7f6f0');
});
test('the script starts on every page that loads it and wires the About dialog where the page has one',()=>{
  // Each page is reduced to the IDs in its own markup, so an element the script expects but a page lacks fails here.
  const folder=new URL('../src/',import.meta.url);let pages=0;
  for(const name of readdirSync(folder).filter(name=>name.endsWith('.html'))){
    const html=readFileSync(new URL(name,folder),'utf8');if(!/<script[^>]*\ssrc="(?:\.\/)?site\.js"/.test(html))continue;
    const ids=new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(match=>match[1]));pages++;
    let page;assert.doesNotThrow(()=>{page=setup('dark',false,'https://example.org/PI_browser/'+name,id=>ids.has(id));},name);
    assert.equal(page.attributes['theme-toggle:aria-checked'],'true',name);
    for(const id of aboutIds)assert.equal(typeof page.clicks[id+':click'],ids.has(id)?'function':'undefined',name+' '+id);
  }
  assert.ok(pages,'no page in src/ loads site.js');
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
