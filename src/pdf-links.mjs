export function externalPdfUrl(value){
  if(typeof value!=='string')return null;
  try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:null;}catch{return null;}
}

// Percentages keep the annotation hit areas aligned with the responsive canvas.
export function pdfLinkBoxes(annotation,viewport){
  const quads=annotation.quadPoints,rects=[];
  if(quads?.length&&quads.length%8===0){
    for(let i=0;i<quads.length;i+=8){const q=Array.from(quads.slice(i,i+8));rects.push([Math.min(q[0],q[2],q[4],q[6]),Math.min(q[1],q[3],q[5],q[7]),Math.max(q[0],q[2],q[4],q[6]),Math.max(q[1],q[3],q[5],q[7])]);}
  }else if(Array.isArray(annotation.rect))rects.push(annotation.rect);
  return rects.flatMap(rect=>{
    if(rect.length!==4||!rect.every(Number.isFinite)||viewport.width<=0||viewport.height<=0)return [];
    const [x1,y1]=viewport.convertToViewportPoint(rect[0],rect[1]);
    const [x2,y2]=viewport.convertToViewportPoint(rect[2],rect[3]);
    const left=Math.max(0,Math.min(x1,x2)),top=Math.max(0,Math.min(y1,y2));
    const right=Math.min(viewport.width,Math.max(x1,x2)),bottom=Math.min(viewport.height,Math.max(y1,y2));
    if(right<=left||bottom<=top)return [];
    return [{left:100*left/viewport.width,top:100*top/viewport.height,width:100*(right-left)/viewport.width,height:100*(bottom-top)/viewport.height}];
  });
}

export async function pdfDestinationPage(document,destination){
  const resolved=typeof destination==='string'?await document.getDestination(destination):destination;
  if(!Array.isArray(resolved)||!resolved.length)return null;
  const ref=resolved[0];
  const index=Number.isInteger(ref)?ref:ref&&Number.isInteger(ref.num)&&Number.isInteger(ref.gen)?await document.getPageIndex(ref):null;
  return Number.isInteger(index)&&index>=0&&index<document.numPages?index+1:null;
}
