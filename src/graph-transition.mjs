const ns='http://www.w3.org/2000/svg';
const duration=500,lerp=(a,b,t)=>a+(b-a)*t;
function nodeBoxes(svg){
  const origin=svg.getBoundingClientRect();
  return new Map([...svg.querySelectorAll('a[data-node]')].map(a=>{
    const b=a.querySelector('rect').getBoundingClientRect();
    return [a.dataset.node,{x:b.x-origin.x+b.width/2,y:b.y-origin.y+b.height/2,width:b.width,height:b.height}];
  }));
}
// A shallow arc and a small change in apparent depth suggest a turn in space.
export function travelPoint(start,end,t){
  const dx=end.x-start.x,dy=end.y-start.y,distance=Math.hypot(dx,dy);
  const bend=Math.sin(Math.PI*t)*Math.min(44,distance*.16);
  return {x:lerp(start.x,end.x,t)-(distance?dy/distance*bend:0),y:lerp(start.y,end.y,t)+(distance?dx/distance*bend:0)};
}
export function captureGraph(svg){
  if(!svg||matchMedia('(prefers-reduced-motion: reduce)').matches)return null;
  const nodes=nodeBoxes(svg),clone=svg.cloneNode(true),originals=svg.querySelectorAll('g');
  clone.querySelectorAll('g').forEach((g,i)=>{
    const style=getComputedStyle(originals[i]);g.style.transform=style.transform;g.style.opacity=style.opacity;
  });
  clone.removeAttribute('tabindex');clone.setAttribute('aria-hidden','true');
  clone.querySelectorAll('a').forEach(a=>{a.removeAttribute('href');a.setAttribute('tabindex','-1');});
  return {nodes,clone};
}
export function transitionGraph(svg,previous){
  if(!previous||matchMedia('(prefers-reduced-motion: reduce)').matches)return ()=>{};
  const oldId=previous.clone.querySelector('[aria-current]')?.dataset.node,newId=svg.querySelector('[aria-current]')?.dataset.node;
  if(oldId===newId)return ()=>{};
  const current=nodeBoxes(svg),oldCenter=previous.nodes.get(oldId),newCenter=current.get(newId);
  if(!oldCenter||!newCenter)return ()=>{};
  const incomingStart=previous.nodes.get(newId)||oldCenter;
  const outgoingEnd=current.get(oldId)||{...oldCenter,x:oldCenter.x+newCenter.x-incomingStart.x,y:oldCenter.y+newCenter.y-incomingStart.y};
  const plans=new Map();
  for(const [id,end] of current){
    const start=previous.nodes.get(id);
    plans.set(id,t=>{
      if(start){const depth=1+.05*Math.sin(Math.PI*t);return {...travelPoint(start,end,t),width:lerp(start.width,end.width,t)*depth,height:lerp(start.height,end.height,t)*depth,opacity:1};}
      const anchor=travelPoint(incomingStart,newCenter,t),scale=lerp(.78,1,t);
      return {x:anchor.x+(end.x-newCenter.x)*scale,y:anchor.y+(end.y-newCenter.y)*scale,width:end.width*scale,height:end.height*scale,opacity:t};
    });
  }
  for(const [id,start] of previous.nodes){
    if(current.has(id))continue;
    plans.set(id,t=>{
      const anchor=travelPoint(oldCenter,outgoingEnd,t),scale=lerp(1,.78,t);
      return {x:anchor.x+(start.x-oldCenter.x)*scale,y:anchor.y+(start.y-oldCenter.y)*scale,width:start.width*scale,height:start.height*scale,opacity:1-t};
    });
  }
  // Only departing nodes remain in the old drawing; shared nodes never crossfade.
  const overlay=previous.clone;
  overlay.querySelectorAll('a[data-node]').forEach(a=>{if(current.has(a.dataset.node))a.remove();});
  Object.assign(overlay.style,{position:'absolute',left:'0',top:'0',width:svg.clientWidth+'px',pointerEvents:'none',margin:'0',background:'transparent',borderColor:'transparent'});
  const host=svg.parentElement,oldPosition=host.style.position;host.style.position='relative';host.append(overlay);
  const wrappers=[],drawNodes=[];
  for(const drawing of [svg,overlay])for(const a of drawing.querySelectorAll('a[data-node]')){
    const box=a.querySelector('rect').getBBox(),wrapper=document.createElementNS(ns,'g');
    a.before(wrapper);wrapper.append(a);wrappers.push(wrapper);
    const matrix=wrapper.parentElement.getScreenCTM();
    drawNodes.push({wrapper,box,id:a.dataset.node,inverse:matrix.inverse(),scaleX:Math.hypot(matrix.a,matrix.b),scaleY:Math.hypot(matrix.c,matrix.d)});
  }
  const drawEdges=[];
  for(const drawing of [svg,overlay])for(const line of drawing.querySelectorAll('.global-edges line')){
    drawEdges.push({line,source:line.dataset.source,target:line.dataset.target,inverse:line.parentElement.getScreenCTM().inverse(),old:drawing===overlay,original:['x1','y1','x2','y2'].map(k=>line.getAttribute(k))});
  }
  let frame=0,cleaned=false;
  const cleanup=()=>{
    if(cleaned)return;cleaned=true;cancelAnimationFrame(frame);
    wrappers.forEach(g=>g.replaceWith(...g.childNodes));
    drawEdges.filter(e=>!e.old).forEach(({line,original})=>{['x1','y1','x2','y2'].forEach((k,i)=>line.setAttribute(k,original[i]));line.style.removeProperty('opacity');});
    overlay.remove();host.style.position=oldPosition;
  };
  const started=performance.now();
  function paint(now){
    const elapsed=Math.min(1,(now-started)/duration),t=elapsed*elapsed*(3-2*elapsed);
    const origin=svg.getBoundingClientRect(),positions=new Map([...plans].map(([id,plan])=>[id,plan(t)]));
    const local=(point,inverse)=>new DOMPoint(origin.x+point.x,origin.y+point.y).matrixTransform(inverse);
    for(const {wrapper,box,id,inverse,scaleX,scaleY} of drawNodes){
      const point=positions.get(id),center=local(point,inverse),sx=point.width/(box.width*scaleX),sy=point.height/(box.height*scaleY);
      wrapper.setAttribute('transform','matrix('+[sx,0,0,sy,center.x-(box.x+box.width/2)*sx,center.y-(box.y+box.height/2)*sy].join(' ')+')');
      wrapper.style.opacity=point.opacity;
    }
    // Connections follow the moving endpoints rather than hanging in empty space.
    for(const {line,source,target,inverse,old} of drawEdges){
      const a=positions.get(source),b=positions.get(target);
      if(a&&b){const p=local(a,inverse),q=local(b,inverse);for(const [key,value] of Object.entries({x1:p.x,y1:p.y,x2:q.x,y2:q.y}))line.setAttribute(key,value);}
      line.style.opacity=.4*(old?1-t:t);
    }
    if(elapsed===1)cleanup();else frame=requestAnimationFrame(paint);
  }
  paint(started);
  return cleanup;
}
