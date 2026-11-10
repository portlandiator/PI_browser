// Passages added to subject compilations by an editor on the website's Review
// quoted passages page. They are ordinary editorial selections, like the
// reviewed additions in the extract archive, but kept in their own small file
// (data/subject-additions.json) so that a publication adds readable JSON rather
// than a new copy of the archive. Each one's exact ranges are a confirmed
// decision in data/subject-edits.json, so a later translation correction renews
// it like any other quotation, and a deletion removes it like any other.
import {createHash} from 'node:crypto';
import {recordFilename} from '../src/record-file.mjs';
import {parseCsv} from '../src/text.mjs';
import {confirmedCandidate,additionKey,additionExcerpt} from '../src/passage-review-core.mjs';
import {digest,tokens} from './subject-core.mjs';

export const additionsFile='data/subject-additions.json';
export const additionIdSync=(subject,candidate)=>createHash('sha256').update(additionKey(subject,candidate)).digest('hex').slice(0,24);
const wordingKey=text=>tokens(text).map(t=>t.word).join(' ');
const location=c=>JSON.stringify([c.source,c.ranges.map(r=>[r.paragraph,r.start,r.end])]);
// Keep the file's own line endings, as the other data files do.
export const jsonText=(original,data)=>(JSON.stringify(data,null,2)+'\n').replaceAll('\n',original?.includes('\r\n')?'\r\n':'\n');

