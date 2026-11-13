import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {guideThemeScript} from '../scripts/build-compilation-pilot.mjs';

const script=readFileSync(new URL('../src/site.js',import.meta.url),'utf8');
// has(id) says whether the page has that element; getElementById returns null when it does not.
// loaded:false stops before DOMContentLoaded; parse() then stands for the parser adding elements.
function setup(saved, blocked=false,href='https://example.org/PI_browser/subjects.html',{has=()=>true,loaded=true,source=script}={}){
  const events={},clicks={},root={dataset:{}},values=new Map(saved?[['pi-theme',saved]]:[]),attributes={},observers=[];
  const element=id=>({addEventListener:(event,fn)=>{clicks[id+':'+event]=fn;},setAttribute:(key,value)=>{attributes[id+':'+key]=value;}});
  const listen=(event,fn)=>{events[event]=fn;};
  let redirected;
  runInNewContext(source,{
    URL,location:{href},history:{replaceState:(_state,_title,url)=>{redirected=String(url);}},
    document:{documentElement:root,getElementById:id=>has(id)?element(id):null,querySelector:()=>element('meta'),addEventListener:listen},
    window:{addEventListener:listen},addEventListener:listen,
    MutationObserver:class{constructor(fn){this.fn=fn;observers.push(this);}observe(target,options){this.target=target;this.options={...options};this.active=true;}disconnect(){this.active=false;}},
    localStorage:{getItem:key=>{if(blocked)throw Error('Blocked');return values.get(key);},setItem:(key,value)=>{if(blocked)throw Error('Blocked');values.set(key,value);}}
  });
  const parse=()=>{for(const observer of observers)if(observer.active)observer.fn();};
  if(loaded)events.DOMContentLoaded();return {events,clicks,root,values,attributes,redirected,observers,parse};
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
  const load=saved=>setup(saved,false,'https://example.org/PI_browser/privacy.html',{has:id=>!aboutIds.includes(id)});
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
    let page;assert.doesNotThrow(()=>{page=setup('dark',false,'https://example.org/PI_browser/'+name,{has:id=>ids.has(id)});},name);
    assert.equal(page.attributes['theme-toggle:aria-checked'],'true',name);
    for(const id of aboutIds)assert.equal(typeof page.clicks[id+':click'],ids.has(id)?'function':'undefined',name+' '+id);
    // The theme must be set before the page is parsed and painted: a plain script in the head, after the theme-color element it updates.
    const tag=html.match(/<script[^>]*\ssrc="(?:\.\/)?site\.js"[^>]*>/)[0];assert.doesNotMatch(tag,/defer|async|module/,name);
    assert.ok(html.indexOf('<meta name="theme-color"')<html.indexOf(tag)&&html.indexOf(tag)<html.indexOf('</head>'),name);
  }
  assert.ok(pages,'no page in src/ loads site.js');
});
test('main and study-guide pages show the saved theme on theme-color at once and on the switch as soon as it is parsed',()=>{
  // Both happen before DOMContentLoaded, which waits for the page's modules and can follow the first frame.
  for(const [family,source] of [['main',script],['study guide',guideThemeScript]]){
    let parsed=false;
    const page=setup('dark',false,undefined,{source,has:id=>parsed||id!=='theme-toggle',loaded:false}),[observer]=page.observers;
    assert.equal(page.root.dataset.theme,'dark',family);assert.equal(page.attributes['meta:content'],'#151d19',family);
    assert.equal(observer.target,page.root,family);assert.deepEqual(observer.options,{childList:true,subtree:true},family);
    page.parse();assert.equal(page.attributes['theme-toggle:aria-checked'],undefined,family);assert.equal(observer.active,true,family);
    parsed=true;page.parse();assert.equal(page.attributes['theme-toggle:aria-checked'],'true',family);assert.equal(observer.active,false,family);
    page.events.storage({key:'pi-theme',newValue:'light'});assert.equal(page.root.dataset.theme,'light',family);
    assert.equal(page.attributes['theme-toggle:aria-checked'],'false',family);assert.equal(page.attributes['meta:content'],'#f7f6f0',family);
    assert.equal(setup(undefined,false,undefined,{source,loaded:false}).attributes['meta:content'],'#f7f6f0',family);
  }
  assert.equal(setup('dark').observers[0].active,false);
});
test('the switch thumb is placed by the page theme in the main and study-guide stylesheets',()=>{
  // The theme attribute exists before the first frame; an attribute a script sets on the switch may not.
  for(const file of ['../src/theme.css','../scripts/compilation-pilot.css']){
    const css=readFileSync(new URL(file,import.meta.url),'utf8');
    assert.match(css,/:root:not\(\[data-theme=dark\]\) \.theme-track>span\{transform:translateX\(16px\)\}/,file);
    assert.doesNotMatch(css,/\[aria-checked/,file);
  }
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
