import {escapeHtml as esc} from './text.mjs';
import {hasFilter} from './metadata.mjs';
import {catalogFilterFields,volumeFilterLabel} from './catalog-filters.mjs';

export class FacetPanel {
  constructor({container,fields,getFilters,onChange,request,volumeTitles={}}){
    fields=catalogFilterFields(fields);
    Object.assign(this,{container,fields,getFilters,onChange,request,volumeTitles});
    this.limits=new Map();
    const ordered=fields;
    container.innerHTML=`<div class="metadata-filter-heading"><h3>Refine search</h3></div>${ordered.map(field=>this.fieldMarkup(field)).join('')}`;
    const author=document.getElementById('author-field');
    container.insertBefore(author,this.node('pin')?.nextSibling||container.querySelector('.metadata-facet'));
    container.querySelector('.metadata-filter-heading').append(document.getElementById('reset-filters'));
    for(const field of fields){
      const root=this.node(field.key),key=field.key;
      root.ontoggle=()=>{if(root.open)this.load(key);};
      const text=root.querySelector('[data-filter-text]');
      if(text)text.oninput=()=>this.change(key,{...this.getFilters()[key],text:text.value},false);
      const optionSearch=root.querySelector('[data-option-search]');
      if(optionSearch){let timer;optionSearch.oninput=()=>{clearTimeout(timer);this.limits.set(key,40);timer=setTimeout(()=>this.load(key),180);};}
      for(const bound of ['min','max']){const input=root.querySelector(`[data-bound="${bound}"]`);if(input)input.oninput=()=>this.change(key,{...this.getFilters()[key],[bound]:input.value},false);}
      root.querySelector('[data-clear-field]').onclick=()=>this.change(key,{},true);
      root.querySelector('[data-facet-options]')?.addEventListener('change',event=>{const input=event.target.closest('input[type=checkbox]');if(!input)return;const values=new Set(this.getFilters()[key]?.values||[]);input.checked?values.add(input.value):values.delete(input.value);this.change(key,{...this.getFilters()[key],values:[...values],presence:this.getFilters()[key]?.presence==='missing'?'':this.getFilters()[key]?.presence},true);});
    }
    this.sync();
    container.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches('[data-filter-text],[data-bound]')){event.preventDefault();this.onChange({...this.getFilters()},true);}});
  }
  node(key){return this.container.querySelector(`[data-field="${key}"]`);}
  fieldMarkup(field){
    const key=field.key;
    return `<details class="metadata-facet" data-field="${key}" ><summary><span>${esc(field.name)}</span><span class="facet-selected" data-selected></span></summary><div class="facet-body">${field.kind==='categorical'?`<label class="sr-only" for="options-${key}">Find ${esc(field.name)} values</label><input id="options-${key}" data-option-search type="search" placeholder="Find a value…" autocomplete="off"><div class="facet-options" data-facet-options aria-label="${esc(field.name)} values"><p class="facet-status">Open to load values.</p></div>`:field.kind==='number'?`<div class="facet-range"><label for="min-${key}">Minimum<input id="min-${key}" data-bound="min" type="number" min="0" step="1" placeholder="Any"></label><span aria-hidden="true">–</span><label for="max-${key}">Maximum<input id="max-${key}" data-bound="max" type="number" min="0" step="1" placeholder="Any"></label></div><p class="facet-help">Uses the supplied word count. Unknown counts are excluded from ranges.</p>`:`<label class="sr-only" for="text-${key}">Search ${esc(field.name)}</label><input id="text-${key}" data-filter-text type="search" dir="auto" placeholder="Contains…" autocomplete="off"><p class="facet-help">${['manuscripts','publications','translations','musical-interpretations','notes'].includes(key)?'Search reference text or a link address.':'Matches text in this metadata field.'}</p>`}<div class="facet-bottom"><span data-facet-status class="facet-status">${field.populated?field.populated.toLocaleString()+' recorded':'Not populated in this file'}</span><button class="text-button" data-clear-field type="button" aria-label="Clear ${esc(field.name)} filter">Clear</button></div></div></details>`;
  }
  change(key,value,immediate){const next={...this.getFilters()};if(hasFilter(value))next[key]=value;else delete next[key];this.onChange(next,immediate);this.sync();}
  sync(){
    for(const field of this.fields){
      const root=this.node(field.key),filter=this.getFilters()[field.key]||{};
      root.querySelector('[data-selected]').textContent=hasFilter(filter)?filter.values?.length||'•':'';
      const text=root.querySelector('[data-filter-text]');if(text&&text.value!==(filter.text||''))text.value=filter.text||'';
      for(const bound of ['min','max']){const input=root.querySelector(`[data-bound="${bound}"]`);if(input&&input.value!==String(filter[bound]??''))input.value=filter[bound]??'';}
      for(const input of root.querySelectorAll('input[type=checkbox]'))input.checked=filter.values?.includes(input.value)||false;
      root.querySelector('[data-clear-field]').hidden=!hasFilter(filter);
    }
  }
  load(key){const root=this.node(key);root.querySelector('[data-facet-status]').textContent='Updating counts…';this.request(key,root.querySelector('[data-option-search]')?.value||'',this.limits.get(key)||40);}
  refresh(){for(const field of this.fields)if(this.node(field.key).open)this.load(field.key);}
  receive(data){
    const root=this.node(data.field);if(!root)return;
    if(data.type==='error'){root.querySelector('[data-facet-status]').textContent='Could not load values.';return;}
    root.querySelector('[data-facet-status]').textContent=`${data.present.toLocaleString()} recorded · ${data.missing.toLocaleString()} missing`;
    const options=root.querySelector('[data-facet-options]');
    if(options){const selected=this.getFilters()[data.field]?.values||[];options.innerHTML=data.options.map(({value,count},i)=>`<label class="facet-option"><input type="checkbox" value="${esc(value)}" ${selected.includes(value)?'checked':''}><span dir="auto">${esc(data.field==='volume'?volumeFilterLabel(value,this.volumeTitles):value)}</span><span class="facet-count">${count.toLocaleString()}</span></label>`).join('')||'<p class="facet-status">No values match these filters.</p>';
      const limit=this.limits.get(data.field)||40;if(data.optionCount>limit){if(limit<500){const button=document.createElement('button');button.className='text-button facet-more';button.textContent=`Show more (${data.optionCount.toLocaleString()} values)`;button.onclick=()=>{this.limits.set(data.field,Math.min(limit+60,500));this.load(data.field);};options.append(button);}else{const hint=document.createElement('p');hint.className='facet-help';hint.textContent='Type above to find more values.';options.append(hint);}}
    }
  }
}
