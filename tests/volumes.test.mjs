import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {renderVolume} from '../src/volumes.mjs';
import {volumeTitle} from '../scripts/volume-title.mjs';

test('permitted PDFs are published byte-for-byte and withheld PDFs have no public files or links',async()=>{
  const withheld=JSON.parse(await fs.readFile('data/withheld-pdf-volumes.json','utf8'));
  const manifest=JSON.parse(await fs.readFile('dist/volumes.json','utf8'));
  const titles=JSON.parse(await fs.readFile('dist/volume-titles.json','utf8'));
  const names=(await fs.readdir('pdf_volumes - copy')).filter(name=>/\.pdf$/i.test(name)&&!Object.hasOwn(withheld,String(Number(/^volume_(\d+)\b/i.exec(name)[1]))));
  for(const key of Object.keys(withheld)){
    assert.ok(!manifest[key]);
    await assert.rejects(fs.access(`dist/pdf-volumes/volume-${key}.pdf`));
  }
  assert.equal(Object.keys(manifest).length,names.length);
  assert.deepEqual(Object.keys(titles),Object.keys(manifest));
  const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
  for(const name of names){
    const key=String(Number(/^volume_(\d+)\b/i.exec(name)[1]));
    assert.equal(manifest[key],`pdf-volumes/volume-${key}.pdf`);
    assert.equal(titles[key],volumeTitle(name));
    const source=await fs.readFile(`pdf_volumes - copy/${name}`);
    assert.equal(digest(await fs.readFile(`dist/${manifest[key]}`)),digest(source),name);
  }
  const stats=JSON.parse(await fs.readFile('dist/stats.json','utf8'));
  const catalog=JSON.parse(gunzipSync(await fs.readFile(`dist/${stats.dataset}catalog.json.gz`)));
  for(const record of catalog)if(record.volume&&!Object.hasOwn(withheld,String(Number(record.volume))))assert.ok(manifest[String(Number(record.volume))],record.id);
});

test('volume titles distinguish filename separators from names, compounds and date ranges',()=>{
  assert.equal(volumeTitle('volume_01 The-Bab-Writings-of-the-pre-Declaration-period-(before-May-23,-1844).pdf'),'Volume 1, The Bab: Writings of the pre-Declaration period (before May 23, 1844)');
  assert.equal(volumeTitle('volume_04 The-Bab-Writings-during-the-Hajj-and-in-Bushihr-(late-1844-July-1845).pdf'),'Volume 4, The Bab: Writings during the Hajj and in Bushihr (late-1844-July 1845)');
  assert.equal(volumeTitle("volume_09 Tafsir-i-Suratu'l-Kawthar-(Commentary-on-the-Surah-of-Abundance,-April-1846).pdf"),"Volume 9, Tafsir-i-Suratu'l-Kawthar (Commentary on the Surah of Abundance, April 1846)");
  assert.equal(volumeTitle("volume_108 Abdu'l-Baha,-Pre-ministry-(before-June-1892).pdf"),"Volume 108, Abdu'l-Baha: Pre-ministry (before June 1892)");
});

test('volume links use the project subpath and open a PDF in a new tab',()=>{
  const html=renderVolume('02',{'2':'pdf-volumes/volume-2.pdf'});
  assert.match(html,/href="\.\/pdf-volumes\/volume-2\.pdf"/);
  assert.match(html,/target="_blank"/);assert.match(html,/>02<\/a>/);
  assert.equal(renderVolume('999',{}),'999');
  assert.equal(renderVolume('<script>',{}),'&lt;script&gt;');
});
