// Anonymous weekly visitor counts for the four main views of the website.
//
// The site has no server of its own and collects no personal information, so
// a visit is counted with two things that identify nobody:
//  - GitHub counts the downloads of every file attached to a release. The
//    "Visitor counts" release of this repository holds one tiny image for each
//    view and week; scripts/visitor-counts.mjs keeps them there.
//  - The browser notes, in its own storage, the views it has already been
//    counted on this week.
// A view reads the week's download counts for the foot of the page. The first
// time a browser opens the view in a week, it also asks GitHub for that week's
// file, without cookies or a referrer, which adds one to the file's count.
// Nothing is sent to anyone but GitHub, which already serves the site. The iOS
// app is packaged without this module (ios/scripts/package-website.mjs).

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

// GitHub adds a request to a file's count about ten minutes after it was made,
// so an answer is kept a little longer: the next one includes the visit.
const seenKey='pi-visitor-week',cacheKey='pi-visitor-counts',cacheTime=15*60*1000;
// Crawlers and test browsers that run scripts are not visitors.
const automated=/bot[\/;]|adsbot|googleother|inspectiontool|crawl|spider|slurp|headless|lighthouse|pagespeed|phantomjs|ptst\//i;

// Counts this browser once for the page and week, and shows the week's total
// in every element marked data-visitor-count. The page is named by the
// data-visitor-page attribute of the script element that loads this module.
export async function showVisitorCount({document,navigator,storage,fetch,site,now=()=>Date.now()}){
  const repository=siteRepository(site);
  const page=document.querySelector('script[data-visitor-page]')?.dataset.visitorPage;
  if(!repository||!Object.hasOwn(pages,page))return;
  if(navigator.webdriver||automated.test(navigator.userAgent||''))return;

  // Unavailable storage reads as empty and refuses to write.
  const read=key=>{try{return JSON.parse(storage.getItem(key));}catch{return null;}};
  const write=(key,value)=>{
    try{const text=JSON.stringify(value);storage.setItem(key,text);return storage.getItem(key)===text;}catch{return false;}
  };
  const seenPages=week=>{const seen=read(seenKey);return seen?.week===week&&Array.isArray(seen.pages)?seen.pages:[];};

  let shown;
  const render=()=>{
    if(shown===undefined)return;
    for(const element of document.querySelectorAll('[data-visitor-count]')){element.textContent=countLabel(shown);element.hidden=false;}
  };
  // The study guides replace the page body in place, footer included.
  document.addEventListener('pi-guide-page',render);

  // A view opened in a background tab is counted when it is first looked at.
  if(document.visibilityState!=='visible')await new Promise(resolve=>{
    const looked=()=>{
      if(document.visibilityState!=='visible')return;
      document.removeEventListener('visibilitychange',looked);resolve();
    };
    document.addEventListener('visibilitychange',looked);
  });
  const week=weekOf(new Date(now()));

  // GitHub allows few unsigned questions an hour from one address, so an
  // answer is kept for a quarter of an hour and a refused question falls back
  // to it.
  // Null when GitHub gave no answer.
  let reachable=navigator.onLine!==false;
  async function counts(){
    const cached=read(cacheKey),kept=cached?.week===week&&cached.counts&&typeof cached.counts==='object'?cached:null;
    const age=kept?now()-kept.at:NaN;
    if(age>=0&&age<cacheTime)return kept;
    let response;
    try{response=await fetch(countsUrl(repository),{credentials:'omit',referrerPolicy:'no-referrer',headers:{Accept:'application/vnd.github+json'}});}
    catch{reachable=false;return kept;}
    try{
      // Without the release there are no files to count with.
      if(!response.ok&&response.status!==404)return kept;
      const answer={week,at:now(),counts:response.ok?weekCounts(await response.json(),week):{}};
      write(cacheKey,answer);
      return answer;
    }catch{return kept;}
  }
  // Notes that this browser is counted on the page this week; false when it
  // already is (another tab may have counted it while GitHub was being asked)
  // or when the browser cannot keep the note. A browser that cannot remember
  // being counted would be counted on every visit, so it is left out.
  function note(){
    const seen=seenPages(week);
    return !seen.includes(page)&&write(seenKey,{week,pages:[...seen,page]});
  }

  const earlier=seenPages(week).includes(page),known=await counts();
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
  // The kept answer follows, so the next page opened shows the same number.
  write(cacheKey,{...known,counts:{...known.counts,[page]:shown}});
  render();
}

if(typeof document!=='undefined'){
  let storage;
  try{storage=localStorage;}catch{}
  showVisitorCount({document,navigator,storage,fetch:(...request)=>fetch(...request),site:new URL('./',import.meta.url)}).catch(()=>{});
}
