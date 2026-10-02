import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {spawn} from 'node:child_process';
import {ItemStore} from './item-store.mjs';

const directory=path.dirname(fileURLToPath(import.meta.url));
export async function startEditor({root=path.resolve(directory,'..'),port=0,open=true}={}){
  const store=new ItemStore(root),token=randomBytes(32).toString('hex');let busy=false,job=null;
  const page=await fs.readFile(path.join(directory,'item-editor.html'));
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
      if(req.url==='/status'){send(200,{job});return;}
      if(req.url==='/load'){send(200,await store.load(input.id));return;}
      if(busy||job?.status==='running'){send(409,{error:'Wait for the current save or publication to finish.'});return;}
      if(req.url==='/save'){
        busy=true;try{send(200,await store.save(input));}finally{busy=false;}return;
      }
      if(req.url==='/publish'){
        busy=true;
        try{
        const current=await store.load(input.id);if(current.revision!==input.revision)throw Error('Sources changed. Reload before publishing.');
        job={status:'running',id:current.id,log:'Preparing publication…\n'};
        const child=spawn(process.execPath,[path.join(directory,'publish-item.mjs'),path.resolve(root),current.id,current.revision],{windowsHide:true,stdio:['ignore','pipe','pipe']});
        const append=data=>{job.log=(job.log+data).slice(-60000);};
        child.stdout.on('data',append);child.stderr.on('data',append);
        child.on('error',error=>{append(error.message);job.status='failed';});
        child.on('close',code=>{job.status=code===0?'success':'failed';});
        send(202,{job});return;
        }finally{busy=false;}
      }
      send(404,{error:'Unknown operation'});
    }catch(error){send(400,{error:error.message});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  const url=`http://127.0.0.1:${server.address().port}/#token=${token}`;
  console.log('Single-item catalog editor: '+url);console.log('Keep this window open while editing or publishing. Source folder: '+path.resolve(root));
  if(open&&process.platform==='win32')spawn('powershell.exe',['-NoProfile','-Command',`Start-Process '${url}'`],{windowsHide:true,stdio:'ignore'}).on('error',()=>{});
  return {server,url,token};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))startEditor({root:process.argv[2]||path.resolve(directory,'..'),open:!process.env.PI_EDITOR_NO_OPEN}).catch(error=>{console.error(error.message);process.exitCode=1;});
