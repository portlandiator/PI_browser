import {relationKey} from './subject-relations.mjs';

export const emptyDraft=()=>({format:1,matches:{},relationships:[],reviewedSubjects:{}});
export function validateDraft(value,ids){
  if(!value||value.format!==1||!value.matches||typeof value.matches!=='object'||Array.isArray(value.matches)||!Array.isArray(value.relationships))throw Error('Choose a format 1 subject-edits.json file.');
  for(const edge of value.relationships){
    if(!ids.has(edge.source)||!ids.has(edge.target)||edge.source===edge.target||!['related','broader','narrower'].includes(edge.type)||!['accepted','rejected'].includes(edge.status)||edge.note!==undefined&&typeof edge.note!=='string')throw Error('Invalid connection or unknown subject in the decisions file.');
  }
  if(value.reviewedSubjects&&(!Object.keys(value.reviewedSubjects).every(id=>ids.has(id))||!Object.values(value.reviewedSubjects).every(v=>typeof v==='boolean')))throw Error('Invalid subject review progress.');
  return value;
}
export function mergeDrafts(base,incoming){
  const edges=new Map(base.relationships.map(e=>[relationKey(e),e]));
  for(const edge of incoming.relationships)edges.set(relationKey(edge),edge);
  return {format:1,matches:{...base.matches,...incoming.matches},relationships:[...edges.values()],reviewedSubjects:{...base.reviewedSubjects,...incoming.reviewedSubjects}};
}
export function effectiveEdges(edges,draft){
  const map=new Map();
  for(const edge of edges){const key=relationKey(edge),previous=map.get(key);if(!previous||edge.status!=='suggested')map.set(key,edge);}
  for(const edit of draft.relationships){const key=relationKey(edit);map.set(key,{...map.get(key),...edit});}
  return [...map.values()];
}
export function relativeType(edge,id){return edge.source===id||edge.type==='related'?edge.type:edge.type==='broader'?'narrower':'broader';}
export function changeConnection(draft,edge,previous){
  const changes=[];
  if(previous&&relationKey(previous)!==relationKey(edge))changes.push({...previous,status:'rejected',note:'Replaced by an edited connection.'});
  changes.push(edge);
  return mergeDrafts(draft,{...emptyDraft(),relationships:changes});
}
export function sharedEvidence(left,right,limit=5){
  const byParagraph=new Map(),found=new Map();
  for(const selection of left.selections){if(!selection.passage)continue;const c=selection.candidates[0];for(const range of c.ranges){const key=c.source+':'+range.paragraph;const list=byParagraph.get(key)||[];list.push({range,source:c.source,passage:selection.passage});byParagraph.set(key,list);}}
  for(const selection of right.selections){if(!selection.passage)continue;const c=selection.candidates[0];for(const range of c.ranges){const key=c.source+':'+range.paragraph;for(const other of byParagraph.get(key)||[]){const start=Math.max(range.start,other.range.start),end=Math.min(range.end,other.range.end);if(start<end&&!found.has(key))found.set(key,{source:c.source,paragraph:range.paragraph,passage:other.passage,text:other.range.text.slice(start-other.range.start,end-other.range.start)});}}}
  return {total:found.size,examples:[...found.values()].slice(0,limit)};
}
