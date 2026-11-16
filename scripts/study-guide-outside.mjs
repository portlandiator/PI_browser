// Study guides read with quotations from beyond the Bahá’í writings
// (study-guides/outside/, OUTSIDE.md). Each guide has one file there: its plan,
// which says which of the guide's readings are kept and places outside
// quotations after the readings they were chosen for, and the quotations first
// recorded for it, each with the page its wording was copied from. Together the
// files' quotations are one library, so any guide may place any of them. The
// site build publishes the plans marked published (outside-guide-page.mjs).
import fs from 'node:fs/promises';
import path from 'node:path';

// How an outside quotation stands to the readings it accompanies.
export const relations={adjacent:'alongside',contrast:'in contrast',complement:'complement'};
export const kinds={sacred:'Scripture and religious teaching',philosophy:'Philosophy and science',literature:'Literature',public:'Speeches, journalism, declarations and law',proverb:'Proverbs and sayings'};
export const rightsStatuses={'public-domain':'public domain','public-domain-us':'public domain in the United States, in copyright elsewhere','open-licence':'open licence','in-copyright':'in copyright, brief quotation'};
export const sourceStatuses={primary:'text of the work',secondary:'reference work quoting it'};
// A quotation still in copyright stays brief.
export const copyrightWordLimit=60;
export const omission=' … ',lineBreak=' / ';
// A guide shows at most this many of its own quotations beside as many from outside.
export const quotationLimit=100;

export const words=text=>text.split(/\s+/).filter(word=>/[\p{L}\p{N}]/u.test(word)).length;

// ---- Cutting a guide to a limit of quotations ----

export const quotationsIn=entries=>entries.reduce((n,entry)=>n+entry.selectionIds.length,0);
const wholeLimit=limit=>{if(!Number.isInteger(limit)||limit<1)throw Error('Invalid quotation limit');return limit;};

// The guide's first readings, in reading order, whose quotations stay within the limit.
export function firstReadings(compiled,limit){
  wholeLimit(limit);
  const readings=[];let quotations=0;
  for(const entry of compiled){
    if(quotations+entry.selectionIds.length>limit)break;
    readings.push(entry);quotations+=entry.selectionIds.length;
  }
  return {readings,quotations};
}

// The guide's named sections. The arc names them, and each is a run of several readings
// under one editor's note; readings after the last named section, each with a note of its
// own, belong to none. null when the guide is not divided this way: most guides give
// every reading its own note, or name no parts in their arc.
export function guideSections(guide){
  const names=String(guide.arc||'').split(' → ').map(name=>name.trim()).filter(Boolean);
  const note=new Map(guide.order.map(item=>[item.key,item.why])),runs=[];
  for(const entry of guide.compiled){
    const why=note.get(entry.key);
    if(!runs.length||why!==runs.at(-1).note)runs.push({note:why,readings:[]});
    runs.at(-1).readings.push(entry);
  }
  const named=runs.slice(0,names.length),after=runs.slice(names.length);
  if(names.length<2||named.length<names.length||named.some(run=>run.readings.length<2)||after.some(run=>run.readings.length>1))return null;
  return {sections:named.map((run,i)=>({name:names[i],note:run.note,readings:run.readings})),beyond:after.flatMap(run=>run.readings)};
}

// Where a guide names no sections, its reading order is divided into this many stretches
// of equal length in quotations; a reading belongs to the stretch its first quotation falls in.
export const stretchCount=10;
export function guideStretches(guide,count=stretchCount){
  const total=quotationsIn(guide.compiled),stretches=Array.from({length:count},()=>({readings:[]}));
  let before=0;
  for(const entry of guide.compiled){
    stretches[Math.min(count-1,Math.floor(before*count/Math.max(total,1)))].readings.push(entry);
    before+=entry.selectionIds.length;
  }
  return stretches.filter(stretch=>stretch.readings.length);
}

// 0: every paragraph of the reading is an authorized translation; 1: some are; 2: none.
export function authorizedRank(entry){
  const authorized=entry.paragraphs.filter(paragraph=>paragraph.authorized).length;
  return authorized&&authorized===entry.paragraphs.length?0:authorized?1:2;
}

