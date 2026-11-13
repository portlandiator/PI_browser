// Anonymous weekly visitor counts for the four main views of the website.
//
// The site has no server of its own and collects no personal information, so
// a visit is counted with two things that identify nobody:
//  - GitHub counts the downloads of every file attached to a release. The
//    "Visitor counts" release of this repository holds one tiny image for each
//    view and week; scripts/visitor-counts.mjs keeps them there.
//  - The browser notes, in its own storage, the views it has already been
//    counted on this week.
// Once a visitor has done something in a view (moved the pointer, touched,
// typed), the view reads the week's download counts for the foot of the page.
// The first time in a week, it also asks GitHub for that week's file, without
// cookies or a referrer, which adds one to the file's count.
// Nothing is sent to anyone but GitHub, which already serves the site. The
// number at the foot of the page leads to a graph of every week's counts
// (visitors.html, src/visitor-graph.mjs). The iOS app is packaged without this
// module and without the graph (ios/scripts/package-website.mjs).

export const releaseTag='visitor-counts';
export const pages={catalog:'Catalog',volumes:'Volumes',subjects:'Subjects','study-guides':'Study guides'};

// A week runs from Monday 00:00 UTC and is named by that Monday's date.
export function weekOf(date){
  const day=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));
  day.setUTCDate(day.getUTCDate()-(day.getUTCDay()+6)%7);
  return day.toISOString().slice(0,10);
}
export function addWeeks(week,count){
  const day=new Date(week+'T00:00:00Z');
  day.setUTCDate(day.getUTCDate()+7*count);
  return day.toISOString().slice(0,10);
}
export const assetName=(page,week)=>`${page}-${week}.gif`;
export function parseAssetName(name){
  const match=/^([a-z-]+)-(\d{4}-\d{2}-\d{2})\.gif$/.exec(name);
  if(!match||!Object.hasOwn(pages,match[1]))return null;
  const day=new Date(match[2]+'T00:00:00Z');
  return !Number.isNaN(day.getTime())&&weekOf(day)===match[2]?{page:match[1],week:match[2]}:null;
}

// The repository behind a GitHub Pages project address,
// https://OWNER.github.io/REPOSITORY/. Any other address (a local preview, the
// iOS app's loopback server, a copy hosted elsewhere) has none, and nothing is
// counted or shown there.
export function siteRepository(site){
  const owner=/^([a-z\d](?:[a-z\d-]*[a-z\d])?)\.github\.io$/i.exec(site.hostname)?.[1];
  const repository=/^\/([\w.-]+)\/$/.exec(site.pathname)?.[1];
  return site.protocol==='https:'&&owner&&repository?{owner,repository}:null;
}
export const hitUrl=({owner,repository},page,week)=>`https://github.com/${owner}/${repository}/releases/download/${releaseTag}/${assetName(page,week)}`;
export const countsUrl=({owner,repository})=>`https://api.github.com/repos/${owner}/${repository}/releases/tags/${releaseTag}`;

// One week's download counts by page, from GitHub's description of the
// release. A page whose file is missing is absent.
export function weekCounts(release,week){
  const counts={};
  for(const asset of Array.isArray(release?.assets)?release.assets:[]){
    const file=parseAssetName(asset?.name);
    if(file?.week===week&&Number.isSafeInteger(asset.download_count)&&asset.download_count>=0)counts[file.page]=asset.download_count;
  }
  return counts;
}
export const countLabel=count=>`${count.toLocaleString('en-US')} unique visitor${count===1?'':'s'} this week`;

