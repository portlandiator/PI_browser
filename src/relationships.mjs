import {escapeHtml as esc} from './text.mjs';
import {loadCompressed} from './data.mjs';
import {relationKey} from './subject-relations.mjs';
import {emptyDraft,validateDraft,mergeDrafts,effectiveEdges,relativeType,changeConnection,sharedEvidence} from './relationship-review-core.mjs';
const $=id=>document.getElementById(id),storageKey='pi-subject-edits';
let index,base,published,local=emptyDraft(),ids,byId,ordered=[],groups=[],active,edges=[],undo,ready=false;
const cache=new Map();
const message=(text,error=false)=>{$('review-message').textContent=text;$('review-message').className=error?'review-error':'';};
const color=s=>/^#[a-f\d]{6}$/i.test(s.color)?s.color:'#203a32';
const subjectLabel=s=>`<span style="color:${color(s)}">${esc(s.name)}</span>`;
const draft=()=>mergeDrafts(published,local);
const typeLabels={related:'Related subject',broader:'Broader subject',narrower:'Narrower subject'};
const typeOptions=value=>Object.entries(typeLabels).map(([key,label])=>`<option value="${key}" ${key===value?'selected':''}>${label}</option>`).join('');
function readLocal(){const text=localStorage.getItem(storageKey);return text?validateDraft(JSON.parse(text),ids):emptyDraft();}
function save(transform){
  try{
    const focusId=document.activeElement?.id;
    const latest=readLocal(),next=validateDraft(transform(structuredClone(latest)),ids);
    localStorage.setItem(storageKey,JSON.stringify(next));undo=latest;local=next;
    render();if(focusId)document.getElementById(focusId)?.focus({preventScroll:true});message('Saved in this browser. Export decisions to back up or publish your work.');
  }catch(e){message('Not saved: '+e.message+' Export your current decisions before leaving this page.',true);}
}
function updateUrl(push=false){const p=new URLSearchParams();if(active)p.set('subject',active);for(const [key,id] of [['q','review-search'],['order','review-order'],['queue','review-queue']]){const v=$(id).value;if(v&&v!=='thematic'&&v!=='all')p.set(key,v);}history[push?'pushState':'replaceState']({},'',location.pathname+'?'+p);}
function select(id,push=true){active=id;updateUrl(push);render();$('review-title')?.focus({preventScroll:true});}
const pending=id=>edges.filter(e=>e.status==='suggested'&&(e.source===id||e.target===id)).length;
function renderDirectory(){
  const query=$('review-search').value.toLowerCase(),queue=$('review-queue').value,done=draft().reviewedSubjects;
  const alphabetical=$('review-order').value==='alphabetical';
  ordered=alphabetical?[...index.subjects].sort((a,b)=>a.name.localeCompare(b.name)):groups.flatMap(g=>g.subjects.map(name=>index.subjects.find(s=>s.name===name)).filter(Boolean));
  const included=new Set(ordered.map(s=>s.id));ordered.push(...index.subjects.filter(s=>!included.has(s.id)));
  const visible=s=>s.name.toLowerCase().includes(query)&&(queue==='all'||queue==='pending'&&pending(s.id)>0||queue==='unfinished'&&!done[s.id]||queue==='finished'&&done[s.id]);
  const row=s=>`<a href="?subject=${s.id}" data-subject="${s.id}" ${active===s.id?'aria-current="true"':''}>${subjectLabel(s)}<small>${pending(s.id)} proposed${done[s.id]?' · reviewed':''}</small></a>`;
  const shown=ordered.filter(visible);$('review-directory-count').textContent=`${shown.length} of ${index.subjects.length} subjects`;
  $('review-subjects').innerHTML=alphabetical?shown.map(row).join(''):groups.map(g=>{const rows=g.subjects.map(name=>index.subjects.find(s=>s.name===name)).filter(s=>s&&visible(s));return rows.length?`<h3>${esc(g.title)}</h3>${rows.map(row).join('')}`:'';}).join('')+ordered.filter(s=>!groups.some(g=>g.subjects.includes(s.name))&&visible(s)).map(row).join('');
  if(!shown.length)$('review-subjects').textContent='No subjects match these filters.';
}
function render(){
  const current=draft();edges=effectiveEdges(index.edges,current);renderDirectory();
  $('review-progress').textContent=`${Object.values(current.reviewedSubjects).filter(Boolean).length} / ${index.subjects.length} subjects marked reviewed · ${edges.filter(e=>e.status==='suggested').length} proposed connections remaining`;
  $('undo-change').disabled=!undo;$('export-preview').value=JSON.stringify(current,null,2);
  const subject=byId.get(active);if(!subject){$('review-content').innerHTML='<h2>Choose a subject</h2>';return;}
  const connections=edges.filter(e=>e.source===active||e.target===active).sort((a,b)=>(a.status!=='suggested')-(b.status!=='suggested')||(b.score||0)-(a.score||0)||byId.get(a.source===active?a.target:a.source).name.localeCompare(byId.get(b.source===active?b.target:b.source).name));
  const position=ordered.findIndex(s=>s.id===active);
  $('review-content').innerHTML=`<div class="review-navigation"><button id="review-prev" ${position<=0?'disabled':''}>← Previous</button><span>${position+1} / ${ordered.length}</span><button id="review-next" ${position===ordered.length-1?'disabled':''}>Next →</button><button id="next-proposals">Next with proposals</button></div><h2 id="review-title" tabindex="-1">${subjectLabel(subject)}</h2><div class="review-subject-actions"><a href="./subjects.html?subject=${active}" target="_blank" rel="noopener">Open subject and passages ↗</a><label><input id="mark-reviewed" type="checkbox" ${current.reviewedSubjects[active]?'checked':''}> Mark this subject reviewed</label></div><p class="review-help">${connections.filter(e=>e.status==='suggested').length} proposed · ${connections.length} connections total. Marking a subject reviewed does not accept its proposals.</p><details class="add-connection"><summary>Add a connection manually</summary><form id="add-connection"><label for="other-search">Find another subject<input id="other-search" type="search" placeholder="Type to narrow the list…"></label><label for="other-subject">Other subject<select id="other-subject" required></select></label><label for="new-type">Other subject is<select id="new-type">${typeOptions('related')}</select></label><label for="new-note">Note (optional)<input id="new-note" maxlength="4000" placeholder="Why these subjects connect"></label><button type="submit">Add accepted connection</button><p class="review-help">A broader subject is more general than the current subject; a narrower subject is more specific.</p></form></details><h3>Connections</h3><div id="connection-list">${connections.length?connections.map((edge,i)=>connectionHtml(edge,i)).join(''):'<p>No proposed or existing connections. You can add one above.</p>'}</div>`;
  $('review-prev').onclick=()=>select(ordered[position-1].id);$('review-next').onclick=()=>select(ordered[position+1].id);
  $('next-proposals').onclick=()=>{const next=[...ordered.slice(position+1),...ordered.slice(0,position+1)].find(s=>pending(s.id));if(next)select(next.id);else message('No proposed connections remain.');};
  $('mark-reviewed').onchange=e=>{const checked=e.target.checked;save(d=>({...d,reviewedSubjects:{...d.reviewedSubjects,[active]:checked}}));};
  const fillTargets=()=>{const q=$('other-search').value.toLowerCase();const targets=index.subjects.filter(s=>s.id!==active&&s.name.toLowerCase().includes(q)).sort((a,b)=>a.name.localeCompare(b.name));$('other-subject').innerHTML=targets.map(s=>`<option value="${s.id}" style="color:${color(s)}">${esc(s.name)}</option>`).join('');};
  $('other-search').oninput=fillTargets;fillTargets();
  $('add-connection').onsubmit=e=>{e.preventDefault();const target=$('other-subject').value;if(!target){message('Choose another subject.',true);return;}const edge={source:active,target,type:$('new-type').value,status:'accepted',note:$('new-note').value};save(d=>changeConnection(d,edge));};
  for(const [i,edge] of connections.entries()){
    const card=$('connection-'+i),other=edge.source===active?edge.target:edge.source;
    for(const status of ['accepted','rejected'])card.querySelector('[data-'+status+']').onclick=()=>save(d=>changeConnection(d,{source:edge.source,target:edge.target,type:edge.type,status,note:card.querySelector('[data-note]').value}));
    card.querySelector('[data-save]').onclick=()=>{const type=card.querySelector('[data-type]').value,note=card.querySelector('[data-note]').value;save(d=>changeConnection(d,{source:active,target:other,type,status:'accepted',note},edge));};
    card.querySelector('[data-restore]').onclick=()=>save(d=>({...d,relationships:d.relationships.filter(e=>relationKey(e)!==relationKey(edge))}));
    card.querySelector('[data-evidence]').onclick=()=>showEvidence(card,other,active);
  }
}
function connectionHtml(edge,i){
  const other=byId.get(edge.source===active?edge.target:edge.source),localEdit=local.relationships.some(e=>relationKey(e)===relationKey(edge));
  return `<article class="connection-card" id="connection-${i}"><div class="connection-heading"><a href="?subject=${other.id}" data-subject="${other.id}">${subjectLabel(other)}</a><span class="connection-status">${edge.status==='suggested'?'Proposed':edge.status==='imported'?'Imported':edge.status==='accepted'?'Accepted':'Rejected'}${localEdit?' · local draft':''}</span></div><p>${typeLabels[relativeType(edge,active)]}${edge.score!==undefined?` · ${(edge.score*100).toFixed(1)}% normalized overlap`:''}${edge.sharedParagraphs!==undefined?` · ${edge.sharedParagraphs} shared paragraphs`:''}</p><p class="review-help">${esc(edge.provenance||'Editorial connection')}${edge.score!==undefined?' · Overlap is shared selected paragraphs divided by the combined distinct selected paragraphs (Jaccard). It suggests a connection; it does not establish one.':''}</p><label>Note (saved with your decision)<input data-note maxlength="4000" value="${esc(edge.note||'')}" aria-label="Note for ${esc(other.name)}"></label><div class="connection-actions"><button data-accepted>${edge.status==='accepted'?'Save accepted decision':'Accept'}</button><button data-rejected>${edge.status==='rejected'?'Save rejected decision':'Reject'}</button><button data-evidence>Inspect shared passages</button><button data-restore ${localEdit?'':'disabled'}>Restore published version</button></div><details><summary>Edit connection type</summary><label>Other subject is<select data-type>${typeOptions(relativeType(edge,active))}</select></label><button data-save>Save as accepted</button></details><div class="connection-evidence" role="status"></div></article>`;
}
async function subjectData(id){if(!cache.has(id)){cache.set(id,loadCompressed(new URL(`subjects/${id}.json.gz`,base)).catch(e=>{cache.delete(id);throw e;}));if(cache.size>6)cache.delete(cache.keys().next().value);}return cache.get(id);}
async function showEvidence(card,other,subject){
  const holder=card.querySelector('.connection-evidence'),button=card.querySelector('[data-evidence]');button.disabled=true;holder.textContent='Loading shared passages…';
  try{const [a,b]=await Promise.all([subjectData(subject),subjectData(other)]);const result=sharedEvidence(a,b);holder.innerHTML=result.total?`<p>${result.total} shared source paragraphs with overlapping accepted selections. Showing ${result.examples.length} examples.</p>${result.examples.map(e=>`<blockquote>${esc(e.text.length>600?e.text.slice(0,600)+'…':e.text)}<br><a href="./?id=${encodeURIComponent(e.source)}&passage=${e.passage}&subject=${subject}#p-en-${e.paragraph}" target="_blank" rel="noopener">${esc(e.source)} · paragraph ${e.paragraph} ↗</a></blockquote>`).join('')}`:'<p>No overlapping accepted selections were found. A conceptual connection can still be added manually.</p>';}
  catch(e){holder.textContent=e.message+' Try again.';}finally{button.disabled=false;}
}
function download(){const text=JSON.stringify(draft(),null,2);$('export-preview').value=text;const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='subject-edits.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message('Export prepared. Keep this backup; provide it for import to publish your decisions.');}
document.addEventListener('click',event=>{const link=event.target.closest('[data-subject]');if(link&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){event.preventDefault();select(link.dataset.subject);}});
function restoreUrl(){const p=new URLSearchParams(location.search);$('review-search').value=p.get('q')||'';$('review-order').value=p.get('order')==='alphabetical'?'alphabetical':'thematic';$('review-queue').value=['pending','unfinished','finished'].includes(p.get('queue'))?p.get('queue'):'all';active=ids.has(p.get('subject'))?p.get('subject'):(index.subjects.find(s=>s.name===groups[0]?.subjects[0])||index.subjects[0]).id;render();}
window.addEventListener('popstate',()=>{if(ready)restoreUrl();});
window.addEventListener('storage',e=>{if(ready&&e.key===storageKey){try{local=readLocal();undo=null;render();message('Updated decisions from another tab.');}catch(error){message(error.message,true);}}});
try{
  const response=await fetch('./stats.json',{cache:'no-cache'});if(!response.ok)throw Error('Collection manifest unavailable');const stats=await response.json();base=new URL(stats.dataset,location.href);
  index=await loadCompressed(new URL('subjects/index.json.gz',base));ids=new Set(index.subjects.map(s=>s.id));byId=new Map(index.subjects.map(s=>[s.id,s]));
  published=validateDraft(await loadCompressed(new URL('subjects/editorial-decisions.json.gz',base)),ids);local=readLocal();
  const orderResponse=await fetch('./subject-order.json');if(!orderResponse.ok)throw Error('Subject order unavailable');groups=(await orderResponse.json()).groups;
  $('export-decisions').onclick=download;$('undo-change').onclick=()=>{if(undo){const latest=readLocal();if(JSON.stringify(latest)!==JSON.stringify(local)){local=latest;undo=null;render();message('Another tab changed the decisions. Undo was cleared to preserve those edits.');return;}const previous=undo;save(()=>previous);undo=null;$('undo-change').disabled=true;}};
  $('import-decisions').onchange=async event=>{try{const file=event.target.files[0];if(!file)return;const incoming=validateDraft(JSON.parse(await file.text()),ids);save(d=>mergeDrafts(d,incoming));}catch(e){message('Import failed: '+e.message,true);}finally{event.target.value='';}};
  for(const id of ['review-search','review-order','review-queue'])$(id)[id==='review-search'?'oninput':'onchange']=()=>{updateUrl();if(id==='review-order')render();else renderDirectory();};
  ready=true;restoreUrl();message('Ready. Decisions stay local until exported and published.');
}catch(e){message('Could not open the review workspace: '+e.message+' Reload to try again.',true);}
