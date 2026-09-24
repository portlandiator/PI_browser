import {escapeHtml as esc} from './text.mjs';
import {subjectColorStyle} from './subject-colors.mjs';
import {publicGraphEdges,zoomCamera} from './global-graph-layout.mjs';
let cached, savedCamera;

export function graphShell(local,global){
  return `<section class="graph-panel" aria-label="Knowledge graph"><div class="graph-heading"><h2>Connected subjects</h2><div class="graph-view-switch" role="group" aria-label="Graph view"><button type="button" data-graph-view="local" aria-pressed="${!global}">Local</button><button type="button" data-graph-view="global" aria-pressed="${global}">Global</button></div></div><div class="graph-body">${global?'<p role="status">Arranging the complete knowledge graph…</p>':local}</div></section>`;
}

export function mountGraph(panel,{index,subject,global,lines,url,onView,suggestions=true}){
  const abort=new AbortController(),signal=abort.signal;
  let worker,disposed=false,frame=0,resize,expanded=false;
  const listen=(el,type,fn,options={})=>el.addEventListener(type,fn,{...options,signal});
  panel.querySelectorAll('[data-graph-view]').forEach(b=>listen(b,'click',()=>onView(b.dataset.graphView)));
  const body=panel.querySelector('.graph-body');
  function collapse(){expanded=false;panel.classList.remove('graph-expanded');document.body.classList.remove('graph-open');panel.removeAttribute('role');panel.removeAttribute('aria-modal');if(document.fullscreenElement===panel)document.exitFullscreen?.().catch(()=>{});const b=panel.querySelector('[data-fullscreen]');if(b){b.textContent='Fullscreen';b.setAttribute('aria-pressed','false');}}
  if(global)load();
  async function load(){
    try{
      const edges=publicGraphEdges(index.edges,index.subjects,suggestions);
      const nodes=index.subjects.map(s=>({...s,lines:lines(s.name),width:170})).map(s=>({...s,height:Math.max(48,s.lines.length*16+24)}));
      const key=JSON.stringify([nodes.map(s=>s.id),edges]);
      let layout;
      if(cached?.key===key)layout=cached.layout;
      else{
        layout=await new Promise((resolve,reject)=>{
          worker=new Worker(new URL('./global-graph-worker.mjs',import.meta.url),{type:'module'});
          worker.onmessage=e=>{worker.terminate();e.data.error?reject(Error(e.data.error)):resolve(e.data.layout);};
          worker.onerror=()=>{worker.terminate();reject(Error('The graph layout could not be loaded.'));};
          worker.postMessage({nodes,edges});
        });cached={key,layout};savedCamera=null;
      }
      if(disposed)return;
      draw(layout,edges);
    }catch(e){if(!disposed)body.innerHTML=`<p role="alert">${esc(e.message)} Switch to Local, or try Global again.</p>`;}
  }
  function draw(layout,edges){
    const positions=new Map(layout.nodes.map(n=>[n.id,n]));
    body.innerHTML=`<div class="global-tools"><label>Find subject <input type="search" list="global-subject-options" placeholder="Subject name…" aria-label="Find subject in graph"></label><datalist id="global-subject-options">${layout.nodes.map(n=>`<option value="${esc(n.name)}"></option>`).join('')}</datalist><button data-find>Find</button><button data-current>Current subject</button><button data-fit>Fit all</button><button data-zoom="1.4" aria-label="Zoom in">+</button><button data-zoom="0.7142857" aria-label="Zoom out">−</button><button data-fullscreen aria-pressed="false">Fullscreen</button></div><p class="global-help" id="global-help">Drag to move · scroll or pinch to zoom · select a subject to read. Keyboard: arrows to move, +/− to zoom, 0 to fit, Escape to exit fullscreen.</p><p class="global-status" role="status">${layout.nodes.length} subjects · ${edges.length} connections</p><svg class="subject-graph global-graph" tabindex="0" role="group" aria-label="Entire knowledge graph" aria-describedby="global-help"><g class="graph-camera"><g class="global-edges">${edges.map(e=>{const a=positions.get(e.source),b=positions.get(e.target);return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" ${e.status==='suggested'?'stroke-dasharray="8 6"':''}><title>${esc(a.name)} — ${esc(e.type)} — ${esc(b.name)} (${esc(e.status)})</title></line>`;}).join('')}</g>${layout.nodes.map(n=>`<a data-node="${n.id}" href="${esc(url({subject:n.id,page:null}))}" aria-label="${esc(n.name)}" ${n.id===subject.id?'aria-current="true"':''} style="${subjectColorStyle(n)}"><title>${esc(n.name)}</title><rect x="${n.x-n.width/2}" y="${n.y-n.height/2}" width="${n.width}" height="${n.height}" rx="6"/><text x="${n.x}" y="${n.y}" text-anchor="middle">${n.lines.map((line,i)=>`<tspan x="${n.x}" y="${n.y-(n.lines.length-1)*8+4+i*16}">${esc(line)}</tspan>`).join('')}</text></a>`).join('')}</g></svg>`;
    const svg=body.querySelector('svg'),cameraGroup=svg.querySelector('.graph-camera'),status=body.querySelector('.global-status');
    let camera=savedCamera?{...savedCamera}:null,minScale=0.01,fitted=!savedCamera;
    const size=()=>({width:svg.clientWidth,height:svg.clientHeight});
    function paint(){savedCamera={...camera};if(frame)return;frame=requestAnimationFrame(()=>{frame=0;cameraGroup.setAttribute('transform',`translate(${camera.x} ${camera.y}) scale(${camera.scale})`);});}
    function fit(){fitted=true;status.textContent=`${layout.nodes.length} subjects · ${edges.length} connections`;const {width,height}=size();minScale=Math.min(width/layout.width,height/layout.height)*0.92;camera={scale:minScale,x:(width-layout.width*minScale)/2,y:(height-layout.height*minScale)/2};paint();}
    function zoom(factor,anchor){fitted=false;const {width,height}=size();camera=zoomCamera(camera,factor,anchor||{x:width/2,y:height/2},minScale*0.5,4);paint();}
    function center(id){fitted=false;const n=positions.get(id);if(!n)return;const {width,height}=size(),scale=Math.min(1.3,width/(n.width+70),height/(n.height+70));camera={scale,x:width/2-n.x*scale,y:height/2-n.y*scale};paint();status.textContent=n.name;}
    if(camera)paint();else fit();
    let previousSize=size();
    resize=new ResizeObserver(()=>{const next=size();minScale=Math.min(next.width/layout.width,next.height/layout.height)*0.92;if(fitted)fit();else{camera.x+=(next.width-previousSize.width)/2;camera.y+=(next.height-previousSize.height)/2;paint();}previousSize=next;});resize.observe(svg);
    listen(body.querySelector('[data-fit]'),'click',fit);
    listen(body.querySelector('[data-current]'),'click',()=>center(subject.id));
    const input=body.querySelector('input');const find=()=>{const q=input.value.trim().toLowerCase(),match=layout.nodes.find(n=>n.name.toLowerCase()===q)||layout.nodes.find(n=>q&&n.name.toLowerCase().includes(q));if(match)center(match.id);else status.textContent='No subject found. Try another name.';};
    listen(body.querySelector('[data-find]'),'click',find);listen(input,'keydown',e=>{if(e.key==='Enter'){e.preventDefault();find();}});
    body.querySelectorAll('[data-zoom]').forEach(b=>listen(b,'click',()=>zoom(Number(b.dataset.zoom))));
    const full=body.querySelector('[data-fullscreen]');
    listen(full,'click',()=>{if(expanded){collapse();return;}expanded=true;panel.classList.add('graph-expanded');document.body.classList.add('graph-open');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');full.textContent='Exit fullscreen';full.setAttribute('aria-pressed','true');panel.requestFullscreen?.().catch(()=>{});});
    listen(document,'fullscreenchange',()=>{if(!document.fullscreenElement&&expanded)collapse();});
    listen(document,'keydown',e=>{if(!expanded)return;if(e.key==='Escape'){e.preventDefault();collapse();full.focus();}if(e.key==='Tab'){const items=[...panel.querySelectorAll('button,input,a,svg[tabindex]')],first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
    const point=e=>{const r=svg.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
    listen(svg,'wheel',e=>{e.preventDefault();zoom(Math.exp(-Math.max(-200,Math.min(200,e.deltaY))*0.005),point(e));},{passive:false});
    const pointers=new Map();let previous,dragged=false,start,suppressUntil=0;
    const gesture=()=>{const p=[...pointers.values()];return p.length>1?{x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2,d:Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y)}:{...p[0],d:0};};
    listen(svg,'pointerdown',e=>{if(e.button!==0)return;pointers.set(e.pointerId,point(e));previous=gesture();if(pointers.size===1){dragged=false;start=point(e);}else dragged=true;});
    listen(svg,'pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,point(e));const next=gesture();if(Math.hypot(next.x-start.x,next.y-start.y)>5)dragged=true;if(dragged){fitted=false;svg.setPointerCapture(e.pointerId);if(next.d&&previous.d)zoom(next.d/previous.d,previous);camera.x+=next.x-previous.x;camera.y+=next.y-previous.y;paint();}previous=next;});
    const end=e=>{if(dragged)suppressUntil=performance.now()+400;pointers.delete(e.pointerId);previous=pointers.size?gesture():null;};
    listen(svg,'pointerup',end);listen(svg,'pointercancel',end);listen(svg,'pointerleave',e=>{if(!svg.hasPointerCapture(e.pointerId))end(e);});
    listen(svg,'click',e=>{if(performance.now()<suppressUntil){e.preventDefault();e.stopPropagation();}},{capture:true});
    listen(svg,'keydown',e=>{if(['+','=','-','0','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();if(e.key==='0')fit();else if(['+','=','-'].includes(e.key))zoom(e.key==='-'?1/1.4:1.4);else{fitted=false;camera.x+=e.key==='ArrowLeft'?60:e.key==='ArrowRight'?-60:0;camera.y+=e.key==='ArrowUp'?60:e.key==='ArrowDown'?-60:0;paint();}}});
    listen(svg,'focusin',e=>{const a=e.target.closest('[data-node]');if(a&&a.matches(':focus-visible'))center(a.dataset.node);});
  }
  return ()=>{disposed=true;worker?.terminate();abort.abort();resize?.disconnect();cancelAnimationFrame(frame);collapse();};
}
