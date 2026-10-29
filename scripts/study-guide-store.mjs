import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {writeZip} from './zip-archive.mjs';

// Editorial text of the study guides lives in study-guides/editorial.json and
// the numbered *-batch.json files. The editor changes the wording, the reading
// order, which sentences of a reading are shown (`shortened`) and whether a
// reading is left out (`omitted`); the reviewed quotations themselves, the
// subject, the link name and the neighbors' evidence stay exactly as reviewed.
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const guideFiles=async directory=>['editorial.json',...(await fs.readdir(directory)).filter(name=>name.endsWith('-batch.json')).sort()];

export function maxQuestions(readingEntries){return Math.min(6,Math.max(0,readingEntries-1));}
export function minQuestions(readingEntries){return Math.min(3,maxQuestions(readingEntries));}
export const shownReadings=guide=>guide.order.filter(x=>!x.omitted).length;

// Reading entries whose kept sentences or omission changed in a way that needs
// the source text to check (restoring a whole reading never does).
export function changedReadings(original,edited){
  const before=new Map(original.order.map(x=>[x.key,x]));
  return (Array.isArray(edited?.order)?edited.order:[]).filter(x=>{
    const old=before.get(x?.key);if(!old)return false;
    return (x.shortened!==undefined&&JSON.stringify(x.shortened)!==JSON.stringify(old.shortened))||(x.omitted===true&&!old.omitted);
  }).map(x=>x.key);
}

const text=(value,label,{multiline=true}={})=>{
  if(typeof value!=='string'||!value.trim())throw Error(`${label} cannot be empty.`);
  if(!multiline&&/[\r\n]/.test(value))throw Error(`${label} must be a single paragraph (no line breaks).`);
  if(value!==value.trim())throw Error(`${label} must not start or end with spaces or blank lines.`);
  return value;
};

