import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {beginCollectionUpdate} from './collection-storage.mjs';

// The Windows updater supplies its separately built and tested staging output.
// Hold the same lock as builds throughout copying and retiring the old dataset.
export async function installBuiltSite(root,source){
  const out=path.resolve(root,'dist');source=path.resolve(source);
  const relative=path.relative(out,source);
  if(!relative||(!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative)))throw Error('Staged output must be outside the destination site');
  try{await fs.access(path.join(source,'.collection-update.lock'));throw Error('Staged build is still locked');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  const update=await beginCollectionUpdate(root);
  try{
    await fs.cp(source,out,{recursive:true});
    return await update.prune();
  }finally{await update.close();}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(!process.argv[2])throw Error('Usage: node scripts/install-built-site.mjs <tested-stage-dist>');
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  console.log('Installed tested site:',await installBuiltSite(root,process.argv[2]));
}
