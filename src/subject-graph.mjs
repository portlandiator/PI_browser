// Expand the circle just enough to keep full rectangular labels separated.
export function circularLayout(count, nodeWidth, nodeHeight) {
  const points = Array.from({length: count}, (_, i) => {
    const angle = -Math.PI / 2 + i * 2 * Math.PI / count;
    return [Math.cos(angle), Math.sin(angle)];
  });
  let radius = 230;
  const all = [[0, 0], ...points];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const dx = Math.abs(all[i][0] - all[j][0]), dy = Math.abs(all[i][1] - all[j][1]);
    radius = Math.max(radius, Math.min((nodeWidth + 24) / dx, (nodeHeight + 24) / dy));
  }
  radius = Math.ceil(radius);
  const width = 2 * radius + nodeWidth + 40, height = 2 * radius + nodeHeight + 40;
  const center = [width / 2, height / 2];
  return {width, height, center, neighbors: points.map(([x, y]) => [center[0] + radius * x, center[1] + radius * y])};
}

// Use the available width, spacing side labels vertically along an oval.
// Grow the drawing, rather than shrink type, when there are many neighbors.
export function ovalLayout(count,nodeWidth,nodeHeight,viewportWidth,viewportHeight){
  const gap=24,leftCount=Math.ceil(Math.max(0,count-2)/2),rightCount=Math.floor(Math.max(0,count-2)/2);
  let rx=Math.max(nodeWidth+32,(viewportWidth-nodeWidth-48)/2);
  const ry=Math.max(nodeHeight+gap,(viewportHeight-nodeHeight-48)/2,(Math.max(leftCount,rightCount)+1)*(nodeHeight+gap)/2);
  const units=[];
  if(count>0)units.push([0,-1]);
  if(count>1)units.push([0,1]);
  for(const [size,side] of [[leftCount,-1],[rightCount,1]])for(let i=0;i<size;i++){
    const y=-1+2*(i+1)/(size+1);units.push([side*Math.sqrt(1-y*y),y]);
  }
  const all=[[0,0],...units];
  for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
    const dx=Math.abs(all[i][0]-all[j][0]),dy=Math.abs(all[i][1]-all[j][1])*ry;
    if(dy<nodeHeight+gap-1e-6&&dx>0)rx=Math.max(rx,(nodeWidth+gap)/dx);
  }
  const width=2*rx+nodeWidth+48,height=2*ry+nodeHeight+48,center=[width/2,height/2];
  return {width,height,center,neighbors:units.map(([x,y])=>[center[0]+rx*x,center[1]+ry*y])};
}
