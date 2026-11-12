import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {createGzip,createGunzip} from 'node:zlib';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {tokens,mappedTokens} from './subject-core.mjs';

// Matching every extract against the whole collection takes minutes, and a
// catalog correction changes one text. Each match is therefore kept with what
// it was derived from, and reused while none of that changed:
//   - a match found by exact wording depends on the sources it was found in,
//     and changes only if one of them changes or a changed text now contains
//     the wording;
//   - a match restricted to the extract's supplied IDs depends on those sources;
//   - an approximate search of the whole collection ranks sources by how rare
//     the extract's words are, so it is repeated whenever any text changes.
// A reused match is the one a complete build would compute; tests compare them.
export const matchCacheFile=out=>path.join(out,'subject-match-state.json.gz');
const format=1;

// Wraps a matcher (built on first use) and records what each lookup depended on.
export function trackedMatcher(sources,full){
  let calls=[];
  const matcher={sources,match(selection){
    const result=full().match(selection),words=tokens(selection.excerpt).map(t=>t.word),supplied=selection.suppliedIds||[];
    if(!words.length)calls.push({constant:true});
    else{
      const exact=['exact','normalized','ambiguous'].includes(result.status);
      calls.push({needle:words.join(' '),supplied,exact,...(exact?{sources:[...new Set(result.candidates.map(c=>c.source))]}:{})});
    }
    return result;
  }};
  return {matcher,run(compute){calls=[];const match=compute(matcher);return {match,calls};}};
}

// versions: Map of source ID to the version (digest) of its English text.
export function reusableMatches(previous,versions,sources){
  const changed=new Set();
  for(const [id,version] of versions)if(previous.versions[id]!==version)changed.add(id);
  for(const id of Object.keys(previous.versions))if(!versions.has(id))changed.add(id);
  if(!changed.size)return {entries:previous.entries,changed};
  const texts=[...changed].filter(id=>sources.has(id)).map(id=>{const m=mappedTokens(sources.get(id).text);return {normalized:m.normalized,words:new Set(m.spans.map(t=>t.word))};});
  const appears=needle=>{
    const words=needle.split(' ');
    return texts.some(text=>{
      if(!words.every(word=>text.words.has(word)))return false;
      for(let at=text.normalized.indexOf(needle);at>=0;at=text.normalized.indexOf(needle,at+1)){
        const end=at+needle.length;
        if((at===0||text.normalized[at-1]===' ')&&(end===text.normalized.length||text.normalized[end]===' '))return true;
      }
      return false;
    });
  };
  const unaffected=call=>{
    if(call.constant)return true;
    if(call.supplied.length)return !call.supplied.some(id=>changed.has(id));
    return call.exact&&!call.sources.some(id=>changed.has(id))&&!appears(call.needle);
  };
  const entries=new Map();
  for(const [key,entry] of previous.entries)if(entry.calls.every(unaffected))entries.set(key,entry);
  return {entries,changed};
}

export async function loadMatchCache(out,code){
  let input;
  try{input=fs.createReadStream(matchCacheFile(out));await new Promise((resolve,reject)=>input.once('open',resolve).once('error',reject));}
  catch(error){if(error.code==='ENOENT')return null;throw error;}
  try{
    const lines=readline.createInterface({input:input.pipe(createGunzip()),crlfDelay:Infinity});
    let header;const entries=new Map();
    for await(const line of lines){
      if(!header){header=JSON.parse(line);if(header.format!==format||header.code!==code)return null;continue;}
      const [key,match,calls,undefinedKeys]=JSON.parse(line);
      // JSON drops undefined values; a complete build's match has them as properties.
      for(const name of undefinedKeys)match[name]=undefined;
      entries.set(key,{match,calls});
    }
    if(!header||entries.size!==header.entries)return null;
    return {versions:header.versions,entries};
  }catch{return null;}// A damaged or truncated file only costs a complete matching.
  finally{input.destroy();}
}

export async function saveMatchCache(out,code,versions,entries){
  const file=matchCacheFile(out),temporary=file+'.writing';
  function* lines(){
    yield JSON.stringify({format,code,entries:entries.size,versions:Object.fromEntries(versions)})+'\n';
    for(const [key,{match,calls}] of entries)yield JSON.stringify([key,match,calls,Object.keys(match).filter(name=>match[name]===undefined)])+'\n';
  }
  await pipeline(Readable.from(lines()),createGzip({level:1}),fs.createWriteStream(temporary));
  await fs.promises.rename(temporary,file);
}
