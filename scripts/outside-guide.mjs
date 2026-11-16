// One study guide at a time, read with quotations from beyond the Bahá’í writings.
// OUTSIDE.md describes the work; these are its tools.
//   node scripts/outside-guide.mjs status                        guides in the overview's order, and which are done
//   node scripts/outside-guide.mjs brief <slug>                  start or resume a guide: its cut, and the readings to read
//   node scripts/outside-guide.mjs find <word> ...               search the quotations already recorded
//   node scripts/outside-guide.mjs show <url> <phrase> ...       read a source page around a phrase
//   node scripts/outside-guide.mjs record <slug> <id> <url> --from <words> --to <words> [details]
//   node scripts/outside-guide.mjs place <slug> <id> --after <reading> --relation <relation> --why <note> [--with <readings>]
//   node scripts/outside-guide.mjs unplace <slug> <id>
//   node scripts/outside-guide.mjs set <slug> introduction|questions|shortfall <text> ...
//   node scripts/outside-guide.mjs check <slug> [--publish] [--offline] [--fragment]
// The guide is read from a local build (dist/) when there is one, otherwise from the
// published site (--site and --local choose). Nothing here needs a build of the collection.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {escapeHtml as esc} from '../src/text.mjs';
import {githubTarget} from './github-target.mjs';
import {guideQuotations} from './study-guide-quotations.mjs';
import {decodeGuideHtmlPayload} from './guide-html-payload.mjs';
import {outsideGuideBody,guideArticles,citation} from './outside-guide-page.mjs';
import {readPage,closeBrowser,verifyOutsideQuotations,guideQuotationIds} from './verify-outside-quotations.mjs';
import {relations,kinds,rightsStatuses,sourceStatuses,omission,lineBreak,quotationLimit,words,quotationsIn,guideSections,guideStretches,authorizedRank,sectionShares,ruleFor,cutGuide,cutRules,
  validateOutsideLibrary,validateOutsidePlan,readOutside,decodeEntities,pageText,findQuotation} from './study-guide-outside.mjs';

const today=()=>new Date().toISOString().slice(0,10);
const count=(n,one,many=one+'s')=>`${n} ${n===1?one:many}`;
const tally=(items,key)=>{const result=new Map();for(const item of items){const k=key(item);result.set(k,(result.get(k)||0)+1);}return result;};
const listed=counts=>[...counts].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]))).map(([name,n])=>`${name} ${n}`).join(', ');
const eras=[[-Infinity,'before the common era'],[1,'1–1499'],[1500,'1500–1799'],[1800,'1800–1899'],[1900,'1900–1999'],[2000,'2000 onward']];
export const eraOf=year=>eras.findLast(([from])=>year>=from)[1];
export const workFolder=root=>path.join(root,'reports','outside-guides');

// ---- Arguments: words, and --name value pairs; a name given twice keeps every value ----
const switches=new Set(['browser','verse','secondary','publish','offline','site','local','fragment','first','recut','all']);
export function parseArguments(args){
  const plain=[],options={};
  for(let i=0;i<args.length;i++){
    if(!args[i].startsWith('--')){plain.push(args[i]);continue;}
    const name=args[i].slice(2);
    if(switches.has(name)){options[name]=true;continue;}
    if(i+1>=args.length)throw Error(`--${name} needs a value`);
    (options[name]??=[]).push(args[++i]);
  }
  return {plain,options};
}
const one=(options,name)=>{const values=options[name];if(values&&values.length>1)throw Error(`--${name} is given once`);return values?.[0];};

// ---- The guide as built: from dist/ or from the published site ----
export async function builtFiles(root,{site=false,local=false}={}){
  const dist=path.join(root,'dist');
  if(!site&&!local)local=await Promise.all(['stats.json','study-guides/manifest.json'].map(name=>fs.access(path.join(dist,name)))).then(()=>true,()=>false);
  if(local)return {from:'the local build (dist/)',base:(await githubTarget(root)).site,get:name=>fs.readFile(path.join(dist,name))};
  const base=(await githubTarget(root)).site,cache=path.join(workFolder(root),'cache','site');
  return {from:base,base,get:async name=>{
    const file=path.join(cache,name);
    try{return await fs.readFile(file);}catch(error){if(error.code!=='ENOENT')throw error;}
    const response=await fetch(new URL(name,base));
    if(!response.ok)throw Error(`${new URL(name,base)} answered ${response.status}`);
    const bytes=Buffer.from(await response.arrayBuffer());
    await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);
    return bytes;
  }};
}

