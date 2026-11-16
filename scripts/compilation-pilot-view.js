// The guide loader may show several guides in one page visit, so setup is
// repeatable and binds the current page's print button each time.
(()=>{
  function updatePrintHeader(){
    const heading=document.querySelector('h1');if(!heading)return;
    document.documentElement.style.setProperty('--print-subject',JSON.stringify(heading.textContent));
    document.documentElement.style.setProperty('--print-stamp',JSON.stringify(new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date())));
  }
  function setup(){
    const button=document.getElementById('print-compilation'),status=document.getElementById('print-status');
    if(!button)return;
    updatePrintHeader();
    button.onclick=()=>window.print();
    document.fonts.ready.then(()=>{
      button.disabled=false;
      status.textContent='Ready to print';
    });
  }
  if(!window.piGuidePrint){
    window.piGuidePrint=true;
    window.addEventListener('beforeprint',updatePrintHeader);
    document.addEventListener('pi-guide-shown',setup);
    // A guide read with quotations from beyond the Bahá’í writings can show all its
    // readings or one kind. A link to a reading that is hidden shows all again.
    const shown={all:()=>true,guide:row=>row.dataset.kind==='guide',outside:row=>row.dataset.kind==='outside'};
    const show=chip=>{
      for(const other of chip.parentElement.children)other.setAttribute('aria-pressed',String(other===chip));
      for(const row of document.querySelectorAll('#readings .quotation'))row.hidden=!shown[chip.dataset.show](row);
    };
    document.addEventListener('click',event=>{
      const chip=event.target.closest?.('.reading-filter .chip'),link=event.target.closest?.('a[href^="#reading-"]');
      if(chip&&shown[chip.dataset.show])show(chip);
      else if(link&&document.getElementById(link.hash.slice(1))?.hidden)show(document.querySelector('.reading-filter .chip[data-show="all"]'));
    },true);
  }
  setup();
})();
