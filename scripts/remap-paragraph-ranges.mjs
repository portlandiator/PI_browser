import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseText} from '../src/text.mjs';

const version=bytes=>createHash('sha256').update(bytes).digest('hex');
function decode(bytes){try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return new TextDecoder('windows-1252').decode(bytes);}}
function coordinates(paragraphs){
  let text='';const positions=[],offsets=[];
  for(const [i,p] of paragraphs.entries()){
    const counts=[text.length];
    for(let j=0;j<p.plain.length;j++){
      if(!/\s/u.test(p.plain[j])){text+=p.plain[j];positions.push({paragraph:i+1,offset:j});}
      counts.push(text.length);
    }
    offsets.push(counts);
  }
  return {text,positions,offsets};
}

// A positional migration, not a quotation search: repeated wording stays at its
// original occurrence. Only newline-only source edits are eligible.
export function paragraphRangeRemapper(id,before,after){
  const strip=b=>Buffer.from([...b].filter(c=>c!==10&&c!==13));
  assert.ok(strip(before).equals(strip(after)),id+': source changed beyond newlines');
  const old=parseText(decode(before),'en').paragraphs,next=parseText(decode(after),'en').paragraphs;
  const a=coordinates(old),b=coordinates(next),oldVersion=version(before),newVersion=version(after);
  assert.equal(a.text,b.text,id+': rendered text changed');
  return candidate=>{
    assert.equal(candidate.source,id);
    assert.equal(candidate.version,oldVersion,id+': stale candidate version');
    assert.ok(candidate.ranges?.length,id+': empty ranges');
    const ranges=[];
    for(const r of candidate.ranges){
      const plain=old[r.paragraph-1]?.plain;
      assert.ok(typeof plain==='string'&&Number.isInteger(r.start)&&Number.isInteger(r.end)&&r.start>=0&&r.end>r.start&&r.end<=plain.length,id+': invalid old coordinates');
      assert.equal(plain.slice(r.start,r.end),r.text,id+': old highlight text differs');
      const start=a.offsets[r.paragraph-1][r.start],end=a.offsets[r.paragraph-1][r.end];
      assert.ok(end>start,id+': whitespace-only range');
      const fragments=[];
      for(const p of b.positions.slice(start,end)){
        let part=fragments.at(-1);
        if(!part||part.paragraph!==p.paragraph){part={paragraph:p.paragraph,start:p.offset,end:p.offset+1};fragments.push(part);}
        else part.end=p.offset+1;
      }
      for(const part of fragments){part.paragraphId=`${id}@${newVersion}:en:${part.paragraph}`;part.text=next[part.paragraph-1].plain.slice(part.start,part.end);}
      assert.equal(fragments.map(r=>r.text).join('').replace(/\s/g,''),r.text.replace(/\s/g,''),id+': highlight content changed');
      ranges.push(...fragments);
    }
    return {...candidate,version:newVersion,ranges};
  };
}
