import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const inside = (parent, child) => child.startsWith(parent + path.sep);
async function parallelFiles(items, action) {
  let cursor = 0, failure;
  await Promise.all(Array.from({length:Math.min(8,items.length)},async()=>{
    while (!failure && cursor < items.length) {
      const item=items[cursor++];
      try { await action(item); } catch(error) { failure ??= error; }
    }
  }));
  if (failure) throw failure;
}
export function safePath(root, relative) {
  assert.equal(typeof relative, 'string');
  assert(relative.length && !relative.includes('\\') && !relative.includes('\0') && !relative.includes(':') && !relative.startsWith('/'), 'Unsafe inventory path');
  assert(!relative.split('/').some(p => p === '..' || p === '.' || !p), 'Unsafe inventory path');
  const result = path.resolve(root, relative);
  assert(inside(path.resolve(root), result), 'Path escapes source');
  return result;
}
async function verifiedFile(root, entry) {
  assert(Number.isSafeInteger(entry.bytes) && entry.bytes >= 0 && /^[a-f0-9]{64}$/.test(entry.sha256), 'Invalid inventory entry');
  const file = safePath(root, entry.path);
  assert(inside(await fs.realpath(root), await fs.realpath(file)), 'Source symlink escapes root');
  assert((await fs.lstat(file)).isFile(), 'Expected ordinary file');
  const bytes = await fs.readFile(file);
  assert.equal(bytes.length, entry.bytes, `Length: ${entry.path}`);
  assert.equal(sha(bytes), entry.sha256, `Hash: ${entry.path}`);
  return bytes;
}

// The website counts its weekly visitors with src/visitor-count.mjs. The app
// takes no part in that: the module is packaged empty, so the pages that load
// it keep their own footer wording and nothing is counted or asked of GitHub.
export const visitorCountModule = 'visitor-count.mjs';
export const withoutVisitorCount = '// The website counts its weekly visitors here. The app does not.\n';

