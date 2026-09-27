import {escapeHtml} from './text.mjs';

export function renderVolume(value,volumes,titles={}){
  const key=/^\d+$/.test(String(value).trim())?String(Number(value)):null;
  const file=key&&volumes[key];
  const label=key&&titles[key]||value;
  if(!file||!/^pdf-volumes\/volume-\d+\.pdf$/.test(file))return escapeHtml(label);
  return `<a href="./${file}" target="_blank" rel="noopener noreferrer" aria-label="Open volume ${escapeHtml(value)} PDF">${escapeHtml(label)}</a>`;
}
