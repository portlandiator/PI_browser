import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync,gzipSync} from 'node:zlib';
import {reviewSummary} from '../src/passage-review-core.mjs';

export async function writeReviewIndex(base, subjects, bySubject) {
  const rows=subjects.map(s=>reviewSummary(s.id,bySubject.get(s.id)?.selections||[]));
  await fs.writeFile(path.join(base,'review-index.json.gz'),gzipSync(JSON.stringify({format:1,subjects:rows}),{level:9}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const stats=JSON.parse(await fs.readFile('dist/stats.json','utf8'));
  const base=path.join('dist',stats.dataset,'subjects');
  const index=JSON.parse(gunzipSync(await fs.readFile(path.join(base,'index.json.gz'))));
  // Read sequentially to keep peak memory bounded; only compact summaries survive.
  const summaries=[];
  for(const s of index.subjects) {
    const data=JSON.parse(gunzipSync(await fs.readFile(path.join(base,s.id+'.json.gz'))));
    summaries.push(reviewSummary(s.id,data.selections));
  }
  await fs.writeFile(path.join(base,'review-index.json.gz'),gzipSync(JSON.stringify({format:1,subjects:summaries}),{level:9}));
  console.log(`Passage review index: ${summaries.reduce((n,s)=>n+s.items.length,0)} selections in ${summaries.length} subjects`);
}