// The subjects as build-subjects.mjs identifies them (a repeated category keeps
// a distinct ID), with the CSV row and address the selections record.
export function subjectTable(csv){
  const seen=new Set();
  return new Map(parseCsv(csv).map((row,i)=>{
    const categoryId=new URLSearchParams(new URL(row.hyperlink).hash.replace(/^#\??/,'')).get('category');
    const id=seen.has(categoryId)?categoryId+'-'+digest(row.subject).slice(0,8):categoryId;seen.add(categoryId);
    return [id,{id,name:row.subject,row:i+2,url:row.hyperlink}];
  }));
}

// The additions file as the build reads it: checked selections for known
// subjects. Deleted ones (extract-review-decisions.json) are left out, as the
// archive leaves out its deleted rows.
export function parseAdditions(text,subjects,decisions={},excluded=new Set()){
  if(text==null)return {selections:[],deleted:[]};
  const data=JSON.parse(String(text));
  if(data?.format!==1||!Array.isArray(data.selections))throw Error('Invalid subject additions file');
  const known=new Set(subjects.map(s=>s.id)),deleted=new Set(decisions.deletedIds||[]),seen=new Set(),selections=[],removed=[];
  for(const s of data.selections){
    if(!/^[a-f0-9]{24}$/.test(s?.id||'')||seen.has(s.id)||!known.has(s.subject)||s.provenance?.sourceCollection!=='editorial'||typeof s.excerpt!=='string'||!s.excerpt||!Array.isArray(s.suppliedIds))throw Error('Invalid subject addition '+(s?.id||''));
    if(excluded.has(s.id))throw Error('Excluded quotation remains in the subject additions '+s.id);
    seen.add(s.id);
    if(deleted.has(s.id)){removed.push(s.id);continue;}
    selections.push({...s,reviewNote:decisions.notes?.[s.id]||s.reviewNote||''});
  }
  return {selections,deleted:removed};
}

// Turn the additions of a browser export into selections and confirmed
// decisions, checked against the published website: the source text must still
// be the version the editor saw, and a subject gets each passage once. Nothing
// is written here. `site(name)` reads the website (parsed JSON or null) and
// `read(name)` the published repository (Buffer or null).
export async function planAdditions({additions,subjects,site,read}){
  const existingText=(await read(additionsFile))?.toString('utf8');
  const existing=existingText?JSON.parse(existingText):{format:1,selections:[]};
  if(existing.format!==1||!Array.isArray(existing.selections))throw Error('The published '+additionsFile+' is not understood.');
  const have=new Set(existing.selections.map(s=>s.id));
  const added=[],matches={},skipped=[],done=[],records=new Map(),compilations=new Map();
  const once=(map,key,load)=>{if(!map.has(key))map.set(key,load());return map.get(key);};
  for(const [id,addition] of Object.entries(additions)){
    const subject=subjects.get(addition.subject);
    const skip=reason=>skipped.push({id,subject:subject?.name||addition.subject,source:addition.candidate?.source||'',reason});
    if(!subject){skip('its subject is not in the subject list.');continue;}
    if(additionIdSync(addition.subject,addition.candidate)!==id){skip('its identity does not match its subject and ranges; add it again on the review page.');continue;}
    if(have.has(id)){done.push(id);skip('already published.');continue;}
    const record=await once(records,addition.candidate.source,()=>site('data/'+recordFilename(addition.candidate.source)));
    if(!record){skip(`the website has no record ${addition.candidate.source}.`);continue;}
    let candidate;
    try{candidate=confirmedCandidate(addition.candidate,record);}
    catch(error){skip(error.message+' Load the passage again on the review page and add it anew.');continue;}
    const compilation=await once(compilations,subject.id,()=>site(`subjects/${subject.id}.json.gz`));
    if(!compilation)throw Error(`The website has no compilation for subject “${subject.name}”.`);
    const excerpt=additionExcerpt(candidate),wording=wordingKey(excerpt),where=location(candidate);
    const same=compilation.selections.find(s=>s.id===id||wordingKey(s.excerpt||'')===wording||(['exact','normalized','confirmed'].includes(s.status)&&s.candidates?.[0]&&location(s.candidates[0])===where));
    if(same){
      if(same.id===id){done.push(id);skip('already published.');}
      else if(same.status==='rejected')skip(`the subject has this wording as a rejected quotation (selection ${same.id}); restore that decision on the review page instead.`);
      else skip(`the subject already quotes this passage (selection ${same.id}).`);
      continue;
    }
    const raw=`${excerpt}  ${candidate.source}`;
    added.push({raw,original:raw,excerpt,reference:candidate.source,suppliedIds:[candidate.source],outsideAuthor:false,id,subject:subject.id,
      reviewNote:addition.note||'Added on the Review quoted passages page.',
      provenance:{sourceCollection:'editorial',sourceFilename:additionsFile,sourceVersion:candidate.version,subjectFilename:'14-colors_and_hyperlinks.csv',subjectRow:subject.row,subjectUrl:subject.url,candidateId:candidate.ranges[0].paragraphId,addedAt:typeof addition.addedAt==='string'?addition.addedAt:new Date().toISOString()},
      preserveBoundaries:true});
    matches[id]={status:'confirmed',candidate,note:addition.note||'Passage added to the subject compilation on the Review quoted passages page.'};
    done.push(id);
  }
  const text=added.length?jsonText(existingText,{...existing,selections:[...existing.selections,...added]}):null;
  const summary=added.map(s=>({id:s.id,subject:subjects.get(s.subject).name,source:s.suppliedIds[0],paragraphs:[...new Set(matches[s.id].candidate.ranges.map(r=>r.paragraph))],excerpt:s.excerpt}));
  return {added,matches,skipped,done,text,summary};
}

// The pull request description for added passages.
export function additionsBody({summary,skipped}){
  const short=text=>text.length>160?text.slice(0,159)+'…':text;
  const lines=[];
  if(summary.length)lines.push(`**Passages added to subject compilations (${summary.length}):**\n`+summary.map(a=>`- ${a.subject}: \`${a.source}\` ¶${a.paragraphs.join(', ')} — “${short(a.excerpt)}”`).join('\n'));
  if(skipped.length)lines.push('Added passages not included:\n'+skipped.map(s=>`- ${s.subject} (\`${s.source}\`): ${s.reason}`).join('\n'));
  if(summary.length)lines.push('Each added passage is an editorial selection in `data/subject-additions.json` with its confirmed ranges in `data/subject-edits.json`. A study guide of its subject receives it as a reading left out; show it with Edit-Study-Guide.cmd.');
  return lines.join('\n\n');
}
