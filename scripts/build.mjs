import {recordFilename} from '../src/record-file.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {buildSubjects} from './build-subjects.mjs';
import {parseCsv,parseText,tokenize,shardKey,packPosting} from '../src/text.mjs';
import {describeFields,metadataPlain,metadataSearchText} from '../src/metadata.mjs';
import {citationCount} from '../src/citations.mjs';
import {buildVolumes} from './build-volumes.mjs';

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
const metadataFiles=(await fs.readdir(path.join(root,sources[2]))).filter(n=>n.endsWith('.csv')).sort();
if(metadataFiles.length!==1)throw new Error(`Expected one enhanced metadata CSV, found ${metadataFiles.length}.`);
let schema;
for(const filename of metadataFiles){
  report.metadataFile=filename;
  const rows=parseCsv(await readText(path.join(root,sources[2],filename)));
  if(!rows.length||!Object.hasOwn(rows[0],'PIN'))throw new Error('Enhanced metadata must contain a PIN column.');
  schema=describeFields(rows);report.metadataFields=schema.map(field=>field.name);
  for(const row of rows){
    if(!/^[\w-]+$/.test(row.PIN))throw new Error(`Unsafe PIN: ${row.PIN}`);
    if(metadata.has(row.PIN)){report.duplicateMetadata.push(row.PIN);throw new Error(`Duplicate metadata ${row.PIN}`);}
    metadata.set(row.PIN,row);report.metadataRows++;
  }
}
const files=await Promise.all(sources.slice(0,2).map(async folder=>new Set((await fs.readdir(path.join(root,folder))).filter(n=>n.endsWith('.txt')).map(n=>n.slice(0,-4)))));
const ids=[...new Set([...metadata.keys(),...files[0],...files[1]])].sort();
for(const id of ids)if(!/^[\p{L}\p{N}_ ()-]+$/u.test(id))throw new Error(`Unsafe filename ${id}`);
await fs.mkdir(out,{recursive:true});
// Every build has an immutable dataset path, preventing stale browsers from mixing
// a previous catalogue with a new positional index. CI starts with an empty dist.
for(const folder of ['data','index','facets'])await fs.mkdir(path.join(corpus,folder),{recursive:true});
await fs.cp(path.join(root,'src'),out,{recursive:true});
await fs.writeFile(path.join(out,'.nojekyll'),'');
const volumes=await buildVolumes(root,out);
for(const row of metadata.values())if(row.Volume&&!volumes[String(Number(row.Volume))])throw new Error(`No PDF for volume ${row.Volume}`);
const catalog=[],indices={en:Array.from({length:1024},()=>new Map()),original:Array.from({length:1024},()=>new Map())};
const authorNames={AB:'‘Abdu’l-Bahá',BB:'The Báb',BH:'Bahá’u’lláh'};
const zipWrite=(file,value)=>fs.writeFile(file,gzipSync(JSON.stringify(value),{level:9}));

for(let doc=0;doc<ids.length;doc++){
  const id=ids[doc],row=metadata.get(id)||{};
  const record={id,citationCount:citationCount(row),author:authorNames[id.slice(0,2)]||'Other',title:metadataPlain(row.Title||''),date:row.Date||'',volume:row.Volume||'',addressee:row.Recipient||'',place:row.Place||'',hasOriginal:files[0].has(id),hasEnglish:files[1].has(id)};
  if(!record.hasOriginal)report.missingOriginal.push(id);
  if(!record.hasEnglish)report.missingEnglish.push(id);
  if(!record.hasOriginal&&!record.hasEnglish)report.metadataOnly.push(id);
  if(!metadata.has(id))report.textWithoutMetadata.push(id);
  const versions={};
  let enVersion;
  for(const [language,fileSet,folder] of [['original',files[0],sources[0]],['en',files[1],sources[1]]]){
    const text=fileSet.has(id)?await readText(path.join(root,folder,`${id}.txt`)):'';
    if(language==='en'&&fileSet.has(id))enVersion=createHash('sha256').update(await fs.readFile(path.join(root,folder,`${id}.txt`))).digest('hex');
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
  record.excerpt=(versions.en.paragraphs[0]?.plain||versions.original.paragraphs[0]?.plain||row['First line (translated)']||row['First line (original)']||row.Abstracts||'').slice(0,190);
  const equal=versions.en.paragraphs.length===versions.original.paragraphs.length;
  if(record.hasEnglish&&record.hasOriginal&&!equal)report.unequalParagraphCounts.push({id,en:versions.en.paragraphs.length,original:versions.original.paragraphs.length});
  catalog.push(record);
  await zipWrite(path.join(corpus,'data',recordFilename(id)),{...record,enVersion,metadata:row,en:versions.en,original:versions.original,paired:equal&&record.hasEnglish&&record.hasOriginal});
  if(doc%3000===0)console.log(`Imported ${doc.toLocaleString()} / ${ids.length.toLocaleString()} records`);
}
const stats={dataset,records:ids.length,pairs:ids.filter(id=>files[0].has(id)&&files[1].has(id)).length,original:files[0].size,english:files[1].size,metadataOnly:report.metadataOnly.length,unequalParagraphCounts:report.unequalParagraphCounts.length};
await zipWrite(path.join(corpus,'catalog.json.gz'),catalog);
await fs.writeFile(path.join(corpus,'metadata-schema.json'),JSON.stringify(schema));
for(const field of schema)await zipWrite(path.join(corpus,'facets',`${field.key}.json.gz`),ids.map(id=>metadataSearchText(metadata.get(id)?.[field.name]||'')));
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
await buildSubjects(root,out,dataset);
await fs.writeFile(path.join(out,'stats.json'),JSON.stringify(stats));
await fs.writeFile(path.join(root,'build-report.json'),JSON.stringify({...stats,...report},null,2));
console.log('Build complete',stats);
