import {escapeHtml} from './text.mjs';
import {subjectColorStyle} from './subject-colors.mjs';

// Summaries support plain paragraphs and links to known subjects only.
export function parseSubjectSummary(markdown, subject, subjects) {
  const blocks = markdown.trim().split(/\r?\n\s*\r?\n/);
  if (blocks.length !== 3 || blocks[0] !== '# ' + subject.name) {
    throw new Error(`Expected a heading and two summary paragraphs: ${subject.name}`);
  }
  const ids = new Set(subjects.map(item => item.id));
  return blocks.slice(1).map(block => {
    const parts = [];
    let end = 0;
    for (const match of block.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
      const target = new URL(match[2]);
      const id = target.searchParams.get('subject');
      if (target.origin !== 'https://portlandiator.github.io' ||
          target.pathname !== '/PI_browser/subjects.html' || !ids.has(id)) {
        throw new Error(`Invalid summary subject link: ${subject.name}`);
      }
      if (match.index > end) parts.push({text: block.slice(end, match.index)});
      parts.push({text: match[1], subject: id});
      end = match.index + match[0].length;
    }
    if (end < block.length) parts.push({text: block.slice(end)});
    return parts;
  });
}

export function renderSubjectSummary(paragraphs, subjects, subjectUrl) {
  const byId = new Map(subjects.map(subject => [subject.id, subject]));
  if (!paragraphs?.length) return '<p class="subject-note">Summary unavailable for this subject.</p>';
  return paragraphs.map(parts => `<p>${parts.map(part => {
    const subject = byId.get(part.subject);
    return subject
      ? `<a class="summary-subject-link" style="${subjectColorStyle(subject)}" href="${escapeHtml(subjectUrl(subject.id))}">${escapeHtml(part.text)}</a>`
      : escapeHtml(part.text);
  }).join('')}</p>`).join('');
}
