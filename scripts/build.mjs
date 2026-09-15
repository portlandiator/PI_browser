import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {parseCsv,parseText,tokenize,shardKey,packPosting} from '../src/text.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'dist');
const dataset=`collections/${randomUUID().slice(0,12)}/`;
const corpus=path.join(out,dataset);
const report={encodings:{utf8:0,windows1252:[]},metadataRows:0,duplicateMetadata:[],missingOriginal:[],missingEnglish:[],metadataOnly:[],textWithoutMetadata:[],unequalParagraphCounts:[],unknownCommands:[]};
const sources=['original_texts - copy','translated_texts - copy','metadata - copy'];
try{await fs.access(path.join(root,sources[0]));}catch{
  const archive=path.join(root,'data','collection.tar.gz');
  await fs.access(archive);
  execFileSync('tar',['-xzf',archive,'-C',root],{stdio:'inherit'});
}
async function readText(file){const bytes=await fs.readFile(file);try{const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);report.encodings.utf8++;return text;}catch{report.encodings.windows1252.push(path.relative(root,file));return new TextDecoder('windows-1252').decode(bytes);}}
const metadata=new Map();
for(const filename of (await fs.readdir(path.join(root,sources[2]))).filter(n=>n.endsWith('.csv')).sort()){
  for(const row of parseCsv(await readText(path.join(root,sources[2],filename)))){
    if(!/^[\w-]+$/.test(row.ID))throw new Error(`Unsafe ID: ${row.ID}`);
    if(metadata.has(row.ID)){report.duplicateMetadata.push(row.ID);throw new Error(`Duplicate metadata ${row.ID}`);}
    metadata.set(row.ID,row);report.metadataRows++;
  }
}
const files=await Promise.all(sources.slice(0,2).map(async folder=>new Set((await fs.readdir(path.join(root,folder))).filter(n=>n.endsWith('.txt')).map(n=>n.slice(0,-4)))));
const ids=[...new Set([...metadata.keys(),...files[0],...files[1]])].sort();
for(const id of ids)if(!/^[\p{L}\p{N}_ ()-]+$/u.test(id))throw new Error(`Unsafe filename ${id}`);
await fs.mkdir(out,{recursive:true});
// Every build has an immutable dataset path, preventing stale browsers from mixing
// a previous catalogue with a new positional index. CI starts with an empty dist.
for(const folder of ['data','index'])await fs.mkdir(path.join(corpus,folder),{recursive:true});
await fs.cp(path.join(root,'src'),out,{recursive:true});
await fs.writeFile(path.join(out,'.nojekyll'),'');
const catalog=[],indices={en:Array.from({length:1024},()=>new Map()),original:Array.from({length:1024},()=>new Map())};
const authorNames={AB:'‘Abdu’l-Bahá',BB:'The Báb',BH:'Bahá’u’lláh'};
const zipWrite=(file,value)=>fs.writeFile(file,gzipSync(JSON.stringify(value),{level:9}));

for(let doc=0;doc<ids.length;doc++){
  const id=ids[doc],row=metadata.get(id)||{};
  const record={id,author:authorNames[id.slice(0,2)]||'Other',title:row.Title||'',date:row.Date||'',volume:row.volume_number||'',volumeTitle:row.volume_title||'',addressee:row.Addressee||'',place:row.Place||'',hasOriginal:files[0].has(id),hasEnglish:files[1].has(id)};
  if(!record.hasOriginal)report.missingOriginal.push(id);
  if(!record.hasEnglish)report.missingEnglish.push(id);
  if(!record.hasOriginal&&!record.hasEnglish)report.metadataOnly.push(id);
  if(!metadata.has(id))report.textWithoutMetadata.push(id);
  const versions={};
  for(const [language,fileSet,folder] of [['original',files[0],sources[0]],['en',files[1],sources[1]]]){
    const text=fileSet.has(id)?await readText(path.join(root,folder,`${id}.txt`)):'';
    const version=parseText(text,language);versions[language]=version;
    let position=0;
    for(const part of [...version.paragraphs,...version.notes]){
      for(const word of tokenize(part.plain)){
        const bucket=indices[language][shardKey(word)];
        if(!bucket.has(word))bucket.set(word,new Map());
        const posting=bucket.get(word);if(!posting.has(doc))posting.set(doc,[]);
        posting.get(doc).push(position++);
      }
      position++; // A phrase may not cross paragraph or footnote boundaries.
    }
  }
  record.excerpt=(versions.en.paragraphs[0]?.plain||versions.original.paragraphs[0]?.plain||row.Abstract||'').slice(0,190);
  const equal=versions.en.paragraphs.length===versions.original.paragraphs.length;
  if(record.hasEnglish&&record.hasOriginal&&!equal)report.unequalParagraphCounts.push({id,en:versions.en.paragraphs.length,original:versions.original.paragraphs.length});
  catalog.push(record);
  await zipWrite(path.join(corpus,'data',`${id}.json.gz`),{...record,metadata:row,en:versions.en,original:versions.original,paired:equal&&record.hasEnglish&&record.hasOriginal});
  if(doc%3000===0)console.log(`Imported ${doc.toLocaleString()} / ${ids.length.toLocaleString()} records`);
}
const stats={dataset,records:ids.length,pairs:ids.filter(id=>files[0].has(id)&&files[1].has(id)).length,original:files[0].size,english:files[1].size,metadataOnly:report.metadataOnly.length,unequalParagraphCounts:report.unequalParagraphCounts.length};
await zipWrite(path.join(corpus,'catalog.json.gz'),catalog);
for(const language of ['en','original']){
  await fs.mkdir(path.join(corpus,'index',language),{recursive:true});
  let terms=0;
  for(let bucket=0;bucket<1024;bucket++){
    const serialized=Object.create(null);
    for(const [word,posting] of indices[language][bucket])serialized[word]=Buffer.from(packPosting(posting)).toString('base64');
    terms+=indices[language][bucket].size;
    await zipWrite(path.join(corpus,'index',language,`${bucket}.json.gz`),serialized);
    indices[language][bucket].clear();
  }
  console.log(`${language}: ${terms.toLocaleString()} indexed terms`);
}
await fs.writeFile(path.join(out,'stats.json'),JSON.stringify(stats));
await fs.writeFile(path.join(root,'build-report.json'),JSON.stringify({...stats,...report},null,2));
console.log('Build complete',stats);
