const button=document.getElementById('print-compilation');
const status=document.getElementById('print-status');
function updatePrintHeader(){
  document.documentElement.style.setProperty('--print-subject',JSON.stringify(document.querySelector('h1').textContent));
  document.documentElement.style.setProperty('--print-stamp',JSON.stringify(new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date())));
}
updatePrintHeader();
window.addEventListener('beforeprint',updatePrintHeader);
document.fonts.ready.then(()=>{
  button.disabled=false;
  status.textContent='Ready to print';
});
button.addEventListener('click',()=>window.print());
