import {normalize,parseQuery,shardKey,unpackPosting,matchPostings} from './text.mjs';
import {loadCompressed} from './data.mjs';
import {hasFilter,matchesMetadata,facetSummary} from './metadata.mjs';
let catalogPromise;
let datasetBase;
let schemaPromise,baseCache;
const columns=new Map();
const shards=new Map();
const getCatalog=()=>catalogPromise??=loadCompressed(new URL('catalog.json.gz',datasetBase)).then(rows=>rows.map((row,doc)=>({...row,doc}))).catch(error=>{catalogPromise=null;throw error;});
const getSchema=()=>schemaPromise??=fetch(new URL('metadata-schema.json',datasetBase)).then(r=>{if(!r.ok)throw new Error('Metadata fields could not be loaded.');return r.json();}).catch(error=>{schemaPromise=null;throw error;});
async function getColumn(key){
  const schema=await getSchema();if(!schema.some(field=>field.key===key))throw new Error('Unknown metadata field');
  if(!columns.has(key))columns.set(key,loadCompressed(new URL(`facets/${key}.json.gz`,datasetBase)).catch(error=>{columns.delete(key);throw error;}));
  return columns.get(key);
}
async function getShard(language,key){
  const cacheKey=`${language}/${key}`;
  if(shards.has(cacheKey)){const value=shards.get(cacheKey);shards.delete(cacheKey);shards.set(cacheKey,value);return value;}
  const promise=loadCompressed(new URL(`index/${cacheKey}.json.gz`,datasetBase)).catch(error=>{shards.delete(cacheKey);throw error;});
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
function allowed(row,filters){
  if(filters.author&&row.author!==filters.author)return false;
  if(filters.availability==='paired'&&!(row.hasEnglish&&row.hasOriginal))return false;
  if(filters.availability==='en'&&!row.hasEnglish)return false;
  if(filters.availability==='original'&&!row.hasOriginal)return false;
  if(filters.availability==='missing'&&row.hasEnglish&&row.hasOriginal)return false;
  return true;
}
async function baseResults(query,language){
  const signature=JSON.stringify([query,language]);
  if(baseCache?.signature===signature)return baseCache.promise;
  const promise=(async()=>{
    const catalog=await getCatalog();
    const cleanId=query.trim().replace(/\.txt$/i,'').toUpperCase();
    const idLike=/^[A-Z]{2}\d{3,}[\w ()-]*$/.test(cleanId);
    if(idLike||catalog.some(row=>row.id.toUpperCase()===cleanId))return catalog.filter(row=>row.id.toUpperCase()===cleanId);
    if(!query.trim())return catalog;
    if(query.length>300)throw new Error('Please use a search of 300 characters or fewer.');
    const groups=parseQuery(query),languages=language==='both'?['en','original']:[language];
    const found=await Promise.all(languages.map(lang=>searchLanguage(lang,groups)));
    const matches=new Map();found.forEach((list,i)=>list.forEach(doc=>matches.set(doc,[...(matches.get(doc)||[]),languages[i]])));
    return [...matches].map(([doc,languages])=>({...catalog[doc],matches:languages}));
  })().catch(error=>{if(baseCache?.signature===signature)baseCache=null;throw error;});
  baseCache={signature,promise};return promise;
}
async function filteredResults(data,exceptField){
  const {query='',language='both',filters={},metadataFilters={}}=data;
  const schema=await getSchema(),keys=new Set(schema.map(field=>field.key));
  const active=Object.entries(metadataFilters).filter(([key,value])=>key!==exceptField&&keys.has(key)&&hasFilter(value));
  const loaded=await Promise.all(active.map(async([key,filter])=>({filter,values:await getColumn(key)})));
  return (await baseResults(query,language)).filter(row=>allowed(row,filters)&&loaded.every(({filter,values})=>matchesMetadata(values[row.doc]||'',filter)));
}
self.onmessage=async({data})=>{
  const {type,requestId}=data;
  try{
    if(type==='init')datasetBase=new URL(data.dataset,import.meta.url);
    const catalog=await getCatalog();
    if(type==='init'){
      const unique=key=>[...new Set(catalog.map(r=>r[key]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
      self.postMessage({type,requestId,total:catalog.length,fields:await getSchema(),facets:{author:unique('author')}});return;
    }
    if(type==='facet'){
      const rows=await filteredResults(data,data.field),values=await getColumn(data.field);
      const summary=facetSummary(values,rows.map(row=>row.doc),{query:data.optionQuery||'',limit:Math.min(500,data.limit||40),selected:data.metadataFilters?.[data.field]?.values||[]});
      self.postMessage({type,requestId,field:data.field,...summary});return;
    }
    const {sort='citations',page=1}=data;
    const rows=await filteredResults(data);
    rows.sort((a,b)=>sort==='citations'?((b.citationCount??0)-(a.citationCount??0)||a.id.localeCompare(b.id)):sort==='volume'?(Number(a.volume||99999)-Number(b.volume||99999)||a.id.localeCompare(b.id)):sort==='date'?(a.date?b.date?a.date.localeCompare(b.date,undefined,{numeric:true}):-1:b.date?1:a.id.localeCompare(b.id)):a.id.localeCompare(b.id));
    const total=rows.length,lastPage=Math.max(1,Math.ceil(total/20)),current=Math.max(1,Math.min(page,lastPage));
    self.postMessage({type,requestId,total,page:current,pages:lastPage,rows:rows.slice((current-1)*20,current*20)});
  }catch(error){self.postMessage({type:'error',operation:type,field:data.field,requestId,message:error.message});}
};
