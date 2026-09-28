export const pendingStatuses = ['approximate', 'ambiguous', 'unmatched'];
export function reviewSummary(subject, selections) {
  return {subject, items: selections.filter(s => [...pendingStatuses, 'confirmed', 'rejected'].includes(s.status)).map(s => ({id:s.id,status:s.status}))};
}
export function reviewStatus(selection, draft) { return draft.matches[selection.id]?.status || selection.status; }
export function inQueue(selection, draft, filter='pending') {
  const status=reviewStatus(selection,draft);
  return filter==='all'||filter==='pending'&&pendingStatuses.includes(status)||filter==='reviewed'&&['confirmed','rejected'].includes(status)||status===filter;
}
export function reviewKeyAction(event={}, {editable=false,canConfirm=true}={}) {
  if(editable||event.repeat||!event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return '';
  if(event.key==='ArrowRight')return 'next';
  if(event.key==='ArrowLeft')return 'previous';
  if(event.key?.toLowerCase()==='c'&&canConfirm)return 'confirm';
  if(event.key?.toLowerCase()==='r')return 'reject';
  return '';
}
export function validateMatchEdits(draft) {
  for(const [id,edit] of Object.entries(draft.matches)) {
    if(!/^[a-f\d]{24}$/.test(id)||!edit||!['confirmed','rejected'].includes(edit.status)||edit.note!==undefined&&typeof edit.note!=='string')throw Error('Invalid passage decision.');
    if(edit.status==='confirmed') {
      const c=edit.candidate;
      if(!c||typeof c.source!=='string'||!c.source||!/^[a-f\d]{64}$/.test(c.version)||!Array.isArray(c.ranges)||!c.ranges.length)throw Error('A confirmed passage needs a source version and ranges.');
      for(const r of c.ranges)if(!Number.isInteger(r.paragraph)||r.paragraph<1||!Number.isInteger(r.start)||!Number.isInteger(r.end)||r.start<0||r.end<=r.start)throw Error('Invalid passage range.');
    }
  }
  return draft;
}
export function confirmedCandidate(candidate, record) {
  if(!candidate||candidate.source!==record.id||candidate.version!==record.enVersion)throw Error('Source version differs. Load a current source before confirming.');
  if(!Array.isArray(candidate.ranges)||!candidate.ranges.length)throw Error('Choose at least one passage range.');
  let previous;
  const ranges=candidate.ranges.map(r=>{
    const p=record.en?.paragraphs[r.paragraph-1];
    if(!Number.isInteger(r.paragraph)||!p||!Number.isInteger(r.start)||!Number.isInteger(r.end)||r.start<0||r.end<=r.start||r.end>p.plain.length)throw Error('Invalid paragraph or character range.');
    if(previous&&(r.paragraph<previous.paragraph||r.paragraph===previous.paragraph&&r.start<previous.end))throw Error('Ranges must be in reading order without overlap.');
    previous=r;
    return {paragraph:r.paragraph,paragraphId:`${record.id}@${record.enVersion}:en:${r.paragraph}`,start:r.start,end:r.end,text:p.plain.slice(r.start,r.end)};
  });
  return {...candidate,ranges,method:'editorial',evidence:'Editorial source mapping'};
}
export function paragraphCandidate(record, first, last=first) {
  if(!Number.isInteger(first)||!Number.isInteger(last)||first<1||last<first||last-first>49||last>(record.en?.paragraphs.length||0))throw Error('Choose a valid range of up to 50 English paragraphs.');
  return confirmedCandidate({source:record.id,version:record.enVersion,ranges:Array.from({length:last-first+1},(_,i)=>({paragraph:first+i,start:0,end:record.en.paragraphs[first+i-1].plain.length}))},record);
}
