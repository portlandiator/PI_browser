import fs from 'node:fs/promises';
import path from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';

// Publication packaging only: editorial checks still use the complete originals.
// A round trip must reproduce every byte before an original is replaced.
export async function packStudyGuides(root,out){
  const directory=path.join(out,'study-guides');
  for(const name of await fs.readdir(directory)){
    if(name==='index.html'||!name.endsWith('.html'))continue;
    const file=path.join(directory,name),html=await fs.readFile(file,'utf8');
    if(html.includes('src="guide-loader.mjs"'))continue;
    const match=/^([\s\S]*?<body[^>]*>)([\s\S]*)(<\/body><\/html>\s*)$/.exec(html);
    if(!match)throw Error('Unexpected guide document: '+name);
    const payload=Buffer.from(match[2]),packed=gzipSync(payload,{level:9});
    if(!gunzipSync(packed).equals(payload))throw Error('Guide packaging changed wording: '+name);
    await fs.writeFile(file+'.gz',packed);
    const heading=match[2].match(/<h1>[\s\S]*?<\/h1>/)?.[0]||'<h1>Study guide</h1>';
    const header=match[2].match(/<header>[\s\S]*?<\/header>/)?.[0]||'';
    const head=match[1].replace('<script src="pilot-view.js" defer></script>','').replace('</head>','<script type="module" src="guide-loader.mjs"></script></head>');
    await fs.writeFile(file,head+header+'<main id="main" aria-busy="true">'+heading+'<p role="status" id="guide-loading">Opening the study guide…</p><noscript>Please enable JavaScript to read this guide.</noscript></main>'+match[3]);
  }
  for(const name of ['compiled.json','validation.json','sentence-review.json']){
    const file=path.join(directory,name);let bytes;
    try{bytes=await fs.readFile(file);}catch(error){if(error.code==='ENOENT')continue;throw error;}
    const packed=gzipSync(bytes,{level:9});
    if(!gunzipSync(packed).equals(bytes))throw Error('Guide export changed during packaging');
    await fs.writeFile(file+'.gz',packed);await fs.unlink(file);
  }
  await fs.copyFile(path.join(root,'scripts/compilation-guide-loader.mjs'),path.join(directory,'guide-loader.mjs'));
}
