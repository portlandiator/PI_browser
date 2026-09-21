import {countReferences} from './citations.mjs';

export const mayPublishOriginal=metadata=>['Manuscripts','Publications'].some(field=>countReferences(metadata?.[field]||'')>0);

// Local source metadata stays intact; public copies must not reveal even an incipit.
export function publicMetadata(metadata){
  return mayPublishOriginal(metadata)?metadata:{...metadata,'First line (original)':''};
}
