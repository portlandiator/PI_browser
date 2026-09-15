export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function normalize(value) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/ـ/g, '')
    .replace(/[٠-٩۰-۹]/g, c => String(c.charCodeAt(0) - (c <= '٩' ? 0x660 : 0x6f0)))
    .replace(/[\u200c\u200d]/g, ' ').replace(/[‘’ʼ]/g, "'");
}
export const tokenize = value => normalize(value).match(/[\p{L}\p{N}]+/gu) || [];
export function shardKey(word) {
  let hash = 2166136261;
  for (const c of word) hash = Math.imul(hash ^ c.codePointAt(0), 16777619);
  return (hash >>> 0) % 1024;
}

export function parseCsv(source) {
  const rows = []; let row = [], cell = '', quoted = false;
  source = source.replace(/^\uFEFF/, '');
  for (let i=0;i<source.length;i++) {
    const c=source[i];
    if(c==='"') {
      if(quoted && source[i+1]==='"') { cell+='"'; i++; }
      else if(quoted || cell==='') quoted=!quoted;
      else cell+=c;
    } else if(c===',' && !quoted) {row.push(cell);cell='';}
    else if((c==='\n'||c==='\r') && !quoted) {
      if(c==='\r' && source[i+1]==='\n')i++;
      row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell='';
    } else cell+=c;
  }
  if(quoted)throw new Error('Unclosed CSV quotation');
  if(cell||row.length){row.push(cell);rows.push(row);}
  const headers=rows.shift()||[];
  return rows.map((values,i)=>{
    if(values.length!==headers.length)throw new Error(`CSV row ${i+2}: expected ${headers.length} columns, found ${values.length}`);
    return Object.fromEntries(headers.map((h,j)=>[h,values[j].trim()]));
  });
}

function groupAt(text, start) {
  if(text[start]!=='{')return null;
  let depth=1;
  for(let i=start+1;i<text.length;i++){
    if(text[i]==='\\'){i++;continue;}
    if(text[i]==='{')depth++;
    if(text[i]==='}' && --depth===0)return {value:text.slice(start+1,i),end:i+1};
    if(text[i]!=='}') { /* depth only changes at braces */ }
  }
  return null;
}

// A small allowlist, never a general TeX or HTML evaluator.
export function renderInline(text, context={language:'en',notes:[]}, depth=0) {
  if(depth>30)return {html:escapeHtml(text),plain:text};
  let html='',plain='';
  const add=s=>{html+=escapeHtml(s);plain+=s;};
  for(let i=0;i<text.length;){
    if(text[i]!=='\\'){let end=text.indexOf('\\',i);if(end<0)end=text.length;add(text.slice(i,end));i=end;continue;}
    const match=/^\\([a-zA-Z]+|.)/.exec(text.slice(i));
    if(!match){add('\\');i++;continue;}
    const cmd=match[1];let end=i+match[0].length;
    if(cmd==='textquoteleft'||cmd==='textquotesingle'){add(cmd==='textquoteleft'?'‘':"'");i=end;continue;}
    if(['&','%','_','#','{','}'].includes(cmd)){add(cmd);i=end;continue;}
    const group=groupAt(text,end);
    if(group && cmd==='footnote'){
      const number=context.notes.length+1;
      const note={number,html:'',plain:''};context.notes.push(note);
      Object.assign(note,renderInline(group.value,context,depth+1));
      html+=`<sup><a class="note-ref" id="ref-${context.language}-${number}" href="#note-${context.language}-${number}" aria-label="Footnote ${number}">${number}</a></sup>`;
      i=group.end;continue;
    }
    if(group && ['textit','emph','textbf'].includes(cmd)){
      const inner=renderInline(group.value,context,depth+1),tag=cmd==='textbf'?'strong':'em';
      html+=`<${tag}>${inner.html}</${tag}>`;plain+=inner.plain;i=group.end;continue;
    }
    const accents={d:'\u0323',u:'\u0306','=':'\u0304',"'":'\u0301','`':'\u0300','^':'\u0302','"':'\u0308','~':'\u0303'};
    if(group && accents[cmd]){add((group.value+accents[cmd]).normalize('NFC'));i=group.end;continue;}
    add(match[0]);i=end;
  }
  return {html,plain};
}

export function parseText(text, language) {
  const context={language,notes:[]};
  const paragraphs=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim().split(/\n[\t ]*\n+/).filter(p=>p.trim()).map(p=>renderInline(p.trim(),context));
  return {paragraphs,notes:context.notes};
}

export function parseQuery(query) {
  const groups=[];
  for(const match of query.matchAll(/"([^"]+)"|([^"\s]+)/g)){
    const words=tokenize(match[1]||match[2]);
    if(words.length)groups.push({words,phrase:Boolean(match[1])});
  }
  return groups;
}

export function matchRanges(text,query){
  const spans=[...text.matchAll(/[\p{L}\p{N}\p{M}]+/gu)].map(m=>({word:normalize(m[0]),start:m.index,end:m.index+m[0].length}));
  const ranges=[];
  for(const group of parseQuery(query))for(let i=0;i<spans.length;i++){
    if(group.phrase){if(group.words.every((word,j)=>spans[i+j]?.word===word))ranges.push([spans[i].start,spans[i+group.words.length-1].end]);}
    else if(group.words.includes(spans[i].word))ranges.push([spans[i].start,spans[i].end]);
  }
  ranges.sort((a,b)=>a[0]-b[0]);const merged=[];
  for(const range of ranges){const last=merged.at(-1);if(last&&range[0]<=last[1])last[1]=Math.max(last[1],range[1]);else merged.push(range);}
  return merged;
}

export function packPosting(posting) {
  const bytes=[];const write=n=>{do{let b=n&127;n=Math.floor(n/128);bytes.push(b|(n?128:0));}while(n);};
  let previousDoc=0;
  for(const [doc,positions] of posting){write(doc-previousDoc);previousDoc=doc;write(positions.length);let previous=0;for(const p of positions){write(p-previous);previous=p;}}
  return Uint8Array.from(bytes);
}
export function unpackPosting(bytes) {
  let i=0,doc=0;const result=new Map();
  const read=()=>{let n=0,factor=1,b;do{if(i>=bytes.length)throw new Error('Truncated search index');b=bytes[i++];n+=(b&127)*factor;factor*=128;}while(b&128);return n;};
  while(i<bytes.length){doc+=read();const count=read(),positions=[];let p=0;for(let j=0;j<count;j++){p+=read();positions.push(p);}result.set(doc,positions);}
  return result;
}

export function matchPostings(groups, postings) {
  const words=[...new Set(groups.flatMap(g=>g.words))];
  if(!words.length)return [];
  const lists=words.map(w=>postings.get(w)||new Map()).sort((a,b)=>a.size-b.size);
  const matches=[];
  for(const doc of lists[0].keys()){
    if(!lists.every(list=>list.has(doc)))continue;
    if(groups.every(g=>!g.phrase||postings.get(g.words[0]).get(doc).some(start=>g.words.every((word,i)=>postings.get(word).get(doc).includes(start+i)))))matches.push(doc);
  }
  return matches;
}
