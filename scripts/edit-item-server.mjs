import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {spawn} from 'node:child_process';
import {requireSourceFolders,validId} from './item-store.mjs';
import {CatalogEdits,previewDeletion} from './catalog-edits.mjs';
import {githubTarget} from './github-target.mjs';
import {tool} from './publish-tools.mjs';

const directory=path.dirname(fileURLToPath(import.meta.url));
// A private local page for one item at a time. Saving records the change in
// the pending file; Publish-Editorial-Decisions.cmd publishes everything
// pending as one pull request.
export async function startEditor({root=path.resolve(directory,'..'),port=0,open=true,pendingPath}={}){
  await requireSourceFolders(root);
  const edits=new CatalogEdits(root,{file:pendingPath}),token=randomBytes(32).toString('hex');let busy=false;
  // The live-site link follows this checkout's GitHub origin.
  const site=await githubTarget(root,{gh:await tool('gh',root),git:await tool('git',root)}).then(target=>target.site,()=>'');
  const page=(await fs.readFile(path.join(directory,'item-editor.html'),'utf8')).replace('%SITE%',site.replace(/[^\w:/.~-]/g,''));
  const server=http.createServer(async(req,res)=>{
    const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
    const address=`127.0.0.1:${server.address().port}`,origin='http://'+address;
    if(req.headers.host!==address){send(403,{error:'Invalid host'});return;}
    if(req.method==='GET'&&req.url==='/'){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; form-action 'none'"});res.end(page);return;
    }
    const supplied=Buffer.from(req.headers['x-editor-token']||'');
    if(req.method!=='POST'||req.headers.origin!==origin||supplied.length!==token.length||!timingSafeEqual(supplied,Buffer.from(token))||req.headers['content-type']!=='application/json'){send(403,{error:'Open the editor using its private local link.'});return;}
    try{
      const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>24*1024*1024)throw Error('This item is too large for the editor.');chunks.push(chunk);}
      const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(req.url==='/load'){send(200,await edits.load(input.id));return;}
      if(req.url==='/pending'){send(200,await edits.list());return;}
      if(busy){send(409,{error:'Wait for the current operation to finish.'});return;}
      busy=true;
      try{
        if(req.url==='/save')send(200,await edits.save(input));
        else if(req.url==='/discard')send(200,await edits.discard(input.id));
        else if(req.url==='/clear'){
          if(input.confirm!==true)throw Error('Confirm clearing all pending catalog edits.');
          send(200,await edits.clear());
        }
        else if(req.url==='/delete-preview')send(200,await previewDeletion(root,input.id));
        else if(req.url==='/delete'){
          if(!validId(input.id)||input.confirm!==input.id)throw Error('Type the exact ID to confirm the deletion.');
          send(200,await edits.markDeletion(input.id));
        }
        else send(404,{error:'Unknown operation'});
      }finally{busy=false;}
    }catch(error){send(400,{error:error.message});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  const url=`http://127.0.0.1:${server.address().port}/#token=${token}`;
  console.log('Catalog item editor: '+url);console.log('Keep this window open while editing. Source folder: '+path.resolve(root));
  if(open&&process.platform==='win32')spawn('powershell.exe',['-NoProfile','-Command',`Start-Process '${url}'`],{windowsHide:true,stdio:'ignore'}).on('error',()=>{});
  return {server,url,token};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))startEditor({root:process.argv[2]||path.resolve(directory,'..'),open:!process.env.PI_EDITOR_NO_OPEN}).catch(error=>{console.error(error.message);process.exitCode=1;});
