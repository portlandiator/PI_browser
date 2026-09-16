import {escapeHtml} from './text.mjs';

export function renderVolume(value,volumes){
  const key=/^\d+$/.test(String(value).trim())?String(Number(value)):null;
  const file=key&&volumes[key];
  if(!file||!/^pdf-volumes\/volume-\d+\.pdf$/.test(file))return escapeHtml(value);
  return `<a href="./${file}" target="_blank" rel="noopener noreferrer" aria-label="Open volume ${escapeHtml(value)} PDF">${escapeHtml(value)}</a>`;
}
