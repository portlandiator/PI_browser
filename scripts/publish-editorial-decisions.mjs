// Publish what is waiting on this computer as one pull request: the catalog
// edits and deletions saved with Edit-Catalog-Item.cmd (the pending file), and
// the decisions exported from the website's editorial pages (Review subject
// connections, Review quoted passages, Editorial workspace). The exported
// subject-edits.json is checked, merged onto the published decisions (the
// export wins where both have an entry, and nothing published is lost); the
// catalog edits are applied to the published source archive. Everything is
// shown as a summary, then proposed as a pull request; merging it publishes
// them, after GitHub has built and tested the result.
//
//   node scripts/publish-editorial-decisions.mjs [EXPORTED-FILE] [--yes] [--dry-run]
// Reads Downloads/subject-edits.json plus the newest separate browser export.
// An explicitly supplied export wins subject-decision conflicts. Legacy catalog
// edits are still readable until they are saved into the Downloads file.
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import {fileURLToPath} from 'node:url';
import {parseCsv} from '../src/text.mjs';
import {validateDraft,mergeDrafts} from '../src/relationship-review-core.mjs';
import {relationKey} from '../src/subject-relations.mjs';
import {prepareRepository,publishChanges,requireNoOpenProposals} from './publish-changes.mjs';
import {tool} from './publish-tools.mjs';
import {githubTarget} from './github-target.mjs';
import {liveSite} from './catalog-deletion.mjs';
import {PendingCatalogEdits,publishedFiles,prepareCatalogProposal,catalogBody,conflictingEntries,applyLocally,settlePullRequest,withStage} from './catalog-edits.mjs';
import {editorialExports} from './editorial-exports.mjs';

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target='data/subject-edits.json';
const plural=(n,word)=>`${n} ${word}${n===1?'':'s'}`;