// Each part's share of the limit, in proportion to its quotations. Whole numbers by
// largest remainder; on a tie the earlier part has the quotation.
export function sectionShares(sizes,limit){
  wholeLimit(limit);
  const total=sizes.reduce((sum,size)=>sum+size,0);
  if(total<=limit)return [...sizes];
  const shares=sizes.map(size=>Math.floor(size*limit/total));
  const waiting=sizes.map((size,i)=>[size*limit%total,i]).sort((a,b)=>b[0]-a[0]||a[1]-b[1]);
  for(let left=limit-shares.reduce((sum,share)=>sum+share,0),i=0;left>0;left--,i++)shares[waiting[i][1]]++;
  return shares;
}

// Readings from every part in proportion to its length. Within a part those wholly in
// authorized translation come first, then those partly so, then the rest, each group in
// reading order; a reading is taken when its quotations still fit the part's share. What
// a part could not use passes to the readings not yet taken, in the same order of
// preference. The result is in reading order.
function proportional(guide,parts,limit){
  wholeLimit(limit);
  const preferred=entries=>[...entries].sort((a,b)=>authorizedRank(a)-authorizedRank(b)||a.position-b.position);
  const shares=sectionShares(parts.map(part=>quotationsIn(part.readings)),limit),kept=new Set();
  const take=(entries,room)=>{for(const entry of entries)if(!kept.has(entry)&&entry.selectionIds.length<=room){kept.add(entry);room-=entry.selectionIds.length;}return room;};
  const spare=parts.reduce((left,part,i)=>left+take(preferred(part.readings),shares[i]),0);
  if(spare)take(preferred(parts.flatMap(part=>part.readings)),spare);
  const readings=guide.compiled.filter(entry=>kept.has(entry));
  return {readings,quotations:quotationsIn(readings),shares};
}
// The parts are the guide's named sections; readings after them are not drawn on.
export function proportionalReadings(guide,limit){
  const divided=guideSections(guide);
  if(!divided)throw Error(`${guide.slug}: the guide is not divided into the sections its arc names`);
  return proportional(guide,divided.sections,limit);
}
// The parts are equal stretches of the whole reading order.
export const stretchReadings=(guide,limit)=>proportional(guide,guideStretches(guide),limit);

// The ways a plan may cut its guide, and the one a new plan takes.
export const cutRules={whole:'every reading: the guide is within the limit',proportional:'from every named section in proportion to its length, authorized translations first',stretches:'from equal stretches of the reading order in proportion to their length, authorized translations first',first:'the first quotations, in reading order'};
export const ruleFor=(guide,limit)=>quotationsIn(guide.compiled)<=wholeLimit(limit)?'whole':guideSections(guide)?'proportional':'stretches';
export function cutGuide(guide,plan){
  if(plan.rule==='whole'){
    const quotations=quotationsIn(guide.compiled);
    if(quotations>plan.limit)throw Error(`${plan.slug}: the guide now holds ${quotations} quotations, more than the limit of ${plan.limit}`);
    return {readings:[...guide.compiled],quotations};
  }
  if(plan.rule==='first')return firstReadings(guide.compiled,plan.limit);
  if(plan.rule==='proportional')return proportionalReadings(guide,plan.limit);
  if(plan.rule==='stretches')return stretchReadings(guide,plan.limit);
  throw Error(`${plan.slug}: unknown rule for the cut`);
}

// ---- The library and the plans ----

const text=(value,name,id)=>{if(typeof value!=='string'||!value.trim()||value!==value.trim()||/\s{2,}|[\n\t]/.test(value))throw Error(`${id}: ${name} must be one line of text`);return value;};
const optional=(value,name,id)=>value===undefined||value===''?'':text(value,name,id);

