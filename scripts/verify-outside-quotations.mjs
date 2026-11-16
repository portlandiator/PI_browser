// Check each quotation from beyond the Bahá’í writings against the page its wording
// was copied from (study-guides/outside/quotations.json).
//   node scripts/verify-outside-quotations.mjs [id ...] [--write] [--strict]
// --write records today's date on every quotation found; --strict also fails when a
// page cannot be reached. Behind a proxy, run Node with NODE_USE_ENV_PROXY=1. Sites
// that refuse plain requests are opened in a browser when Playwright is installed.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {decodeSource} from './source-encoding.mjs';
import {validateOutsideLibrary,findQuotation} from './study-guide-outside.mjs';

const agent='Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function plain(url){
  const response=await fetch(url,{headers:{'user-agent':agent,accept:'text/html,application/json,text/plain,*/*'},redirect:'follow',signal:AbortSignal.timeout(90000)});
  if(!response.ok)throw Object.assign(Error(`HTTP ${response.status}`),{status:response.status});
  return decodeSource(new Uint8Array(await response.arrayBuffer())).text;
}

let browser;
async function inBrowser(url){
  if(browser===undefined){
    // Playwright is optional and may be installed outside the project, so it is looked up the CommonJS way.
    try{browser=await createRequire(import.meta.url)('playwright').chromium.launch();}
    catch{browser=null;}
  }
  if(!browser)throw Error('this site needs a browser, and Playwright is not installed');
  const context=await browser.newContext({userAgent:agent.replace('Firefox/128.0','Chrome/126.0 Safari/537.36'),locale:'en-US'}),page=await context.newPage();
  try{await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForTimeout(2500);return await page.content();}
  finally{await context.close();}
}

// One reading of each page, however many quotations cite it.
export async function verifyOutsideQuotations(library,{ids=null,log=console.log,read=null}={}){
  const pages=new Map(),lastVisit=new Map(),results=[];
  const load=read||(async quotation=>{
    const {url,fetch:how}=quotation.source,host=new URL(url).host;
    const wait=1100-(Date.now()-(lastVisit.get(host)||0));
    if(wait>0)await pause(wait);
    try{
      if(how==='browser')return await inBrowser(url);
      try{return await plain(url);}
      catch(error){if([401,403,429,503].includes(error.status))return await inBrowser(url);throw error;}
    }finally{lastVisit.set(host,Date.now());}
  });
  for(const [id,quotation] of Object.entries(library.quotations)){
    if(ids&&!ids.includes(id))continue;
    const url=quotation.source.url;
    if(!pages.has(url))pages.set(url,await load(quotation).then(body=>({body}),error=>({error})));
    const page=pages.get(url);
    const result=page.error?{id,state:'unreachable',detail:page.error.message}:(found=>found.found?{id,state:'found'}:{id,state:'changed',detail:found.missing.join(' | ')})(findQuotation(page.body,quotation));
    results.push(result);
    log(`${result.state.padEnd(11)} ${id}${result.detail?'  — '+result.detail.slice(0,160):''}`);
  }
  return results;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),file=path.join(root,'study-guides','outside','quotations.json');
  const args=process.argv.slice(2),write=args.includes('--write'),strict=args.includes('--strict'),ids=args.filter(arg=>!arg.startsWith('--'));
  const library=validateOutsideLibrary(JSON.parse(await fs.readFile(file,'utf8')));
  const unknown=ids.filter(id=>!library.quotations[id]);
  if(unknown.length)throw Error('Unknown quotation: '+unknown.join(', '));
  const results=await verifyOutsideQuotations(library,{ids:ids.length?ids:null});
  await browser?.close();
  const tally=state=>results.filter(result=>result.state===state).length;
  console.log(`\n${tally('found')} found on their pages, ${tally('changed')} not found, ${tally('unreachable')} pages unreachable`);
  if(write){
    const today=new Date().toISOString().slice(0,10);
    for(const result of results)if(result.state==='found')library.quotations[result.id].source.checked=today;
    await fs.writeFile(file,JSON.stringify(library,null,1)+'\n');
  }
  if(tally('changed')||(strict&&tally('unreachable')))process.exitCode=1;
}
