"""Compare current inputs with the published source archive without modifying either."""
from pathlib import Path
import tarfile,json,hashlib
root=Path(__file__).resolve().parents[1]
current={}
for folder in ['metadata - copy','original_texts - copy','translated_texts - copy']:
    for path in (root/folder).glob('*.csv' if folder.startswith('metadata') else '*.txt'):
        current[path.relative_to(root).as_posix()]=path
added=set(current);changed=[];removed=[]
with tarfile.open(root/'data'/'collection.tar.gz','r:gz') as archive:
    for member in archive:
        if not member.isfile():continue
        added.discard(member.name)
        if member.name not in current:removed.append(member.name);continue
        source=current[member.name].read_bytes()
        old=archive.extractfile(member).read()
        if hashlib.sha256(source).digest()!=hashlib.sha256(old).digest():changed.append(member.name)
report={'added':sorted(added),'changed':changed,'removed':removed,'currentFiles':len(current)}
(root/'.qa').mkdir(exist_ok=True)
(root/'.qa'/'source-update.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'currentFiles':len(current),'added':len(added),'changed':len(changed),'removed':len(removed),'examples':changed[:12]},ensure_ascii=True))
