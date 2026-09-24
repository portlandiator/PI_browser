import {test} from 'node:test';
import assert from 'node:assert/strict';
import {globalLayout,publicGraphEdges,zoomCamera} from '../src/global-graph-layout.mjs';

test('global edges retain reviewed connections, suppress rejections, and collapse inverse duplicates',()=>{
  const subjects=['a','b','c'].map(id=>({id}));
  const edges=[{source:'a',target:'b',type:'related',status:'suggested'},{source:'b',target:'a',type:'related',status:'rejected'},{source:'a',target:'c',type:'broader',status:'imported'},{source:'c',target:'a',type:'narrower',status:'accepted'},{source:'b',target:'c',type:'related',status:'suggested'},{source:'a',target:'missing',type:'related',status:'accepted'}];
  assert.equal(publicGraphEdges(edges,subjects).length,2);
  assert.deepEqual(publicGraphEdges(edges,subjects,false),[edges[3]]);
});
test('global layout preserves every subject including isolates with finite bounded positions',()=>{
  const nodes=Array.from({length:80},(_,i)=>({id:String(i),width:170,height:48+i%5*16}));
  const edges=nodes.slice(1,60).map(n=>({source:'0',target:n.id}));
  const layout=globalLayout(nodes,edges);
  assert.equal(layout.nodes.length,nodes.length);
  for(const p of layout.nodes){assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));assert.ok(p.x>=p.width/2&&p.x+p.width/2<=layout.width);assert.ok(p.y>=p.height/2&&p.y+p.height/2<=layout.height);}
  assert.deepEqual(globalLayout(nodes,edges),layout);
  for(let i=0;i<layout.nodes.length;i++)for(let j=i+1;j<layout.nodes.length;j++){
    const a=layout.nodes[i],b=layout.nodes[j];assert.ok(Math.abs(a.x-b.x)>=(a.width+b.width)/2+24-1e-6||Math.abs(a.y-b.y)>=(a.height+b.height)/2+24-1e-6);
  }
});
test('zoom stays anchored under the pointer and clamps its scale',()=>{
  const c={x:10,y:-20,scale:.5},anchor={x:250,y:100};
  const z=zoomCamera(c,2,anchor,.1,4);
  assert.equal((anchor.x-z.x)/z.scale,(anchor.x-c.x)/c.scale);
  assert.equal((anchor.y-z.y)/z.scale,(anchor.y-c.y)/c.scale);
  assert.equal(zoomCamera(c,100,anchor,.1,4).scale,4);
  assert.equal(zoomCamera(c,.001,anchor,.1,4).scale,.1);
});
