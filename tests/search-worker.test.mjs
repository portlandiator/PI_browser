import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {parseText,shardKey,packPosting} from '../src/text.mjs';
import {indexedUnits,unitShard} from '../src/search-passages.mjs';

test('worker filters before counting, pagination and facets without fetching source records',async t=>{
  const records=Array.from({length:52},(_,i)=>({id:`AB${10000+i}`,author:i%2?'Matching':'Split',
    en:parseText(i%2?'love of God and peace':'love of God\n\npeace','en'),original:parseText('','original')}));
  records.push({id:'AB10052',en:parseText('love','en'),original:parseText('God','original')});
  records.push({id:'AB10053',en:parseText('','en'),original:parseText('كِتاب الله حق','original')});
  const catalog=records.map(({en,original,...row})=>({...row,hasEnglish:!!en.paragraphs.length,hasOriginal:!!original.paragraphs.length}));
  const files=new Map([['catalog.json.gz',catalog],['metadata-schema.json',[{key:'author',name:'Author'}]],['facets/author.json.gz',catalog.map(r=>r.author||'')]]);
  const units={};
  for(const language of ['en','original']){
    const index=new Map();
    records.forEach((record,doc)=>{
      (units[doc]??={})[language]=[];
      for(const unit of indexedUnits(record[language])){
        units[doc][language].push(unit.end);
        unit.words.forEach((word,i)=>{
          if(!index.has(word))index.set(word,new Map());
          if(!index.get(word).has(doc))index.get(word).set(doc,[]);
          index.get(word).get(doc).push(unit.start+i);
        });
      }
    });
    for(const [word,posting] of index){const name=`index/${language}/${shardKey(word)}.json.gz`;if(!files.has(name))files.set(name,{});files.get(name)[word]=Buffer.from(packPosting(posting)).toString('base64');}
  }
  files.set(`index/units/${unitShard(0)}.json.gz`,units);
  const requests=[];
  t.mock.method(globalThis,'fetch',async url=>{
    const name=new URL(url).pathname.split('/fixture/')[1];requests.push(name);
    const value=files.get(name)??{};
    return new Response(name.endsWith('.gz')?gzipSync(JSON.stringify(value)):JSON.stringify(value));
  });
  const previousSelf=globalThis.self;let response;
  globalThis.self={postMessage:data=>{response=data;}};
  t.after(()=>{if(previousSelf===undefined)delete globalThis.self;else globalThis.self=previousSelf;});
  await import('../src/search-worker.mjs');
  let requestId=0;
  const request=async data=>{await self.onmessage({data:{requestId:++requestId,...data}});assert.notEqual(response.type,'error',response.message);return response;};
  await request({type:'init',dataset:'https://example.org/PI_browser/fixture/'});
  const first=await request({type:'search',query:'"love of God" peace',sort:'id'});
  assert.equal(first.total,26);assert.equal(first.pages,2);assert.equal(first.rows.length,20);
  assert.ok(first.rows.every(row=>row.author==='Matching'));
  const second=await request({type:'search',query:'"love of God" peace',page:2,sort:'id'});
  assert.equal(second.rows.length,6);
  const facet=await request({type:'facet',query:'"love of God" peace',field:'author'});
  assert.ok(JSON.stringify(facet).includes('Matching'));assert.ok(!JSON.stringify(facet).includes('Split'));
  assert.equal((await request({type:'search',query:'love God'})).total,52,'cross-language row must not match');
  const original=await request({type:'search',query:'"کتاب الله" حق'});
  assert.equal(original.total,1);assert.deepEqual(original.rows[0].matches,['original']);
  assert.equal((await request({type:'search',query:'AB10052.txt'})).rows[0].id,'AB10052');
  assert.ok(!requests.some(name=>name.startsWith('data/')));
  assert.equal(requests.filter(name=>name.startsWith('index/units/')).length,1,'boundary shards share the bounded index cache');
});
