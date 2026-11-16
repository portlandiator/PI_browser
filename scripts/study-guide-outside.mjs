// Quotations from beyond the Bahá’í writings, for the comparative study-guide
// pilot (study-guides/outside/). The library holds each quotation once, with the
// page its wording was copied from; a guide's plan places quotations after the
// readings they were chosen for. Nothing here is read by the site build.
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

export const words=text=>text.split(/\s+/).filter(word=>/[\p{L}\p{N}]/u.test(word)).length;

// The guide's first readings, in reading order, whose quotations stay within the limit.
export function firstReadings(compiled,limit){
  if(!Number.isInteger(limit)||limit<1)throw Error('Invalid quotation limit');
  const readings=[];let quotations=0;
  for(const entry of compiled){
    if(quotations+entry.selectionIds.length>limit)break;
    readings.push(entry);quotations+=entry.selectionIds.length;
  }
  return {readings,quotations};
}

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

// readings: the guide's first readings (compiled entries). Returns the plan.
export function validateOutsidePlan(plan,library,readings){
  if(plan?.format!==1||!/^[a-z]+$/.test(plan.slug||'')||typeof plan.subject!=='string')throw Error('Unknown outside-quotation plan');
  if(!Number.isInteger(plan.limit)||plan.limit<1)throw Error(`${plan.slug}: invalid limit`);
  // The plan was written against a known cut of the guide; a changed guide needs the plan reviewed.
  if(plan.readings!==readings.length)throw Error(`${plan.slug}: written for the guide's first ${plan.readings} readings, but the limit of ${plan.limit} quotations now keeps ${readings.length}`);
  if(!Number.isInteger(plan.quotations)||plan.quotations<1||plan.quotations>plan.limit)throw Error(`${plan.slug}: the plan must record how many of the guide's quotations it keeps`);
  const keys=new Set(readings.map(entry=>entry.key)),seen=new Set();
  if(!Array.isArray(plan.outside))throw Error(`${plan.slug}: no outside quotations`);
  for(const placement of plan.outside){
    const id=placement.id;
    if(!library.quotations[id])throw Error(`${plan.slug}: unknown quotation ${id}`);
    if(seen.has(id))throw Error(`${plan.slug}: ${id} is placed twice`);
    seen.add(id);
    if(!(placement.relation in relations))throw Error(`${plan.slug}: ${id} has an unknown relation`);
    if(!keys.has(placement.after))throw Error(`${plan.slug}: ${id} follows a reading outside the guide's first ${plan.limit} quotations`);
    if(!Array.isArray(placement.responds)||!placement.responds.length||new Set(placement.responds).size!==placement.responds.length||placement.responds.some(key=>!keys.has(key)))throw Error(`${plan.slug}: ${id} must name the readings it was chosen for`);
    if(!placement.responds.includes(placement.after))throw Error(`${plan.slug}: ${id} must follow one of the readings it was chosen for`);
    text(placement.why,'why',id);
    if(words(placement.why)<12)throw Error(`${plan.slug}: ${id} needs a reason a reader can use`);
  }
  if(typeof plan.introduction!=='string'||!plan.introduction.trim()||plan.introduction.includes('\n'))throw Error(`${plan.slug}: expected a single introductory paragraph`);
  if(!Array.isArray(plan.questions)||plan.questions.length<3||plan.questions.length>6||plan.questions.some(q=>typeof q!=='string'||!q.trim()))throw Error(`${plan.slug}: expected three to six questions`);
  return plan;
}

// The combined sequence: each reading, then the outside quotations placed after it, in plan order.
export function combinedSequence(readings,plan,library){
  const following=new Map(readings.map(entry=>[entry.key,[]]));
  for(const placement of plan.outside)following.get(placement.after).push(placement);
  return readings.flatMap(entry=>[{reading:entry},...following.get(entry.key).map(placement=>({placement,quotation:library.quotations[placement.id]}))]);
}

export async function readOutside(root,slug){
  const directory=path.join(root,'study-guides','outside'),json=async name=>JSON.parse(await fs.readFile(path.join(directory,name),'utf8'));
  return {library:await json('quotations.json'),plan:await json(slug+'.json')};
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
// A tag ends at the first ">" outside its quoted attribute values.
export function pageText(body){
  let source=String(body);
  if(/^\s*[{[]/.test(source))try{source=jsonStrings(JSON.parse(source)).join('\n');}catch{}
  if(/<(?:html|body|p|div|br|span|table|b|i|a)\b/i.test(source))
    source=source.replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi,' ').replace(/<!--[\s\S]*?-->/g,' ').replace(/<![^>]*>/g,' ')
      .replace(/<\/?([a-z][a-z0-9:-]*)(?:"[^"]*"|'[^']*'|[^'">])*>/gi,(tag,name)=>blocks.has(name.toLowerCase())?'\n':'');
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
// numbers, note marks, emphasis underscores) is removed from the page first.
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