export async function subjectIds(root){
  const rows=parseCsv(await fs.readFile(path.join(root,'14-colors_and_hyperlinks.csv'),'utf8'));
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
| Subjects marked reviewed or unreviewed | ${summary.reviewProgress} | |`;
}

// The title and branch kind of a publication, from what it contains.
export function publicationTitle({corrections=0,deletions=0,decisions=0}){
  const parts=[corrections&&plural(corrections,'catalog correction'),deletions&&plural(deletions,'catalog deletion'),decisions&&plural(decisions,'editorial decision')].filter(Boolean);
  return {title:'Publish '+parts.join(', '),kind:corrections||deletions?'catalog-edits':'editorial-decisions'};
}

export function mergeExportedDecisions(published,exports,ids){
  let merged=published;
  for(const exported of exports)merged=mergeDecisions(merged,exported.value,ids).merged;
  return mergeDecisions(published,merged,ids);
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),yes=args.includes('--yes'),dry=args.includes('--dry-run');
  try{
    const pending=new PendingCatalogEdits(projectRoot);
    const exports=await editorialExports({file:args.find(arg=>!arg.startsWith('--')),pendingPath:pending.file});
    console.log(exports.length?'Decisions files: '+exports.map(entry=>entry.file).join(', '):'No exported subject-edits.json in Downloads; publishing the pending catalog edits only.');
    await prepareRepository(projectRoot,[target]);
    const git=await tool('git',projectRoot),gh=await tool('gh',projectRoot),python=await tool('python',projectRoot);
    const repository=await githubTarget(projectRoot,{gh,git});
    await settlePullRequest(pending,{gh,repository:repository.repository,root:projectRoot});
    const waiting=(await pending.read()).items;
    const ids=Object.keys(waiting);
    console.log(ids.length?`Pending catalog edits (${pending.file}): ${ids.length}`:'No catalog edits are pending.');
    if(!exports.length&&!ids.length)throw Error('Nothing to publish: no catalog edits are pending (save them with Edit-Catalog-Item.cmd) and no exported subject-edits.json was found in Downloads (use "Export decisions" on a review page, or drag the file onto this tool).');
    await requireNoOpenProposals(projectRoot,{gh,repository:repository.repository});
    await withStage(async stage=>{
      const conflicts=await conflictingEntries(projectRoot,waiting);
      const entries=Object.fromEntries(Object.entries(waiting).filter(([id])=>!conflicts.some(c=>c.id===id)));
      const files=publishedFiles(projectRoot,git,'HEAD');
      if(Object.keys(entries).length)console.log('Reading the published source archive…');
      const catalog=Object.keys(entries).length?await prepareCatalogProposal({root:projectRoot,git,python,entries,files,site:liveSite(repository.site),stage}):{edits:[],deletions:[],skipped:[],blobs:new Map(),overlay:files.overlay};
      catalog.skipped.push(...conflicts);
      // Items with nothing to publish still go to the source folders (an edit
      // matching the published catalog, a deletion of an unpublished item).
      const localOnly=[...catalog.skipped.filter(s=>s.applyOnly).map(s=>s.id),...catalog.deletions.filter(d=>!d.archived).map(d=>d.id)];
      const included=[...catalog.edits.map(e=>e.id),...catalog.deletions.filter(d=>d.archived).map(d=>d.id)];
      if(ids.length){
        console.log('\nCatalog edits compared with the published catalog:');
        for(const e of catalog.edits)console.log(`  ${e.id}: ${e.changed.join('; ')}`);
        for(const d of catalog.deletions)console.log(d.archived?`  ${d.id}: deleted (${plural(d.quotations,'quotation')} from ${plural(d.subjects.length,'subject')}; ${plural(d.guides.length,'study guide')} changed)`:`  ${d.id}: not in the published catalog; removed from the source folders only`);
        for(const s of catalog.skipped)console.log(`  ${s.id}: ${s.applyOnly?'already matches the published catalog; written to the source folders only':'not included: '+s.reason}`);
      }
      let decisions=null;
      if(exports.length){
        const publishedText=catalog.overlay.get(target)??await fs.readFile(path.join(projectRoot,target),'utf8');
        const {merged,summary}=mergeExportedDecisions(JSON.parse(String(publishedText)),exports,await subjectIds(projectRoot));
        // Quotations removed by a deletion above stay removed.
        for(const id of catalog.deletions.flatMap(d=>d.removedIds||[]))if(merged.matches&&Object.hasOwn(merged.matches,id))delete merged.matches[id];
        console.log(`\nChanges compared with the published decisions:
  passage decisions: ${summary.newPassages} new, ${summary.changedPassages} changed
  subject connections: ${summary.newConnections} new, ${summary.changedConnections} changed
  subjects marked reviewed/unreviewed: ${summary.reviewProgress}`);
        if(summary.total){const file=path.join(stage,'subject-edits.json');await fs.writeFile(file,JSON.stringify(merged,null,2)+'\n');catalog.blobs.set(target,file);decisions=summary;}
      }
      if(!catalog.blobs.size){
        console.log('\nNothing new to publish.');
        if(localOnly.length&&!dry){
          for(const note of await applyLocally(projectRoot,Object.fromEntries(localOnly.map(id=>[id,entries[id]]))))console.log(note.text);
          await pending.update(data=>{for(const id of localOnly)if(data.items[id]?.savedAt===entries[id].savedAt)delete data.items[id];});
        }
        return;
      }
      if(dry){console.log('\nDry run: nothing was changed.');return;}
      if(!yes){
        const prompt=readline.createInterface({input:process.stdin,output:process.stdout});
        const answer=await prompt.question('\nOpen a pull request with these changes? Type Y and press Enter: ');prompt.close();
        if(!/^y(es)?$/i.test(answer.trim())){console.log('Cancelled. Nothing was changed.');return;}
      }
      const {title,kind}=publicationTitle({corrections:catalog.edits.length,deletions:catalog.deletions.filter(d=>d.archived).length,decisions:decisions?.total||0});
      const body=[included.length||catalog.skipped.length?catalogBody(catalog):'',decisions?decisionsBody(decisions,exports.map(entry=>path.basename(entry.file)).join(', ')):''].filter(Boolean).join('\n\n');
      const result=await publishChanges(projectRoot,[],title,{kind,toolName:'Publish-Editorial-Decisions.cmd',body,blobs:catalog.blobs});
      if(!result)return;
      const applied=[...included,...localOnly];
      if(applied.length){
        console.log('\nWriting the published edits to this computer’s source folders…');
        const notes=await applyLocally(projectRoot,Object.fromEntries(applied.map(id=>[id,entries[id]])));
        for(const note of notes)console.log('  '+note.text);
        const openedAt=new Date().toISOString();
        await pending.update(data=>{
          for(const id of applied){
            const entry=data.items[id];if(!entry||entry.savedAt!==entries[id].savedAt)continue;
            if(!included.includes(id)){delete data.items[id];continue;}
            entry.publishedIn={number:result.number,url:result.url,branch:result.branch,openedAt};
            entry.applied={at:openedAt,backup:notes.find(n=>n.id===id)?.backup||null,failed:notes.find(n=>n.id===id)?.failed||false};
          }
          if(included.length)data.pullRequest={number:result.number,url:result.url,branch:result.branch,openedAt,ids:included};
        });
        if(included.length)console.log('These edits stay listed in Edit-Catalog-Item until the pull request is merged. If it is closed without merging, the next publication proposes them again (restore the backups above to undo them here).');
      }
    });
  }catch(error){console.error('\nNO PULL REQUEST OPENED: '+error.message);process.exitCode=1;}
}
