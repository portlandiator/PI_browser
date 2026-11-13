// Keeps the "Visitor counts" release the website counts its visitors with
// (src/visitor-count.mjs): one small image for each main page and week, added
// a few weeks ahead, and the weekly totals in the release notes. A file's
// download count is that week's number of visitors, so an existing file is
// never replaced, and a file of a past week is removed only after its count is
// in the notes.
//
// Run every day by .github/workflows/visitor-counts.yml:
//   GITHUB_REPOSITORY=owner/name GITHUB_TOKEN=… node scripts/visitor-counts.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {releaseTag,pages,weekOf,addWeeks,assetName,parseAssetName} from '../src/visitor-count.mjs';

// Files are prepared this many weeks ahead, so counting continues through a
// month in which this script does not run.
export const weeksAhead=4;
export const releaseName='Visitor counts';
const pageNames=Object.keys(pages);
const firstColumn='Week from';
const inProgress=' (so far)';

export const fileLabel=(page,week)=>`${pages[page]}, week from ${week}`;
// A transparent one-pixel image: every browser accepts an image from another
// site without complaint, whatever it does with other kinds of file.
export const fileBytes=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64');
export function siteAddress(repository){
  const [owner,name]=repository.split('/');
  return `https://${owner.toLowerCase()}.github.io/${name}/`;
}

// The weekly totals recorded in the release notes: week → page → count.
export function readHistory(notes){
  const history=new Map();
  let columns;
  for(const line of String(notes||'').split(/\r?\n/)){
    const row=/^\s*\|(.*)\|\s*$/.exec(line);
    if(!row)continue;
    const cells=row[1].split('|').map(cell=>cell.trim());
    if(cells[0]===firstColumn){columns=cells.slice(1).map(label=>pageNames.find(page=>pages[page]===label));continue;}
    const week=cells[0].endsWith(inProgress)?cells[0].slice(0,-inProgress.length):cells[0];
    if(!columns||!/^\d{4}-\d{2}-\d{2}$/.test(week))continue;
    const day=new Date(week+'T00:00:00Z');
    if(Number.isNaN(day.getTime())||weekOf(day)!==week)continue;
    const counts={};
    columns.forEach((page,index)=>{
      const text=(cells[index+1]||'').replaceAll(',','');
      if(page&&/^\d+$/.test(text))counts[page]=Number(text);
    });
    history.set(week,counts);
  }
  return history;
}

export function writeNotes(history,current,site){
  const weeks=[...history.keys()].filter(week=>week<=current).sort().reverse();
  const cell=count=>Number.isSafeInteger(count)?String(count):'–';
  return [
    `Unique visitors of the four main pages of the [Partial Inventory browser](${site}) in each week, Monday to Sunday (UTC).`,
    '',
    `Each file attached below (a one-pixel image) counts one page in one week. A browser asks for the file the first time it opens that page in the week, and GitHub's download count of the file is the number of visitors. No personal information is collected; see the [privacy policy](${site}privacy.html).`,
    '',
    'Please do not download the files (each download is counted as a visitor) and do not edit this text: the "Keep the weekly visitor counters" workflow rewrites it every day and removes the files of earlier weeks once their counts are in the table.',
    '',
    `| ${firstColumn} | ${pageNames.map(page=>pages[page]).join(' | ')} |`,
    `| --- |${pageNames.map(()=>' ---: |').join('')}`,
    ...weeks.map(week=>`| ${week}${week===current?inProgress:''} | ${pageNames.map(page=>cell(history.get(week)[page])).join(' | ')} |`),
    '',
  ].join('\n');
}

// What a run changes, from the release as it stands: the files to add, the
// notes, and the files of past weeks that the notes now make redundant.
export function plan({notes,assets},now,site){
  const current=weekOf(now),lastWeek=addWeeks(current,-1);
  const files=[];
  for(const asset of assets){
    const file=parseAssetName(asset.name);
    if(file)files.push({...file,name:asset.name,id:asset.id,count:asset.download_count});
  }
  const present=new Set(files.map(file=>file.name));
  const add=[];
  for(let ahead=0;ahead<=weeksAhead;ahead++)for(const page of pageNames){
    const week=addWeeks(current,ahead),name=assetName(page,week);
    if(!present.has(name))add.push({page,week,name});
  }
  const history=readHistory(notes);
  if(!history.has(current))history.set(current,{});
  const recorded=file=>Number.isSafeInteger(file.count)&&file.count>=0;
  for(const file of files){
    if(file.week>current||!recorded(file))continue;
    const counts=history.get(file.week)||{};
    // A count already in the notes is never lowered.
    counts[file.page]=Math.max(counts[file.page]??0,file.count);
    history.set(file.week,counts);
  }
  // Last week's files stay for a week, for the visits GitHub adds late.
  const remove=files.filter(file=>file.week<lastWeek&&recorded(file));
  return {add,remove,notes:writeNotes(history,current,site),history};
}

