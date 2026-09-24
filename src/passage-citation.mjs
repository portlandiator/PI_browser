import {metadataPlain} from './metadata.mjs';
import {escapeHtml} from './text.mjs';

export function passageCitation(record,href){
  const field=name=>metadataPlain(record.metadata?.[name]||'').trim();
  const recipient=field('Recipient');
  const author=field('Author')||(record.author==='Other'?'':record.author)||'';
  const description=[author,field('Title'),field('Date'),recipient?`to ${recipient}`:''].filter(Boolean).join(', ');
  return `<span class="passage-citation" dir="ltr" lang="en">(${description?escapeHtml(description)+' -- ':''}<a href="${escapeHtml(href)}">${escapeHtml(record.id)}</a>)</span>`;
}
