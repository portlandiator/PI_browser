// Optional development test. Install Playwright 1.62.1 and its Chromium browser,
// or set PLAYWRIGHT_MODULE to an existing Playwright module's absolute index.mjs.
// This verifies the offline WEB bundle; it does not replace iPhone/Xcode tests.
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const root=path.resolve(process.argv[2] || 'ios/PartialInventory/Website');
const installed=JSON.parse(await fs.readFile(path.join(root,'offline-version.json'),'utf8'));
const reportDirectory=path.resolve(process.argv[3] || 'ios/build/browser-check');
await fs.mkdir(reportDirectory,{recursive:true});
const native=await fs.readFile(new URL('../PartialInventory/HTTPFileResponse.swift',import.meta.url),'utf8');
const csp=native.match(/fields\["Content-Security-Policy"\] = "([^"]+)"/)[1];
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.gz':'application/gzip','.svg':'image/svg+xml','.pdf':'application/pdf','.ttf':'font/ttf','.wasm':'application/wasm'};
const server=http.createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(!pathname.startsWith('/PI_browser/')){res.writeHead(404).end();return;}
    const relative=pathname.slice('/PI_browser/'.length)+(pathname.endsWith('/')?'index.html':'');
    const file=path.resolve(root,relative);
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    const info=await fs.stat(file);if(!info.isFile()){res.writeHead(404).end();return;}
    const headers={'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store','content-security-policy':csp,'accept-ranges':'bytes'};
    const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
    const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),info.size-1):info.size-1;
    if(start>=info.size||end<start){res.writeHead(416).end();return;}
    headers['content-length']=end-start+1;if(range)headers['content-range']=`bytes ${start}-${end}/${info.size}`;
    res.writeHead(range?206:200,headers);
    if(req.method==='HEAD')res.end();else createReadStream(file,{start,end}).pipe(res);
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}/PI_browser/`;
let browser;
const external=[],errors=[],checks=[];
try{
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,serviceWorkers:'block'});
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='127.0.0.1')return route.continue();
    external.push(url.href);return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);
  await page.waitForFunction(()=>document.querySelector('#results')?.getAttribute('aria-busy')==='false');
  assert.equal(await page.locator('#collection-count').innerText(),installed.records.toLocaleString('en-US'));
  checks.push('Cold catalog load with every external request blocked');
  // The website's weekly visitor count is not part of the app.
  assert.doesNotMatch(await fs.readFile(path.join(root,'visitor-count.mjs'),'utf8'),/github|fetch/);
  assert.equal(await page.locator('.site-footer [data-visitor-count]').innerText(),'Partial Inventory browser');
  assert.equal(await page.locator('.site-footer [data-visitor-count] a').count(),0);
  for(const file of ['visitors.html','visitor-graph.mjs','visitors.css'])await assert.rejects(fs.access(path.join(root,file)),{code:'ENOENT'},file);
  checks.push('No visitor counting and no visitor graph in the packaged site');
  await page.locator('#query').fill('God');await page.locator('#search-form button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#results')?.getAttribute('aria-busy')==='false'&&document.querySelectorAll('.result-row').length>0);
  checks.push('Full-text search via local Web Worker and index shards');
  for (const query of ['"O people"','الله']) {
    await page.locator('#query').fill(query);await page.locator('#search-form button[type=submit]').click();
    await page.waitForFunction(()=>document.querySelector('#results')?.getAttribute('aria-busy')==='false'&&document.querySelectorAll('.result-row').length>0);
  }
  checks.push('Exact phrase and original-language search');
  await page.goto(base+'?id=BH00001');
  await page.locator('#reader-title').waitFor();
  await page.locator('#reading-paragraphs .paragraph-cell').first().waitFor();
  await page.screenshot({path:path.join(reportDirectory,'phone-reader.png')});
  checks.push('Bilingual source reader from the bundled record');
  await page.goto(base+'subjects.html');
  await page.locator('.subject-heading').waitFor({timeout:60000});
  await page.locator('#passage-results').waitFor();
  await page.screenshot({path:path.join(reportDirectory,'phone-subjects.png')});
  checks.push('Subject directory, graph and passages');
  await page.goto(base+'study-guides/praise-pdf.html');
  await page.waitForFunction(()=>document.querySelector('article.quotation'));
  await page.getByText('Ready to print',{exact:true}).waitFor({timeout:60000});
  checks.push('Compressed study guide, shared quotation payloads, fonts and print readiness');
  await page.screenshot({path:path.join(reportDirectory,'phone-guide.png')});
  const volumes=JSON.parse(await fs.readFile(path.join(root,'volumes.json'),'utf8'));
  const volume=Object.keys(volumes)[0];
  await page.goto(base+`volume-view.html?volume=${volume}&page=2&layout=single`);
  await page.waitForFunction(()=>document.querySelector('#pdf-reader')?.getAttribute('aria-busy')==='false'&&document.querySelector('#pdf-pages canvas'),{},{timeout:60000});
  await page.screenshot({path:path.join(reportDirectory,'phone-volume.png')});
  checks.push('Locally bundled PDF renders through PDF.js');
  await page.setViewportSize({width:1024,height:1366});
  await page.goto(base+'subjects.html');await page.locator('.subject-heading').waitFor({timeout:60000});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Tablet horizontal overflow');
  await page.screenshot({path:path.join(reportDirectory,'tablet-subjects.png')});
  checks.push('Tablet layout without horizontal overflow');
  assert.equal(external.length,0,'Unexpected network dependency');
  assert.deepEqual(errors,[],'Browser JavaScript errors');
  await fs.writeFile(path.join(reportDirectory,'result.json'),JSON.stringify({status:'passed',engine:'Chromium; not an iOS simulator',checks,externalRequests:external,errors},null,2));
  console.log(JSON.stringify({checks,externalRequests:external.length,errors},null,2));
}catch(error){
  await fs.writeFile(path.join(reportDirectory,'result.json'),JSON.stringify({status:'failed',checks,externalRequests:external,errors,failure:error.message},null,2));
  throw error;
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
