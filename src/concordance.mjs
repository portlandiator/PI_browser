// Concordance of authorized renderings: for each Persian/Arabic word form, the
// authorized-translation paragraphs where it occurs, and English words that
// statistically co-occur with it in those paragraph pairs (Dice coefficient),
// scored by folded key and shown in their usual spelling.
// Co-occurrence is a statistic over positionally paired paragraphs, never a
// claimed word-for-word alignment of the translation.
import {shardKey} from './text.mjs';
import {dictionaryKey,textWords} from './dictionary.mjs';
import {mayPublishOriginal} from './original-publication.mjs';
import {readingSlots} from './paragraph-alignment.mjs';
import {authorizedRanges,isAuthorizedParagraph} from './translation-status.mjs';

export const concordanceShards=256;
export const concordanceShard=key=>shardKey(key)%concordanceShards;
export const concordanceLimits={references:40,words:8,minJoint:2};
export const englishStopwords=new Set(('the and that which with from this these those unto upon into have hath been were are was for not all his her hers their theirs them they thee thou thy thine ye you your yours its who whom whose what shall will may might must can could would should such there then than but also every each any some one own him our ours out over through before after even ever verily indeed '+
  'has had having being let say said saith doth did does done its itself himself herself themselves ourselves yourself yourselves myself how why when where whereby wherein whereof thereof therein thereby hence thus yet nor now nay yea very more most much many other others both either neither only same about above below under again against among amongst between within without toward towards while whilst until till because though although whether lest unless once here whoso whosoever whoever whatever whatsoever whereas therefore wherefore shalt wilt hast art dost canst mayest wouldst couldst shouldst')
  .split(' '));
const latin=/^\p{Script=Latin}+$/u;
const englishWord=word=>{const key=dictionaryKey(word);return [...key].length>=3&&latin.test(key)&&!englishStopwords.has(key)?key:'';};
// A word as written, with a directly preceding ‘ (the ayn of transliterated
// names such as ‘Abdu’l-Bahá; a quotation mark loses to the bare spelling).
const surfaceOf=(text,{text:word,start})=>/[‘ʻʿ]/.test(text[start-1]||'')?text[start-1]+word:word;
const capitalized=word=>/\p{Lu}/u.test(word.match(/\p{L}/u)?.[0]||'');
// The display form of a word: its most frequent spelling (ties: first seen),
// lower-cased unless every occurrence was capitalized.
// Capitalized when at least 90% of occurrences are (so "God" stays "God" despite
// a stray lower-case "god"), otherwise lower-case.
export function displayForm(spellings){
  let best='',most=0,total=0,capital=0;
  for(const [spelling,n] of spellings){if(n>most){best=spelling;most=n;}total+=n;if(capitalized(spelling))capital+=n;}
  return capital>=total*0.9?best:best.toLowerCase();
}

// Paragraph pairs of a record whose English paragraph is authorized. Needs both
// texts, a publishable original and reading layouts of the same length; null
// layout slots are skipped. Numbers are 1-based source paragraph numbers.
export function authorizedPairs(record){
  if(!record?.hasEnglish||!record?.hasOriginal||!record.en||!record.original||!mayPublishOriginal(record.metadata))return [];
  const ranges=authorizedRanges(record.metadata?.Authorized);
  if(!ranges.length)return [];
  const en=readingSlots(record.en),original=readingSlots(record.original);
  if(!en.length||en.length!==original.length)return [];
  const pairs=[];
  for(let i=0;i<en.length;i++){
    const e=en[i],o=original[i];
    if(e==null||o==null||!isAuthorizedParagraph(ranges,e+1))continue;
    const english=record.en.paragraphs[e],source=record.original.paragraphs[o];
    if(english&&source)pairs.push({english,original:source,englishNumber:e+1,originalNumber:o+1});
  }
  return pairs;
}

const byText=(a,b)=>a<b?-1:a>b?1:0;

