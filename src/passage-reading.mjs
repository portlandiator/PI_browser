export function readingPreferences(params,saved={}){
  const mode=params.get('mode')??saved.mode;
  const size=params.has('size')?Number(params.get('size')):Number(saved.scale??1)*100;
  return {mode:['parallel','en','original'].includes(mode)?mode:'parallel',scale:Math.max(85,Math.min(135,Number.isFinite(size)&&size>0?size:100))/100};
}
export function passageControls(){
  return `<div class="reader-controls passage-controls"><div class="segmented" role="group" aria-label="Reading language"><button data-passage-mode="parallel" aria-pressed="true">Parallel</button><button data-passage-mode="en" aria-pressed="false">English</button><button data-passage-mode="original" aria-pressed="false">Original</button></div><div class="type-controls" role="group" aria-label="Text size"><button id="passage-size-down" aria-label="Decrease text size">A−</button><span id="passage-size-label" aria-live="polite">100%</span><button id="passage-size-up" aria-label="Increase text size">A+</button></div></div>`;
}
export function wirePassageReading(container,preferences,onChange){
  const view=container.querySelector('#passage-results');
  function apply(){
    view.dataset.mode=preferences.mode;view.style.setProperty('--scale',preferences.scale);
    container.querySelectorAll('[data-passage-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.passageMode===preferences.mode)));
    container.querySelector('#passage-size-label').textContent=`${Math.round(preferences.scale*100)}%`;
    container.querySelector('#passage-size-down').disabled=preferences.scale<=.85;
    container.querySelector('#passage-size-up').disabled=preferences.scale>=1.35;
  }
  const change=next=>{preferences=next;apply();onChange(next);};
  container.querySelectorAll('[data-passage-mode]').forEach(b=>b.onclick=()=>change({...preferences,mode:b.dataset.passageMode}));
  for(const [id,delta] of [['down',-5],['up',5]])container.querySelector('#passage-size-'+id).onclick=()=>change({...preferences,scale:Math.max(85,Math.min(135,Math.round(preferences.scale*100)+delta))/100});
  apply();
}