export function validateOutsideLibrary(library){
  if(library?.format!==1||!library.quotations||typeof library.quotations!=='object')throw Error('Unknown outside-quotation library');
  for(const [id,q] of Object.entries(library.quotations)){
    if(!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id))throw Error(`Invalid quotation id: ${id}`);
    text(q.text,'text',id);text(q.work,'work',id);text(q.year,'year',id);text(q.tradition,'tradition',id);
    for(const name of ['author','locator','translator','translationYear','currency','caveat'])optional(q[name],name,id);
    if(q.translationYear&&!q.translator)throw Error(`${id}: a translation year needs its translator`);
    if(!Number.isInteger(q.sortYear))throw Error(`${id}: sortYear must be a whole year (negative before the common era)`);
    if(!(q.kind in kinds))throw Error(`${id}: unknown kind`);
    if(q.verse!==undefined&&typeof q.verse!=='boolean')throw Error(`${id}: verse must be true or false`);
    if(!q.verse&&q.text.includes(lineBreak))throw Error(`${id}: line breaks are for verse`);
    const source=q.source||{};
    let url;try{url=new URL(source.url);}catch{throw Error(`${id}: source needs an address`);}
    if(url.protocol!=='https:')throw Error(`${id}: source address must use https`);
    text(source.label,'source label',id);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(source.checked||''))throw Error(`${id}: source needs the date it was checked`);
    if(!(source.status in sourceStatuses))throw Error(`${id}: source status must be primary or secondary`);
    if(source.fetch!==undefined&&!['plain','browser'].includes(source.fetch))throw Error(`${id}: unknown way of fetching`);
    for(const pattern of source.strip||[])new RegExp(pattern,'g');
    // Scanning errors on the page, each given as [page's reading, correct reading].
    for(const pair of source.repair||[])if(!Array.isArray(pair)||pair.length!==2||pair.some(part=>typeof part!=='string'||!part))throw Error(`${id}: a repair is a pair of readings`);
    if(source.after!==undefined)text(source.after,'source marker',id);
    const rights=q.rights||{};
    if(!(rights.status in rightsStatuses))throw Error(`${id}: unknown rights status`);
    text(rights.note,'rights note',id);
    if(['in-copyright','public-domain-us'].includes(rights.status)&&words(q.text)>copyrightWordLimit)throw Error(`${id}: a quotation in copyright is limited to ${copyrightWordLimit} words`);
  }
  return library;
}

// A draft may be unfinished and is not published; a published plan is complete.
export const planStatuses=['draft','published'];
// As in every guide: three to six questions when possible, always fewer than the quotations shown.
export const questionRange=shown=>{const most=Math.min(6,Math.max(0,shown-1));return [Math.min(3,most),most];};

// readings: the readings the plan keeps (compiled entries, in reading order). Returns the plan.
export function validateOutsidePlan(plan,library,readings){
  if(plan?.format!==2||!/^[a-z]+$/.test(plan.slug||'')||typeof plan.subject!=='string')throw Error('Unknown outside-quotation plan');
  if(!planStatuses.includes(plan.status))throw Error(`${plan.slug}: a plan is a draft or published`);
  if(!Number.isInteger(plan.limit)||plan.limit<1)throw Error(`${plan.slug}: invalid limit`);
  if(!Object.hasOwn(cutRules,plan.rule))throw Error(`${plan.slug}: unknown rule for the cut`);
  // The plan was written against a known cut of the guide; a changed guide needs the plan reviewed.
  if(!Array.isArray(plan.kept)||plan.kept.some(key=>typeof key!=='string')||new Set(plan.kept).size!==plan.kept.length||plan.readings!==plan.kept.length)throw Error(`${plan.slug}: the plan must list the readings it was written for`);
  const changed=readings.length!==plan.kept.length?Math.min(readings.length,plan.kept.length):readings.findIndex((entry,i)=>entry.key!==plan.kept[i]);
  if(changed>=0)throw Error(`${plan.slug}: written for ${plan.kept.length} readings of the guide, but the cut now keeps ${readings.length}${readings.length===plan.kept.length?`, and they differ from reading ${changed+1} of the cut`:''}; review the plan`);
  if(!Number.isInteger(plan.quotations)||plan.quotations<1||plan.quotations>plan.limit)throw Error(`${plan.slug}: the plan must record how many of the guide's quotations it keeps`);
  const keys=new Set(readings.map(entry=>entry.key)),seen=new Set();
  if(!Array.isArray(plan.outside))throw Error(`${plan.slug}: no outside quotations`);
  for(const placement of plan.outside){
    const id=placement.id;
    if(!library.quotations[id])throw Error(`${plan.slug}: unknown quotation ${id}`);
    if(seen.has(id))throw Error(`${plan.slug}: ${id} is placed twice`);
    seen.add(id);
    if(!(placement.relation in relations))throw Error(`${plan.slug}: ${id} has an unknown relation`);
    if(!keys.has(placement.after))throw Error(`${plan.slug}: ${id} follows a reading that the cut does not keep`);
    if(!Array.isArray(placement.responds)||!placement.responds.length||new Set(placement.responds).size!==placement.responds.length||placement.responds.some(key=>!keys.has(key)))throw Error(`${plan.slug}: ${id} must name the readings it was chosen for`);
    if(!placement.responds.includes(placement.after))throw Error(`${plan.slug}: ${id} must follow one of the readings it was chosen for`);
    text(placement.why,'why',id);
    if(words(placement.why)<12)throw Error(`${plan.slug}: ${id} needs a reason a reader can use`);
  }
  if(plan.outside.length>plan.quotations)throw Error(`${plan.slug}: more outside quotations than the guide's own`);
  const published=plan.status==='published',introduction=plan.introduction??'',questions=plan.questions??[];
  if(typeof introduction!=='string'||introduction.includes('\n')||(published&&!introduction.trim()))throw Error(`${plan.slug}: expected a single introductory paragraph`);
  const [fewest,most]=questionRange(readings.length+plan.outside.length);
  if(!Array.isArray(questions)||questions.some(q=>typeof q!=='string'||!q.trim())||(published&&(questions.length<fewest||questions.length>most)))throw Error(`${plan.slug}: expected ${fewest===most?fewest:`${fewest} to ${most}`} questions`);
  // An equal number is the aim. Where honest parallels run out, the plan says so rather than pad.
  if(plan.shortfall!==undefined&&(words(text(plan.shortfall,'shortfall',plan.slug))<12||plan.outside.length===plan.quotations))throw Error(`${plan.slug}: a shortfall is explained in a sentence, and only where there is one`);
  if(published&&(!plan.outside.length||(plan.outside.length<plan.quotations&&plan.shortfall===undefined)))throw Error(`${plan.slug}: a published plan places as many outside quotations as the guide keeps, or says why it has fewer (shortfall)`);
  return plan;
}

