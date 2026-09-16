import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {renderVolume} from '../src/volumes.mjs';

test('each supplied PDF is published byte-for-byte with a unique volume link',async()=>{
  const manifest=JSON.parse(await fs.readFile('dist/volumes.json','utf8'));
  const names=(await fs.readdir('pdf_volumes - copy')).filter(name=>/\.pdf$/i.test(name));
  assert.equal(Object.keys(manifest).length,names.length);
  const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
  for(const name of names){
    const key=String(Number(/^volume_(\d+)\b/i.exec(name)[1]));
    assert.equal(manifest[key],`pdf-volumes/volume-${key}.pdf`);
    const source=await fs.readFile(`pdf_volumes - copy/${name}`);
    assert.equal(digest(await fs.readFile(`dist/${manifest[key]}`)),digest(source),name);
  }
  const stats=JSON.parse(await fs.readFile('dist/stats.json','utf8'));
  const catalog=JSON.parse(gunzipSync(await fs.readFile(`dist/${stats.dataset}catalog.json.gz`)));
  for(const record of catalog)if(record.volume)assert.ok(manifest[String(Number(record.volume))],record.id);
});

test('volume links use the project subpath and open a PDF in a new tab',()=>{
  const html=renderVolume('02',{'2':'pdf-volumes/volume-2.pdf'});
  assert.match(html,/href="\.\/pdf-volumes\/volume-2\.pdf"/);
  assert.match(html,/target="_blank"/);assert.match(html,/>02<\/a>/);
  assert.equal(renderVolume('999',{}),'999');
  assert.equal(renderVolume('<script>',{}),'&lt;script&gt;');
});
