// Publish what is waiting on this computer as one pull request: the catalog
// edits and deletions saved with Edit-Catalog-Item.cmd (the pending file), and
// the decisions exported from the website's editorial pages (Review subject
// connections, Review quoted passages, Editorial workspace). The exported
// subject-edits.json is checked, merged onto the published decisions (the
// export wins where both have an entry, and nothing published is lost);
// passages added on the Review quoted passages page become editorial
// selections (data/subject-additions.json) with confirmed decisions; the
// catalog edits are applied to the published source archive. Everything is
// shown as a summary, then proposed as a pull request; merging it publishes
// them, after GitHub has built and tested the result.
//
//   node scripts/publish-editorial-decisions.mjs [EXPORTED-FILE] [--yes] [--dry-run]
// Reads Downloads/subject-edits.json plus the newest separate browser export.
// An explicitly supplied export wins subject-decision conflicts. Legacy catalog
// edits are still readable until they are saved into the Downloads file.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import readline from 'node:readline/promises';
import {fileURLToPath} from 'node:url';
import {parseCsv} from '../src/text.mjs';
import {validateDraft,mergeDrafts} from '../src/relationship-review-core.mjs';
import {relationKey} from '../src/subject-relations.mjs';
import {prepareRepository,publishChanges,requireNoOpenProposals,githubAccount} from './publish-changes.mjs';
import {tool,withLock,jobFolder,withProgress} from './publish-tools.mjs';
import {githubTarget} from './github-target.mjs';
import {liveSite} from './catalog-deletion.mjs';
import {PendingCatalogEdits,publishedFiles,prepareCatalogProposal,catalogBody,conflictingEntries,applyLocally,settlePullRequest,withStage} from './catalog-edits.mjs';
import {editorialExports} from './editorial-exports.mjs';
import {additionsFile,planAdditions,subjectTable,additionsBody} from './subject-additions.mjs';

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target='data/subject-edits.json';
const plural=(n,word)=>`${n} ${word}${n===1?'':'s'}`;

