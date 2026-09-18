import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const script=readFileSync(new URL('../src/site.js',import.meta.url),'utf8');
function setup(saved, blocked=false){
  const events={},clicks={},root={dataset:{}},values=new Map(saved?[['pi-theme',saved]]:[]),attributes={};
  const element=id=>({addEventListener:(event,fn)=>{clicks[id+':'+event]=fn;},setAttribute:(key,value)=>{attributes[id+':'+key]=value;}});
  runInNewContext(script,{
    document:{documentElement:root,getElementById:element,querySelector:()=>element('meta'),addEventListener:(event,fn)=>{events[event]=fn;}},
    window:{addEventListener:(event,fn)=>{events[event]=fn;}},
    localStorage:{getItem:key=>{if(blocked)throw Error('Blocked');return values.get(key);},setItem:(key,value)=>{if(blocked)throw Error('Blocked');values.set(key,value);}}
  });
  events.DOMContentLoaded();return {events,clicks,root,values,attributes};
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
test('catalog and subject pages share header geometry and About content',()=>{
  const pages=['index.html','subjects.html'].map(name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8'));
  const header=html=>html.match(/<header class="masthead">[\s\S]*?<\/header>/)[0].replace(/ class="active"| aria-current="page"/g,'');
  assert.equal(header(pages[0]),header(pages[1]));
  assert.equal(pages[0].match(/<dialog[\s\S]*?<\/dialog>/)[0],pages[1].match(/<dialog[\s\S]*?<\/dialog>/)[0]);
});
