import fs from 'node:fs/promises';
import path from 'node:path';
import {digest,tokens,mappedTokens,locateRanges} from './subject-core.mjs';

export const extractFolders=['subjects_inv_length_ordered','Evernote_scrape'];
export const accepted=s=>['exact','normalized','confirmed'].includes(s.status);
export const wordingKey=s=>tokens(s).map(t=>t.word).join(' ');

// These aliases are explicit editorial filename mappings, never fuzzy topic guesses.
export async function readExtractInputs(root,subjects){
  const aliases=JSON.parse(await fs.readFile(path.join(root,'data/extract-subject-aliases.json'),'utf8'));
  const byName=new Map(subjects.map(s=>[s.name,s])),bySubject=new Map(subjects.map(s=>[s.id,[]]));
  const report={files:{},blocks:{},filenameAliases:[],unknownSubjects:[],missingFiles:{},encodingFallbacks:[],inputIssues:[],duplicates:[]};
  const hashes=[];
  for(const folder of extractFolders){
    const files=(await fs.readdir(path.join(root,'subject_extracts',folder))).filter(f=>f.endsWith('.txt')).sort();
    report.files[folder]=files.length;report.blocks[folder]=0;const covered=new Set();
    for(const filename of files){
      const name=filename.slice(0,-4),target=byName.has(name)?name:(aliases[name]||name),subject=byName.get(target);
      if(!subject){report.unknownSubjects.push({folder,filename});continue;}
      if(name!==target)report.filenameAliases.push({folder,filename,subject:target});
      covered.add(target);
      const bytes=await fs.readFile(path.join(root,'subject_extracts',folder,filename));
      let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('windows-1252').decode(bytes);report.encodingFallbacks.push(`subject_extracts/${folder}/${filename}`);}
      const version=digest(bytes);
      hashes.push([folder,filename,version]);
      for(const block of extractBlocks(text)){
        const selection=parseExtract(block.raw,folder);
        report.blocks[folder]++;
        if(folder===extractFolders[0]&&!selection.suppliedIds.length)report.inputIssues.push({folder,filename,block:block.ordinal,line:block.line,reason:'No terminal Inventory ID'});
        bySubject.get(subject.id).push({...selection,id:digest(JSON.stringify([subject.id,folder,filename,block.ordinal,block.raw])).slice(0,24),subject:subject.id,
          provenance:{sourceCollection:folder,sourceFilename:`subject_extracts/${folder}/${filename}`,sourceVersion:version,sourceLine:block.line,selectionParagraph:block.ordinal,subjectFilename:'14-colors_and_hyperlinks.csv',subjectRow:subject.row,subjectUrl:subject.url}});
      }
    }
    report.missingFiles[folder]=subjects.filter(s=>!covered.has(s.name)).map(s=>s.name);
  }
  if(report.unknownSubjects.length)throw Error('Unmapped extract filenames: '+JSON.stringify(report.unknownSubjects));
  return {bySubject,report,version:digest(JSON.stringify(hashes))};
}

export function extractBlocks(text){
  const blocks=[];let raw=[],line=1,start=1;
  for(const value of text.replace(/^\uFEFF/,'').split(/\r\n|\r|\n/)){
    if(value.trim()){if(!raw.length)start=line;raw.push(value);}
    else if(raw.length){blocks.push({raw:raw.join('\n').trim(),line:start,ordinal:blocks.length+1});raw=[];}
    line++;
  }
  if(raw.length)blocks.push({raw:raw.join('\n').trim(),line:start,ordinal:blocks.length+1});
  return blocks;
}

