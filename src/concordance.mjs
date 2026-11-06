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
// objects keyed by dictionary key.
export function buildConcordance(records){
  const keyIds=new Map(),keys=[],keyPairs=[];
  const wordIds=new Map(),words=[],wordDf=[],spellings=[];
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
        if(!key||seenKeys.has(key))continue;
        seenKeys.add(key);
        let id=keyIds.get(key);
        if(id===undefined){id=keys.length;keyIds.set(key,id);keys.push(key);keyPairs.push([]);}
        keyPairs[id].push(p);
      }
      const english=pair.english.plain||'';
      for(const found of textWords(english)){
        const word=englishWord(found.text);
        if(!word)continue;
        let id=wordIds.get(word);
        if(id===undefined){id=words.length;wordIds.set(word,id);words.push(word);wordDf.push(0);spellings.push(new Map());}
        const surface=surfaceOf(english,found);spellings[id].set(surface,(spellings[id].get(surface)||0)+1);
        if(seenWords.has(word))continue;
        seenWords.add(word);wordDf[id]++;
      }
      pairs.push({id:record.id,citations,number:pair.originalNumber,words:Int32Array.from(seenWords,word=>wordIds.get(word))});
    }
  }
  const display=new Map(),shown=id=>{if(!display.has(id))display.set(id,displayForm(spellings[id]));return display.get(id);};
  const shards=Array.from({length:concordanceShards},()=>({}));
  const joint=new Int32Array(words.length),touched=[];
  const reference=(a,b)=>pairs[b].citations-pairs[a].citations||byText(pairs[a].id,pairs[b].id)||pairs[a].number-pairs[b].number;
  for(let k=0;k<keys.length;k++){
    const list=keyPairs[k],df=list.length;
    const entry={n:df,r:[...list].sort(reference).slice(0,concordanceLimits.references).map(p=>[pairs[p].id,pairs[p].number]),w:[]};
    if(df>=2){
      for(const p of list)for(const w of pairs[p].words){if(wordDf[w]<2)continue;if(!joint[w]++)touched.push(w);}
      const found=[];
      for(const w of touched){
        if(joint[w]>=concordanceLimits.minJoint)found.push([words[w],Math.round(2000*joint[w]/(df+wordDf[w]))/1000,joint[w]]);
        joint[w]=0;
      }
      touched.length=0;
      entry.w=found.sort((a,b)=>b[1]-a[1]||b[2]-a[2]||byText(a[0],b[0])).slice(0,concordanceLimits.words).map(([word,dice,n])=>[shown(wordIds.get(word)),dice,n]);
    }
    shards[concordanceShard(keys[k])][keys[k]]=entry;
  }
  return {index:{paragraphs:pairs.length,records:recordCount,keys:keys.length},shards};
}
