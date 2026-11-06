// Publish the dictionaries listed in dictionaries/dictionaries.json as small
// lookup shards in <out>/dictionaries/, read on demand by the reader's word
// tooltip and interlinear word study. Dictionary changes need no collection
// rebuild: this runs on every build and interface refresh. Each source file
// is also published unchanged for the dictionary review page.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {reviewCounts,parseDictionary,shardDictionary,dictionaryShards,dictionaryTarget} from '../src/dictionary.mjs';

const idPattern=/^[a-z0-9][a-z0-9-]{0,63}$/;

export async function readDictionaryCatalog(root){
  let catalog;
  try{catalog=JSON.parse(await fs.readFile(path.join(root,'dictionaries','dictionaries.json'),'utf8'));}
  catch(error){if(error.code==='ENOENT')return [];throw error;}
  const seen=new Set();
  return catalog.dictionaries.map(item=>{
    if(!idPattern.test(item.id||''))throw Error(`Invalid dictionary id: ${item.id}`);
    if(seen.has(item.id))throw Error(`Duplicate dictionary id: ${item.id}`);seen.add(item.id);
    if(!item.name||!item.file)throw Error(`Dictionary ${item.id} needs a name and a file`);
    if(path.basename(item.file)!==item.file)throw Error(`Dictionary ${item.id}: file must be in dictionaries/`);
    return item;
  });
}

export {reviewCounts};
// The source file is published unchanged as <id>.tsv (or .csv) for the
// dictionary review page, which needs every row in its original order.
export const publishedSourceName=item=>`${item.id}${path.extname(item.file).toLowerCase()==='.csv'?'.csv':'.tsv'}`;

export async function buildDictionaries(root,out){
  const target=path.join(out,'dictionaries');
  await fs.rm(target,{recursive:true,force:true});
  const catalog=await readDictionaryCatalog(root);
  const published=[];
  for(const item of catalog){
    const source=await fs.readFile(path.join(root,'dictionaries',item.file));
    const entries=parseDictionary(source.toString('utf8'),{strict:true});
    const shards=shardDictionary(entries,item.id),present={original:[],english:[]};
    await fs.mkdir(path.join(target,item.id),{recursive:true});
    for(const side of ['original','english'])for(let n=0;n<dictionaryShards;n++){
      if(!Object.keys(shards[side][n]).length)continue;
      present[side].push(n);
      await fs.writeFile(path.join(target,item.id,`${side[0]}-${n}.json`),JSON.stringify(shards[side][n]));
    }
    await fs.writeFile(path.join(target,publishedSourceName(item)),source);
    published.push({id:item.id,name:item.name,description:item.description||'',source:item.source||'',aiGenerated:item.aiGenerated===true,target:['en','fa','ar'].includes(item.target)?item.target:dictionaryTarget(entries),entries:entries.length,review:reviewCounts(entries),file:publishedSourceName(item),sourceFile:item.file,shards:present});
  }
  if(published.length){await fs.mkdir(target,{recursive:true});await fs.writeFile(path.join(target,'index.json'),JSON.stringify({format:1,dictionaries:published}));}
  return published.map(({id,entries})=>({id,entries}));
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  console.log('Dictionaries:',await buildDictionaries(root,path.resolve(root,process.argv[2]||'dist')));
}
