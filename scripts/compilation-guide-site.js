// The site masthead's light/dark switch and About dialog, as on the main
// pages. The guide loader replaces the page body in place, so controls are
// found when used rather than bound once. The saved theme itself is applied
// by each page's inline script before styles paint.
(()=>{
  const root=document.documentElement;
  const sync=()=>{
    const dark=root.dataset.theme==='dark';
    document.getElementById('theme-toggle')?.setAttribute('aria-checked',String(dark));
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#151d19':'#f7f6f0');
  };
  document.addEventListener('click',event=>{
    const target=event.target.closest?.('button')||event.target,dialog=document.getElementById('about-dialog');
    if(target.id==='theme-toggle'){
      root.dataset.theme=root.dataset.theme==='dark'?'light':'dark';
      try{localStorage.setItem('pi-theme',root.dataset.theme);}catch{}
      sync();
    }else if((target.id==='about-open'||target.id==='footer-about')&&dialog){
      dialog.showModal();
      const stats=document.getElementById('about-stats');
      import(new URL(dialog.dataset.stats,location.href).href).then(module=>module.showAboutStats(stats)).catch(()=>{stats.textContent='Collection statistics are temporarily unavailable.';});
    }else if(target.id==='about-close')dialog?.close();
    else if(target===dialog){
      const rect=dialog.getBoundingClientRect();
      if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();
    }
  });
  addEventListener('storage',event=>{if(event.key==='pi-theme')sync();});
  document.addEventListener('DOMContentLoaded',sync);
  document.addEventListener('pi-guide-page',sync);
})();
