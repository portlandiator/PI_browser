// The payload is the escaped HTML generated and checked by the guide builder.
try{
  const url=new URL(location.href);url.search='';url.hash='';url.pathname+='.gz';
  const response=await fetch(url);
  if(!response.ok||!response.body)throw Error('The guide could not be downloaded.');
  const html=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).text();
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
