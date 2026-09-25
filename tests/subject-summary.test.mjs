import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {parseSubjectSummary,renderSubjectSummary} from '../src/subject-summary.mjs';

const subjects=[{id:'one',name:'One',color:'#123456'},{id:'two',name:'Two',color:'#654321'}];
test('summary links use the target subject color and local navigation; prose is escaped',()=>{
  const summary=parseSubjectSummary('# One\n\n<script>text</script>\n\nSee [Two & more](https://portlandiator.github.io/PI_browser/subjects.html?subject=two).',subjects[0],subjects);
  const html=renderSubjectSummary(summary,subjects,id=>'./subjects.html?subject='+id+'&mode=en');
  assert.match(html,/&lt;script&gt;text&lt;\/script&gt;/);
  assert.match(html,/--subject-654321/);
  assert.match(html,/href="\.\/subjects.html\?subject=two&amp;mode=en"/);
  assert.match(html,/Two &amp; more/);
  assert.doesNotMatch(html,/<script>|portlandiator/);
});
test('summary import rejects unknown subjects, unsafe links and malformed files',()=>{
  for(const href of ['javascript:alert(1)','https://example.com/?subject=two','https://portlandiator.github.io/PI_browser/subjects.html?subject=missing']) {
    assert.throws(()=>parseSubjectSummary(`# One\n\nIntro\n\n[link](${href})`,subjects[0],subjects));
  }
  assert.throws(()=>parseSubjectSummary('# One\n\nOnly one paragraph',subjects[0],subjects));
});
test('every editable summary imports with known subject links',()=>{
  const root=new URL('../',import.meta.url);
  const stats=JSON.parse(readFileSync(new URL('dist/stats.json',root)));
  const index=JSON.parse(gunzipSync(readFileSync(new URL('dist/'+stats.dataset+'subjects/index.json.gz',root))));
  const directory=new URL('subject-summaries/',root);
  assert.equal(readdirSync(directory).filter(name=>name.endsWith('.md')).length,index.subjects.length);
  for(const subject of index.subjects){
    const markdown=readFileSync(new URL(encodeURIComponent(subject.name+'.md'),directory),'utf8');
    assert.equal(parseSubjectSummary(markdown,subject,index.subjects).length,2);
  }
});