// Apply the same rules the site build enforces, so a saved guide does not stop
// the next deployment. `original` is the guide as last published.
// `verified` lists the reading entries whose new kept sentences or omission
// were checked against the source text (see study-guide-passage.mjs).
export function checkGuide(original,edited,{verified=new Set()}={}){
  const fail=message=>{throw Error(message);};
  if(!edited||typeof edited!=='object')fail('The guide is missing.');
  const allowed=new Set(['displayTitle','introduction','arc','order','questions','neighbors','references']);
  for(const key of new Set([...Object.keys(original),...Object.keys(edited)]))
    if(!allowed.has(key)&&JSON.stringify(original[key])!==JSON.stringify(edited[key]))fail(`“${key}” cannot be changed in this editor.`);
  const title=text(edited.displayTitle,'The title',{multiline:false});
  const introduction=text(edited.introduction,'The introduction',{multiline:false});
  const arc=text(edited.arc,'The reading arc',{multiline:false});
  // Reading order: every reading entry exactly once, supplied quotations last.
  if(!Array.isArray(edited.order)||edited.order.length!==original.order.length)fail('Every reading entry must stay in the guide exactly once.');
  const keys=original.order.map(x=>x.key);
  if(new Set(edited.order.map(x=>x?.key)).size!==keys.length||edited.order.some(x=>!keys.includes(x?.key)))fail('Every reading entry must stay in the guide exactly once.');
  let unlinked=false;
  const order=edited.order.map((entry,i)=>{
    const before=original.order.find(x=>x.key===entry.key);
    if(Object.keys(entry).some(k=>!['key','why','shortened','omitted','sourceQuestion'].includes(k)))fail('Reading entries can only be moved, shortened, left out or have their note changed.');
    if(entry.sourceQuestion!==undefined&&JSON.stringify(entry.sourceQuestion)!==JSON.stringify(before.sourceQuestion))fail('The reviewed source question cannot be changed in this editor.');
    // New kept sentences or a new omission must have been checked against the source.
    if(entry.shortened!==undefined){
      if(!Array.isArray(entry.shortened)||!entry.shortened.length||entry.shortened.some(t=>typeof t!=='string'||!t.trim()))fail(`The kept sentences of reading ${i+1} are invalid.`);
      if(JSON.stringify(entry.shortened)!==JSON.stringify(before.shortened)&&!verified.has(entry.key))fail(`The kept sentences of reading ${i+1} could not be checked against the source text. Reload the guide and try again.`);
    }
    if(entry.omitted!==undefined&&entry.omitted!==true)fail(`Reading ${i+1} is either left out or not.`);
    if(entry.omitted&&!before.omitted&&!verified.has(entry.key))fail(`Leaving out reading ${i+1} could not be checked against the source text. Reload the guide and try again.`);
    text(entry.why,`The note for reading ${i+1}`,{multiline:false});
    if(entry.key.startsWith('selection:'))unlinked=true;
    else if(unlinked)fail(`Reading ${i+1} is linked to a catalog source, so it must come before the supplied quotations (“Further quotations”).`);
    const {key,why,shortened,omitted}=entry;
    return {key,why,...(shortened!==undefined&&{shortened}),...(omitted&&{omitted}),...(before.sourceQuestion&&{sourceQuestion:structuredClone(before.sourceQuestion)})};
  });
  const shown=shownReadings(edited);
  if(!shown)fail('At least one reading must stay in the guide.');
  // Questions: the build allows up to one fewer than the readings shown (at most 6).
  const most=maxQuestions(shown),least=minQuestions(shown);
  if(!Array.isArray(edited.questions))fail('Questions are missing.');
  edited.questions.forEach((q,i)=>text(q,`Question ${i+1}`,{multiline:false}));
  if(edited.questions.length<least||edited.questions.length>most)fail(least===most?`This guide must have exactly ${most} question${most===1?'':'s'}.`:`This guide needs ${least} to ${most} questions (it shows ${shown} readings).`);
  if(new Set(edited.questions).size!==edited.questions.length)fail('Two questions are identical.');
  // Neighbors: only the (optional) invitation wording is editorial.
  if(!Array.isArray(edited.neighbors)||edited.neighbors.length!==original.neighbors.length)fail('Neighboring subjects cannot be added or removed here.');
  const neighbors=edited.neighbors.map((n,i)=>{
    const before=original.neighbors[i];
    if(!n||[...Object.keys(n),...Object.keys(before)].some(k=>k!=='invitation'&&JSON.stringify(n[k])!==JSON.stringify(before[k])))fail('Only the invitation text of a neighboring subject can be changed.');
    const {invitation,...rest}=n;
    // An emptied invitation is removed; the guide then lists the subject alone.
    if(invitation===undefined||invitation==='')return rest;
    text(invitation,`The invitation for neighbor ${i+1}`,{multiline:false});
    return {...n};
  });
  // Comparative reading: [n] in the introduction refers to the n-th reference.
  if(!Array.isArray(edited.references))fail('References are missing.');
  edited.references.forEach((r,i)=>{
    if(!r||Object.keys(r).some(k=>!['label','url','note','verified'].includes(k)))fail(`Reference ${i+1} has unexpected fields.`);
    // A reviewer's verification note belongs to the address it checked.
    if('verified' in r&&!original.references.some(o=>o.url===r.url&&o.verified===r.verified))fail(`Reference ${i+1} keeps a verification note for a different web address.`);
    text(r.label,`Reference ${i+1} label`,{multiline:false});text(r.note,`Reference ${i+1} note`,{multiline:false});
    let url;try{url=new URL(r.url);}catch{fail(`Reference ${i+1} needs a complete web address (https://…).`);}
    if(!['https:','http:'].includes(url.protocol))fail(`Reference ${i+1} must be an http or https address.`);
  });
  for(const [,n] of introduction.matchAll(/\[(\d+)\]/g))if(Number(n)<1||Number(n)>edited.references.length)fail(`The introduction cites [${n}], but there ${edited.references.length===1?'is 1 reference':'are '+edited.references.length+' references'}.`);
  // The introduction and questions appear only in the study guide (PDF) view.
  const regular=[title,arc,...order.filter(x=>!x.omitted).map(x=>x.why)];
  if(regular.some(t=>t.includes(introduction))||edited.questions.some(q=>regular.some(t=>t.includes(q))))fail('The introduction and questions must not repeat the title, arc or reading notes word for word.');
  return {...original,...Object.fromEntries([...allowed].map(k=>[k,edited[k]])),order,neighbors};
}