// The release notes hold every week's totals as a table that
// scripts/visitor-counts.mjs writes: a row for each week, a column for each
// page. Read back here: week → page → count.
const notesColumn='Week from',notesInProgress=' (so far)';
export {notesColumn,notesInProgress};
export function readHistory(notes){
  const history=new Map(),names=Object.keys(pages);
  let columns;
  for(const line of String(notes||'').split(/\r?\n/)){
    const row=/^\s*\|(.*)\|\s*$/.exec(line);
    if(!row)continue;
    const cells=row[1].split('|').map(cell=>cell.trim());
    if(cells[0]===notesColumn){columns=cells.slice(1).map(label=>names.find(page=>pages[page]===label));continue;}
    const week=cells[0].endsWith(notesInProgress)?cells[0].slice(0,-notesInProgress.length):cells[0];
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
// Every week's totals up to the current one, from GitHub's description of the
// release: the table in its notes, and the download counts of the files still
// attached (this week's and last week's), which are newer. The higher number
// stands, so a count once recorded is never lowered.
export function weeklyTotals(release,current){
  const history=readHistory(release?.body);
  for(const asset of Array.isArray(release?.assets)?release.assets:[]){
    const file=parseAssetName(asset?.name);
    if(!file||!Number.isSafeInteger(asset.download_count)||asset.download_count<0)continue;
    const counts=history.get(file.week)||{};
    counts[file.page]=Math.max(counts[file.page]??0,asset.download_count);
    history.set(file.week,counts);
  }
  // Files are prepared for the coming weeks; those have no visitors yet.
  for(const week of [...history.keys()])if(week>current)history.delete(week);
  return history;
}

// GitHub adds a request to a file's count about ten minutes after it was made,
// so an answer is kept a little longer: the next one includes the visit.
const seenKey='pi-visitor-week',cacheKey='pi-visitor-counts';
export const cacheTime=15*60*1000;
// The page with the graph of every week's counts, beside this module.
export const graphPage='visitors.html';

// The browser's own storage. Unavailable storage reads as empty and refuses
// to write.
export function browserStore(storage){
  return {
    read:key=>{try{return JSON.parse(storage.getItem(key));}catch{return null;}},
    write:(key,value)=>{
      try{const text=JSON.stringify(value);storage.setItem(key,text);return storage.getItem(key)===text;}catch{return false;}
    },
  };
}
// The totals GitHub holds: this week's counts by page (`counts`, absent for a
// page whose file is missing) and every week's totals, oldest first (`weeks`).
// GitHub allows few unsigned questions an hour from one address, so an answer
// is kept for a quarter of an hour and a refused question falls back to it.
// `totals` is null when GitHub gave no answer and none was kept; `reachable`
// is false when GitHub could not be asked at all.
export async function readTotals({store,fetch,repository,week,now}){
  const cached=store.read(cacheKey);
  const kept=cached?.week===week&&cached.counts&&typeof cached.counts==='object'&&Array.isArray(cached.weeks)?cached:null;
  const age=kept?now()-kept.at:NaN;
  if(age>=0&&age<cacheTime)return {totals:kept,reachable:true};
  let response;
  try{response=await fetch(countsUrl(repository),{credentials:'omit',referrerPolicy:'no-referrer',headers:{Accept:'application/vnd.github+json'}});}
  catch{return {totals:kept,reachable:false};}
  try{
    // Without the release there are no files to count with.
    if(!response.ok&&response.status!==404)return {totals:kept,reachable:true};
    const release=response.ok?await response.json():null;
    const totals={week,at:now(),counts:weekCounts(release,week),weeks:[...weeklyTotals(release,week)].sort(([a],[b])=>a<b?-1:1)};
    store.write(cacheKey,totals);
    return {totals,reachable:true};
  }catch{return {totals:kept,reachable:true};}
}
// Crawlers and test browsers that run scripts are not visitors.
const automated=/bot[\/;]|adsbot|googleother|inspectiontool|crawl|spider|slurp|headless|lighthouse|pagespeed|phantomjs|ptst\/|preview|external(?:agent|hit|fetcher)/i;
// Most automated browsers do not say what they are: crawlers and the scanners
// that open the links in e-mails load a page like anyone else, from many
// addresses. On its first day (2026-11-13) Catalog was "visited" 157 times in
// the five minutes after it went live, the other views one to six times. What
// those loads never do is what a person does within moments: move the
// pointer, touch the screen, press a key or turn the wheel. Scrolling is left
// out, because a script can scroll. So is a pointer that merely appears: an
// automated Chromium gives the first page of a tab a pointer event at its
// corner with nobody there (6 of 8 fresh browsers, 2026-11-13), and a resting
// pointer is reported again whenever the page under it changes. Only a
// pointer that travels is a hand.
const signs=['pointerdown','pointermove','keydown','wheel','touchstart'],travel=8;

// Counts this browser once for the page and week, and shows the week's total
// in every element marked data-visitor-count, as a link to the graph of every
// week's counts. The page is named by the data-visitor-page attribute of the
// script element that loads this module.
export async function showVisitorCount({document,navigator,storage,fetch,site,now=()=>Date.now()}){
  const repository=siteRepository(site);
  const page=document.querySelector('script[data-visitor-page]')?.dataset.visitorPage;
  if(!repository||!Object.hasOwn(pages,page))return;
  if(navigator.webdriver||automated.test(navigator.userAgent||''))return;

  const store=browserStore(storage),{read,write}=store;
  const seenPages=week=>{const seen=read(seenKey);return seen?.week===week&&Array.isArray(seen.pages)?seen.pages:[];};

  let shown;
  const graph=new URL(graphPage,site).href;
  const render=()=>{
    if(shown===undefined)return;
    for(const element of document.querySelectorAll('[data-visitor-count]')){
      const link=document.createElement('a');
      link.href=graph;
      link.title='See the weekly counts as a graph';
      link.textContent=countLabel(shown);
      element.replaceChildren(link);
      element.hidden=false;
    }
  };
  // The study guides replace the page body in place, footer included.
  document.addEventListener('pi-guide-page',render);

  // Nothing is asked of GitHub and nothing is counted until the visitor does
  // something in the page while it is being looked at.
  await new Promise(resolve=>{
    let rest;
    const acted=event=>{
      if(!event.isTrusted||document.visibilityState!=='visible')return;
      if(event.type==='pointermove'){
        rest??=[event.clientX,event.clientY];
        if(!(Math.abs(event.clientX-rest[0])+Math.abs(event.clientY-rest[1])>=travel))return;
      }
      for(const sign of signs)document.removeEventListener(sign,acted,true);
      resolve();
    };
    for(const sign of signs)document.addEventListener(sign,acted,{capture:true,passive:true});
  });
  const week=weekOf(new Date(now()));

  // Notes that this browser is counted on the page this week; false when it
  // already is (another tab may have counted it while GitHub was being asked)
  // or when the browser cannot keep the note. A browser that cannot remember
  // being counted would be counted on every visit, so it is left out.
  function note(){
    const seen=seenPages(week);
    return !seen.includes(page)&&write(seenKey,{week,pages:[...seen,page]});
  }

  const earlier=seenPages(week).includes(page),online=navigator.onLine!==false;
  const answer=await readTotals({store,fetch,repository,week,now});
  const known=answer.totals,reachable=online&&answer.reachable;
  // Before the week's file exists there is nothing to add to, and while GitHub
  // cannot be reached the request would be lost: the visit is counted later.
  // When GitHub only refused to say, the file is taken to exist.
  const added=!earlier&&reachable&&(!known||Object.hasOwn(known.counts,page))&&note();
  // Asking for the week's file adds one to its download count. The note comes
  // first and stands whatever becomes of the request: it can be cut short by
  // leaving the page after GitHub has counted it, and a browser may refuse to
  // show a page the answer, so a failure is no reason to count a second time.
  // GitHub answers with cookies of its own; omitting credentials means the
  // browser neither sends nor keeps any, which an image element would.
  if(added)fetch(hitUrl(repository,page,week),{mode:'no-cors',credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',keepalive:true}).catch(()=>{});
  const total=known?.counts[page];
  // Without a number the page keeps its own footer wording.
  if(!Number.isSafeInteger(total)||total<0)return;
  // GitHub's answer was given before this visit was added, and an earlier
  // visit may not be in it yet: a counted visitor is never shown zero.
  shown=Math.max(total+(added?1:0),seenPages(week).includes(page)?1:0);
  // The kept answer follows, so the next page opened, and the graph, show the
  // same number.
  write(cacheKey,{...known,counts:{...known.counts,[page]:shown}});
  render();
}

if(typeof document!=='undefined'){
  let storage;
  try{storage=localStorage;}catch{}
  showVisitorCount({document,navigator,storage,fetch:(...request)=>fetch(...request),site:new URL('./',import.meta.url)}).catch(()=>{});
}