export async function subjectIds(root,read=name=>fs.readFile(path.join(root,name),'utf8')){
  const rows=parseCsv(String(await read('14-colors_and_hyperlinks.csv')));
  return new Set(rows.map(row=>new URLSearchParams(new URL(row.hyperlink).hash.replace(/^#\??/,'')).get('category')));
}

function checkMatches(matches){
  for(const [id,match] of Object.entries(matches)){
    if(!/^[\w-]+$/.test(id)||!match||!['confirmed','rejected'].includes(match.status))throw Error(`Invalid passage decision ${id}: status must be confirmed or rejected.`);
    if(match.status==='confirmed'){
      const c=match.candidate;
      if(!c||typeof c.source!=='string'||!/^[a-f\d]{64}$/.test(c.version||'')||!Array.isArray(c.ranges)||!c.ranges.length||!c.ranges.every(r=>Number.isInteger(r.paragraph)&&Number.isInteger(r.start)&&Number.isInteger(r.end)&&r.end>r.start&&typeof r.text==='string'))
        throw Error(`Invalid confirmed passage ${id}: it needs a source, version and paragraph ranges.`);
    }
  }
}

// Returns the merged decisions and a summary of what changes.
export function mergeDecisions(published,incoming,ids){
  const checked=validateDraft(incoming,ids);checkMatches(checked.matches);
  const merged=mergeDrafts({reviewedSubjects:{},...published},{reviewedSubjects:{},...checked});
  // Added passages are published as selections (planAdditions), not kept as drafts.
  delete merged.additions;
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const before=new Map(published.relationships.map(e=>[relationKey(e),e]));
  const summary={
    newPassages:Object.keys(merged.matches).filter(id=>!published.matches[id]).length,
    changedPassages:Object.keys(merged.matches).filter(id=>published.matches[id]&&!same(published.matches[id],merged.matches[id])).length,
    newConnections:merged.relationships.filter(e=>!before.has(relationKey(e))).length,
    changedConnections:merged.relationships.filter(e=>before.has(relationKey(e))&&!same(before.get(relationKey(e)),e)).length,
    reviewProgress:Object.keys(merged.reviewedSubjects).filter(id=>published.reviewedSubjects?.[id]!==merged.reviewedSubjects[id]).length,
  };
  if(!published.reviewedSubjects&&!Object.keys(merged.reviewedSubjects).length)delete merged.reviewedSubjects;
  summary.total=Object.values(summary).reduce((a,b)=>a+b,0);
  return {merged,summary};
}

export function decisionsBody(summary,file){
  return `Editorial decisions exported from the website's review pages (\`${file}\`) and merged onto the published decisions in \`${target}\`. Published decisions are kept; where both have an entry, the export wins.

| Decisions | New | Changed |
| --- | ---: | ---: |
| Quoted passages (confirmed or rejected) | ${summary.newPassages} | ${summary.changedPassages} |
| Subject connections | ${summary.newConnections} | ${summary.changedConnections} |
| Subjects marked reviewed or unreviewed | ${summary.reviewProgress} | |${summary.addedPassages?`
| Passages added to subject compilations | ${summary.addedPassages} | |`:''}`;
}

// The title and branch kind of a publication, from what it contains.
// Added passages change the quotations of their subjects, so their pull
// request gets the study-guide reconciliation that catalog edits get.
export function publicationTitle({corrections=0,deletions=0,decisions=0,additions=0}){
  const parts=[corrections&&plural(corrections,'catalog correction'),deletions&&plural(deletions,'catalog deletion'),additions&&plural(additions,'added passage'),decisions&&plural(decisions,'editorial decision')].filter(Boolean);
  return {title:'Publish '+parts.join(', '),kind:corrections||deletions?'catalog-edits':additions?'passage-additions':'editorial-decisions'};
}

// Every decision in an export, by key, with a digest of the key and value.
// Browser exports keep every decision ever made, so a decision that has been
// published once (its digest is in `publishedDecisions`) is not proposed
// again: otherwise an old export would undo what was published after it, such
// as quotation ranges renewed by an approved translation correction.
const digest=(key,value)=>createHash('sha256').update(key+'\n'+JSON.stringify(value)).digest('hex').slice(0,20);
export function decisionDigests(value){
  return [
    ...Object.entries(value.matches||{}).map(([id,match])=>digest('match:'+id,match)),
    ...(value.relationships||[]).map(edge=>digest('connection:'+relationKey(edge),edge)),
    ...Object.entries(value.reviewedSubjects||{}).map(([id,reviewed])=>digest('reviewed:'+id,reviewed)),
  ];
}
// Added passages are recorded the same way once their pull request is merged.
export function additionDigests(value){
  return Object.entries(value.additions||{}).map(([id,addition])=>digest('addition:'+id,addition));
}
export function withoutPublished(value,published=[]){
  const done=new Set(published);
  if(!done.size)return value;
  return {...value,
    matches:Object.fromEntries(Object.entries(value.matches||{}).filter(([id,match])=>!done.has(digest('match:'+id,match)))),
    relationships:(value.relationships||[]).filter(edge=>!done.has(digest('connection:'+relationKey(edge),edge))),
    ...value.reviewedSubjects&&{reviewedSubjects:Object.fromEntries(Object.entries(value.reviewedSubjects).filter(([id,reviewed])=>!done.has(digest('reviewed:'+id,reviewed))))},
    ...value.additions&&{additions:Object.fromEntries(Object.entries(value.additions).filter(([id,addition])=>!done.has(digest('addition:'+id,addition))))},
  };
}
// Digests of export decisions that the published file already holds as they are.
export function alreadyPublished(published,exports){
  const current=new Set(decisionDigests(published));
  return [...new Set(exports.flatMap(entry=>decisionDigests(entry.value)).filter(d=>current.has(d)))];
}

// How many export decisions are left out as published although the published
// file now holds something else for them.
export function supersededDecisions(published,exports,done){
  const current=new Set(decisionDigests(published)),left=new Set(done);
  return new Set(exports.flatMap(entry=>decisionDigests(entry.value)).filter(d=>left.has(d)&&!current.has(d))).size;
}

export function mergeExportedDecisions(published,exports,ids,done=[]){
  let merged=published;
  for(const exported of exports)merged=mergeDecisions(merged,withoutPublished(exported.value,done),ids).merged;
  return mergeDecisions(published,merged,ids);
}

const describe=(catalog)=>{
  console.log('\nCatalog edits compared with the published catalog:');
  for(const e of catalog.edits)console.log(`  ${e.id}: ${e.changed.join('; ')}`);
  for(const d of catalog.deletions)console.log(d.archived?`  ${d.id}: deleted (${plural(d.quotations,'quotation')} from ${plural(d.subjects.length,'subject')}; ${plural(d.guides.length,'study guide')} changed)`:`  ${d.id}: not in the published catalog; removed from the source folders only`);
  for(const s of catalog.skipped)console.log(`  ${s.id}: ${s.applyOnly?'already matches the published catalog; written to the source folders only':'not included: '+s.reason}`);
};

// Write entries to the source folders, then settle them in the pending file:
// those only applied locally are done; those in the pull request record where
// they were written. An entry saved again meanwhile is left alone.
async function applyAndRecord(pending,entries,{included=[],pr=null}={}){
  const current=(await pending.read()).items;
  const ids=Object.keys(entries).filter(id=>current[id]?.savedAt===entries[id].savedAt);
  for(const id of Object.keys(entries))if(!ids.includes(id))console.log(`  ${id}: saved again in Edit-Catalog-Item while publishing; not written to the source folders.`);
  const notes=await applyLocally(projectRoot,Object.fromEntries(ids.map(id=>[id,entries[id]])));
  const backups=[...new Set(notes.map(n=>n.backup).filter(Boolean))];
  for(const note of notes)console.log('  '+(note.backup?note.text.replace(/ Backup: .*$/,''):note.text));
  if(backups.length)console.log('  Backup of the previous source files: '+backups.join(', '));
  const at=new Date().toISOString();
  await pending.update(data=>{
    for(const note of notes){
      const entry=data.items[note.id];if(!entry||entry.savedAt!==entries[note.id].savedAt)continue;
      if(!included.includes(note.id)){if(!note.failed)delete data.items[note.id];continue;}
      if(entry.publishedIn?.number===pr?.number)entry.applied={at,backup:note.backup||null,failed:note.failed||false};
    }
  });
  return notes;
}

async function main(args){
  const yes=args.includes('--yes'),dry=args.includes('--dry-run');
  const pending=new PendingCatalogEdits(projectRoot);
  const exports=await editorialExports({file:args.find(arg=>!arg.startsWith('--')),pendingPath:pending.file});
  console.log(exports.length?'Decisions files: '+exports.map(entry=>entry.file).join(', '):'No exported subject-edits.json in Downloads; publishing the pending catalog edits only.');
  const [git,gh,python]=await Promise.all(['git','gh','python'].map(name=>tool(name,projectRoot)));
  // Ask GitHub everything at once, while this folder is brought up to date.
  let repository,account;
  const checks=await Promise.allSettled([
    prepareRepository(projectRoot,[target]),
    (async()=>{
      repository=await githubTarget(projectRoot,{gh,git});
      const github={gh,repository:repository.repository};
      const results=await Promise.allSettled([withProgress('asking GitHub who is signed in',githubAccount(projectRoot,gh)),withProgress('checking the earlier pull request on GitHub',settlePullRequest(pending,{...github,root:projectRoot})),withProgress('checking GitHub for open pull requests',requireNoOpenProposals(projectRoot,github))]);
      const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
      account=results[0].value;
    })(),
  ]);
  const failed=checks.find(r=>r.status==='rejected');if(failed)throw failed.reason;
  const waiting=(await pending.read()).items;
  const ids=Object.keys(waiting);
  console.log(ids.length?`Pending catalog edits (${pending.file}): ${ids.join(', ')}`:'No catalog edits are pending (Edit-Catalog-Item.cmd lists them; an edit is pending once it is saved there).');
  if(!exports.length&&!ids.length)throw Error('Nothing to publish: no catalog edits are pending (save them with Edit-Catalog-Item.cmd) and no exported subject-edits.json was found in Downloads (use "Export decisions" on a review page, or drag the file onto this tool).');
  return withStage(async stage=>{
    const conflicts=await conflictingEntries(projectRoot,waiting);
    const entries=Object.fromEntries(Object.entries(waiting).filter(([id])=>!conflicts.some(c=>c.id===id)));
    const files=publishedFiles(projectRoot,git,'HEAD');
    // Merge exports first. Catalog corrections then renew these decisions;
    // an older browser export must not put obsolete ranges back afterwards.
    const site=liveSite(repository.site);
    let decisions=null,exported=[],additions=null,additionsBlob=null;
    if(exports.length){
      const publishedText=await files.read(target);
      if(!publishedText)throw Error('The published repository has no '+target+'.');
      const published=JSON.parse(String(publishedText));
      let done=(await pending.read()).publishedDecisions||[];
      const known=alreadyPublished(published,exports).filter(d=>!done.includes(d));
      if(known.length&&!dry){await pending.update(data=>{data.publishedDecisions=[...new Set([...(data.publishedDecisions||[]),...known])];});}
      done=[...done,...known];
      const {merged,summary}=mergeExportedDecisions(published,exports,await subjectIds(projectRoot,files.read),done);
      const superseded=supersededDecisions(published,exports,done);
      if(superseded)console.log(`\n${plural(superseded,'exported decision')} published earlier and changed on GitHub since (for example by a translation correction) ${superseded===1?'was':'were'} not proposed again. To change one, decide it again on the review page and export.`);
      exported=[...new Set(exports.flatMap(entry=>decisionDigests(withoutPublished(entry.value,done))))];
      // Passages added on the review page: checked against the website, then
      // selections in their own file with confirmed decisions among the others.
      const proposed=Object.assign({},...exports.map(entry=>withoutPublished(entry.value,done).additions||{}));
      if(Object.keys(proposed).length){
        console.log('\nChecking the added passages against the website…');
        additions=await planAdditions({additions:proposed,subjects:subjectTable(String(await files.read('14-colors_and_hyperlinks.csv'))),site,read:files.read});
        Object.assign(merged.matches,additions.matches);
        summary.addedPassages=additions.added.length;summary.total+=additions.added.length;
        if(additions.text){files.overlay.set(additionsFile,additions.text);additionsBlob=path.join(stage,'subject-additions.json');await fs.writeFile(additionsBlob,additions.text);}
        const digestsOf=entry=>Object.entries(withoutPublished(entry.value,done).additions||{}).filter(([id])=>additions.done.includes(id)).map(([id,addition])=>digest('addition:'+id,addition));
        exported.push(...new Set(exports.flatMap(digestsOf)));
      }
      if(summary.total){files.overlay.set(target,JSON.stringify(merged,null,2)+'\n');decisions=summary;}
      else exported=[];
      console.log(`\nChanges compared with the published decisions:
  passage decisions: ${summary.newPassages} new, ${summary.changedPassages} changed
  subject connections: ${summary.newConnections} new, ${summary.changedConnections} changed
  subjects marked reviewed/unreviewed: ${summary.reviewProgress}`);
      if(additions){
        console.log(`  passages added to subject compilations: ${additions.added.length}`);
        for(const a of additions.summary)console.log(`    ${a.subject}: ${a.source} ¶${a.paragraphs.join(', ')} “${a.excerpt.length>90?a.excerpt.slice(0,89)+'…':a.excerpt}”`);
        for(const s of additions.skipped)console.log(`    not included, ${s.subject} (${s.source}): ${s.reason}`);
      }else console.log(`  passages added to subject compilations: none in ${exports.length===1?'this file':'these files'}. A passage added on the Review quoted passages page stays in the browser until you click Export decisions there.`);
    }
    if(Object.keys(entries).length)console.log('Reading the published source archive…');
    const catalog=Object.keys(entries).length?await prepareCatalogProposal({root:projectRoot,git,python,entries,files,site,stage}):{edits:[],deletions:[],skipped:[],blobs:new Map(),overlay:files.overlay};
    if(decisions&&!catalog.blobs.has(target)){const file=path.join(stage,'subject-edits.json');await fs.writeFile(file,await files.read(target));catalog.blobs.set(target,file);}
    if(additionsBlob&&!catalog.blobs.has(additionsFile))catalog.blobs.set(additionsFile,additionsBlob);
    catalog.skipped.push(...conflicts);
    // Items with nothing to publish still go to the source folders (an edit
    // matching the published catalog, a deletion of an unpublished item).
    const localOnly=[...catalog.skipped.filter(s=>s.applyOnly).map(s=>s.id),...catalog.deletions.filter(d=>!d.archived).map(d=>d.id)];
    const included=[...catalog.edits.map(e=>e.id),...catalog.deletions.filter(d=>d.archived).map(d=>d.id)];
    if(ids.length)describe(catalog);
    if(!catalog.blobs.size){
      console.log('\nNothing new to publish.');
      if(localOnly.length&&!dry){
        console.log('\nWriting to this computer’s source folders…');
        await applyAndRecord(pending,Object.fromEntries(localOnly.map(id=>[id,entries[id]])));
      }
      return;
    }
    if(dry){console.log('\nDry run: nothing was changed.');return;}
    if(!yes){
      const prompt=readline.createInterface({input:process.stdin,output:process.stdout});
      const answer=await prompt.question('\nOpen a pull request with these changes? Type Y and press Enter: ');prompt.close();
      if(!/^y(es)?$/i.test(answer.trim())){console.log('Cancelled. Nothing was changed.');return;}
    }
    const added=additions?.added.length||0;
    const {title,kind}=publicationTitle({corrections:catalog.edits.length,deletions:catalog.deletions.filter(d=>d.archived).length,additions:added,decisions:(decisions?.total||0)-added});
    const body=[included.length||catalog.skipped.length?catalogBody(catalog):'',decisions?decisionsBody(decisions,exports.map(entry=>path.basename(entry.file)).join(', ')):'',additions?additionsBody(additions):''].filter(Boolean).join('\n\n');
    const result=await publishChanges(projectRoot,[],title,{kind,toolName:'Publish-Editorial-Decisions.cmd',body,blobs:catalog.blobs,target:repository,account});
    if(!result)return;
    // From here on the pull request exists: record it first, so that the next
    // run knows about it whatever happens while writing the source folders.
    try{
      const openedAt=new Date().toISOString(),pr={number:result.number,url:result.url,branch:result.branch,openedAt};
      await pending.update(data=>{
        for(const id of included){const entry=data.items[id];if(entry&&entry.savedAt===entries[id].savedAt)entry.publishedIn=pr;}
        data.pullRequest={...pr,ids:included,...exported.length&&{decisions:exported}};
      });
      const applied=[...included,...localOnly];
      if(applied.length){
        console.log('\nWriting the published edits to this computer’s source folders…');
        await applyAndRecord(pending,Object.fromEntries(applied.map(id=>[id,entries[id]])),{included,pr});
        if(included.length)console.log('These edits stay listed in Edit-Catalog-Item until the pull request is merged. If it is closed without merging, the next publication proposes them again (restore the backup above to undo them here).');
      }
    }catch(error){
      error.opened=result;throw error;
    }
  });
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    // One publication at a time on this computer: two runs could otherwise
    // both open a pull request, or write the source folders together.
    await withLock(path.join(await jobFolder(),'publish-editorial-decisions.lock'),()=>main(process.argv.slice(2)),{busy:'Publish-Editorial-Decisions is already running in another window. Let it finish first.'});
  }catch(error){
    if(error.opened)console.error(`\nThe pull request was opened (${error.opened.url}), but finishing on this computer failed: ${error.message}\nRun this tool again after fixing the problem; it will not open a second pull request while this one is open.`);
    else console.error('\nNO PULL REQUEST OPENED: '+error.message);
    process.exitCode=1;
  }
}