// Build the concordance from records (pure). Returns index counts and 256 shard
// objects keyed by dictionary key: `shards` for original word forms (English
// words that co-occur) and `english` for English words (original word forms
// that co-occur, the reverse statistic over the same pairs).
const ranked=(found,limit)=>found.sort((a,b)=>b[1]-a[1]||b[2]-a[2]||byText(a[0],b[0])).slice(0,limit);
export function buildConcordance(records){
  const keyIds=new Map(),keys=[],keyPairs=[],keySpellings=[];
  const wordIds=new Map(),words=[],wordPairs=[],spellings=[];
  const pairs=[];let recordCount=0;
  for(const record of records){
    const list=authorizedPairs(record);
    if(!list.length)continue;
    recordCount++;
    const citations=Number(record.citationCount)||0;
    for(const pair of list){
      const p=pairs.length,seenKeys=new Set(),seenWords=new Set();
      for(const {text} of textWords(pair.original.plain||'')){
        const key=dictionaryKey(text);
        if(!key)continue;
        let id=keyIds.get(key);
        if(id===undefined){id=keys.length;keyIds.set(key,id);keys.push(key);keyPairs.push([]);keySpellings.push(new Map());}
        keySpellings[id].set(text,(keySpellings[id].get(text)||0)+1);
        if(seenKeys.has(id))continue;
        seenKeys.add(id);keyPairs[id].push(p);
      }
      const english=pair.english.plain||'';
      for(const found of textWords(english)){
        const word=englishWord(found.text);
        if(!word)continue;
        let id=wordIds.get(word);
        if(id===undefined){id=words.length;wordIds.set(word,id);words.push(word);wordPairs.push([]);spellings.push(new Map());}
        const surface=surfaceOf(english,found);spellings[id].set(surface,(spellings[id].get(surface)||0)+1);
        if(seenWords.has(id))continue;
        seenWords.add(id);wordPairs[id].push(p);
      }
      pairs.push({id:record.id,citations,number:pair.originalNumber,englishNumber:pair.englishNumber,words:Int32Array.from(seenWords),keys:Int32Array.from(seenKeys)});
    }
  }
  const memo=list=>{const cache=new Map();return id=>{if(!cache.has(id))cache.set(id,displayForm(list[id]));return cache.get(id);};};
  const shown=memo(spellings),shownKey=memo(keySpellings);
  const order=number=>(a,b)=>pairs[b].citations-pairs[a].citations||byText(pairs[a].id,pairs[b].id)||pairs[a][number]-pairs[b][number];
  const references=(list,number)=>[...list].sort(order(number)).slice(0,concordanceLimits.references).map(p=>[pairs[p].id,pairs[p][number]]);
  // Items of `field` co-occurring with a list of pairs, as [id, dice, joint]
  // (both sides in at least two pairs, together in at least minJoint).
  // One counter array per side, reset after each use, keeps this linear.
  const counters={words:new Int32Array(words.length),keys:new Int32Array(keys.length)};
  function together(list,field,counts){
    const joint=counters[field],touched=[],df=list.length;
    for(const p of list)for(const x of pairs[p][field]){if(counts[x].length<2)continue;if(!joint[x]++)touched.push(x);}
    const found=[];
    for(const x of touched){if(joint[x]>=concordanceLimits.minJoint)found.push([x,Math.round(2000*joint[x]/(df+counts[x].length))/1000,joint[x]]);joint[x]=0;}
    return found;
  }
  // Ranked by dice, then joint count, then key; shown in display form.
  const top=(found,names,display)=>ranked(found.map(([x,dice,n])=>[names[x],dice,n,x]),concordanceLimits.words).map(([,dice,n,x])=>[display(x),dice,n]);
  const shards=Array.from({length:concordanceShards},()=>({})),english=Array.from({length:concordanceShards},()=>({}));
  for(let k=0;k<keys.length;k++){
    const list=keyPairs[k],entry={n:list.length,r:references(list,'number'),w:[]};
    if(list.length>=2)entry.w=top(together(list,'words',wordPairs),words,shown);
    shards[concordanceShard(keys[k])][keys[k]]=entry;
  }
  for(let w=0;w<words.length;w++){
    const list=wordPairs[w],entry={n:list.length,r:references(list,'englishNumber'),o:[]};
    if(list.length>=2)entry.o=top(together(list,'keys',keyPairs),keys,shownKey);
    english[concordanceShard(words[w])][words[w]]=entry;
  }
  return {index:{paragraphs:pairs.length,records:recordCount,keys:keys.length,englishKeys:words.length},shards,english};
}
