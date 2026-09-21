import {recordFilename} from '../src/record-file.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {parseCsv} from '../src/text.mjs';
import {publicMetadata} from '../src/original-publication.mjs';
import {describeFields,metadataSearchText} from '../src/metadata.mjs';
import {authorizedRanges,isAuthorizedParagraph} from '../src/translation-status.mjs';
const stats=JSON.parse(fs.readFileSync('dist/stats.json','utf8'));
const base='dist/'+stats.dataset;
const load=p=>JSON.parse(gunzipSync(fs.readFileSync(base+'/'+p)));
const rows=parseCsv(fs.readFileSync('metadata - copy/'+fs.readdirSync('metadata - copy').find(f=>f.endsWith('.csv')),'utf8')).map(publicMetadata);
const rawById=new Map(rows.map(r=>[r.PIN,{...r}]));
const periodMapping=parseCsv(fs.readFileSync('period_renaming.csv','utf8'));
for(const row of rows)for(const {Old,New} of periodMapping)row.Period=row.Period.replaceAll(Old,New);
const byId=new Map(rows.map(r=>[r.PIN,r]));
const catalog=load('catalog.json.gz');

test('updated translation metadata reaches records without changing its paragraph declarations',()=>{
 const mixed=load('data/'+recordFilename('BB00262'));
 assert.equal(mixed.metadata.Authorized,'Y2,4-5,7-9,12-');
 const ranges=authorizedRanges(mixed.metadata.Authorized);
 assert.deepEqual(mixed.en.paragraphs.map((_,i)=>i+1).filter(n=>isAuthorizedParagraph(ranges,n)),
   mixed.en.paragraphs.map((_,i)=>i+1).filter(n=>[2,4,5,7,8,9].includes(n)||n>=12));
 assert.equal(load('data/'+recordFilename('BB00004')).metadata.Extract,'x');
 for(const row of rows)if(row.Authorized&&row.Authorized!=='N')assert.ok(authorizedRanges(row.Authorized).length,row.PIN+': '+row.Authorized);
});
test('all metadata columns preserve the CSV with supplied Period replacements in catalogue order',()=>{
 const fields=JSON.parse(fs.readFileSync(base+'/metadata-schema.json','utf8'));
 const expected=describeFields(rows);
 expected.find(field=>field.name==='Period').valueOrder=[...new Set(periodMapping.map(row=>metadataSearchText(row.New)))];
 assert.deepEqual(fields,expected);
 for(const field of fields){const values=load('facets/'+field.key+'.json.gz');assert.deepEqual(values,catalog.map(r=>metadataSearchText(byId.get(r.id)?.[field.name]||'')),field.name);}
 const ids=new Set(catalog.map(r=>r.id));for(const row of rows)assert.ok(ids.has(row.PIN),row.PIN);
});
test('PIN joins preserve rich metadata, original Period provenance, and catalogue aliases',()=>{
 for(const id of ['AB00016','BH00386','AB00001','BB00001']){
 const record=load('data/'+recordFilename(id)),row=byId.get(id);
 assert.deepEqual(record.metadata,row);assert.equal(record.metadataOriginalValues?.Period||record.metadata.Period,rawById.get(id).Period);assert.equal(record.volume,row.Volume);assert.equal(record.addressee,row.Recipient);assert.equal(record.date,row.Date);
 }
});

test('every nonempty imported Period changes and no old Period code remains in facets',()=>{
 const values=load('facets/period.json.gz');
 for(let i=0;i<catalog.length;i++){
  const original=rawById.get(catalog[i].id)?.Period||'';
  if(!original)continue;
  assert.notEqual(values[i],metadataSearchText(original),catalog[i].id);
  assert.ok(!/^[A-Z]-/.test(values[i]),catalog[i].id+': '+values[i]);
 }
});
