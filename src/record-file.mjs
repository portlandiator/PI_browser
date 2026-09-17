// Source IDs remain exact. Escape lowercase/non-ASCII bytes only in generated
// filenames so distinct IDs also remain distinct on case-insensitive filesystems.
export function recordFilename(id){
  return [...String(id)].map(c=>/^[A-Z0-9_ ()-]$/.test(c)?c:[...new TextEncoder().encode(c)].map(b=>'~'+b.toString(16).padStart(2,'0')).join('')).join('')+'.json.gz';
}
