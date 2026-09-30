import fs from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {digest} from './subject-core.mjs';

export const publicExtractArchive='data/subject-extracts-public.json.gz';
export async function readPublicExtracts(root,subjects,decisions={}){
  let bytes;try{bytes=await fs.readFile(path.join(root,publicExtractArchive));}catch(error){if(error.code==='ENOENT')return null;throw error;}
  const archive=JSON.parse(gunzipSync(bytes));
  if(archive.format!==1||!Array.isArray(archive.selections)||!archive.report)throw Error('Invalid public extract archive');
  const bySubject=new Map(subjects.map(s=>[s.id,[]])),seen=new Set(),deleted=new Set(decisions.deletedIds||[]);
  const report=structuredClone(archive.report),excluded=new Set(report.deletedSelections||[]);
  report.duplicates=[];delete report.reviewCounts;
  for(const selection of archive.selections){
    if(!bySubject.has(selection.subject)||seen.has(selection.id)||!/^[a-f0-9]{24}$/.test(selection.id))throw Error('Invalid public extract identity '+selection.id);
    if(!['subjects_inv_length_ordered','Evernote_scrape'].includes(selection.provenance?.sourceCollection))throw Error('Invalid public extract provenance');
    seen.add(selection.id);
    if(excluded.has(selection.id))throw Error('Excluded quotation remains in public archive '+selection.id);
    if(deleted.has(selection.id)){excluded.add(selection.id);continue;}
    bySubject.get(selection.subject).push({...selection,reviewNote:decisions.notes?.[selection.id]||''});
  }
  report.deletedSelections=[...excluded];
  return {bySubject,report,version:digest(JSON.stringify([digest(bytes),decisions]))};
}
