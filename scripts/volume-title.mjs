// Filenames use hyphens both for spaces and for real compounds. Protect the
// compounds present in this collection before converting filename separators.
const compounds=["Qayyumu'l-Asma","Tafsir-i-Suratu'l-Kawthar","Tafsir-va'l-Asr","Nubuwwat-i-Khassih","Kitab-i-Ruh","Kitab-i-Asma'","Kitab-i-Jaza'","Kitab-i-Iqan","Kitab-i-Badi'","Kitab-i-Aqdas","Abdu'l-Baha","Panj-Sha'n"];
const month='(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?';
export function volumeTitle(filename){
  const match=/^volume_(\d+)\s+(.+)\.pdf$/i.exec(filename);
  if(!match)throw new Error(`Cannot determine volume title: ${filename}`);
  let title=match[2];
  const protect=value=>value.replaceAll('-','\u0000');
  for(const compound of compounds)title=title.replaceAll(compound,()=>protect(compound));
  title=title.replace(/\b(?:pre|post)-[Dd]eclaration\b|\b[Pp]re-ministry\b/g,protect)
    .replace(/\b(?:early|mid|late)-(?:early|mid|late)-\d{4}\b|\b(?:early|mid|late)-\d{4}\b/g,protect)
    .replace(/\b\d{4}-\d{4}\b/g,protect)
    .replace(new RegExp(`\\b${month}-${month}`, 'g'),protect)
    .replace(new RegExp(`\\b\\d{4}-(?=${month})`, 'g'),protect)
    .replace(/ - /g,protect)
    .replaceAll('-',' ')
    .replaceAll('\u0000','-')
    .replace(/^(The Bab|Baha'u'llah|Abdu'l-Baha),?\s+/,'$1: ')
    .replace(/\s+/g,' ').trim();
  return `Volume ${Number(match[1])}, ${title}`;
}