const sameText=(a,b)=>String(a||'').replaceAll('\r\n','\n').trim()===String(b||'').replaceAll('\r\n','\n').trim();

// One run against GitHub (or, in tests, a stand-in for it).
export async function maintain({github,site,now=new Date(),log=console.log}){
  let release=await github.release();
  if(!release){
    release=await github.createRelease({name:releaseName,notes:writeNotes(new Map(),weekOf(now),site)});
    log(`Created the "${releaseName}" release.`);
  }
  let assets=await github.assets(release.id);
  let changes=plan({notes:release.body,assets},now,site);
  const added=changes.add.map(file=>file.name);
  for(const file of changes.add){
    await github.addFile(release,{name:file.name,label:fileLabel(file.page,file.week),bytes:fileBytes});
    log(`Added ${file.name}.`);
  }
  if(added.length){
    assets=await github.assets(release.id);
    changes=plan({notes:release.body,assets},now,site);
    if(changes.add.length)throw Error('GitHub does not list the files just added: '+changes.add.map(file=>file.name).join(', '));
  }
  if(!sameText(release.body,changes.notes)){
    const saved=await github.setNotes(release.id,changes.notes);
    // Files are removed only once GitHub holds their counts in the notes.
    const kept=readHistory(saved?.body);
    for(const file of changes.remove)if(kept.get(file.week)?.[file.page]!==changes.history.get(file.week)[file.page])throw Error(`The release notes were not saved with the count of ${file.name}; no file was removed.`);
    log('Updated the weekly totals in the release notes.');
  }
  for(const file of changes.remove){
    await github.removeFile(file.id);
    log(`Removed ${file.name} (${file.count} recorded in the notes).`);
  }
  return {release,added,removed:changes.remove.map(file=>file.name),notes:changes.notes};
}

// GitHub's REST API for the one release, with the workflow's token.
export function githubRelease({repository,token,fetch=globalThis.fetch,api=process.env.GITHUB_API_URL||'https://api.github.com',pause=1000}){
  if(!/^[\w.-]+\/[\w.-]+$/.test(repository||''))throw Error('GITHUB_REPOSITORY must be owner/name');
  if(!token)throw Error('GITHUB_TOKEN is required');
  const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
  async function call(method,url,{json,body,type,accept=[]}={}){
    const response=await fetch(url.startsWith('https://')?url:api+url,{method,headers:{...headers,...(json?{'Content-Type':'application/json'}:{}),...(type?{'Content-Type':type}:{})},body:json?JSON.stringify(json):body});
    // GitHub asks for a second between requests that change something.
    if(method!=='GET'&&pause)await new Promise(resolve=>setTimeout(resolve,pause));
    if(accept.includes(response.status))return null;
    const text=await response.text();
    let value=null;
    try{value=text?JSON.parse(text):null;}catch{}
    if(!response.ok)throw Object.assign(Error(`GitHub answered ${response.status} to ${method} ${url.split('?')[0]}${value?.message?': '+value.message:''}`),{status:response.status,details:value});
    return value;
  }
  const base=`/repos/${repository}/releases`;
  return {
    release:()=>call('GET',`${base}/tags/${releaseTag}`,{accept:[404]}),
    // Not a draft (drafts cannot be downloaded) and never the "latest" release.
    createRelease:({name,notes})=>call('POST',base,{json:{tag_name:releaseTag,name,body:notes,draft:false,prerelease:false,make_latest:'false'}}),
    async assets(id){
      const all=[];
      for(let page=1;;page++){
        const batch=await call('GET',`${base}/${id}/assets?per_page=100&page=${page}`);
        all.push(...batch);
        if(batch.length<100)return all;
      }
    },
    async addFile(release,{name,label,bytes}){
      const upload=String(release.upload_url||'').replace(/\{.*$/,'');
      if(!upload.startsWith('https://'))throw Error('The release has no upload address');
      try{await call('POST',`${upload}?name=${encodeURIComponent(name)}&label=${encodeURIComponent(label)}`,{body:bytes,type:'image/gif'});}
      catch(error){
        // Another run added it first; the file and its count are kept as they are.
        if(error.status===422&&error.details?.errors?.some(item=>item.code==='already_exists'))return;
        throw error;
      }
    },
    setNotes:(id,notes)=>call('PATCH',`${base}/${id}`,{json:{body:notes}}),
    removeFile:id=>call('DELETE',`${base}/assets/${id}`,{accept:[204]}),
  };
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const repository=process.env.GITHUB_REPOSITORY;
  const result=await maintain({github:githubRelease({repository,token:process.env.GITHUB_TOKEN}),site:siteAddress(repository||'')});
  console.log(`${result.added.length} files added, ${result.removed.length} removed.`);
  if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,`${result.notes}\n[${releaseName} release](${result.release.html_url})\n`);
}