export async function packageWebsite({site, audit, pdfs, output, bibliography, expectedCommit}) {
  for (const value of [site, audit, output]) assert(value, 'site, audit and output are required');
  site = path.resolve(site); audit = path.resolve(audit); output = path.resolve(output);
  for (const input of [site, audit, pdfs && path.resolve(pdfs)].filter(Boolean)) {
    assert(output !== input && !inside(input, output) && !inside(output, input), 'Output must be separate from inputs');
  }
  await assert.rejects(fs.access(output), {code:'ENOENT'}, 'Output already exists; choose a fresh directory');
  const summary = await json(path.join(audit, 'summary.json'));
  const marker = await json(path.join(site, 'publication.json'));
  assert(/^[a-f0-9]{40}$/.test(marker.commit), 'Package a release with a real commit hash');
  assert.equal(marker.commit, summary.commit, 'Audit belongs to another release');
  if (expectedCommit) assert.equal(marker.commit, expectedCommit, 'Unexpected website commit');
  assert.equal(marker.dataset, summary.dataset);
  assert(/^collections\/[a-zA-Z0-9-]+\/$/.test(marker.dataset), 'Invalid dataset');
  const inventoryBytes = await fs.readFile(path.join(audit, 'files.json.gz'));
  assert.equal(sha(inventoryBytes), summary.manifestSha256, 'Audit inventory hash');
  const inventory = JSON.parse(gunzipSync(inventoryBytes));
  assert.equal(new Set(inventory.map(x => x.path)).size, inventory.length, 'Duplicate public paths');
  assert.equal(inventory.reduce((n, x) => n + x.bytes, 0), summary.publicBytes);
  const inventoryPaths = new Set(inventory.map(x => x.path));
  for (const file of ['publication.json','index.html','subjects.html','volume-view.html','stats.json','volumes.json','pdf-hosting.json','study-guides/index.html','study-guides/manifest.json',marker.dataset+'catalog.json.gz',marker.dataset+'subjects/index.json.gz']) {
    assert(inventoryPaths.has(file), `Missing collection component: ${file}`);
  }
  await fs.mkdir(path.dirname(output), {recursive:true});
  const staging = await fs.mkdtemp(output + '.staging-');
  let bytesTotal = 0;
  const bundleFiles = [];
  async function write(relative, bytes) {
    const file = safePath(staging, relative);
    await fs.mkdir(path.dirname(file), {recursive:true});
    await fs.writeFile(file, bytes);
    bytesTotal += bytes.length;
    bundleFiles.push({path:relative,bytes:bytes.length,sha256:sha(bytes)});
  }
  // Copy exactly the allowlisted public artifact; never copy raw inputs or the dist audit exports.
  await parallelFiles(inventory, async entry => {
    const bytes = await verifiedFile(site, entry);
    let packaged = bytes;
    if (entry.path === 'pdf-hosting.json') packaged = Buffer.from('{"url":"","repository":""}\n');
    if (entry.path === visitorCountModule) packaged = Buffer.from(withoutVisitorCount);
    if (bibliography && entry.path.endsWith('.html')) {
      packaged = Buffer.from(bytes.toString('utf8').replaceAll(/https:\/\/github\.com\/(?:portlandiator|loomofreality)\/PI_browser\/raw\/refs\/heads\/main\/docs\/Bibliography(?:%2C|,)\s?(?:%20| )Source(?:%20| )Codes(?:%20| )and(?:%20| )Subject(?:%20| )Schema\.pdf/g, '/PI_browser/bibliography.pdf'));
    }
    await write(entry.path, packaged);
  });
  if (summary.pdfSite) {
    assert(pdfs, 'The release uses separate PDF hosting; --pdf-site is required');
    const manifestBytes = await fs.readFile(path.join(pdfs, 'pdf-site.json'));
    assert.equal(sha(manifestBytes), summary.pdfSite.manifestSha256, 'PDF manifest belongs to another release');
    const manifest = JSON.parse(manifestBytes);
    assert.equal(manifest.files.length, summary.pdfSite.files);
    assert.equal(new Set(manifest.files.map(x => x.path)).size, manifest.files.length);
    for (const entry of manifest.files) {
      assert(/^pdf-volumes\/volume-\d+\.pdf$/.test(entry.path), 'Unexpected PDF path');
      assert(!inventoryPaths.has(entry.path), 'Duplicate PDF');
      await write(entry.path, await verifiedFile(pdfs, entry));
    }
  }
  if (bibliography) await write('bibliography.pdf', await fs.readFile(bibliography));
  const volumes = await json(path.join(staging,'volumes.json'));
  for (const name of Object.values(volumes)) {
    assert(/^pdf-volumes\/volume-\d+\.pdf$/.test(name));
    const file = await fs.open(safePath(staging, name));
    try { const head = Buffer.alloc(5); await file.read(head, 0, 5, 0); assert.equal(head.toString(), '%PDF-', `Invalid PDF ${name}`); } finally { await file.close(); }
  }
  const stats = await json(path.join(staging,'stats.json'));
  const subjects = JSON.parse(gunzipSync(await fs.readFile(path.join(staging, marker.dataset, 'subjects/index.json.gz'))));
  const guides = await json(path.join(staging,'study-guides/manifest.json'));
  assert.equal(stats.dataset, marker.dataset); assert.equal(guides.dataset, marker.dataset);
  assert.equal(Object.keys(guides.subjects).length, summary.studyGuides);
  assert(bytesTotal < 3_800_000_000, 'Offline collection leaves insufficient room under the 4 GB app limit');
  const version = {format:1,commit:marker.commit,dataset:marker.dataset,records:stats.records,subjects:subjects.subjects.length,studyGuides:summary.studyGuides,volumes:Object.keys(volumes).length,bytes:bytesTotal,builtAt:new Date().toISOString(),pdfPublicBase:summary.pdfSite?.url ?? null};
  await write('offline-version.json', Buffer.from(JSON.stringify(version,null,2)+'\n'));
  bundleFiles.sort((a,b)=>a.path.localeCompare(b.path,'en'));
  await fs.writeFile(path.join(staging,'offline-files.json'),JSON.stringify({format:1,files:bundleFiles},null,1)+'\n');
  await fs.rename(staging, output);
  return version;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2); const values = {};
  for (let i=0; i<args.length; i+=2) { assert(args[i].startsWith('--') && args[i+1], 'Use --name value'); values[args[i].slice(2)] = args[i+1]; }
  console.log(JSON.stringify(await packageWebsite({site:values.site,audit:values.audit,pdfs:values['pdf-site'],output:values.output,bibliography:values.bibliography,expectedCommit:values.commit}),null,2));
}