// The readings of a built guide that a plan keeps, in reading order. A guide edited since
// the plan was written may have lost some; the page is built from those that remain.
export function planReadings(plan,compiled){
  const kept=new Set(plan.kept),readings=compiled.filter(entry=>kept.has(entry.key)),present=new Set(readings.map(entry=>entry.key));
  return {readings,missing:plan.kept.filter(key=>!present.has(key))};
}

// The combined sequence: each reading, then the outside quotations placed after it, in plan order.
// A placement whose reading is gone is left out; one that remains names only readings that remain.
export function combinedSequence(readings,plan,library){
  const following=new Map(readings.map(entry=>[entry.key,[]]));
  for(const placement of plan.outside)following.get(placement.after)?.push({...placement,responds:placement.responds.filter(key=>following.has(key))});
  return readings.flatMap(entry=>[{reading:entry},...following.get(entry.key).map(placement=>({placement,quotation:library.quotations[placement.id]}))]);
}

// Two records of one quotation agree when only the date of their check differs.
const withoutDate=quotation=>JSON.stringify({...quotation,source:{...quotation.source,checked:''}});
// Every guide's file: the plans by slug, and one library of all the quotations recorded.
// The same quotation may be recorded for two guides, word for word; two different
// quotations under one id are an error, named with both guides.
export async function readOutside(root){
  const directory=path.join(root,'study-guides','outside'),plans=new Map(),quotations={},recordedFor=new Map();
  let names=[];
  try{names=(await fs.readdir(directory)).filter(name=>name.endsWith('.json')).sort();}catch(error){if(error.code!=='ENOENT')throw error;}
  for(const name of names){
    const plan=JSON.parse(await fs.readFile(path.join(directory,name),'utf8'));
    if(name!==plan?.slug+'.json')throw Error(`study-guides/outside/${name} is not named for its guide`);
    plans.set(plan.slug,plan);
    for(const [id,quotation] of Object.entries(plan.library||{})){
      if(!recordedFor.has(id)){recordedFor.set(id,plan.slug);quotations[id]=quotation;}
      else if(withoutDate(quotations[id])!==withoutDate(quotation))throw Error(`The outside quotation ${id} is recorded differently for ${recordedFor.get(id)} and for ${plan.slug}`);
    }
  }
  return {library:validateOutsideLibrary({format:1,quotations}),plans,recordedFor};
}

// ---- Checking a quotation against the page it was copied from ----