// Every guide's editorial file entry, by slug.
export async function readGuides(root){
  const directory=path.join(root,'study-guides'),guides=new Map();
  for(const name of (await fs.readdir(directory)).filter(name=>name==='editorial.json'||name.endsWith('-batch.json')))
    for(const guide of JSON.parse(await fs.readFile(path.join(directory,name),'utf8')).subjects)guides.set(guide.slug,guide);
  return guides;
}

// The quotation paragraphs of a reading's article: their wording and whether each is authorized.
export function articleParagraphs(article){
  const quote=/<blockquote>([\s\S]*?)<\/blockquote>/.exec(article)?.[1]||'';
  return [...quote.matchAll(/<p( class="authorized")?>([\s\S]*?)<\/p>/g)].map(match=>({authorized:Boolean(match[1]),text:decodeEntities(match[2].replace(/<[^>]+>/g,''))}));
}

// A guide's readings as its pages show them, enough to cut it and to read it: the same
// keys, positions, quotation counts and authorized paragraphs as the build compiles.
export async function guideView(guide,files){
  const {dataset}=JSON.parse(await files.get('stats.json'));
  const read=async name=>JSON.parse(gunzipSync(await files.get(dataset+name)));
  const subject=await guideQuotations(guide,read);
  if(subject.changed)throw Error(`${guide.slug}: ${subject.changed}`);
  const dictionary=async hash=>JSON.parse(gunzipSync(await files.get(`study-guides/shared-paragraphs/${hash}.json.gz`)));
  // The regular view holds every reading, whatever the study-guide view now shows.
  let html;
  try{html=await decodeGuideHtmlPayload(gunzipSync(await files.get(`study-guides/${guide.slug}.quotations.html.gz`)).toString(),dictionary);}
  catch(error){if(error.code!=='ENOENT')throw error;html=(await files.get(`study-guides/${guide.slug}.html`)).toString();}
  const articles=guideArticles(html),order=guide.order.filter(item=>!item.omitted);
  if(articles.size!==order.length)throw Error(`${guide.slug}: its page holds ${articles.size} readings and its order ${order.length}; the site and this checkout differ`);
  const compiled=order.map((item,i)=>{
    const entry=subject.entries[item.key],paragraphs=articleParagraphs(articles.get(i+1));
    return {position:i+1,key:item.key,selectionIds:Array.from({length:entry.quotations},(_,n)=>`${item.key}#${n+1}`),source:entry.source||undefined,paragraphs:entry.linked?paragraphs:[],text:paragraphs.map(p=>p.text).join(' ¶ ')};
  });
  return {...guide,order,compiled,articles,subjectName:subject.subject};
}

// The parts a cut is reckoned over, for the brief and the check.
export function guideParts(view,rule){
  if(rule==='proportional'){
    const divided=guideSections(view);
    return [...divided.sections.map(section=>({name:section.name,note:section.note,readings:section.readings})),...(divided.beyond.length?[{name:'After the named sections (not drawn on)',readings:divided.beyond,aside:true}]:[])];
  }
  if(rule==='stretches')return guideStretches(view).map((stretch,i,all)=>({name:`Stretch ${i+1} of ${all.length}`,readings:stretch.readings}));
  return [{name:'The whole guide',readings:view.compiled}];
}

const planKeys=['format','slug','subject','status','limit','rule','readings','quotations','kept','introduction','questions','outside','shortfall','leftOut','library'];
const ordered=plan=>Object.fromEntries([...planKeys.filter(key=>plan[key]!==undefined).map(key=>[key,plan[key]]),...Object.entries(plan).filter(([key])=>!planKeys.includes(key))]);
const planFile=(root,slug)=>path.join(root,'study-guides','outside',slug+'.json');
export async function writePlan(root,plan){
  await fs.mkdir(path.dirname(planFile(root,plan.slug)),{recursive:true});
  await fs.writeFile(planFile(root,plan.slug),JSON.stringify(ordered(plan),null,1)+'\n');
}

// A new plan for a guide: the rule that fits it, and the readings that rule keeps.
export function startPlan(view,limit=quotationLimit){
  const rule=ruleFor(view,limit),cut=cutGuide(view,{slug:view.slug,rule,limit});
  return {format:2,slug:view.slug,subject:view.id,status:'draft',limit,rule,readings:cut.readings.length,quotations:cut.quotations,kept:cut.readings.map(entry=>entry.key),introduction:'',questions:[],outside:[],library:{}};
}
// What the plan's rule keeps of the guide as it now stands, and whether the plan still says so.
export function currentCut(view,plan){
  const cut=cutGuide(view,plan);
  return {...cut,same:cut.readings.length===plan.kept.length&&cut.readings.every((entry,i)=>entry.key===plan.kept[i])};
}

