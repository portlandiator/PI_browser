import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {pdfBase} from '../src/pdf-hosting.mjs';

export const auditFiles = [
  'study-guides/compiled.archive.json.br',
  'study-guides/validation.json.gz',
  'study-guides/sentence-review.json.gz',
  'study-guides/sentence-review.html',
  'study-guides/sentence-review.html.gz',
];
export const sharedFonts = ['eb-garamond.ttf','eb-garamond-italic.ttf','scheherazade-new.ttf','EB-Garamond-OFL.txt','Scheherazade-New-OFL.txt'];
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export async function listFiles(root, prefix='') {
  const files=[];
  async function visit(directory) {
    for (const entry of await fs.readdir(path.join(root,directory),{withFileTypes:true})) {
      const relative=path.posix.join(directory,entry.name);
      if (entry.isSymbolicLink()) throw Error('Publication input must not be a symlink: '+relative);
      if (entry.isDirectory()) await visit(relative);
      else if (entry.isFile()) files.push(relative);
      else throw Error('Unsupported publication input: '+relative);
    }
  }
  await visit(prefix);
  return files.sort();
}

export async function parallelMap(values, callback, concurrency=12) {
  const results=new Array(values.length);let next=0;
  await Promise.all(Array.from({length:Math.min(concurrency,values.length)},async()=>{
    while(next<values.length){const i=next++;results[i]=await callback(values[i],i);}
  }));
  return results;
}

// Only these fixed directories can be replaced. The original dist and its build
// cache stay intact, and audit generations are retained by commit and dataset.
function child(root,name) {
  const target=path.resolve(root,name);
  if (path.dirname(target)!==path.resolve(root)) throw Error('Unsafe publication directory');
  return target;
}
async function ordinaryDirectory(directory) {
  try { if ((await fs.lstat(directory)).isSymbolicLink()) throw Error('Publication directory must not be a symlink'); }
  catch(error) { if(error.code!=='ENOENT') throw error; }
}

