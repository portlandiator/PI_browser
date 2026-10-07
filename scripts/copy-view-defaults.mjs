import fs from 'node:fs/promises';
import path from 'node:path';
import {defaultFiles,parseDefaults} from '../src/view-defaults.mjs';

export async function copyViewDefaults(root,out){
  for(const [kind,file] of Object.entries(defaultFiles)){
    const text=await fs.readFile(path.join(root,file),'utf8');
    parseDefaults(kind,text);
    await fs.writeFile(path.join(out,file),text);
  }
}