const rankName=['authorized','partly authorized','provisional'];
// The readings a session reads before choosing: each kept reading with its number in the
// guide, what is already placed after it, and what other guides placed against the same passage.
export function briefText(view,plan,outside,from){
  const kept=new Set(plan.kept),parts=guideParts(view,plan.rule),shares=sectionShares(parts.filter(part=>!part.aside).map(part=>quotationsIn(part.readings)),plan.limit);
  const elsewhere=new Map(),here=new Map();
  for(const other of outside.plans.values())for(const placement of other.outside||[])
    for(const key of placement.responds)if(other.slug!==plan.slug)(elsewhere.get(key)||elsewhere.set(key,[]).get(key)).push({...placement,slug:other.slug});
  for(const placement of plan.outside)(here.get(placement.after)||here.set(placement.after,[]).get(placement.after)).push(placement);
  const cite=id=>{const q=outside.library.quotations[id];return q?[q.author,q.work,q.locator].filter(Boolean).join(', '):id;};
  const lines=[`# ${view.displayTitle} (${view.slug}): ${view.subjectName}`,'',
    `Read from ${from}. The guide holds ${count(quotationsIn(view.compiled),'quotation')} in ${count(view.compiled.length,'reading')}; the plan (${plan.status}) keeps ${plan.quotations} in ${plan.readings} by the rule “${plan.rule}”: ${cutRules[plan.rule]}.`,
    `Outside quotations placed so far: ${plan.outside.length} of ${plan.quotations}.`,'',`Arc: ${view.arc}`,'',
    `The guide's own introduction, for reference (the plan needs one of its own, for these readings and their company): ${view.introduction}`,'',
    `The guide's own questions, for reference:`,...view.questions.map((q,i)=>`  ${i+1}. ${q}`),'','Parts and shares:'];
  let share=0;
  for(const part of parts){
    const mine=part.readings.filter(entry=>kept.has(entry.key)),placed=plan.outside.filter(placement=>mine.some(entry=>entry.key===placement.after)).length;
    lines.push(`  ${part.name}: ${part.aside?'':`share ${shares[share++]}, `}keeps ${quotationsIn(mine)} of ${count(quotationsIn(part.readings),'quotation')} (${mine.length} of ${count(part.readings.length,'reading')}); outside placed: ${placed}`);
  }
  lines.push('','Readings kept. [number in the guide] key · quotations · translation; then the wording as the guide shows it.');
  for(const part of parts){
    const mine=part.readings.filter(entry=>kept.has(entry.key));
    if(!mine.length)continue;
    lines.push('',`## ${part.name}`);
    if(part.note)lines.push(`Editor's note: ${part.note}`);
    for(const entry of mine){
      lines.push('',`[${entry.position}] ${entry.key} · ${entry.selectionIds.length}q · ${entry.source?rankName[authorizedRank(entry)]:'supplied quotation'}`,entry.text);
      for(const placement of here.get(entry.key)||[])lines.push(`  placed here: ${placement.id} (${relations[placement.relation]}), ${cite(placement.id)}`);
      for(const placement of elsewhere.get(entry.key)||[])lines.push(`  in ${placement.slug}: ${placement.id} (${relations[placement.relation]}), ${cite(placement.id)}: ${placement.why}`);
    }
  }
  return lines.join('\n')+'\n';
}

// ---- The library ----
export function findQuotations(outside,terms){
  const placedIn=new Map();
  for(const plan of outside.plans.values())for(const placement of plan.outside||[])(placedIn.get(placement.id)||placedIn.set(placement.id,[]).get(placement.id)).push(plan.slug);
  const wanted=terms.map(term=>term.toLowerCase());
  return Object.entries(outside.library.quotations).filter(([id,q])=>{
    const hay=[id,q.text,q.author,q.work,q.locator,q.tradition,q.kind,q.translator,q.currency].filter(Boolean).join(' ').toLowerCase();
    return wanted.every(term=>hay.includes(term));
  }).map(([id,q])=>`${id} · ${[q.author,q.work,q.locator,q.year].filter(Boolean).join(', ')} · ${q.tradition} · ${words(q.text)}w · ${rightsStatuses[q.rights.status]} · ${placedIn.has(id)?'placed in '+placedIn.get(id).join(', '):'not placed'} (recorded for ${outside.recordedFor.get(id)})\n   “${q.text.length>300?q.text.slice(0,300)+'…':q.text}”`);
}

