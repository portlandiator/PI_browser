import {ovalLayout} from './subject-graph.mjs';
import {escapeHtml as esc} from './text.mjs';
import {subjectColorStyle} from './subject-colors.mjs';
import {zoomCamera} from './global-graph-layout.mjs';
let cached, savedCamera;

export function graphShell(neighborhood){
  const {depth}=neighborhood;
  return `<section class="graph-panel" aria-label="Knowledge graph"><div class="graph-heading"><h2>Connected subjects</h2></div><div class="graph-body"><p role="status">Arranging subjects within ${depth} ${depth===1?'hop':'hops'}…</p></div></section>`;
}

export function mountGraph(panel,{neighborhood,subject,lines,url}){
  const abort=new AbortController(),signal=abort.signal;
  let worker,disposed=false,frame=0,resize;
  const listen=(el,type,fn,options={})=>el.addEventListener(type,fn,{...options,signal});
  const body=panel.querySelector('.graph-body');
  load();
  async function load(){
    try{
      const {edges,depth}=neighborhood;
      const nodes=neighborhood.nodes.map(s=>({...s,lines:lines(s.name),width:146})).map(s=>({...s,height:Math.max(40,s.lines.length*16+20)}));
      const viewportWidth=Math.max(300,body.clientWidth),viewportHeight=560;
      const key=JSON.stringify([subject.id,depth,viewportWidth,nodes.map(s=>s.id),edges]);
      let layout;
      if(cached?.key===key)layout=cached.layout;
      else if(depth===1){
        const focus=nodes.find(n=>n.id===subject.id),others=nodes.filter(n=>n.id!==subject.id),height=Math.max(...nodes.map(n=>n.height));
        const circle=ovalLayout(others.length,146,height,viewportWidth,viewportHeight);
        layout={width:circle.width,height:circle.height,nodes:[{...focus,x:circle.center[0],y:circle.center[1]},...others.map((n,i)=>({...n,x:circle.neighbors[i][0],y:circle.neighbors[i][1]}))]};cached={key,layout};savedCamera=null;
      }else{
        layout=await new Promise((resolve,reject)=>{
          worker=new Worker(new URL('./global-graph-worker.mjs',import.meta.url),{type:'module'});
          worker.onmessage=e=>{worker.terminate();e.data.error?reject(Error(e.data.error)):resolve(e.data.layout);};
          worker.onerror=()=>{worker.terminate();reject(Error('The graph layout could not be loaded.'));};
          worker.postMessage({nodes,edges});
        });cached={key,layout};savedCamera=null;
      }
      if(disposed)return;
      draw(layout,edges);
    }catch(e){if(!disposed)body.innerHTML=`<p role="alert">${esc(e.message)} Reload to try again.</p>`;}
  }
  function draw(layout,edges){
    const positions=new Map(layout.nodes.map(n=>[n.id,n]));
    body.innerHTML=`<svg class="subject-graph global-graph" tabindex="0" role="group" aria-label="Subject network within ${neighborhood.depth} ${neighborhood.depth===1?'hop':'hops'}" aria-description="Drag to move; scroll or pinch to zoom. Keyboard: arrows to move, plus or minus to zoom, 0 to fit. Select a subject to read."><g class="graph-camera"><g class="global-edges">${edges.map(e=>{const a=positions.get(e.source),b=positions.get(e.target);return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" ${e.status==='suggested'?'stroke-dasharray="8 6"':''}><title>${esc(a.name)} — ${esc(e.type)} — ${esc(b.name)} (${esc(e.status)})</title></line>`;}).join('')}</g>${layout.nodes.map(n=>`<a data-node="${n.id}" href="${esc(url({subject:n.id,page:null}))}" aria-label="${esc(n.name)}" ${n.id===subject.id?'aria-current="true"':''} style="${subjectColorStyle(n)}"><title>${esc(n.name)}</title><rect x="${n.x-n.width/2}" y="${n.y-n.height/2}" width="${n.width}" height="${n.height}" rx="6"/><text x="${n.x}" y="${n.y}" text-anchor="middle">${n.lines.map((line,i)=>`<tspan x="${n.x}" y="${n.y-(n.lines.length-1)*8+4+i*16}">${esc(line)}</tspan>`).join('')}</text></a>`).join('')}</g></svg>`;
    const svg=body.querySelector('svg'),cameraGroup=svg.querySelector('.graph-camera');
    let camera=savedCamera?{...savedCamera}:null,minScale=0.01,fitted=false;
    const size=()=>({width:svg.clientWidth,height:svg.clientHeight});
    function paint(){savedCamera={...camera};if(frame)return;frame=requestAnimationFrame(()=>{frame=0;cameraGroup.setAttribute('transform',`translate(${camera.x} ${camera.y}) scale(${camera.scale})`);});}
    function fit(){fitted=true;const {width,height}=size();minScale=Math.min(width/layout.width,height/layout.height)*0.92;camera={scale:minScale,x:(width-layout.width*minScale)/2,y:(height-layout.height*minScale)/2};paint();}
    function zoom(factor,anchor){fitted=false;const {width,height}=size();camera=zoomCamera(camera,factor,anchor||{x:width/2,y:height/2},minScale*0.5,4);paint();}
    function center(id){fitted=false;const n=positions.get(id);if(!n)return;const {width,height}=size(),scale=Math.min(1.3,width/(n.width+70),height/(n.height+70));camera={scale,x:width/2-n.x*scale,y:height/2-n.y*scale};paint();}
    function originalSize(){fitted=false;const {width,height}=size(),focus=positions.get(subject.id);camera={scale:1,x:width/2-focus.x,y:height/2-focus.y};paint();}
    if(neighborhood.depth===1)svg.style.height=`${Math.min(900,Math.max(560,layout.height))}px`;
    if(camera)paint();else originalSize();
    function reflowOval(width,height){
      if(neighborhood.depth!==1)return;
      const others=layout.nodes.filter(n=>n.id!==subject.id),focus=positions.get(subject.id),oldX=focus.x,oldY=focus.y;
      const oval=ovalLayout(others.length,146,Math.max(...layout.nodes.map(n=>n.height)),width,height);
      layout.width=oval.width;layout.height=oval.height;
      [focus.x,focus.y]=oval.center;others.forEach((n,i)=>{[n.x,n.y]=oval.neighbors[i];});
      svg.querySelectorAll('[data-node]').forEach(a=>{const n=positions.get(a.dataset.node),rect=a.querySelector('rect'),text=a.querySelector('text');rect.setAttribute('x',n.x-n.width/2);rect.setAttribute('y',n.y-n.height/2);text.setAttribute('x',n.x);text.setAttribute('y',n.y);a.querySelectorAll('tspan').forEach((t,i)=>{t.setAttribute('x',n.x);t.setAttribute('y',n.y-(n.lines.length-1)*8+4+i*16);});});
      svg.querySelectorAll('.global-edges line').forEach((line,i)=>{const a=positions.get(edges[i].source),b=positions.get(edges[i].target);for(const [key,value] of Object.entries({x1:a.x,y1:a.y,x2:b.x,y2:b.y}))line.setAttribute(key,value);});
      camera.x+=(oldX-focus.x)*camera.scale;camera.y+=(oldY-focus.y)*camera.scale;
    }
    let previousSize=size();
    resize=new ResizeObserver(()=>{const next=size();reflowOval(next.width,next.height);minScale=Math.min(next.width/layout.width,next.height/layout.height)*0.92;if(fitted)fit();else{camera.x+=(next.width-previousSize.width)/2;camera.y+=(next.height-previousSize.height)/2;paint();}previousSize=next;});resize.observe(svg);
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
  return ()=>{disposed=true;worker?.terminate();abort.abort();resize?.disconnect();cancelAnimationFrame(frame);};
}
