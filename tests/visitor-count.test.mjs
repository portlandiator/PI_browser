import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {releaseTag,pages,weekOf,addWeeks,assetName,parseAssetName,siteRepository,hitUrl,countsUrl,weekCounts,countLabel,showVisitorCount} from '../src/visitor-count.mjs';

// A Windows checkout may hold these files with CRLF line endings.
const source=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8').replaceAll('\r\n','\n');
const publicSite='https://portlandiator.github.io/PI_browser/';
const friday=Date.UTC(2026,10,13,4,30),week='2026-11-09';
const hit=page=>`https://github.com/portlandiator/PI_browser/releases/download/visitor-counts/${page}-${week}.gif`;
const question='https://api.github.com/repos/portlandiator/PI_browser/releases/tags/visitor-counts';
const release=(counts,of=week)=>({tag_name:releaseTag,assets:Object.entries(counts).map(([page,download_count],id)=>({id,name:assetName(page,of),download_count}))});

// A stand-in for the page, its storage and GitHub.
function browser({site=publicSite,page='catalog',values=new Map(),github={catalog:41,volumes:7,subjects:12,'study-guides':3},status=200,delivered=true,blocked=false,visible=true,onLine=true,userAgent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',webdriver=false,time=friday}={}){
  const footer={textContent:'Partial Inventory browser',hidden:false},listeners={},requests=[];
  const state={time,github,status,delivered,visible};
  const document={
    get visibilityState(){return state.visible?'visible':'hidden';},
    querySelector:selector=>selector==='script[data-visitor-page]'&&page?{dataset:{visitorPage:page}}:null,
    querySelectorAll:selector=>selector==='[data-visitor-count]'?state.footers||[footer]:[],
    addEventListener:(type,listener)=>{(listeners[type]||=[]).push(listener);},
    removeEventListener:(type,listener)=>{listeners[type]=(listeners[type]||[]).filter(item=>item!==listener);},
  };
  const storage={
    getItem:key=>{if(blocked)throw Error('Storage is blocked');return values.has(key)?values.get(key):null;},
    setItem:(key,value)=>{if(blocked)throw Error('Storage is blocked');values.set(key,String(value));},
  };
  const fetch=async(url,options={})=>{
    requests.push({url,options});
    if(!state.delivered)throw TypeError('Failed to fetch');
    if(url===question)return {ok:state.status===200,status:state.status,json:async()=>release(state.github)};
    // A download adds one to GitHub's count; its answer cannot be read from another site.
    const file=parseAssetName(url.split('/').pop());
    if(file&&file.week===week&&Object.hasOwn(state.github,file.page))state.github[file.page]++;
    return {type:'opaque',ok:false,status:0};
  };
  const emit=type=>{for(const listener of [...(listeners[type]||[])])listener();};
  return {document,navigator:{userAgent,webdriver,onLine},storage,fetch,site:new URL(site),now:()=>state.time,footer,requests,values,state,emit,
    urls:()=>requests.map(request=>request.url),run(){return showVisitorCount(this);}};
}

test('weeks run from Monday in UTC and name the counting files',()=>{
  assert.equal(weekOf(new Date('2026-11-09T00:00:00Z')),'2026-11-09');
  assert.equal(weekOf(new Date('2026-11-15T23:59:59Z')),'2026-11-09');
  assert.equal(weekOf(new Date('2026-11-16T00:00:00Z')),'2026-11-16');
  // The visitor's own time zone does not move the week.
  assert.equal(weekOf(new Date('2026-11-15T20:00:00-08:00')),'2026-11-16');
  assert.equal(weekOf(new Date('2027-01-01T12:00:00Z')),'2026-12-28');
  assert.equal(addWeeks('2026-12-28',1),'2027-01-04');assert.equal(addWeeks('2026-11-09',-1),'2026-11-02');
  assert.deepEqual(Object.keys(pages),['catalog','volumes','subjects','study-guides']);
  for(const page of Object.keys(pages))assert.deepEqual(parseAssetName(assetName(page,week)),{page,week});
  assert.equal(assetName('study-guides',week),'study-guides-2026-11-09.gif');
  // Not a Monday, not a date, not a counted page, or not a counting file at all.
  for(const name of ['catalog-2026-11-10.gif','catalog-2026-02-31.gif','catalog-2026-13-01.gif','reader-2026-11-09.gif','catalog-2026-11-09.txt','catalog-2026-11-09.gif.zip','notes.gif',undefined])assert.equal(parseAssetName(name),null,String(name));
});

test('only the published GitHub Pages address has a repository to count with',()=>{
  assert.deepEqual(siteRepository(new URL(publicSite)),{owner:'portlandiator',repository:'PI_browser'});
  // GitHub does not distinguish capitals in an owner's or repository's name.
  assert.deepEqual(siteRepository(new URL('https://Some-Owner.github.io/renamed.site/')),{owner:'some-owner',repository:'renamed.site'});
  for(const address of [
    'http://localhost:4173/PI_browser/',        // local preview
    'http://127.0.0.1:51234/PI_browser/',       // the iOS app's loopback server
    'http://portlandiator.github.io/PI_browser/',
    'https://portlandiator.github.io/',          // not a project site
    'https://portlandiator.github.io/PI_browser/study-guides/',
    'https://example.org/PI_browser/',
    'https://github.io/PI_browser/',
    'https://evil.github.io.example.org/PI_browser/',
    'file:///C:/Users/steve/PI_browser/',
  ])assert.equal(siteRepository(new URL(address)),null,address);
  const repository=siteRepository(new URL(publicSite));
  assert.equal(hitUrl(repository,'catalog',week),hit('catalog'));
  assert.equal(countsUrl(repository),question);
});

test('a week\'s counts are read from GitHub\'s description of the release',()=>{
  const described=release({catalog:41,volumes:0,subjects:12});
  described.assets.push({name:assetName('study-guides','2026-11-02'),download_count:99},{name:assetName('study-guides',week),download_count:'7'},{name:'other.zip',download_count:5},null);
  assert.deepEqual(weekCounts(described,week),{catalog:41,volumes:0,subjects:12});
  assert.deepEqual(weekCounts(described,'2026-11-02'),{'study-guides':99});
  for(const nothing of [null,{},{assets:'none'},{assets:[]}])assert.deepEqual(weekCounts(nothing,week),{});
  assert.equal(countLabel(0),'0 unique visitors this week');
  assert.equal(countLabel(1),'1 unique visitor this week');
  assert.equal(countLabel(12345),'12,345 unique visitors this week');
});

test('a first visit of the week is counted once and shown at the foot of the page',async()=>{
  const first=browser();
  await first.run();
  assert.deepEqual(first.urls(),[question,hit('catalog')]);
  assert.equal(first.state.github.catalog,42);
  assert.equal(first.footer.textContent,'42 unique visitors this week');
  // Later visits in the same week ask for nothing more while the answer is fresh.
  const again=browser({values:first.values,github:first.state.github,time:friday+5*60*1000});
  await again.run();
  assert.deepEqual(again.urls(),[]);
  assert.equal(again.footer.textContent,'42 unique visitors this week');
  // GitHub adds a visit to its count about ten minutes later, so the answer is kept for fifteen:
  // within that time nothing is asked, even after eleven minutes.
  const kept=browser({values:first.values,github:first.state.github,time:friday+11*60*1000});
  await kept.run();
  assert.deepEqual(kept.urls(),[]);
  // After that the total is asked for again, and the visitor is still counted once.
  const later=browser({values:first.values,github:{...first.state.github,catalog:57},time:friday+16*60*1000});
  await later.run();
  assert.deepEqual(later.urls(),[question]);
  assert.equal(later.footer.textContent,'57 unique visitors this week');
  assert.equal(later.state.github.catalog,57);
});

test('each page is counted separately, and again in a new week',async()=>{
  const values=new Map(),github={catalog:41,volumes:7,subjects:12,'study-guides':3};
  const catalog=browser({values,github});await catalog.run();
  const subjects=browser({values,github,page:'subjects',time:friday+60*1000});await subjects.run();
  // The answer kept from the Catalog visit is reused, and this visit added to it.
  assert.deepEqual(subjects.urls(),[hit('subjects')]);
  assert.equal(subjects.footer.textContent,'13 unique visitors this week');
  assert.deepEqual(github,{catalog:42,volumes:7,subjects:13,'study-guides':3});
  assert.deepEqual(JSON.parse(values.get('pi-visitor-week')),{week,pages:['catalog','subjects']});
  // The following Monday the browser is a new visitor of the new week.
  const monday=Date.UTC(2026,10,16,0,5);
  const next=browser({values,github:{catalog:0},time:monday});
  next.fetch=async(url,options)=>{next.requests.push({url,options});return url===question?{ok:true,status:200,json:async()=>release({catalog:0},'2026-11-16')}:{type:'opaque'};};
  await next.run();
  assert.deepEqual(next.urls(),[question,'https://github.com/portlandiator/PI_browser/releases/download/visitor-counts/catalog-2026-11-16.gif']);
  assert.equal(next.footer.textContent,'1 unique visitor this week');
  assert.deepEqual(JSON.parse(values.get('pi-visitor-week')),{week:'2026-11-16',pages:['catalog']});
});

test('nothing that identifies a visitor is sent or kept',async()=>{
  const visit=browser({page:'study-guides'});
  await visit.run();
  const [asked,counted]=visit.requests;
  // No cookies and no referrer go to GitHub, and the request names only the page and the week.
  assert.deepEqual(counted,{url:hit('study-guides'),options:{mode:'no-cors',credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',keepalive:true}});
  assert.deepEqual(asked,{url:question,options:{credentials:'omit',referrerPolicy:'no-referrer',headers:{Accept:'application/vnd.github+json'}}});
  for(const request of visit.requests){
    assert(!('body' in request.options)&&!('method' in request.options));
    assert.doesNotMatch(request.url,/[?#]/);
  }
  // The browser keeps only the week, the pages counted in it and the public totals.
  assert.deepEqual([...visit.values.keys()].sort(),['pi-visitor-counts','pi-visitor-week']);
  assert.deepEqual(JSON.parse(visit.values.get('pi-visitor-week')),{week,pages:['study-guides']});
  assert.deepEqual(JSON.parse(visit.values.get('pi-visitor-counts')),{week,at:friday,counts:{catalog:41,volumes:7,subjects:12,'study-guides':4}});
  // Comments aside, the module knows no address but GitHub's and reads nothing about the visitor.
  const code=source('src/visitor-count.mjs').split('\n').filter(line=>!line.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(code,/cookie|document\.referrer|sessionStorage|indexedDB|randomUUID|getRandomValues|Math\.random|screen\.|language|platform|sendBeacon|navigator\.(?!webdriver|userAgent|onLine)/);
  assert.deepEqual([...new Set([...code.matchAll(/https?:\/\/([^\/`'"$]+)/g)].map(match=>match[1]))].sort(),['api.github.com','github.com']);
});

test('local previews, the app and other copies neither count nor ask',async()=>{
  for(const site of ['http://localhost:4173/PI_browser/','http://127.0.0.1:51234/PI_browser/','https://example.org/PI_browser/','https://portlandiator.github.io/']){
    const copy=browser({site});await copy.run();
    assert.deepEqual(copy.urls(),[],site);assert.equal(copy.footer.textContent,'Partial Inventory browser');assert.equal(copy.values.size,0);
  }
  // A page that names no counted view does nothing either.
  for(const page of [null,'privacy','__proto__']){
    const other=browser({page});await other.run();
    assert.deepEqual(other.urls(),[]);assert.equal(other.footer.textContent,'Partial Inventory browser');
  }
});

test('crawlers and automated browsers are not visitors',async()=>{
  for(const userAgent of [
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Chrome-Lighthouse',
    'Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)','AdsBot-Google (+http://www.google.com/adsbot.html)','Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)',
  ]){
    const crawler=browser({userAgent});await crawler.run();
    assert.deepEqual(crawler.urls(),[],userAgent);assert.equal(crawler.footer.textContent,'Partial Inventory browser');
  }
  const driven=browser({webdriver:true});await driven.run();assert.deepEqual(driven.urls(),[]);
  // A phone whose model name happens to contain "bot" is a visitor.
  const phone=browser({userAgent:'Mozilla/5.0 (Linux; Android 13; CUBOT NOTE 21) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'});
  await phone.run();assert.equal(phone.footer.textContent,'42 unique visitors this week');
});

test('a browser that cannot remember being counted is shown the total but not counted',async()=>{
  const blocked=browser({blocked:true});
  await blocked.run();
  assert.deepEqual(blocked.urls(),[question]);
  assert.equal(blocked.state.github.catalog,41);
  assert.equal(blocked.footer.textContent,'41 unique visitors this week');
  // The same when the browser gives no storage at all.
  const none=browser();none.storage=undefined;
  await none.run();
  assert.deepEqual(none.urls(),[question]);assert.equal(none.footer.textContent,'41 unique visitors this week');
});

test('while GitHub cannot be reached the visit is left to be counted later',async()=>{
  // The page came from the browser's cache without a connection: nothing is noted, so nothing is lost.
  for(const state of [{delivered:false},{onLine:false,delivered:false}]){
    const values=new Map(),offline=browser({values,...state});
    await offline.run();
    assert.deepEqual(offline.urls(),[question]);
    assert.equal(offline.footer.textContent,'Partial Inventory browser');
    assert.equal(values.has('pi-visitor-week'),false);
    const online=browser({values,time:friday+60*1000});
    await online.run();
    assert.deepEqual(online.urls(),[question,hit('catalog')]);
    assert.equal(online.footer.textContent,'42 unique visitors this week');
  }
  // With a fresh answer in hand, a browser that reports no connection still waits.
  const values=new Map([['pi-visitor-counts',JSON.stringify({week,at:friday-60*1000,counts:{catalog:41}})]]);
  const waiting=browser({values,onLine:false});
  await waiting.run();
  assert.deepEqual(waiting.urls(),[]);assert.equal(waiting.footer.textContent,'41 unique visitors this week');
  assert.equal(values.has('pi-visitor-week'),false);
});

test('the total is shown without waiting for the counting request, whatever becomes of it',async()=>{
  const slow=browser();
  let arrive;
  const answer=slow.fetch;
  slow.fetch=(url,options)=>url===question?answer(url,options):(slow.requests.push({url,options}),new Promise(resolve=>{arrive=resolve;}));
  await slow.run();
  assert.deepEqual(slow.urls(),[question,hit('catalog')]);
  assert.equal(slow.footer.textContent,'42 unique visitors this week');
  arrive({type:'opaque'});
  // A request cut short by leaving the page may already have been counted, and some browsers
  // report a refused answer as a failure: neither is a reason to count the browser again.
  const values=new Map(),cut=browser({values});
  const reply=cut.fetch;
  cut.fetch=(url,options)=>url===question?reply(url,options):(cut.requests.push({url,options}),Promise.reject(new TypeError('Failed to fetch')));
  await cut.run();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(JSON.parse(values.get('pi-visitor-week')),{week,pages:['catalog']});
  assert.equal(cut.footer.textContent,'42 unique visitors this week');
  const next=browser({values,time:friday+60*1000});await next.run();
  assert.deepEqual(next.urls(),[]);assert.equal(next.footer.textContent,'42 unique visitors this week');
});

test('when GitHub gives no number the page keeps its own footer wording',async()=>{
  // Too many questions from one address, or GitHub is unreachable: the visit is still counted.
  const limited=browser({status:403});
  await limited.run();
  assert.deepEqual(limited.urls(),[question,hit('catalog')]);
  assert.equal(limited.footer.textContent,'Partial Inventory browser');
  assert.deepEqual(JSON.parse(limited.values.get('pi-visitor-week')),{week,pages:['catalog']});
  // An earlier answer for the same week is better than none.
  const stale=browser({status:500,values:new Map([['pi-visitor-counts',JSON.stringify({week,at:friday-3600_000,counts:{catalog:30}})],['pi-visitor-week',JSON.stringify({week,pages:['catalog']})]])});
  await stale.run();
  assert.deepEqual(stale.urls(),[question]);assert.equal(stale.footer.textContent,'30 unique visitors this week');
  // Before the week's file exists, or the release itself, there is nothing to count with: the browser stays uncounted.
  for(const state of [{github:{volumes:7}},{status:404}]){
    const early=browser(state);
    await early.run();
    assert.deepEqual(early.urls(),[question]);
    assert.equal(early.footer.textContent,'Partial Inventory browser');
    assert.equal(early.values.has('pi-visitor-week'),false);
    // The answer is kept, so GitHub is not asked again on every page.
    const soon=browser({values:early.values,time:friday+60*1000,...state});await soon.run();
    assert.deepEqual(soon.urls(),[]);
  }
  // Unreadable answers and damaged storage are treated as no answer.
  const damaged=browser({values:new Map([['pi-visitor-week','{'],['pi-visitor-counts','[1]']])});
  await damaged.run();
  assert.equal(damaged.footer.textContent,'42 unique visitors this week');
  const odd=browser();odd.fetch=async url=>url===question?{ok:true,json:async()=>{throw SyntaxError('Unexpected token');}}:{type:'opaque'};
  await odd.run();assert.equal(odd.footer.textContent,'Partial Inventory browser');
});

test('a counted visitor is never shown zero, and a second tab does not count twice',async()=>{
  // GitHub has not yet included an earlier visit by this browser.
  const lagging=browser({github:{catalog:0},values:new Map([['pi-visitor-week',JSON.stringify({week,pages:['catalog']})]])});
  await lagging.run();
  assert.deepEqual(lagging.urls(),[question]);assert.equal(lagging.footer.textContent,'1 unique visitor this week');
  // Two tabs of one page open together: the second finds the first one's note.
  const values=new Map(),github={catalog:41},one=browser({values,github}),two=browser({values,github});
  await Promise.all([one.run(),two.run()]);
  assert.equal(github.catalog,42);
  assert.equal([...one.urls(),...two.urls()].filter(url=>url===hit('catalog')).length,1);
});

test('a page opened in the background is counted when it is first looked at',async()=>{
  const tab=browser({visible:false});
  const running=tab.run();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(tab.urls(),[]);
  tab.emit('visibilitychange');
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(tab.urls(),[]);
  tab.state.visible=true;tab.emit('visibilitychange');
  await running;
  assert.deepEqual(tab.urls(),[question,hit('catalog')]);
  assert.equal(tab.footer.textContent,'42 unique visitors this week');
});

test('study guides keep the count when a guide replaces the page in place',async()=>{
  const guide=browser({page:'study-guides'});
  // The shell of a guide has no footer until its text has been loaded.
  guide.state.footers=[];
  await guide.run();
  assert.deepEqual(guide.urls(),[question,hit('study-guides')]);
  const footer={textContent:'',hidden:true};
  guide.state.footers=[footer];guide.emit('pi-guide-page');
  assert.deepEqual(footer,{textContent:'4 unique visitors this week',hidden:false});
  // Moving on to another guide is the same visitor of the same view.
  const next={textContent:'',hidden:true};
  guide.state.footers=[next];guide.emit('pi-guide-page');
  assert.deepEqual(next,{textContent:'4 unique visitors this week',hidden:false});
  assert.equal(guide.requests.length,2);
});

test('the four main views carry the count in place of their footer wording',()=>{
  const tag=(page,base='./')=>`<script type="module" src="${base}visitor-count.mjs" data-visitor-page="${page}"></script>`;
  for(const [file,page] of [['src/index.html','catalog'],['src/volume-view.html','volumes'],['src/subjects.html','subjects']]){
    const html=source(file);
    assert(html.includes(tag(page)+'</head>'),file);
    assert.equal(html.match(/data-visitor-page/g).length,1,file);assert.equal(html.match(/data-visitor-count/g).length,1,file);
  }
  // Catalog and Volumes show the count where "Partial Inventory browser" stood, and keep those words without it.
  for(const file of ['src/index.html','src/volume-view.html'])assert(source(file).includes('<footer class="site-footer"><span data-visitor-count>Partial Inventory browser</span>'),file);
  // Subjects and the study guides gain it at the left of their footer, hidden until there is a number.
  assert(source('src/subjects.html').includes('<footer class="site-footer"><span data-visitor-count hidden></span><a href="./relationships.html">'));
  const guides=source('scripts/build-compilation-pilot.mjs');
  assert(guides.includes('<script type="module" src="${esc(base)}visitor-count.mjs" data-visitor-page="study-guides"></script></head>'));
  assert(guides.includes('<footer><span data-visitor-count hidden></span><span class="footer-note">'));
  // No other page counts its visitors.
  for(const file of readdirSync(new URL('../src/',import.meta.url)).filter(name=>name.endsWith('.html')&&!['index.html','volume-view.html','subjects.html'].includes(name)))assert.doesNotMatch(source('src/'+file),/visitor-count/,file);
  for(const file of ['scripts/item-editor.html','scripts/study-guide-editor.html'])assert.doesNotMatch(source(file),/visitor-count/,file);
});

test('the privacy policy and the About dialog describe the count',()=>{
  const policy=source('src/privacy.html');
  assert.match(policy,/<h2>How the website counts visitors<\/h2>/);
  assert.match(policy,/The first time you open one of them in a week, the page asks GitHub, which hosts the website, for a small file\./);
  assert.match(policy,/It carries no cookies, no name or other identifier, nothing about what you read, and no record of the page you came from\./);
  assert.match(policy,/a note of which main pages it has been counted on this week and the latest visitor totals/);
  assert.match(policy,/<p>The app does not take part in this count\.<\/p>/);
  assert.match(policy,/<h2>What we collect<\/h2>\s*<p>No personal information\./);
  // The earlier wording would no longer be true of the website.
  assert.doesNotMatch(policy,/runs no analytics|<p>Nothing\. There are no accounts, analytics|nothing is collected/);
  for(const file of ['src/index.html','src/subjects.html','src/volume-view.html'])assert(source(file).includes('The website’s only measurement is an anonymous count of each week’s visitors, described in the <a href="./privacy.html">privacy policy</a>.'),file);
});