const sourceLabels={'www.gutenberg.org':'Project Gutenberg','gutenberg.net.au':'Project Gutenberg Australia','en.wikisource.org':'Wikisource','www.biblegateway.com':'Bible Gateway','corpus.quran.com':'Quranic Arabic Corpus','www.sefaria.org':'Sefaria','archive.org':'Internet Archive',
  'penelope.uchicago.edu':'LacusCurtius','www.newadvent.org':'New Advent','classics.mit.edu':'Internet Classics Archive','sunnah.com':'Sunnah.com','www.srigranth.org':'SriGranth.org','www.accesstoinsight.org':'Access to Insight','www.presidency.ucsb.edu':'The American Presidency Project',
  'www.un.org':'United Nations','www.unesco.org':'UNESCO','www.law.cornell.edu':'Cornell Legal Information Institute','www.nps.gov':'National Park Service','www.poetryfoundation.org':'Poetry Foundation','poets.org':'Academy of American Poets','en.wikipedia.org':'Wikipedia','en.wikiquote.org':'Wikiquote','ccel.org':'Christian Classics Ethereal Library'};

// A phrase as it may stand on a page: any spacing, any style of quotation mark or dash, any capitals.
const loose=phrase=>new RegExp([...phrase.trim()].map(ch=>/\s/.test(ch)?'\\s+':"'’‘`′".includes(ch)?"['’‘`′]":'"“”„″'.includes(ch)?'["“”„″]':'-—–―'.includes(ch)?'\\s*[-—–―]+\\s*':ch.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('').replace(/(?:\\s\+)+/g,'\\s+'),'i');
const readable=body=>pageText(body).replace(/[\u00ad\u200b-\u200f\u2060\ufeff]/g,'').replace(/[\u00a0\u2000-\u200a\u202f\u3000]/g,' ');

// The wording between two phrases of a page, copied and never retyped. Several pairs are
// joined with the omission mark; verse keeps its lines. after: start below this marker.
// strip: patterns removed from the passage (verse numbers, note marks).
export function cutPassage(body,{segments,after,strip=[],verse=false}){
  let page=readable(body);
  if(after){const marker=loose(after).exec(page);if(!marker)throw Error(`The marker “${after}” is not on the page`);page=page.slice(marker.index+marker[0].length);}
  const parts=[];let from=0;
  for(const [start,end] of segments){
    const first=loose(start).exec(page.slice(from));
    if(!first)throw Error(`“${start}” is not on the page${from?' after the part before it':after?' after the marker':''}`);
    const begin=from+first.index,last=loose(end).exec(page.slice(begin));
    if(!last)throw Error(`“${end}” does not follow “${start}” on the page`);
    from=begin+last.index+last[0].length;parts.push(page.slice(begin,from));
  }
  return parts.map(part=>{
    for(const pattern of strip)part=part.replace(new RegExp(pattern,'gi'),'');
    if(verse)part=part.split('\n').map(line=>line.trim()).filter(Boolean).join(lineBreak);
    return part.replace(/\s+/g,' ').replace(/--+/g,'—').replace(/ ([;:!?])/g,'$1').trim();
  }).join(omission);
}

// A page around each phrase, to find the exact wording without reading the whole page.
export function passageContext(body,phrases,width=320,most=3){
  const page=readable(body).replace(/\s+/g,' '),lines=[`[${page.length} characters of text]`];
  for(const phrase of phrases){
    const matches=[...page.matchAll(new RegExp(loose(phrase).source,'gi'))];
    lines.push(`— “${phrase}”: ${matches.length?count(matches.length,'place'):'not on the page'}`);
    for(const match of matches.slice(0,most))lines.push(`  @${match.index}: …${page.slice(Math.max(0,match.index-width),match.index+match[0].length+width)}…`);
  }
  return lines.join('\n');
}

// Source pages are read once in a session.
async function sourcePage(root,url,browser){
  const file=path.join(workFolder(root),'cache','pages',createHash('sha1').update(url).digest('hex')+'.txt');
  try{return await fs.readFile(file,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
  const body=await readPage(url,browser?'browser':undefined);
  await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,body);
  return body;
}

// The two sources used most have their details ready: the King James Bible at Bible Gateway
// and Pickthall's Qur’an at the Quranic Arabic Corpus, where a verse stands whole.
const presets={
  kjv:reference=>({url:`https://www.biblegateway.com/passage/?search=${encodeURIComponent(reference)}&version=KJV`,after:'Update',strip:['\\d+\\s'],entry:{work:reference.replace(/-/g,'–'),translator:'King James Version',translationYear:'1611',kind:'sacred',rights:{status:'public-domain',note:'Translation of 1611.'}}}),
  pickthall:reference=>{
    const [chapter,verse]=reference.split(':');
    if(!/^\d+$/.test(chapter)||!/^\d+$/.test(verse||''))throw Error('--pickthall takes chapter:verse');
    return {url:`https://corpus.quran.com/translation.jsp?chapter=${chapter}&verse=${verse}`,after:'Pickthall:',whole:'Yusuf Ali:',entry:{work:`Qur’an ${chapter}:${verse}`,year:'7th century',sortYear:630,translator:'Marmaduke Pickthall',translationYear:'1930',tradition:'Qur’an and hadith',kind:'sacred',rights:{status:'public-domain',note:'Translation published 1930; translator d. 1936.'}}};
  }
};

// A library entry from a page and the details given: cut, checked against the page, validated.
export function quotationEntry(id,body,{url,options,preset={}}){
  const starts=options.from||[],ends=options.to||[];
  if(starts.length!==ends.length)throw Error('Give --from and --to in pairs');
  const after=one(options,'after')??preset.after,strip=[...(preset.strip||[]),...(options.strip||[])],verse=Boolean(options.verse);
  let segments=starts.map((start,i)=>[start,ends[i]]),textCut;
  if(!segments.length&&preset.whole){
    // The whole verse: from the translator's name to the next translator's.
    const page=readable(body).replace(/\s+/g,' '),begin=page.indexOf(preset.after),end=page.indexOf(preset.whole,begin);
    if(begin<0||end<0)throw Error('The verse is not on the page');
    textCut=page.slice(begin+preset.after.length,end).trim();
  }else{
    if(!segments.length)throw Error('Say where the passage starts and ends: --from <first words> --to <last words>');
    textCut=cutPassage(body,{segments,after,strip,verse});
  }
  const repair=(options.fix||[]).map(pair=>{const parts=pair.split('=>');if(parts.length!==2||!parts[0]||!parts[1])throw Error('--fix takes “page reading=>correct reading”');return parts;});
  for(const [read,correct] of repair){if(!textCut.includes(read))throw Error(`“${read}” is not in the passage`);textCut=textCut.replaceAll(read,correct);}
  const host=new URL(url).host,label=one(options,'label')??sourceLabels[host];
  if(!label)throw Error(`Name the site with --label (${host} is new here)`);
  const source={url,label,checked:today(),status:options.secondary?'secondary':'primary'};
  if(options.browser)source.fetch='browser';
  if(strip.length)source.strip=strip;
  if(after)source.after=after;
  if(repair.length)source.repair=repair;
  const given=name=>one(options,name),sortYear=given('sort-year')??preset.entry?.sortYear,rights=given('rights')?{status:given('rights'),note:given('rights-note')}:preset.entry?.rights;
  const entry={text:textCut,...(verse?{verse:true}:{}),author:given('author'),work:given('work')??preset.entry?.work,locator:given('locator'),year:given('year')??preset.entry?.year,sortYear:sortYear===undefined?undefined:Number(sortYear),
    translator:given('translator')??preset.entry?.translator,translationYear:given('translation-year')??preset.entry?.translationYear,tradition:given('tradition')??preset.entry?.tradition,kind:given('kind')??preset.entry?.kind,source,rights,currency:given('currency'),caveat:given('caveat')};
  for(const key of Object.keys(entry))if(entry[key]===undefined)delete entry[key];
  if(!entry.rights)throw Error('Say what the rights are: --rights public-domain|public-domain-us|open-licence|in-copyright --rights-note <why>');
  validateOutsideLibrary({format:1,quotations:{[id]:entry}});
  const found=findQuotation(body,entry);
  if(!found.found)throw Error(`The passage cut does not check against its page (${found.missing[0].slice(0,80)}…). A --strip pattern meets the page in lower case, single-spaced and without space before punctuation.`);
  return entry;
}

// ---- Placing ----
// Reading numbers are the guide's own, as the brief shows them.
export function placeQuotation(plan,view,library,{id,after,responds=[],relation,why,first=false}){
  const keyOf=number=>{const entry=view.compiled[Number(number)-1];if(!entry||!plan.kept.includes(entry.key))throw Error(`Reading ${number} is not among the readings kept`);return entry.key;};
  if(!library.quotations[id])throw Error(`${id} is not recorded; record it first`);
  const placement={id,after:keyOf(after),responds:[...new Set([keyOf(after),...responds.map(keyOf)])],relation,why};
  const others=plan.outside.filter(other=>other.id!==id),place=key=>plan.kept.indexOf(key);
  // In reading order; within a reading, in the order placed unless it is to come first.
  let at=others.findIndex(other=>first?place(other.after)>=place(placement.after):place(other.after)>place(placement.after));
  if(at<0)at=others.length;
  return {...plan,outside:[...others.slice(0,at),placement,...others.slice(at)]};
}

// ---- Checking ----
// What a finished plan holds, for the session and for the pull request.
export function planSummary(view,plan,library){
  const kept=new Set(plan.kept),placed=plan.outside.map(placement=>({placement,quotation:library.quotations[placement.id]})),lines=[];
  lines.push(`**${view.displayTitle}** (\`${view.slug}\`): ${count(plan.quotations,'quotation')} of the guide’s ${quotationsIn(view.compiled)} in ${count(plan.readings,'reading')} (rule: ${plan.rule}), with ${count(placed.length,'quotation')} from beyond the Bahá’í writings.`,'');
  const parts=guideParts(view,plan.rule).filter(part=>!part.aside);
  if(parts.length>1){
    lines.push('| Part | Guide’s quotations | Outside quotations |','|---|---|---|');
    for(const part of parts){const mine=part.readings.filter(entry=>kept.has(entry.key));lines.push(`| ${part.name} | ${quotationsIn(mine)} | ${plan.outside.filter(placement=>mine.some(entry=>entry.key===placement.after)).length} |`);}
    lines.push('');
  }
  if(placed.length){
    lines.push(`- Relation: ${listed(tally(placed,p=>relations[p.placement.relation]))}`,`- Tradition or setting: ${listed(tally(placed,p=>p.quotation.tradition))}`,`- Kind: ${listed(tally(placed,p=>kinds[p.quotation.kind]))}`,
      `- Written: ${eras.map(era=>era[1]).map(era=>[era,placed.filter(p=>eraOf(p.quotation.sortYear)===era).length]).filter(([,n])=>n).map(([era,n])=>`${era} ${n}`).join(', ')}`,
      `- Rights: ${listed(tally(placed,p=>rightsStatuses[p.quotation.rights.status]))}`,`- Checked against: ${listed(tally(placed,p=>sourceStatuses[p.quotation.source.status]))}`);
  }
  const unplaced=Object.keys(plan.library||{}).filter(id=>!plan.outside.some(placement=>placement.id===id));
  if(unplaced.length)lines.push(`- Recorded for this guide and not placed: ${unplaced.length}`);
  if(plan.shortfall)lines.push(`- Fewer than the guide’s own: ${plan.shortfall}`);
  return lines.join('\n');
}

// What stands between a plan and publication.
export function planProblems(view,plan,library){
  const problems=[],cut=currentCut(view,plan);
  if(!cut.same)problems.push(`The rule “${plan.rule}” now keeps ${cut.readings.length} readings that differ from the plan’s ${plan.kept.length}: the guide has changed. Run brief with --recut and review the placements.`);
  try{validateOutsidePlan({...plan,status:'published'},library,view.compiled.filter(entry=>plan.kept.includes(entry.key)));}catch(error){problems.push(error.message);}
  const unanswered=plan.kept.filter(key=>!plan.outside.some(placement=>placement.responds.includes(key))).length;
  return {problems,notes:unanswered?[`${count(unanswered,'reading')} kept ${unanswered===1?'has':'have'} no outside quotation chosen for ${unanswered===1?'it':'them'} (allowed; look once more before publishing).`]:[]};
}

// ---- A page to look at before the site builds it ----
const fonts='https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400..800;1,400..800&display=swap';
export async function previewDocument(root,view,plan,library,base,fragment=false){
  const articles=new Map([...view.articles].map(([position,html])=>[position,html.replaceAll('href="../',`href="${base}`)]));
  const page=outsideGuideBody({guide:view,articles,plan,library,subjectName:view.subjectName,links:{subject:`${base}subjects.html?subject=${encodeURIComponent(view.id)}`,complete:`${base}study-guides/${view.slug}.html`}});
  if(!page)throw Error(`${view.slug}: none of the plan’s readings is in the guide`);
  // The site's own stylesheet, with the reading face from a public font service and the
  // night colours following the reader's system where there is no switch.
  const site=await fs.readFile(path.join(root,'scripts','compilation-pilot.css'),'utf8'),night=[...site.matchAll(/^:root\[data-theme=dark\]\{([^}]*)\}/gm)].map(match=>match[1]).join(';');
  const css=site.replace(/@font-face\{[^}]*\}\n?/g,'').replaceAll('Reading,Georgia',"'EB Garamond',Georgia")+`\n@media (prefers-color-scheme:dark){:root:not([data-theme=light]){${night}}}\nbody{padding:0 16px}`;
  const script=await fs.readFile(path.join(root,'scripts','compilation-pilot-view.js'),'utf8');
  const head=`<title>${esc(view.displayTitle)}</title><meta name="claude:viewport-fit-sides" content="cover"><link rel="stylesheet" href="${fonts}"><style>${css}</style>`;
  const body=`<div class="pdf-view"><main id="main">${page.html}</main></div><script>${script}</script>`;
  return {...page,html:fragment?head+body:`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${head}</head><body>${body}</body></html>`};
}

