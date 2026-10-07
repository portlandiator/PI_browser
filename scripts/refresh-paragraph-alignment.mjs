import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync,gunzipSync} from 'node:zlib';
import {alignmentSlots,alignmentCounts} from '../src/paragraph-alignment.mjs';
import {recordFilename} from '../src/record-file.mjs';

// Refresh layout metadata only. Source paragraphs, indexes and quotation IDs stay intact.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const stats=JSON.parse(await fs.readFile(path.join(root,'dist/stats.json'),'utf8'));
const base=path.join(root,'dist',stats.dataset);
const catalog=JSON.parse(gunzipSync(await fs.readFile(path.join(base,'catalog.json.gz'))));
let cursor=0,updated=0,before=0,resolved=0,introduced=0;
const mismatches=[],examples=[];
await Promise.all(Array.from({length:16},async()=>{
  while(cursor<catalog.length){
    const entry=catalog[cursor++],file=path.join(base,'data',recordFilename(entry.id));
    const record=JSON.parse(gunzipSync(await fs.readFile(file)));let changed=false;
    for(const [language,available,folder] of [['en',record.hasEnglish,'translated_texts - copy'],['original',record.hasOriginal,'original_texts - copy']]){
      if(!available)continue;
      const bytes=await fs.readFile(path.join(root,folder,entry.id+'.txt'));
      let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('windows-1252').decode(bytes);}
      const slots=alignmentSlots(text),alignment=slots.includes(null)?slots:undefined;
      if(slots.filter(i=>i!==null).length!==record[language].paragraphs.length)throw Error('Source paragraph count changed: '+entry.id+' '+language+'; run a full build.');
      if(JSON.stringify(record[language].alignment)!==JSON.stringify(alignment)){
        if(alignment)record[language].alignment=alignment;else delete record[language].alignment;
        changed=true;
      }
    }
    if(changed){await fs.writeFile(file,gzipSync(JSON.stringify(record)));updated++;}
    if(!record.en.paragraphs.length||!record.original.paragraphs.length)continue;
    const counts=alignmentCounts(record),wasUnequal=record.en.paragraphs.length!==record.original.paragraphs.length;
    if(wasUnequal)before++;
    if(counts.en!==counts.original){
      if(!wasUnequal)introduced++;
      mismatches.push({id:entry.id,english:counts.en,original:counts.original,difference:Math.abs(counts.en-counts.original)});
    }else if(wasUnequal){resolved++;if(examples.length<20)examples.push({id:entry.id,...counts});}
  }
}));
mismatches.sort((a,b)=>b.difference-a.difference||(a.id<b.id?-1:a.id>b.id?1:0));
const report={records:catalog.length,updated,before,after:mismatches.length,resolved,introduced,examples,rule:'Four or more consecutive logical line breaks add exactly one blank alignment slot, excluding the beginning and end of the document. CRLF counts as one. Both versions must contain text.',top100:mismatches.slice(0,100),mismatches};
const out=path.join(root,'reports');await fs.mkdir(out,{recursive:true});
await fs.writeFile(path.join(out,'paragraph-count-mismatches.json'),JSON.stringify(report,null,2));
const lines=['Top 100 catalogue paragraph-count mismatches','Counts include blank alignment slots; both versions must contain text.','Sorted by absolute difference descending, then exact ID.','Rank\tID\tEnglish\tArabic/Persian\tDifference',...report.top100.map((r,i)=>`${i+1}\t${r.id}\t${r.english}\t${r.original}\t${r.difference}`)];
await fs.writeFile(path.join(out,'paragraph-count-top-100.txt'),lines.join('\n')+'\n');
console.log(JSON.stringify({...report,top100:undefined,mismatches:undefined}));
