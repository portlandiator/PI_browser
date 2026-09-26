let pending;
export function showAboutStats(element){
  pending ||= (async()=>{
    const response=await fetch(new URL('./stats.json',import.meta.url),{cache:'no-cache'});
    if(!response.ok)throw Error('Collection statistics unavailable');
    const stats=await response.json();
    const reportResponse=await fetch(new URL(stats.dataset+'subjects/report.json',import.meta.url));
    if(!reportResponse.ok)throw Error('Subject statistics unavailable');
    const subjects=await reportResponse.json();
    return `The collection contains ${stats.records.toLocaleString()} catalogue records, including ${stats.pairs.toLocaleString()} texts in both languages. It also includes ${subjects.subjects.toLocaleString()} subject categories and ${subjects.selections.toLocaleString()} thematic passages.`;
  })().catch(error=>{pending=null;throw error;});
  return pending.then(text=>{element.textContent=text;});
}
