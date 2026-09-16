import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export async function buildVolumes(root,out){
  const source=path.join(root,'pdf_volumes - copy');
  const files=(await fs.readdir(source)).filter(name=>/\.pdf$/i.test(name)).sort();
  if(!files.length)throw new Error('No volume PDFs were found.');
  const volumes={};
  await fs.mkdir(path.join(out,'pdf-volumes'),{recursive:true});
  for(const name of files){
    const match=/^volume_(\d+)\b.*\.pdf$/i.exec(name);
    if(!match)throw new Error(`Cannot determine volume number: ${name}`);
    const number=String(Number(match[1]));
    if(volumes[number])throw new Error(`Duplicate PDF for volume ${number}`);
    const file=path.join(source,name),handle=await fs.open(file,'r');
    try{const header=Buffer.alloc(5);await handle.read(header,0,5,0);if(header.toString()!=='%PDF-')throw new Error(`Invalid PDF header: ${name}`);}finally{await handle.close();}
    const destination=`pdf-volumes/volume-${number}.pdf`;
    await fs.copyFile(file,path.join(out,destination));
    volumes[number]=destination;
  }
  await fs.writeFile(path.join(out,'volumes.json'),JSON.stringify(volumes));
  console.log(`Published ${files.length} volume PDFs`);
  return volumes;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  await buildVolumes(root,path.join(root,'dist'));
}
