// Word dictionaries for the reader's word tooltip and interlinear word study.
// A dictionary is a table of entries (form, lemma, lang, translit, gloss,
// definition, notes, and optionally rendering and register for the Bahá'í
// English gloss style). Published dictionaries are split into small shards by
// lookup key; dictionaries a reader loads stay in that reader's browser.
// Glosses are dictionary lookups, never a claimed word-for-word alignment.
import {normalize,parseCsv,shardKey} from './text.mjs';

export const dictionaryShards=64;
export const dictionaryColumns=['form','vocalized','lemma','lang','translit','gloss','definition','notes','rendering','register','status','reviewer'];
const aliases={vowelled:'vocalized',voweled:'vocalized',vocalised:'vocalized',harakat:'vocalized',diacritized:'vocalized',headword:'form',word:'form',transliteration:'translit',pronunciation:'translit',meaning:'gloss',translation:'gloss',language:'lang',note:'notes',bahai:'rendering',"bahá'í english":'rendering',"bahai english":'rendering',elevated:'rendering',style:'register',review:'status','review status':'status'};
const arabicScript=/\p{Script=Arabic}/u;

// The lookup key of a word: the search normalization (diacritics, Arabic and
// Persian letter variants, digits) without punctuation, spaces or joiners.
export const dictionaryKey=word=>normalize(String(word)).replace(/[^\p{L}\p{N}]/gu,'');
export const dictionaryShard=key=>shardKey(key)%dictionaryShards;
export const isOriginalScript=word=>arabicScript.test(word);

// A vocalized form must be the written form with vowel signs added: the same
// letters once marks are removed.
export const sameLetters=(vocalized,form)=>dictionaryKey(String(vocalized).replace(/\u0670/g,''))===dictionaryKey(form);

// Vowel signs of a dictionary's vocalized form, laid on the word as written.
// Dictionary forms are search-normalized, so their letters can differ from the
// source in hamza and madda details (امآء, إِمَاء): the written letters always
// stay, and only fatḥa, kasra, ḍamma, sukún, shadda, tanwín and the superscript
// alef move across. When the letters cannot be paired one to one, the word
// stays as written.
const vowelSigns=new Set(['\u064e','\u0650','\u064f','\u0652','\u064b','\u064c','\u064d']);
const shadda='\u0651',superscriptAlef='\u0670';
const letterFolds={'\u0671':'\u0627','\u0629':'\u0647'};
const clusters=word=>{
  const list=[];
  for(const char of String(word)){
    if(list.length&&/\p{Mn}/u.test(char)&&/[\p{L}\u0640]/u.test(list.at(-1).base))list.at(-1).marks.push(char);
    else list.push({base:char,marks:[]});
  }
  return list;
};
const baseKey=({base})=>{const key=dictionaryKey(base);return key?[...key].map(char=>letterFolds[char]||char).join(''):base;};
export function applyVowels(written,vocalized){
  written=String(written);
  const from=clusters(written),to=clusters(vocalized);
  if(from.length!==to.length||from.some((cluster,i)=>baseKey(cluster)!==baseKey(to[i])))return written;
  return from.map((cluster,i)=>{
    const marks=[...cluster.marks],hasVowel=marks.some(mark=>vowelSigns.has(mark));
    const wanted=to[i].marks.filter(mark=>!marks.includes(mark)&&(mark===shadda||mark===superscriptAlef||vowelSigns.has(mark)&&!hasVowel));
    if(wanted.includes(shadda)){const at=marks.findIndex(mark=>vowelSigns.has(mark));marks.splice(at<0?marks.length:at,0,shadda);}
    marks.push(...wanted.filter(mark=>mark!==shadda).sort((a,b)=>(a===superscriptAlef)-(b===superscriptAlef)));
    return cluster.base+marks.join('');
  }).join('');
}

