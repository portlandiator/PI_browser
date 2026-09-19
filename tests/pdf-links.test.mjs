import test from 'node:test';
import assert from 'node:assert/strict';
import {externalPdfUrl,pdfLinkBoxes,pdfDestinationPage} from '../src/pdf-links.mjs';

test('PDF web links preserve destinations and reject executable or local URLs',()=>{
  assert.equal(externalPdfUrl('https://example.org/book?q=one#p14'),'https://example.org/book?q=one#p14');
  for(const value of ['javascript:alert(1)','data:text/html,test','file:///C:/book.pdf','//example.org',null])assert.equal(externalPdfUrl(value),null);
});
test('PDF link rectangles follow viewport rotation, clipping and multiline quadrilaterals',()=>{
  const viewport={width:200,height:100,convertToViewportPoint:(x,y)=>[y,x]};
  assert.deepEqual(pdfLinkBoxes({rect:[10,20,30,60]},viewport),[{left:10,top:10,width:20,height:20}]);
  assert.deepEqual(pdfLinkBoxes({rect:[-10,20,30,60]},viewport),[{left:10,top:0,width:20,height:30}]);
  const quadPoints=new Float32Array([10,20,30,20,10,60,30,60,40,20,60,20,40,60,60,60]);
  assert.equal(pdfLinkBoxes({quadPoints},viewport).length,2);
  assert.deepEqual(pdfLinkBoxes({rect:[NaN,0,10,10]},viewport),[]);
  assert.deepEqual(pdfLinkBoxes({rect:[200,20,300,60]},viewport),[]);
});
test('PDF internal links resolve named and explicit destinations with page bounds',async()=>{
  const document={numPages:20,getDestination:async name=>name==='chapter'?[{num:42,gen:0},{name:'Fit'}]:null,getPageIndex:async()=>13};
  assert.equal(await pdfDestinationPage(document,'chapter'),14);
  assert.equal(await pdfDestinationPage(document,[0,{name:'Fit'}]),1);
  assert.equal(await pdfDestinationPage(document,[20]),null);
  assert.equal(await pdfDestinationPage(document,'unknown'),null);
  assert.equal(await pdfDestinationPage(document,[{}]),null);
});