export class GuideStore{
  constructor(root){this.root=path.resolve(root);this.directory=path.join(this.root,'study-guides');}
  async files(){
    const result=[];
    for(const name of await guideFiles(this.directory)){
      const bytes=await fs.readFile(path.join(this.directory,name));
      result.push({name,bytes,data:JSON.parse(bytes.toString('utf8'))});
    }
    return result;
  }
  async list(){
    const guides=[];
    for(const file of await this.files())for(const s of file.data.subjects)guides.push({slug:s.slug,id:s.id,title:s.displayTitle,file:'study-guides/'+file.name,curated:Boolean(s.selection),readingEntries:shownReadings(s)});
    return guides.sort((a,b)=>a.title.localeCompare(b.title));
  }
  async find(slug){
    if(typeof slug!=='string'||!/^[a-z]+$/.test(slug))throw Error('Choose a study guide from the list.');
    const matches=[];
    for(const file of await this.files()){const index=file.data.subjects.findIndex(s=>s.slug===slug);if(index>=0)matches.push({...file,index});}
    if(matches.length!==1)throw Error(matches.length?'That study guide appears in more than one file.':'No study guide has that name.');
    const match=matches[0];
    return {...match,guide:match.data.subjects[match.index],revision:sha(match.bytes),file:'study-guides/'+match.name};
  }
  async load(slug){
    const {guide,revision,file}=await this.find(slug);
    const shown=shownReadings(guide);
    return {guide,revision,file,readingEntries:shown,questionLimits:[minQuestions(shown),maxQuestions(shown)]};
  }
  // `verify(guide,edited,keys)` checks changed kept sentences and omissions
  // against the source text and throws if one is not allowed.
  async save(slug,revision,edited,{verify}={}){
    const current=await this.find(slug);
    if(current.revision!==revision)throw Error('This guide’s file changed since you opened it (perhaps another guide in the same file was saved). Reload the guide; your edits have not been written.');
    const keys=changedReadings(current.guide,edited);
    if(keys.length&&verify)await verify(current.guide,edited,keys);
    const updated=checkGuide(current.guide,edited,{verified:new Set(verify?keys:[])});
    if(JSON.stringify(updated)===JSON.stringify(current.guide))return {...await this.load(slug),backup:null};
    const original=current.bytes.toString('utf8'),newline=original.includes('\r\n')?'\r\n':'\n';
    const data=structuredClone(current.data);data.subjects[current.index]=updated;
    const output=(JSON.stringify(data,null,2)+'\n').replaceAll('\n',newline);
    // One ZIP per backup (Dropbox syncs the project folder), holding the previous file under study-guides/.
    const backup=await writeZip(path.join(this.root,'.qa','guide-backups',new Date().toISOString().replaceAll(':','-')+'-'+randomUUID().slice(0,8)+'.zip'),[{name:'study-guides/'+current.name,bytes:current.bytes}]);
    // Write beside the file, then rename, so an interrupted save cannot leave half a file.
    const target=path.join(this.directory,current.name),temporary=target+'.'+randomUUID().slice(0,8)+'.tmp';
    await fs.writeFile(temporary,output,'utf8');
    await fs.rename(temporary,target);
    return {...await this.load(slug),backup:path.relative(this.root,backup)};
  }
}
