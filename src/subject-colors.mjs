// Keep source colors as category identities; themes supply display shades.
export function subjectColorStyle(subject){
  const color=/^#[a-f\d]{6}$/i.test(subject?.color)?subject.color.toLowerCase():null;
  return `--subject-color:${color?`var(--subject-${color.slice(1)},${color})`:'var(--ink)'};--subject-bg:var(--white)`;
}