export function parseExtract(raw,folder){
  let split=raw.length,suppliedIds=[];
  // Retain suffixes and nonstandard catalogue IDs exactly, including A02490.
  const id=/\s+((?:AB|BH|BB)[A-Z]?\d{4,5}[a-z]?|A\d{5})(?:\s*(\([^\n]*\)))?\s*$/.exec(raw);
  if(id){split=id.index;suppliedIds=[id[1]];}
  else if(folder===extractFolders[1]){
    // Bibliographic codes begin the supplied reference, not the quotation.
    const code=/(?:^|\s)(?:[A-Z][A-Za-z\d-]{1,15}[.#:]\d|M\d{2}-\d{2}\s+\d|PC\d{5}\b|SW\s+v\d|Enn\.[IVX]+\.|(?:Plotinus|Plato|Aristotle|Pseudo-Dionysius),|(?:John|Matthew|Luke|Mark|Mat|Romans|Ephesians|Corinthians|Genesis|Revelation|Psalms?|Isaiah|Qur['’]an)\s+\d+:)/g;
    const match=code.exec(raw);if(match)split=match.index;
    // An attribution can precede its bibliographic codes. Only use a terminal
    // balanced parenthesis containing a recognizable author/reference marker.
    let depth=0,start=-1;
    for(let i=raw.length-1;i>=0;i--){if(raw[i]===')')depth++;else if(raw[i]==='('&&--depth===0){start=i;break;}}
    if(raw.trimEnd().endsWith(')')&&start>=0&&/(?:Shoghi|House of Justice|Baha|Bahá|Bab\b|Báb|Abdu|[A-Z]{2,}[.#]\d|\b(?:19|20)\d{2}\b|\b(?:AB|BH|BB)[A-Z]?\d{4,5}|\bpp?\.?\s*\d|\bnotes\b|\btranslation\b|\bRidvan\s+\d|Pope|Buddha|Venerable Bede|St\.\s+(?:John|Augustine)|Qur['’]an|Luke\s+\d|note\s+\d)/i.test(raw.slice(start)))split=Math.min(split,start);
  }
  const excerpt=raw.slice(0,split).trim(),reference=raw.slice(split).trim();
  if(!suppliedIds.length)suppliedIds=[...new Set([...reference.matchAll(/\b(?:AB|BH|BB)[A-Z]?\d{4,5}[a-z]?\b/g)].map(m=>m[0]))];
  // A later writer can quote a Central Figure. Primary work codes and explicit
  // quoted-author labels take precedence over the surrounding book or commentary.
  const primaryAttribution=suppliedIds.length>0||/^(?:SAQ|GWB|PUP|SWAB|TB|KI|PT|KA|PM|TAB|ADP|SWB|ESW|SDC|TU|CDB|AHW|PHW|AL|Forel|GDM|SLH|WT|TDP)[.#:]/.test(reference)||/\((?:(?:From (?:a Tablet|notes) of|The)\s+)?['‘’]?(?:Abdu['’]l-Bah[aá]|Bah[aá]['’]u['’]ll[aá]h|B[aá]b)\b/i.test(reference);
  const outsideAuthor=folder===extractFolders[1]&&!primaryAttribution&&(/(?:Shoghi Effendi|Universal House of Justice|\bUHJ\b|Plotinus|Aristotle|\bPlato\b|Izutsu|Chittick|Corbin|Peacocke|Pseudo-Dionysius|Corpus Hermeticum|Venerable Bede|Pope Francis|The Buddha|St\.\s+(?:John of the Cross|Augustine)|Ibn ['’]Arabi)/i.test(reference)||/^(?:WOB|ADJ|GPB|BA|PDC|UD|DG|CF|DND|MBW|PBA|CUHJ)[.#]|^M\d{2}-\d{2}\b|^\(?Ridvan\s+\d|^Enn\.[IVX]+\./.test(reference));
  return {raw,original:raw,excerpt,reference,suppliedIds,outsideAuthor};
}

export function matchExtract(selection,matcher){
  if(selection.outsideAuthor)return {status:'unmatched',candidates:[],reason:'Supplied attribution is outside the Inventory authors'};
  const fragments=selection.excerpt.split(/\.{3,}|…|\[\s*(?:\.\s*){3}\]/).map(wordingKey).filter(Boolean);
  // Exact ordered fragments in one paragraph are publishable only when their
  // complete placement is unique. Do not infer omitted words or paragraph pairs.
  if(fragments.length>1&&fragments.every(f=>f.split(' ').length>=3)){
    const longest=[...fragments].sort((a,b)=>b.length-a.length)[0];
    const anchor=matcher.match({...selection,excerpt:longest});
    if(['exact','normalized','ambiguous'].includes(anchor.status)){
      const locations=new Map(),candidates=[];
      for(const c of anchor.candidates)for(const r of c.ranges)locations.set(c.source+':'+r.paragraph,{source:matcher.sources.get(c.source),paragraph:r.paragraph});
      for(const {source,paragraph} of locations.values()){
        const p=source.paragraphs[paragraph-1],m=mappedTokens(p.plain);
        const hits=fragments.map(f=>{const result=[];let at=-1;while((at=m.normalized.indexOf(f,at+1))>=0){if((at&&m.normalized[at-1]!==' ')||(at+f.length<m.normalized.length&&m.normalized[at+f.length]!==' '))continue;const first=m.offsets.indexOf(at),last=first+f.split(' ').length-1;result.push({first,last});}return result;});
        const placements=[];
        function walk(i,previous,parts){if(placements.length>=2)return;if(i===hits.length){placements.push(parts);return;}for(const hit of hits[i])if(hit.first>previous)walk(i+1,hit.last,[...parts,hit]);}
        walk(0,-1,[]);
        for(const placement of placements)candidates.push({source:source.id,version:source.version,ranges:placement.flatMap(h=>locateRanges(source,source.starts[paragraph-1]+m.spans[h.first].start,source.starts[paragraph-1]+m.spans[h.last].end)),method:'normalized',score:1,evidence:'Every omission-separated fragment matches exactly in order within one paragraph'});
      }
      if(candidates.length)return {status:candidates.length===1?'normalized':'ambiguous',candidates:candidates.slice(0,8),reason:candidates.length>1?'Omission-separated wording has multiple placements':undefined};
    }
  }
  return matcher.match(selection);
}

// Deduplicate within each subject. Different passages from the same paragraph
// remain distinct; equivalent source ranges or complete normalized wording do not.
export function mergeExtracts(selections,duplicates){
  const kept=[],words=new Map(),ranges=new Map();
  const ranked=[...selections].sort((a,b)=>Number(b.provenance.sourceCollection===extractFolders[1])-Number(a.provenance.sourceCollection===extractFolders[1]));
  for(const s of ranked){
    const key=wordingKey(s.excerpt),c=accepted(s)?s.candidates[0]:null;
    const location=c?JSON.stringify([c.source,c.ranges.map(r=>[r.paragraph,r.start,r.end])]):null;
    const prior=(key&&words.get(key))||(location&&ranges.get(location));
    // Never collapse identical wording explicitly attributed to different IDs.
    const conflict=prior&&s.suppliedIds.length&&prior.suppliedIds.length&&!s.suppliedIds.some(id=>prior.suppliedIds.includes(id));
    if(prior&&!conflict){
      prior.duplicates??=[];prior.duplicates.push({id:s.id,original:s.original,provenance:s.provenance});
      duplicates.push({subject:s.subject,kept:prior.id,removed:s.id,keptSource:prior.provenance.sourceCollection,removedSource:s.provenance.sourceCollection});
      continue;
    }
    kept.push(s);if(key)words.set(key,s);if(location)ranges.set(location,s);
  }
  const positions=new Map(selections.map((s,i)=>[s.id,i]));
  return kept.sort((a,b)=>positions.get(a.id)-positions.get(b.id));
}

export async function writeExtractReview(root,bySubject,report){
  const dir=path.join(root,'extract-review');await fs.mkdir(dir,{recursive:true});
  const headers=['Selection ID','Subject','Source file','Block','Line','Status','Reason','Supplied ID','Quotation','Reference','Candidate IDs and paragraphs','Assign ID','Assign paragraph','Notes'];
  const csv=value=>'"'+String(value??'').replaceAll('"','""')+'"';
  report.reviewCounts={};
  for(const folder of extractFolders){
    const rows=[];
    for(const data of bySubject.values())for(const s of data.selections)if(s.provenance.sourceCollection===folder&&!accepted(s)){
      rows.push([s.id,data.subject.name,s.provenance.sourceFilename,s.provenance.selectionParagraph,s.provenance.sourceLine,s.status,s.reason,s.suppliedIds.join('; '),s.excerpt,s.reference,s.candidates.map(c=>`${c.source}: ${[...new Set(c.ranges.map(r=>r.paragraph))].join(',')} (${c.score})`).join('; '),'','','']);
    }
    report.reviewCounts[folder]=rows.length;
    await fs.writeFile(path.join(dir,folder+'-review.csv'),'\uFEFF'+[headers,...rows].map(row=>row.map(csv).join(',')).join('\r\n')+'\r\n');
  }
  await fs.writeFile(path.join(dir,'input-report.json'),JSON.stringify(report,null,2));
  await fs.writeFile(path.join(dir,'README.md'),'# Extract review\n\nEach CSV includes every retained selection from that source without an accepted paragraph mapping, including outside-author quotations. Fill in **Assign ID**, **Assign paragraph** (one-based, as in the Catalog reader), and **Notes**. Leave outside-catalogue quotations blank. Candidate scores are lexical coverage, not probabilities. Original files are unchanged. Duplicates removed from these queues remain recorded in input-report.json and the retained selection provenance.\n\nFor exact highlight selection, use the website’s Passage review utility and export its decisions. CSV assignments can be returned for incorporation with paragraph/range validation.\n');
}
