import {relationKey} from './subject-relations.mjs';

// Connections are traversable in either direction. Return the induced graph:
// every public edge whose endpoints fall within the requested hop distance.
export function graphNeighborhood(subjects, edges, focus, requested=1, suggestions=true){
  const publicEdges=publicGraphEdges(edges,subjects,suggestions),adj=new Map(subjects.map(s=>[s.id,[]]));
  for(const e of publicEdges){adj.get(e.source).push(e.target);adj.get(e.target).push(e.source);}
  const distances=new Map(),queue=[];
  if(adj.has(focus)){distances.set(focus,0);queue.push(focus);}
  for(let i=0;i<queue.length;i++)for(const id of adj.get(queue[i]))if(!distances.has(id)){distances.set(id,distances.get(queue[i])+1);queue.push(id);}
  const maxDepth=Math.max(1,...distances.values()),parsed=Number(requested),depth=Math.min(maxDepth,Number.isFinite(parsed)?Math.max(1,Math.floor(parsed)):1);
  const nodes=subjects.filter(s=>distances.has(s.id)&&distances.get(s.id)<=depth),ids=new Set(nodes.map(s=>s.id));
  return {nodes,edges:publicEdges.filter(e=>ids.has(e.source)&&ids.has(e.target)),depth,maxDepth};
}

export function publicGraphEdges(edges, subjects, suggestions=true) {
  const ids=new Set(subjects.map(s=>s.id)), unique=new Map();
  for(const e of edges) {
    if(!ids.has(e.source)||!ids.has(e.target)||e.source===e.target)continue;
    const key=relationKey(e), prior=unique.get(key);
    if(!prior||e.status!=='suggested')unique.set(key,e);
  }
  return [...unique.values()].filter(e=>e.status!=='rejected'&&(suggestions||e.status!=='suggested'));
}

// A deterministic, bounded force layout, computed off the UI thread.
export function globalLayout(nodes, edges) {
  if(!nodes.length)return {nodes:[],width:1,height:1};
  const n=nodes.length, columns=Math.ceil(Math.sqrt(n));
  const points=nodes.map((s,i)=>({...s,x:(i%columns)*220,y:Math.floor(i/columns)*180}));
  const byId=new Map(points.map((p,i)=>[p.id,i]));
  const links=edges.map(e=>[byId.get(e.source),byId.get(e.target)]).filter(([a,b])=>a!==undefined&&b!==undefined);
  for(let step=0;step<180;step++){
    const dx=new Float64Array(n),dy=new Float64Array(n);
    for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
      let x=points[j].x-points[i].x,y=points[j].y-points[i].y;
      const d2=Math.max(25,x*x+y*y),d=Math.sqrt(d2),force=18000/d2;
      dx[i]-=x/d*force;dy[i]-=y/d*force;dx[j]+=x/d*force;dy[j]+=y/d*force;
    }
    for(const [a,b] of links){const x=points[b].x-points[a].x,y=points[b].y-points[a].y,d=Math.max(1,Math.hypot(x,y)),f=(d-260)*0.012;dx[a]+=x/d*f;dy[a]+=y/d*f;dx[b]-=x/d*f;dy[b]-=y/d*f;}
    const limit=30*(1-step/200);
    for(let i=0;i<n;i++){points[i].x+=Math.max(-limit,Math.min(limit,dx[i]));points[i].y+=Math.max(-limit,Math.min(limit,dy[i]));}
    separate(points);
  }
  for(let k=0;k<100;k++)if(!separate(points))break;
  // Resolve any residual crowding without a convergence assumption. Keep each
  // label close to its force position, but never cover another full label.
  const placed=[];
  for(const p of points){
    const x=p.x,y=p.y;let attempt=0;
    while(placed.some(q=>Math.abs(p.x-q.x)<(p.width+q.width)/2+24&&Math.abs(p.y-q.y)<(p.height+q.height)/2+24)){
      attempt++;const radius=20*Math.sqrt(attempt),angle=attempt*2.399963229728653;
      p.x=x+radius*Math.cos(angle);p.y=y+radius*Math.sin(angle);
    }
    placed.push(p);
  }
  const minX=Math.min(...points.map(p=>p.x-p.width/2))-60,minY=Math.min(...points.map(p=>p.y-p.height/2))-60;
  for(const p of points){p.x-=minX;p.y-=minY;}
  return {nodes:points,width:Math.max(...points.map(p=>p.x+p.width/2))+60,height:Math.max(...points.map(p=>p.y+p.height/2))+60};
}
function separate(points){
  let moved=false;
  for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){
    const a=points[i],b=points[j],x=b.x-a.x,y=b.y-a.y,ox=(a.width+b.width)/2+24-Math.abs(x),oy=(a.height+b.height)/2+24-Math.abs(y);
    if(ox<=0||oy<=0)continue;moved=true;
    if(ox<oy){const shift=(ox+0.1)/2*(x<0?-1:1);a.x-=shift;b.x+=shift;}else{const shift=(oy+0.1)/2*(y<0?-1:1);a.y-=shift;b.y+=shift;}
  }return moved;
}

export function zoomCamera(camera,factor,anchor,min,max){
  const scale=Math.max(min,Math.min(max,camera.scale*factor)),ratio=scale/camera.scale;
  return {scale,x:anchor.x-(anchor.x-camera.x)*ratio,y:anchor.y-(anchor.y-camera.y)*ratio};
}
