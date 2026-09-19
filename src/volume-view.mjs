import {externalPdfUrl,pdfLinkBoxes,pdfDestinationPage} from './pdf-links.mjs';
const $=id=>document.getElementById(id);
const wide=matchMedia('(min-width:1100px)');
let directory={},titles={},pdf,task,lib,volume='',page=1,epoch=0,renderEpoch=0,renders=[];
const count=()=> $('layout').value==='spread'||($('layout').value==='auto'&&wide.matches)?2:1;
function save(replace=false){
  const url=new URL(location.href);url.searchParams.set('volume',volume);url.searchParams.set('page',page);
  url.searchParams.set('layout',$('layout').value);url.searchParams.set('zoom',$('zoom').value);
  history[replace?'replaceState':'pushState']({},'',url);
}
function controls(){
  $('page').disabled=$('go').disabled=!pdf;$('page').value=page;$('page').max=pdf?.numPages||1;
  $('page-total').textContent=pdf?`of ${pdf.numPages}`:'';
  $('previous').disabled=!pdf||page<=1;$('next').disabled=!pdf||page+count()>pdf.numPages;
  if(volume)$('pdf-link').href=`./${directory[volume]}#page=${page}`;
}
function clear(){for(const render of renders)render.cancel();renders=[];$('pdf-pages').replaceChildren();}
async function pageLinks(sheet,current,viewport,number){
  const layer=document.createElement('div');layer.className='pdf-links';
  for(const annotation of await sheet.getAnnotations({intent:'display'})){
    if(annotation.subtype!=='Link'||(annotation.annotationFlags&35))continue;
    const external=externalPdfUrl(annotation.url);
    let target=null;
    if(!external){
      try{target=await pdfDestinationPage(current,annotation.dest);}catch{continue;}
      const actions={FirstPage:1,LastPage:current.numPages,NextPage:Math.min(number+1,current.numPages),PrevPage:Math.max(number-1,1)};
      if(!target&&Object.hasOwn(actions,annotation.action))target=actions[annotation.action];
      if(!target)continue;
    }
    for(const box of pdfLinkBoxes(annotation,viewport)){
      const link=document.createElement('a');link.className='pdf-page-link';
      for(const [key,value] of Object.entries(box))link.style[key]=`${value}%`;
      if(external){link.href=external;link.target='_blank';link.rel='noopener noreferrer';link.title=`${external} (opens in a new tab)`;}
      else{const url=new URL(location.href);url.searchParams.set('page',target);link.href=url.href;link.title=`Go to page ${target}`;link.addEventListener('click',event=>{if(event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();if(pdf===current)move(target);});}
      link.setAttribute('aria-label',link.title);layer.append(link);
    }
  }
  return layer;
}
async function draw(){
  if(!pdf)return;const current=pdf,version=++renderEpoch;for(const render of renders)render.cancel();renders=[];controls();
  const figures=document.createDocumentFragment();
  $('pdf-reader').setAttribute('aria-busy','true');$('volume-status').textContent='Rendering pages…';$('retry').hidden=true;
  const start=page,end=Math.min(start+count()-1,current.numPages),gap=wide.matches?16:8;
  const width=Math.max(100,($('pdf-reader').clientWidth-(wide.matches?40:16)-gap*(count()-1))/count())*Number($('zoom').value);
  try{
    for(let number=start;number<=end;number++){
      const sheet=await current.getPage(number);if(version!==renderEpoch)return;
      const base=sheet.getViewport({scale:1}),scale=width/base.width;
      const ratio=Math.min(devicePixelRatio||1,2,Math.sqrt(12000000/(width*width*base.height/base.width)));
      const viewport=sheet.getViewport({scale:scale*ratio});
      const figure=document.createElement('figure');figure.className='pdf-page';figure.style.width=`${width}px`;
      const canvas=document.createElement('canvas');canvas.width=Math.floor(viewport.width);canvas.height=Math.floor(viewport.height);canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`Volume ${volume}, page ${number}`);
      const surface=document.createElement('div');surface.className='pdf-page-surface';surface.append(canvas);
      const caption=document.createElement('figcaption');caption.textContent=`Page ${number}`;figure.append(surface,caption);figures.append(figure);
      const render=sheet.render({canvasContext:canvas.getContext('2d'),viewport});renders.push(render);await render.promise;
      surface.append(await pageLinks(sheet,current,base,number));if(version!==renderEpoch)return;sheet.cleanup();
    }
    if(version!==renderEpoch)return;
    $('pdf-pages').replaceChildren(figures);
    $('volume-status').textContent='';
  }catch(error){if(version!==renderEpoch)return;$('volume-status').textContent='These pages could not be rendered. Try again or open the PDF directly.';$('retry').hidden=false;}
  finally{if(version===renderEpoch)$('pdf-reader').setAttribute('aria-busy','false');}
}
async function openVolume(id,requestedPage=1){
  const version=++epoch;++renderEpoch;clear();pdf=null;controls();
  $('pdf-reader').setAttribute('aria-busy','true');$('retry').hidden=true;
  const previousTask=task;task=null;if(previousTask)await previousTask.destroy();if(version!==epoch)return;
  if(!Object.hasOwn(directory,id)){
    volume='';$('volume').value='';$('pdf-link').hidden=true;$('volume-status').textContent='That volume is unavailable. Choose a volume from the menu.';$('pdf-reader').setAttribute('aria-busy','false');return;
  }
  volume=id;$('volume').value=id;$('volume').title=titles[id];$('pdf-link').hidden=false;controls();$('volume-status').textContent=`Opening volume ${id}…`;
  try{
    lib ||= await import('./vendor/pdfjs/pdf.mjs');if(version!==epoch)return;
    lib.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.mjs',import.meta.url).href;
    task=lib.getDocument({url:`./${directory[id]}`,cMapUrl:'./vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'./vendor/pdfjs/standard_fonts/',wasmUrl:'./vendor/pdfjs/wasm/',isEvalSupported:false});
    const loaded=await task.promise;if(version!==epoch)return;pdf=loaded;
    page=Math.max(1,Math.min(pdf.numPages,Math.trunc(Number(requestedPage))||1));save(true);await draw();
  }catch(error){if(version!==epoch)return;$('volume-status').textContent='This volume could not be opened. Try again or open the PDF directly.';$('retry').hidden=false;$('pdf-reader').setAttribute('aria-busy','false');}
}
function restore(){const params=new URLSearchParams(location.search);
  $('layout').value=['auto','single','spread'].includes(params.get('layout'))?params.get('layout'):'auto';
  $('zoom').value=['1','1.25','1.5','2'].includes(params.get('zoom'))?params.get('zoom'):'1';
  const id=params.get('volume')||'30';
  return openVolume(id,params.get('page')??(id==='30'?14:1));
}
function move(number){if(!pdf)return;page=Math.max(1,Math.min(pdf.numPages,number));save();draw().then(()=>{if($('pdf-reader').getBoundingClientRect().top<0)$('pdf-reader').scrollIntoView({block:'start'});});}
$('previous').onclick=()=>move(page-count());$('next').onclick=()=>move(page+count());
$('page-form').onsubmit=event=>{event.preventDefault();move(Number($('page').value));};
$('volume').onchange=()=>{volume=$('volume').value;page=1;save();openVolume(volume);};
for(const id of ['layout','zoom'])$(id).onchange=()=>{if(volume)save();draw();};
$('pdf-reader').onkeydown=event=>{if(event.altKey||event.ctrlKey||event.metaKey)return;if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();move(page+(event.key==='ArrowRight'?count():-count()));}};
let resizeTimer,lastWidth=0;new ResizeObserver(([entry])=>{const width=entry.contentRect.width;if(width===lastWidth)return;lastWidth=width;clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>draw(),150);}).observe($('pdf-reader'));
window.addEventListener('popstate',restore);
async function init(){try{const responses=await Promise.all([fetch('./volumes.json'),fetch('./volume-titles.json')]);if(responses.some(response=>!response.ok))throw new Error();[directory,titles]=await Promise.all(responses.map(response=>response.json()));
  const entries=Object.entries(directory).filter(([id,file])=>/^\d+$/.test(id)&&/^pdf-volumes\/volume-\d+\.pdf$/.test(file)).sort((a,b)=>Number(a[0])-Number(b[0]));
  if(!entries.length||entries.some(([id])=>typeof titles[id]!=='string'||!titles[id].trim()))throw new Error();directory=Object.fromEntries(entries);$('volume').replaceChildren(...entries.map(([id])=>new Option(titles[id],id)));$('volume').disabled=false;$('volume-count').textContent=entries.length;await restore();
}catch{$('volume-status').textContent='The volume directory could not be loaded. Please try again.';$('retry').hidden=false;$('pdf-reader').setAttribute('aria-busy','false');}}
$('retry').onclick=()=>volume?openVolume(volume,page):init();init();
