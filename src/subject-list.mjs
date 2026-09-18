// Citation totals use the same source metadata as Catalog view.
export function compareSelections(a,b,sources){
  const sourceA=a.candidates[0]?.source||a.suppliedIds[0]||'~';
  const sourceB=b.candidates[0]?.source||b.suppliedIds[0]||'~';
  return (sources[sourceB]?.citationCount||0)-(sources[sourceA]?.citationCount||0)
    ||sourceA.localeCompare(sourceB)
    ||(a.candidates[0]?.ranges[0]?.paragraph||0)-(b.candidates[0]?.ranges[0]?.paragraph||0)
    ||a.id.localeCompare(b.id);
}