export async function preparePages(root,{commit='local',reuseVerifiedFiles=false}={}) {
  root=path.resolve(root);
  if(!/^(?:local|[a-f0-9]{40})$/.test(commit)) throw Error('Invalid publication commit');
  const source=child(root,'dist'),destination=child(root,'public-site'),auditRoot=child(root,'publication-audit'),pdfDestination=child(root,'pdf-site');
  for(const directory of [source,destination,auditRoot,pdfDestination]) await ordinaryDirectory(directory);
  const stats=JSON.parse(await fs.readFile(path.join(source,'stats.json'),'utf8'));
  if(!/^collections\/[\w-]+\/$/.test(stats.dataset)) throw Error('Invalid active dataset');
  const manifest=JSON.parse(await fs.readFile(path.join(source,'study-guides/manifest.json'),'utf8'));
  if(manifest.dataset!==stats.dataset) throw Error('Study guides use a different dataset');
  const names=await listFiles(source),required=[...auditFiles,'build-state.json','study-guides/pilot.css'];
  // With a separate PDF site, volume PDFs are staged in pdf-site/ instead of public-site/.
  let pdfHosting=null;
  if(names.includes('pdf-hosting.json')){
    const config=JSON.parse(await fs.readFile(path.join(source,'pdf-hosting.json'),'utf8'));
    const url=pdfBase(config);
    if(config.url&&!url)throw Error('pdf-hosting.json url must be an https address ending in /');
    if(url)pdfHosting={url,repository:config.repository||''};
  }
  const hostedPdf=name=>pdfHosting&&/^pdf-volumes\/volume-\d+\.pdf$/.test(name);
  for(const name of required) if(!names.includes(name)) throw Error('Missing publication input: '+name);
  for(const name of ['compiled.json','compiled.json.gz','compiled.archive.json.gz','validation.json','sentence-review.json'])
    if(names.includes('study-guides/'+name)) throw Error('Package study guides before publication: '+name);
  const expectedFonts=sharedFonts.map(name=>'study-guides/fonts/'+name);
  const actualFonts=names.filter(name=>name.startsWith('study-guides/fonts/'));
  if(JSON.stringify(actualFonts)!==JSON.stringify([...expectedFonts].sort())) throw Error('Unexpected study-guide fonts');
  for(const font of sharedFonts) {
    const [original,copy]=await Promise.all([fs.readFile(path.join(source,'fonts',font)),fs.readFile(path.join(source,'study-guides/fonts',font))]);
    if(!original.equals(copy)) throw Error('Shared font differs: '+font);
  }
  const originalCss=await fs.readFile(path.join(source,'study-guides/pilot.css'),'utf8');
  let fontReferences=0;
  const css=originalCss.replace(/url\('\.\/fonts\/([^']+)'\)/g,(match,font)=>{
    if(!sharedFonts.includes(font)) throw Error('Unknown study-guide font: '+font);
    fontReferences++;return `url('../fonts/${font}')`;
  });
  if(fontReferences!==3||/url\('\.\/fonts\//.test(css)) throw Error('Unexpected study-guide font stylesheet');
  const auditDirectory=path.join(auditRoot,commit,stats.dataset.split('/')[1]);
  for(const directory of [path.join(auditRoot,commit),auditDirectory]) await ordinaryDirectory(directory);
  await fs.mkdir(auditDirectory,{recursive:true});
  async function retain(name,bytes) {
    const file=path.join(auditDirectory,name);await fs.mkdir(path.dirname(file),{recursive:true});
    try { await fs.writeFile(file,bytes,{flag:'wx'}); }
    catch(error) { if(error.code!=='EEXIST')throw error;if(!(await fs.readFile(file)).equals(bytes))throw Error('Existing audit differs; preserve it and use a new build: '+name); }
    if(!(await fs.readFile(file)).equals(bytes)) throw Error('Audit copy changed: '+name);
  }
  // Retain the audit exports successfully before preparing the upload directory.
  for(const name of auditFiles) await retain(name,await fs.readFile(path.join(source,name)));
  await retain('study-guides/pilot.css',Buffer.from(originalCss));
  await retain('README.txt',Buffer.from('Exact build audit exports retained outside GitHub Pages. The source dist and build-state.json remain intact for local work and caching. files.json.gz records every public path, byte length and SHA-256. Use scripts/verify-publication.mjs with this directory to verify the live guide payloads. Keep this folder locally before the GitHub Actions audit artifact expires.\n'));
  // destination is the checked, fixed public-site child of root, never dist.
  let prior=[];
  if(reuseVerifiedFiles){await fs.mkdir(destination,{recursive:true});prior=await listFiles(destination);}
  else{await fs.rm(destination,{recursive:true,force:true});await fs.mkdir(destination);}
  const excluded=[],files=[];
  const directories=new Set(names.map(name=>path.posix.dirname(name)).filter(name=>name!=='.'));
  for(const directory of directories) {
    if(directory==='study-guides/fonts'||(pdfHosting&&directory==='pdf-volumes')||(directory.startsWith('collections/')&&!directory.startsWith(stats.dataset.slice(0,-1))))continue;
    await fs.mkdir(path.join(destination,directory),{recursive:true});
  }
  const rows=await parallelMap(names,async name=>{
    const bytes=await fs.readFile(path.join(source,name));
    const entry={path:name,bytes:bytes.length,sha256:sha256(bytes)};
    let reason;
    if(auditFiles.includes(name))reason='retained audit';
    else if(name==='build-state.json'||name==='subject-match-state.json.gz')reason='build cache only';
    else if(expectedFonts.includes(name))reason='identical shared font';
    else if(name.startsWith('collections/')&&!name.startsWith(stats.dataset))reason='obsolete dataset';
    else if(hostedPdf(name))reason='hosted on PDF site';
    if(reason)return {excluded:{...entry,reason}};
    const published=name==='study-guides/pilot.css'?Buffer.from(css):bytes;
    const target=path.join(destination,name);let unchanged=false;
    if(reuseVerifiedFiles)try{unchanged=(await fs.readFile(target)).equals(published);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(!unchanged)await fs.writeFile(target,published);
    const copied=await fs.readFile(target);
    if(!copied.equals(published))throw Error('Publication copy changed: '+name);
    return {file:{path:name,bytes:published.length,sha256:sha256(published)},sourceBytes:bytes.length};
  });
  for(const row of rows)if(row.excluded)excluded.push(row.excluded);else files.push(row.file);
  if(reuseVerifiedFiles){
    const current=new Set(files.map(f=>f.path));current.add('publication.json');
    for(const name of prior)if(!current.has(name)){
      const target=path.resolve(destination,name);if(!target.startsWith(destination+path.sep))throw Error('Unsafe stale publication file');
      await fs.unlink(target);
    }
  }
  let pdfSite=null;
  if(pdfHosting){
    // pdf-site/ is deployed to the separate PDF repository. Its manifest lets
    // the deployment skip an unchanged PDF site and verify the live copies.
    await fs.rm(pdfDestination,{recursive:true,force:true});await fs.mkdir(path.join(pdfDestination,'pdf-volumes'),{recursive:true});
    const pdfs=await parallelMap(names.filter(hostedPdf),async name=>{
      const bytes=await fs.readFile(path.join(source,name));await fs.writeFile(path.join(pdfDestination,name),bytes);
      if(!(await fs.readFile(path.join(pdfDestination,name))).equals(bytes))throw Error('PDF copy changed: '+name);
      return {path:name,bytes:bytes.length,sha256:sha256(bytes)};
    },4);
    if(!pdfs.length)throw Error('No volume PDFs to publish on the PDF site');
    const pdfManifest=JSON.stringify({format:1,files:pdfs},null,1)+'\n';
    await fs.writeFile(path.join(pdfDestination,'pdf-site.json'),pdfManifest);
    await fs.writeFile(path.join(pdfDestination,'.nojekyll'),'');
    await fs.writeFile(path.join(pdfDestination,'index.html'),'<!doctype html><meta charset="utf-8"><title>Partial Inventory volume PDFs</title><p>This site serves the volume PDFs used by the Partial Inventory browser\'s Volume view.</p>\n');
    const pdfBytes=pdfs.reduce((sum,file)=>sum+file.bytes,0);
    if(pdfBytes>=1_000_000_000)throw Error('PDF site exceeds hosting limit: '+pdfBytes);
    pdfSite={...pdfHosting,files:pdfs.length,bytes:pdfBytes,manifestSha256:sha256(pdfManifest)};
  }else await fs.rm(pdfDestination,{recursive:true,force:true});
  const marker=Buffer.from(JSON.stringify({format:1,commit,dataset:stats.dataset,studyGuides:Object.keys(manifest.subjects).length,contentManifestSha256:sha256(JSON.stringify(files))})+'\n');
  await fs.writeFile(path.join(destination,'publication.json'),marker);
  files.push({path:'publication.json',bytes:marker.length,sha256:sha256(marker)});files.sort((a,b)=>a.path.localeCompare(b.path,'en'));
  const publicBytes=files.reduce((sum,file)=>sum+file.bytes,0);
  if(publicBytes>=1_000_000_000)throw Error('Public site exceeds hosting limit: '+publicBytes);
  const inventory=gzipSync(JSON.stringify(files),{level:9});
  const sourceBytes=rows.reduce((sum,row)=>sum+(row.excluded?.bytes??row.sourceBytes),0);
  const summary={format:1,commit,dataset:stats.dataset,studyGuides:Object.keys(manifest.subjects).length,sourceBytes,publicBytes,savedBytes:sourceBytes-publicBytes,remainingBytes:1_000_000_000-publicBytes,publicFiles:files.length,manifestSha256:sha256(inventory),pdfSite,excluded};
  await retain('files.json.gz',inventory);await retain('summary.json',Buffer.from(JSON.stringify(summary,null,2)+'\n'));
  return {...summary,auditDirectory};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const result=await preparePages(root,{commit:process.argv[2]||process.env.GITHUB_SHA||'local'});
  console.log(JSON.stringify(result,null,2));
  if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,`\nPublic site: ${result.publicBytes.toLocaleString('en-US')} bytes; saved ${result.savedBytes.toLocaleString('en-US')} bytes; ${result.remainingBytes.toLocaleString('en-US')} bytes free. Audit records are in the separate publication-audit artifact.\n`);
}
