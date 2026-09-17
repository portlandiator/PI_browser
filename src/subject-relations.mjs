// SKOS inverse/symmetric forms identify the same editorial relationship.
export function relationKey(edge){
  let {source,target,type}=edge;
  if(type==='narrower'){[source,target]=[target,source];type='broader';}
  if(type==='related'&&source>target)[source,target]=[target,source];
  return [source,type,target].join(':');
}
