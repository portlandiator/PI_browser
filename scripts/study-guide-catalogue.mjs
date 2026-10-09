import {createHash} from 'node:crypto';
import {isPublicSelection,isVerifiedMatch} from '../src/selection-policy.mjs';

// Approximate catalogue references are useful, but are not permission to
// substitute different wording for a supplied quotation.
export function studyGuideSelections(selections){
 return selections.filter(isPublicSelection).map(s=>isVerifiedMatch(s)?s:{...s,passage:undefined});
}

export function catalogueFingerprint(selections){
 const critical=selections.map(s=>({id:s.id,status:s.status,public:isPublicSelection(s),excerpt:s.excerpt,original:s.original,reference:s.reference,suppliedIds:s.suppliedIds,passage:s.passage,candidates:s.candidates})).sort((a,b)=>a.id.localeCompare(b.id));
 return createHash('sha256').update(JSON.stringify(critical)).digest('hex');
}

export function verifyCatalogueBaseline(data,baseline){
 if(!baseline)return;
 const expected=baseline.subjects[data.subject.id];
 if(!expected||catalogueFingerprint(data.selections)!==expected.fingerprint)throw Error(`Catalogue review data changed for ${data.subject.name}. Reconcile the published matches, removals, and versioned source text before rebuilding study guides; do not fall back to the older automatic matches.`);
}
