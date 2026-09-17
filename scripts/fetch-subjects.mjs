// Explicit refresh only. Ordinary builds use this versioned, immutable snapshot.
import fs from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import {parseCsv} from '../src/text.mjs';
const rows=parseCsv(await fs.readFile('14-colors_and_hyperlinks.csv','utf8'));
const exceptions=JSON.parse(await fs.readFile('data/subject-source-exceptions.json','utf8'));
const filename='data/subjects-snapshot.json.gz';
let previous={categories:{}};
try{previous=JSON.parse(gunzipSync(await fs.readFile(filename)));}catch{}
const snapshot={format:1,origin:'https://loom.loomofreality.org/',fetchedAt:new Date().toISOString(),categories:{}};
async function get(url){for(let attempt=0;attempt<4;attempt++){try{const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error(`${r.status} ${url}`);return await r.text();}catch(e){if(attempt===3)throw e;await new Promise(r=>setTimeout(r,1000*(attempt+1)));}}}
snapshot.hierarchy=await get(snapshot.origin+'services/categories.php?main=y');
let cursor=0;
const results=await Promise.allSettled(Array.from({length:3},async()=>{while(cursor<rows.length){const row=rows[cursor++],id=new URLSearchParams(new URL(row.hyperlink).hash.replace(/^#\??/,'')).get('category');if(!/^[A-F\d]{32}$/i.test(id))throw Error(`Invalid category URL: ${row.hyperlink}`);if(exceptions[id]&&!process.argv.includes('--retry-unavailable')){console.log(`Known unavailable source: ${row.subject}`);continue;}if(process.argv.includes('--resume')&&previous.categories[id])snapshot.categories[id]=previous.categories[id];else{const url=snapshot.origin+`services/quotes.php?category=${id}&children=n`;console.log(`Fetching ${row.subject}`);const raw=await get(url);const parsed=JSON.parse(raw);if(!Array.isArray(parsed)||!parsed.every(r=>Array.isArray(r.quotes)))throw Error(`Invalid category response: ${id}`);snapshot.categories[id]={url,raw};}if(Object.keys(snapshot.categories).length%30===0)console.log(`Fetched ${Object.keys(snapshot.categories).length}/${rows.length}`);}}));
snapshot.categories=Object.fromEntries(Object.entries(snapshot.categories).sort());
await fs.writeFile(filename,gzipSync(JSON.stringify(snapshot),{level:9}));
console.log(`Saved ${Object.keys(snapshot.categories).length} distinct category responses to ${filename}`);
for(const result of results)if(result.status==='rejected')throw result.reason;
