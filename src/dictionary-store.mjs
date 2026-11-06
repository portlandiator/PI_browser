// The reader's dictionaries: published dictionaries (shards fetched on demand)
// and personal dictionaries the reader adds from a file. Personal dictionaries
// stay in this browser (IndexedDB) and are never uploaded. Storage can be
// unavailable (private windows, blocked site data); everything then still
// works for the current visit.
import {indexEntries,parseDictionary,dictionaryShard,lookupWord,dictionaryTarget} from './dictionary.mjs';

const settingsKey='pi-dictionaries';
const database='pi-dictionaries',storeName='personal';
const shardLimit=1024;
// At most a few shard requests at once: a long word-study view can need hundreds.
const maxFetches=6;let activeFetches=0;const fetchQueue=[];
const limitedFetch=url=>new Promise((resolve,reject)=>{const run=()=>{activeFetches++;fetch(url).then(resolve,reject).finally(()=>{activeFetches--;fetchQueue.shift()?.();});};activeFetches<maxFetches?run():fetchQueue.push(run);});

function readSettings(){try{const value=JSON.parse(localStorage.getItem(settingsKey)||'{}');return {order:Array.isArray(value.order)?value.order.filter(id=>typeof id==='string'):[],disabled:Array.isArray(value.disabled)?value.disabled.filter(id=>typeof id==='string'):[]};}catch{return {order:[],disabled:[]};}}
function writeSettings(settings){try{localStorage.setItem(settingsKey,JSON.stringify(settings));}catch{}}

function openDatabase(){
  return new Promise((resolve,reject)=>{
    let request;try{request=indexedDB.open(database,1);}catch(error){reject(error);return;}
    request.onupgradeneeded=()=>request.result.createObjectStore(storeName,{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
async function withStore(mode,action){
  const db=await openDatabase();
  try{return await new Promise((resolve,reject)=>{const tx=db.transaction(storeName,mode);const result=action(tx.objectStore(storeName));tx.oncomplete=()=>resolve(result.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
  finally{db.close();}
}

export function createDictionaryStore(base){
  const published=new Map(),personal=new Map(),shards=new Map();
  let settings=readSettings(),ready=null;const listeners=new Set();
  const changed=()=>{for(const listener of listeners)listener();};

  async function load(){
    try{const response=await fetch(new URL('dictionaries/index.json',base));if(response.ok){const index=await response.json();for(const item of index.dictionaries||[])published.set(item.id,{...item,kind:'published'});}}catch{}
    try{const rows=await withStore('readonly',store=>store.getAll());for(const row of rows||[])addPersonal(row,false);}catch{}
  }
  function addPersonal(row,notify=true){
    const entries=parseDictionary(row.text);
    personal.set(row.id,{id:row.id,name:row.name,kind:'personal',entries:entries.length,target:dictionaryTarget(entries),added:row.added,index:indexEntries(entries,row.id)});
    if(notify)changed();
  }
  const all=()=>{
    const items=[...personal.values(),...published.values()];
    const rank=id=>{const i=settings.order.indexOf(id);return i<0?Infinity:i;};
    // Personal dictionaries come first unless the reader has ordered them.
    return items.map((item,i)=>({item,i})).sort((a,b)=>rank(a.item.id)-rank(b.item.id)||a.i-b.i).map(({item})=>item);
  };
  async function shard(item,side,n){
    const key=`${item.id}/${side}/${n}`;
    if(shards.has(key)){const value=shards.get(key);shards.delete(key);shards.set(key,value);return value;}
    const promise=item.shards[side].includes(n)?limitedFetch(new URL(`dictionaries/${item.id}/${side[0]}-${n}.json`,base)).then(r=>r.ok?r.json():{}).catch(()=>{shards.delete(key);return {};}):Promise.resolve({});
    shards.set(key,promise);if(shards.size>shardLimit)shards.delete(shards.keys().next().value);
    return promise;
  }
  async function get(item,side,key){
    if(item.kind==='personal')return item.index[side].get(key)||[];
    const entries=(await shard(item,side,dictionaryShard(key)))[key]||[];
    return entries.map(entry=>({...entry,dictionary:item.id}));
  }
  return {
    ready(){return ready||=load();},
    onChange(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
    list(){return all().map(item=>({id:item.id,name:item.name,kind:item.kind,description:item.description||'',aiGenerated:!!item.aiGenerated,target:item.target||'',entries:item.entries,forms:item.forms,uncertain:item.uncertain,about:Array.isArray(item.about)?item.about:[],enabled:!settings.disabled.includes(item.id)}));},
    info(id){const item=published.get(id)||personal.get(id);return item?{id,name:item.name,kind:item.kind,aiGenerated:!!item.aiGenerated,target:item.target||''}:null;},
    active(){return all().filter(item=>!settings.disabled.includes(item.id));},
    hasActive(){return this.active().length>0;},
    // English words: dictionaries into the chosen language (fa or ar) first.
    async lookup(word,{target='',prefer=''}={}){await this.ready();const active=this.active();const rank=item=>item.target===target?0:item.target==='en'?1:2;const order=target?active.map((item,i)=>({item,i})).sort((a,b)=>rank(a.item)-rank(b.item)||a.i-b.i).map(({item})=>item):active;return lookupWord(word,order,get,{prefer});},
    // Fetch every shard a set of words needs, so a paragraph renders at once.
    async prefetch(keys){await this.ready();const jobs=[];for(const item of this.active())if(item.kind==='published')for(const side of ['original','english'])for(const n of new Set(keys.map(dictionaryShard)))jobs.push(shard(item,side,n));await Promise.all(jobs);},
    setEnabled(id,enabled){settings.disabled=settings.disabled.filter(x=>x!==id);if(!enabled)settings.disabled.push(id);writeSettings(settings);changed();},
    move(id,delta){const order=all().map(item=>item.id);const i=order.indexOf(id),j=i+delta;if(i<0||j<0||j>=order.length)return;[order[i],order[j]]=[order[j],order[i]];settings.order=order;writeSettings(settings);changed();},
    async addFile(file){
      const text=await file.text();const entries=parseDictionary(text);
      const row={id:'personal-'+Date.now().toString(36),name:file.name.replace(/\.(tsv|csv|txt)$/i,''),text,added:new Date().toISOString()};
      let saved=true;try{await withStore('readwrite',store=>store.put(row));}catch{saved=false;}
      addPersonal(row);return {entries:entries.length,saved};
    },
    async remove(id){personal.delete(id);try{await withStore('readwrite',store=>store.delete(id));}catch{}settings.order=settings.order.filter(x=>x!==id);settings.disabled=settings.disabled.filter(x=>x!==id);writeSettings(settings);changed();},
  };
}