// Parse a dictionary file: tab-separated when the header line has a tab,
// otherwise comma-separated with quoting. Header names are case-insensitive;
// `form` and `gloss` are required. A `vocalized` value whose letters differ
// from the form is an error with `strict`, otherwise it is left out; so is a
// `register` other than elevated or plain, or a `status` other than
// unreviewed, uncertain or reviewed; strict also rejects a `reviewer` on an
// entry that is not reviewed.
export const reviewStatuses=['unreviewed','uncertain','reviewed'];
export function parseDictionary(source,{strict=false}={}){
  source=String(source).replace(/^﻿/,'');
  const header=source.split(/\r?\n/,1)[0]||'';
  let rows;
  if(header.includes('\t')){
    const lines=source.split(/\r?\n/).filter(line=>line.trim());
    const names=lines.shift().split('\t');
    rows=lines.map((line,i)=>{const values=line.split('\t');if(values.length>names.length)throw Error(`Line ${i+2}: expected ${names.length} columns, found ${values.length}`);return Object.fromEntries(names.map((name,j)=>[name,(values[j]||'').trim()]));});
  }else rows=parseCsv(source);
  const entries=[];
  for(const [i,row] of rows.entries()){
    const entry={};
    for(const [name,value] of Object.entries(row)){const key=name.trim().toLowerCase();const column=aliases[key]||key;if(dictionaryColumns.includes(column)&&value&&!entry[column])entry[column]=value;}
    if(!entry.form&&!entry.lemma)continue;
    entry.form||=entry.lemma;
    if(!entry.gloss&&!entry.definition)throw Error(`Row ${i+2} (${entry.form}): needs a gloss or definition`);
    entry.lang||=(isOriginalScript(entry.form)?'fa/ar':'en');
    if(entry.register){const register=entry.register.toLowerCase();if(register==='elevated'||register==='plain')entry.register=register;else{if(strict)throw Error(`Row ${i+2} (${entry.form}): register must be elevated or plain`);delete entry.register;}}
    if(entry.status){const status=entry.status.toLowerCase();if(reviewStatuses.includes(status))entry.status=status;else{if(strict)throw Error(`Row ${i+2} (${entry.form}): status must be unreviewed, uncertain or reviewed`);delete entry.status;}}
    if(strict&&entry.reviewer&&entry.status!=='reviewed')throw Error(`Row ${i+2} (${entry.form}): reviewer is set but status is not reviewed`);
    if(entry.vocalized&&!sameLetters(entry.vocalized,entry.form)){if(strict)throw Error(`Row ${i+2} (${entry.form}): vocalized form ${entry.vocalized} has different letters`);delete entry.vocalized;}
    entries.push(entry);
  }
  if(!entries.length)throw Error('No dictionary entries found. The first line must name the columns, including form and gloss.');
  return entries;
}

// The language a dictionary translates into: English for Persian/Arabic
// headwords; for English headwords, Persian or Arabic by the letters its
// glosses use (Persian پ چ ژ گ ک ی against Arabic ي ك ة).
export function dictionaryTarget(entries){
  let original=0,persian=0,arabic=0;
  for(const entry of entries){
    if(isOriginalScript(entry.form)){original++;continue;}
    const text=`${entry.gloss||''}${entry.definition||''}`;
    persian+=(text.match(/[پچژگکی]/g)||[]).length;arabic+=(text.match(/[يكة]/g)||[]).length;
  }
  if(original>=entries.length/2)return 'en';
  return persian||arabic?(persian>=arabic?'fa':'ar'):'';
}

const stopGloss=new Set(['a','an','the','of','to','be','is','ones','one','oneself','thing','things','s']);
// English words under which an original-language entry is found from the
// English side: every word of a one-word gloss, otherwise its content words.
export function reverseKeys(entry){
  const words=String(entry.gloss||'').replace(/\([^)]*\)/g,' ').split(/[^\p{L}\p{N}'’]+/u).map(dictionaryKey).filter(Boolean);
  return [...new Set(words.length===1?words:words.filter(word=>!stopGloss.has(word)))].filter(word=>word!=='a');
}

// Index entries by key. Original-language entries are also indexed under
// their gloss words with `reverse` set, so English words find them.
export function indexEntries(entries,dictionary){
  const original=new Map(),english=new Map();
  const add=(map,key,entry)=>{if(!key)return;const list=map.get(key);if(list){if(!list.includes(entry))list.push(entry);}else map.set(key,[entry]);};
  for(const raw of entries){
    const entry={...raw,dictionary};
    if(isOriginalScript(entry.form)){add(original,dictionaryKey(entry.form),entry);for(const key of reverseKeys(entry))add(english,key,{...entry,reverse:true});}
    else add(english,dictionaryKey(entry.form),entry);
  }
  // From the English side, prefer English-headword entries, then entries whose
  // whole gloss is that word, then entries where it is one word of the gloss.
  const rank=(entry,key)=>!entry.reverse?0:dictionaryKey(String(entry.gloss).replace(/\([^)]*\)/g,''))===key?1:2;
  for(const [key,list] of english)list.sort((a,b)=>rank(a,key)-rank(b,key));
  return {original,english};
}

