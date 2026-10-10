// Both views reconstruct the exact escaped HTML checked by the guide builder.
try{
  const url=new URL(location.href);url.search='';url.hash='';
  async function readPayload(source){
    const response=await fetch(source);
    if(!response.ok||!response.body)throw Error('The guide could not be downloaded.');
    return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).text();
  }
  const payload=new URL(url);payload.pathname+='.gz';
  let html=await readPayload(payload);
  const marker='<template id="guide-shared-quotations"></template>';
  if(html.includes(marker)){
    const shared=new URL(url);shared.pathname=shared.pathname.replace(/(?:-pdf)?\.html$/,'.quotations.html.gz');
    const quotations=await readPayload(shared);html=html.replace(marker,()=>quotations);
  }
  document.body.innerHTML=html;
  if(document.body.classList.contains('pdf-view'))await import('./pilot-view.js');
  await document.fonts.ready;
  let anchor;try{anchor=decodeURIComponent(location.hash.slice(1));}catch{}
  if(anchor)document.getElementById(anchor)?.scrollIntoView();
}catch(error){
  const status=document.getElementById('guide-loading');
  if(status){status.textContent='The study guide could not be opened. Reload this page to try again.';document.getElementById('main').setAttribute('aria-busy','false');}
  console.error(error);
}