const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ensp:' ',emsp:' ',thinsp:' ',shy:'',zwnj:'',zwj:'',lrm:'',rlm:'',mdash:'—',ndash:'–',lsquo:'‘',rsquo:'’',sbquo:'‚',ldquo:'“',rdquo:'”',bdquo:'„',hellip:'…',middot:'·',bull:'•',prime:'′',Prime:'″',laquo:'«',raquo:'»',copy:'©',reg:'®',deg:'°',sect:'§',para:'¶',dagger:'†',Dagger:'‡',times:'×',iexcl:'¡',iquest:'¿',szlig:'ß',aelig:'æ',AElig:'Æ',oelig:'œ',OElig:'Œ',oslash:'ø',Oslash:'Ø',aring:'å',Aring:'Å',ccedil:'ç',Ccedil:'Ç',ntilde:'ñ',Ntilde:'Ñ',eth:'ð',thorn:'þ'};
// Accented letters: the entity name is the plain letter followed by the accent's name.
for(const [accent,letters] of Object.entries({grave:'àèìòùÀÈÌÒÙ',acute:'áéíóúýÁÉÍÓÚÝ',circ:'âêîôûÂÊÎÔÛ',tilde:'ãõñÃÕÑ',uml:'äëïöüÿÄËÏÖÜ'}))
  for(const letter of letters)entities[letter.normalize('NFD')[0]+accent]=letter;
export function decodeEntities(value){
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi,(whole,name)=>{
    if(name[0]==='#'){const code=name[1].toLowerCase()==='x'?parseInt(name.slice(2),16):Number(name.slice(1));return code>0&&code<=0x10ffff?String.fromCodePoint(code):whole;}
    return Object.hasOwn(entities,name)?entities[name]:whole;
  });
}

const jsonStrings=value=>typeof value==='string'?[value]:Array.isArray(value)?value.flatMap(jsonStrings):value&&typeof value==='object'?Object.values(value).flatMap(jsonStrings):[];
const blocks=new Set('address article blockquote br dd div dl dt footer h1 h2 h3 h4 h5 h6 header hr li ol option p pre section table td th title tr ul'.split(' '));
// The readable text of a fetched page: a web page without its markup, the strings of a
// JSON reply, or plain text as it is. Block elements separate words; inline ones do not.
// A tag ends at the first ">" outside a quoted attribute value, and a value is quoted only
// when the quotation mark follows "=": a stray apostrophe in a tag ends nothing.
export function pageText(body){
  let source=String(body);
  if(/^\s*[{[]/.test(source))try{source=jsonStrings(JSON.parse(source)).join('\n');}catch{}
  if(/<(?:html|body|p|div|br|span|table|b|i|a)\b/i.test(source))
    source=source.replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi,' ').replace(/<!--[\s\S]*?-->/g,' ').replace(/<![^>]*>/g,' ')
      .replace(/<\/?([a-z][a-z0-9:-]*)(?:=\s*"[^"]*"|=\s*'[^']*'|[^>])*>/gi,(tag,name)=>blocks.has(name.toLowerCase())?'\n':'');
  return decodeEntities(source);
}

// One form for comparing wording: the same letters and punctuation in the same order,
// whatever the page's spacing, line breaks, capitals, quotation-mark style, dash style,
// or space set before punctuation.
export function comparable(value){
  return value.normalize('NFC').toLowerCase().replace(/[\u00a0\u2000-\u200a\u202f\u3000]/g,' ').replace(/[\u00ad\u200b-\u200f\u2060\ufeff]/g,'')
    .replace(/[‘’‚‛′`]/g,"'").replace(/[“”„‟″]/g,'"').replace(/\s*(?:[—–―]|--+)\s*/g,'-').replace(/…/g,'...').replace(/\s+/g,' ').replace(/ ([;:!?,.])/g,'$1').trim();
}

// The parts of a quotation that must each be found on the page, in order.
export const quotationParts=quotation=>quotation.text.split(omission).map(part=>comparable(part.replaceAll(lineBreak,' ')));

// Is the quotation's wording on the page? Page furniture named in source.strip (verse
// numbers, note marks, emphasis underscores) is removed from the page first. The patterns
// meet the page in its comparable form: lower case, single spaces, no space before punctuation.
export function findQuotation(body,quotation){
  let page=comparable(pageText(body));
  const marker=quotation.source?.after;
  if(marker){
    const at=page.indexOf(comparable(marker));
    if(at<0)return {found:false,missing:[`the marker “${marker}”`]};
    page=page.slice(at+comparable(marker).length);
  }
  for(const pattern of quotation.source?.strip||[])page=page.replace(new RegExp(pattern,'gi'),'');
  page=comparable(page);
  for(const [read,correct] of quotation.source?.repair||[])page=page.replaceAll(comparable(read),comparable(correct));
  const missing=[];let from=0;
  for(const part of quotationParts(quotation)){
    const at=page.indexOf(part,from);
    if(at<0)missing.push(part);else from=at+part.length;
  }
  return {found:!missing.length,missing};
}
