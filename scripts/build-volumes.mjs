import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {volumeTitle} from './volume-title.mjs';

export async function buildVolumes(root,out){
  const withheld=JSON.parse(await fs.readFile(path.join(root,'data','withheld-pdf-volumes.json'),'utf8'));
  const source=path.join(root,'pdf_volumes - copy');
  const files=(await fs.readdir(source)).filter(name=>/\.pdf$/i.test(name)).sort();
  if(!files.length)throw new Error('No volume PDFs were found.');
  const volumes={},titles={};
  await fs.mkdir(path.join(out,'pdf-volumes'),{recursive:true});
  for(const number of Object.keys(withheld)){
    if(!/^\d+$/.test(number))throw Error('Unsafe withheld volume number');
    await fs.rm(path.join(out,'pdf-volumes',`volume-${number}.pdf`),{force:true});
  }
  for(const name of files){
    const match=/^volume_(\d+)\b.*\.pdf$/i.exec(name);
    if(!match)throw new Error(`Cannot determine volume number: ${name}`);
    const number=String(Number(match[1]));
    if(Object.hasOwn(withheld,number))continue;
    if(volumes[number])throw new Error(`Duplicate PDF for volume ${number}`);
    const file=path.join(source,name),handle=await fs.open(file,'r');
    try{const header=Buffer.alloc(5);await handle.read(header,0,5,0);if(header.toString()!=='%PDF-')throw new Error(`Invalid PDF header: ${name}`);}finally{await handle.close();}
    const destination=`pdf-volumes/volume-${number}.pdf`;
    await fs.copyFile(file,path.join(out,destination));
    volumes[number]=destination;
    titles[number]=volumeTitle(name);
  }
  await fs.writeFile(path.join(out,'volumes.json'),JSON.stringify(volumes));
  await fs.writeFile(path.join(out,'volume-titles.json'),JSON.stringify(titles));
  console.log(`Published ${Object.keys(volumes).length} volume PDFs`);
  return volumes;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  await buildVolumes(root,path.join(root,'dist'));
}