const prefixes=['وال','بال','فال','کال','لل','ال','و','ب','ل','ف','نمی','می','ن'];
const suffixes=['هایی','هایم','هایش','های','ها','یان','ان','ات','ین','ون','یی','ای','ی','ست','است','ند','ید','یم','ش','ت','م','مان','تان','شان','ه','ة','را'];
// Candidate keys for a word not found as written: the key itself, then forms
// with one common Persian/Arabic prefix and/or suffix removed, or English
// plural, possessive and verb endings. Each candidate records what was removed.
export function candidateKeys(word){
  const key=dictionaryKey(word);if(!key)return [];
  const out=[{key,stripped:''}],seen=new Set([key]);
  const push=(candidate,stripped)=>{if(candidate.length>=2&&!seen.has(candidate)){seen.add(candidate);out.push({key:candidate,stripped});}};
  if(isOriginalScript(key)){
    const stems=[[key,'']];
    for(const prefix of prefixes)if(key.startsWith(prefix))stems.push([key.slice(prefix.length),prefix+'–']);
    for(const [stem,label] of stems){
      push(stem,label);
      for(const suffix of suffixes)if(stem.endsWith(suffix))push(stem.slice(0,-suffix.length),label+(label?' ':'')+'–'+suffix);
    }
  }else{
    const rules=[[/'s$/,''],[/ies$/,'y'],[/ves$/,'f'],[/es$/,''],[/s$/,''],[/ied$/,'y'],[/ed$/,''],[/ed$/,'e'],[/ing$/,''],[/ing$/,'e'],[/ly$/,''],[/er$/,''],[/est$/,'']];
    const plain=normalize(word).replace(/[‘’ʼ]/g,"'").replace(/[^\p{L}\p{N}']/gu,'');
    for(const [pattern,replacement] of rules)if(pattern.test(plain))push(dictionaryKey(plain.replace(pattern,replacement)),plain.match(pattern)[0]);
  }
  return out;
}

// A record's Language: 'fa' for Persian, 'ar' for Arabic, '' for mixed or other.
export function textLanguage(language){const value=String(language??'').trim().toLowerCase();return value==='per'?'fa':value==='ara'?'ar':'';}

// Entries in the text's language first, then shared fa/ar, then the rest (stable).
export function preferLanguage(entries,language){
  if(language!=='fa'&&language!=='ar')return entries;
  const rank=entry=>entry.lang===language?0:entry.lang==='fa/ar'?1:2;
  return entries.map((entry,i)=>({entry,i})).sort((a,b)=>rank(a.entry)-rank(b.entry)||a.i-b.i).map(({entry})=>entry);
}

// Find entries for one word in an ordered list of indexed dictionaries.
// `get(dictionary,side,key)` returns that dictionary's entries for a key
// (published dictionaries load their shard first). An exact match in any
// dictionary wins over a match through a removed prefix or suffix.
export async function lookupWord(word,dictionaries,get,{prefer=''}={}){
  const side=isOriginalScript(word)?'original':'english';
  const candidates=candidateKeys(word),key=candidates[0]?.key||'';
  const find=async candidate=>{const found=[];for(const dictionary of dictionaries){const entries=await get(dictionary,side,candidate);if(entries?.length)found.push(...entries);}return found;};
  // A Persian word written with a zero-width non-joiner (mi + ZWNJ + shavad)
  // is looked up whole first, then by its parts, before any prefix or suffix
  // is removed.
  const order=entries=>side==='original'?preferLanguage(entries,prefer):entries;
  const parts=String(word).split(/\u200c/).filter(part=>dictionaryKey(part));
  for(const [i,candidate] of candidates.entries()){
    const found=await find(candidate.key);
    if(found.length)return {word,key,side,matched:candidate.key,via:candidate.stripped,entries:order(found)};
    if(i===0&&parts.length>1){
      const byParts=[];
      for(const part of parts){const result=await lookupWord(part,dictionaries,get);byParts.push(...result.entries.map(entry=>({...entry,part})));}
      if(byParts.length)return {word,key,side,matched:'',via:'parts',entries:order(byParts)};
    }
  }
  return {word,key,side,matched:'',via:'',entries:[]};
}

// Words of a text with their offsets; punctuation stays with the text between
// words. A word keeps internal joiners, apostrophes and hyphens.
const wordPattern=/[\p{L}\p{M}\p{N}](?:[\p{L}\p{M}\p{N}\u200c\u200d'’ʼ-]*[\p{L}\p{M}\p{N}])?/gu;
export function textWords(text){return [...String(text).matchAll(wordPattern)].map(match=>({text:match[0],start:match.index,end:match.index+match[0].length}));}

// The word containing a character offset, or null.
export function wordAt(text,offset){return textWords(text).find(word=>offset>=word.start&&offset<word.end)||(offset>0?textWords(text).find(word=>offset===word.end):null)||null;}

// Split text into word columns for interlinear display: each column is a word
// with the punctuation that follows it (leading punctuation joins the first).
export function interlinearTokens(text){
  const words=textWords(text),tokens=[];let cursor=0;
  for(const [i,word] of words.entries()){
    const before=text.slice(cursor,word.start),after=i+1<words.length?text.slice(word.end,words[i+1].start):text.slice(word.end);
    const lead=tokens.length?'':before.trim();
    tokens.push({word:word.text,lead,trail:after.replace(/\s+/g,' ').trim()});
    cursor=word.end+after.length;
  }
  return tokens;
}

// Shards a published dictionary is written as: {original:[{key:[entries]}…], english:[…]}.
export function shardDictionary(entries,id){
  const {original,english}=indexEntries(entries,id);
  const shards={original:Array.from({length:dictionaryShards},()=>({})),english:Array.from({length:dictionaryShards},()=>({}))};
  const strip=({dictionary,...entry})=>entry;
  for(const [side,map] of [['original',original],['english',english]])for(const [key,list] of map)shards[side][dictionaryShard(key)][key]=list.map(strip);
  return shards;
}