// The overview lists every guide in its default order, with the quotations each shows.
export const overviewRows=html=>[...html.matchAll(/<li data-title="([^"]*)" data-quotations="(\d+)" data-total="(\d+)" data-centrality="(\d+)"[^>]*><a href="([a-z]+)-pdf\.html"/g)].map(match=>({title:decodeEntities(match[1]),quotations:Number(match[2]),total:Number(match[3]),centrality:Number(match[4]),slug:match[5]}));

// ---- The commands ----
async function loadGuide(root,slug,options){
  const guide=(await readGuides(root)).get(slug);
  if(!guide)throw Error(`There is no study guide named ${slug}`);
  const files=await builtFiles(root,options);
  return {files,view:await guideView(guide,files)};
}
const requirePlan=(outside,slug)=>{const plan=outside.plans.get(slug);if(!plan)throw Error(`No plan for ${slug} yet: run brief ${slug}`);return plan;};

const commands={
  async status(root,_,options){
    const files=await builtFiles(root,options),rows=overviewRows((await files.get('study-guides/index.html')).toString()),outside=await readOutside(root);
    const state=row=>outside.plans.get(row.slug)?.status||'';
    const done=rows.filter(row=>state(row)==='published'),drafts=rows.filter(row=>state(row)==='draft'),open=rows.filter(row=>!state(row));
    console.log(`${rows.length} guides in the overview (${files.from}): ${done.length} read with outside quotations, ${drafts.length} in draft, ${open.length} to do.`);
    if(drafts.length)console.log('In draft: '+drafts.map(row=>row.slug).join(', '));
    console.log(`Next in the overview's order${options.all?'':' (first 15; --all for every one)'}:`);
    for(const row of options.all?open:open.slice(0,15))console.log(`  ${row.slug} · ${row.title} · ${row.quotations>quotationLimit?`${row.quotations} quotations, to be cut to ${quotationLimit}`:count(row.quotations,'quotation')} · ${row.centrality} connected`);
  },
  async brief(root,[slug],options){
    const {files,view}=await loadGuide(root,slug,options),outside=await readOutside(root);
    let plan=outside.plans.get(slug);
    if(!plan||options.recut){
      const fresh=startPlan(view,Number(one(options,'limit')??plan?.limit??quotationLimit));
      // A new cut keeps the placements whose readings are still kept.
      plan=plan?{...plan,...fresh,status:plan.status,introduction:plan.introduction,questions:plan.questions,library:plan.library,outside:plan.outside.filter(p=>fresh.kept.includes(p.after)).map(p=>({...p,responds:p.responds.filter(key=>fresh.kept.includes(key))}))}:fresh;
      await writePlan(root,plan);
      console.log(`${outside.plans.has(slug)?'Cut again':'Started'} study-guides/outside/${slug}.json`);
      outside.plans.set(slug,plan);
    }else if(!currentCut(view,plan).same)console.log('The guide has changed since this plan was written: its rule now keeps other readings. Run brief with --recut to follow it.');
    const file=path.join(workFolder(root),slug+'.brief.md');
    await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,briefText(view,plan,outside,files.from));
    console.log(`${view.displayTitle}: ${count(plan.quotations,'quotation')} kept of ${quotationsIn(view.compiled)} (${count(plan.readings,'reading')}, rule “${plan.rule}”); ${plan.outside.length} outside quotations placed.\nRead ${path.relative(root,file)}`);
  },
  async find(root,terms){
    if(!terms.length)throw Error('Give one or more words to look for');
    const lines=findQuotations(await readOutside(root),terms);
    console.log(lines.length?lines.join('\n'):'Nothing recorded matches.');
  },
  async show(root,[url,...phrases],options){
    if(!url||!phrases.length)throw Error('Give the page address and at least one phrase');
    console.log(passageContext(await sourcePage(root,url,options.browser),phrases,Number(one(options,'width')??320)));
  },
  async record(root,args,options){
    const [slug,id]=args,outside=await readOutside(root),plan=requirePlan(outside,slug);
    const kind=['kjv','pickthall'].find(name=>options[name]),preset=kind?presets[kind](one(options,kind)):{},url=args[2]??preset.url;
    if(!id||!url)throw Error('Give the guide, an id for the quotation, and the page address');
    const known=outside.library.quotations[id];
    if(known&&!plan.library?.[id])throw Error(`${id} is already recorded (for ${outside.recordedFor.get(id)}): place it, or choose another id`);
    const entry=quotationEntry(id,await sourcePage(root,url,options.browser),{url,options,preset});
    const same=Object.entries(outside.library.quotations).find(([other,q])=>other!==id&&q.source.url===url&&q.text===entry.text);
    if(same)throw Error(`This passage is already recorded as ${same[0]}`);
    await writePlan(root,{...plan,library:{...plan.library,[id]:entry}});
    const traditions=new Set(Object.values(outside.library.quotations).map(q=>q.tradition));
    console.log(`Recorded ${id} (${count(words(entry.text),'word')}, ${rightsStatuses[entry.rights.status]}):\n“${entry.text}”${traditions.has(entry.tradition)?'':`\nNote: “${entry.tradition}” is a new tradition or setting. Those in use: ${[...traditions].sort().join('; ')}`}`);
  },
  async place(root,[slug,id],options){
    const outside=await readOutside(root),plan=requirePlan(outside,slug),{view}=await loadGuide(root,slug,options);
    const relation=one(options,'relation'),why=one(options,'why'),after=one(options,'after');
    if(!id||!after||!relation||!why)throw Error('Give the quotation, --after <reading>, --relation adjacent|contrast|complement and --why <note>');
    const next=placeQuotation(plan,view,outside.library,{id,after,responds:(options.with||[]).flatMap(value=>value.split(',')).filter(Boolean),relation,why,first:options.first});
    validateOutsidePlan({...next,status:'draft'},outside.library,view.compiled.filter(entry=>next.kept.includes(entry.key)));
    await writePlan(root,next);
    console.log(`${id} follows reading ${after}; ${next.outside.length} of ${next.quotations} placed.`);
  },
  async unplace(root,[slug,id]){
    const plan=requirePlan(await readOutside(root),slug);
    if(!plan.outside.some(placement=>placement.id===id))throw Error(`${id} is not placed in ${slug}`);
    await writePlan(root,{...plan,outside:plan.outside.filter(placement=>placement.id!==id)});
    console.log(`${id} is no longer placed (it stays recorded).`);
  },
  async set(root,[slug,field,...values]){
    const plan=requirePlan(await readOutside(root),slug);
    if(!['introduction','questions','shortfall'].includes(field)||!values.length)throw Error('set <slug> introduction <paragraph> | questions <question> ... | shortfall <sentence>');
    await writePlan(root,{...plan,[field]:field==='questions'?values:values.join(' ')});
    console.log(`${field} set.`);
  },
  async check(root,[slug],options){
    const outside=await readOutside(root),plan=requirePlan(outside,slug),{files,view}=await loadGuide(root,slug,options);
    const {problems,notes}=planProblems(view,plan,outside.library);
    console.log(planSummary(view,plan,outside.library));
    let changed=0;
    if(!options.offline){
      const results=await verifyOutsideQuotations(outside.library,{ids:guideQuotationIds(plan),log:line=>{if(!line.startsWith('found'))console.log(line);}});
      const tallyOf=state=>results.filter(result=>result.state===state).length;changed=tallyOf('changed');
      console.log(`- Wording checked against its pages: ${tallyOf('found')} found, ${changed} not found, ${tallyOf('unreachable')} pages unreachable`);
      if(changed)problems.push(`${count(changed,'quotation')} no longer found on ${changed===1?'its page':'their pages'}`);
    }
    if(plan.outside.length){
      const preview=await previewDocument(root,view,plan,outside.library,files.base,options.fragment),file=path.join(workFolder(root),slug+(options.fragment?'.fragment':'')+'.html');
      await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,preview.html);
      console.log(`\nPreview: ${path.relative(root,file)}`);
    }
    for(const note of notes)console.log('Note: '+note);
    if(problems.length){console.log('\nBefore this guide can be published:\n'+problems.map(problem=>'  - '+problem).join('\n'));process.exitCode=1;}
    else if(options.publish){await writePlan(root,{...plan,status:'published'});console.log('\nThe plan is marked published: the site builds this guide with its outside quotations once the change is merged.');}
    else console.log(`\nNothing stands in the way${plan.status==='published'?'; the plan is published.':'. Run check with --publish to mark the plan published.'}`);
  }
};

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  // Behind a proxy Node reads it from the environment only when told to at start.
  if((process.env.HTTPS_PROXY||process.env.https_proxy)&&!process.env.NODE_USE_ENV_PROXY)
    process.exit(spawnSync(process.execPath,process.argv.slice(1),{stdio:'inherit',env:{...process.env,NODE_USE_ENV_PROXY:'1',NODE_NO_WARNINGS:'1'}}).status??1);
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),[command,...rest]=process.argv.slice(2);
  try{
    if(!Object.hasOwn(commands,command||''))throw Error('Commands: '+Object.keys(commands).join(', ')+'. See OUTSIDE.md.');
    const {plain:args,options}=parseArguments(rest);
    await commands[command](root,args,options);
  }catch(error){console.error(error.message);process.exitCode=1;}
  finally{await closeBrowser();}
}
