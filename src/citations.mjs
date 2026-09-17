export const citationFields=['Manuscripts','Publications','Translations','Musical interpretations'];

// Protect complete links before splitting: labels and URLs may contain commas.
// Unlinked references count too; empty separators in the source do not.
export function countReferences(value=''){
  const text=String(value).replace(/<a\b[^>]*>[\s\S]*?<\/a\s*>/gi,'REFERENCE');
  let depth=0,count=0,entry='';
  for(const character of text){
    if(character==='('||character==='[')depth++;
    if(character===')'||character===']')depth=Math.max(0,depth-1);
    if(character===','&&depth===0){if(entry.trim())count++;entry='';}
    else entry+=character;
  }
  return count+(entry.trim()?1:0);
}

export const citationCount=metadata=>citationFields.reduce((sum,field)=>sum+countReferences(metadata[field]||''),0);
