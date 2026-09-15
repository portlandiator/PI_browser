import {normalize,parseQuery,shardKey,unpackPosting,matchPostings} from './text.mjs';
import {loadCompressed} from './data.mjs';
let catalogPromise;
const shards=new Map();
const getCatalog=()=>catalogPromise??=loadCompressed(new URL('./catalog.json.gz',import.meta.url)).catch(error=>{catalogPromise=null;throw error;});
async function getShard(language,key){
  const cacheKey=`${language}/${key}`;
  if(shards.has(cacheKey)){const value=shards.get(cacheKey);shards.delete(cacheKey);shards.set(cacheKey,value);return value;}
  const promise=loadCompressed(new URL(`./index/${cacheKey}.json.gz`,import.meta.url)).catch(error=>{shards.delete(cacheKey);throw error;});
  shards.set(cacheKey,promise);
  if(shards.size>32)shards.delete(shards.keys().next().value);
  return promise;
}
async function searchLanguage(language,groups){
  const words=[...new Set(groups.flatMap(g=>g.words))],postings=new Map();
  await Promise.all(words.map(async word=>{
    const bucket=await getShard(language,shardKey(word));
    if(Object.hasOwn(bucket,word)){const bytes=Uint8Array.from(atob(bucket[word]),c=>c.charCodeAt(0));postings.set(word,unpackPosting(bytes));}
  }));
  return matchPostings(groups,postings);
}
function includes(value,query){return normalize(value).includes(normalize(query));}
function allowed(row,filters){
  if(filters.author&&row.author!==filters.author)return false;
  if(filters.volume&&row.volume!==filters.volume)return false;
  for(const key of ['date','addressee','place'])if(filters[key] && (filters[key]==='[missing]'?Boolean(row[key]):!includes(row[key],filters[key])))return false;
  if(filters.availability==='paired'&&!(row.hasEnglish&&row.hasOriginal))return false;
  if(filters.availability==='en'&&!row.hasEnglish)return false;
  if(filters.availability==='original'&&!row.hasOriginal)return false;
  if(filters.availability==='missing'&&row.hasEnglish&&row.hasOriginal)return false;
  return true;
}
self.onmessage=async({data})=>{
  const {type,requestId}=data;
  try{
    const catalog=await getCatalog();
    if(type==='init'){
      const unique=key=>[...new Set(catalog.map(r=>r[key]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
      self.postMessage({type,requestId,total:catalog.length,facets:{author:unique('author'),volume:unique('volume'),place:unique('place'),addressee:unique('addressee')}});return;
    }
    const {query='',language='both',filters={},sort='id',page=1}=data;
    const cleanId=query.trim().replace(/\.txt$/i,'').toUpperCase();
    const idLike=/^[A-Z]{2}\d{3,}[\w ()-]*$/.test(cleanId);
    let rows;
    if(idLike||catalog.some(row=>row.id.toUpperCase()===cleanId)){rows=catalog.filter(row=>row.id.toUpperCase()===cleanId);}
    else if(query.trim()){
      if(query.length>300)throw new Error('Please use a search of 300 characters or fewer.');
      const groups=parseQuery(query);
      const languages=language==='both'?['en','original']:[language];
      const found=await Promise.all(languages.map(lang=>searchLanguage(lang,groups)));
      const matches=new Map();found.forEach((list,i)=>list.forEach(doc=>matches.set(doc,[...(matches.get(doc)||[]),languages[i]])));
      rows=[...matches].map(([doc,languages])=>({...catalog[doc],matches:languages}));
    } else rows=catalog;
    rows=rows.filter(row=>allowed(row,filters));
    rows.sort((a,b)=>sort==='title'?(a.title||a.excerpt||a.id).localeCompare(b.title||b.excerpt||b.id):sort==='volume'?(Number(a.volume||99999)-Number(b.volume||99999)||a.id.localeCompare(b.id)):sort==='date'?(a.date?b.date?a.date.localeCompare(b.date,undefined,{numeric:true}):-1:b.date?1:a.id.localeCompare(b.id)):a.id.localeCompare(b.id));
    const total=rows.length,lastPage=Math.max(1,Math.ceil(total/20)),current=Math.max(1,Math.min(page,lastPage));
    self.postMessage({type,requestId,total,page:current,pages:lastPage,rows:rows.slice((current-1)*20,current*20)});
  }catch(error){self.postMessage({type:'error',requestId,message:error.message});}
};
