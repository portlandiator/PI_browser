import csv, json, pathlib, collections
root=pathlib.Path(__file__).resolve().parents[1]
report={}
for folder in ['original_texts - copy','translated_texts - copy']:
    files=list((root/folder).glob('*.txt'))
    report[folder]={'count':len(files),'bytes':sum(f.stat().st_size for f in files)}
    report[folder]['ids']=set(f.stem for f in files)
print('Files:',json.dumps({k:{a:b for a,b in v.items() if a!='ids'} for k,v in report.items()}))
print('Unpaired:', {k:len(v['ids']-report[other]['ids']) for k,v in report.items() for other in report if other!=k})
for path in (root/'metadata - copy').glob('*.csv'):
    raw=path.read_bytes()
    try: text=raw.decode('utf-8-sig'); enc='utf-8'
    except UnicodeDecodeError: text=raw.decode('cp1252'); enc='cp1252'
    rows=list(csv.DictReader(text.splitlines()))
    print(path.name,enc,len(rows),'unique',len(set(r['ID'] for r in rows)))
    print('fields',[(k,sum(bool(r.get(k)) for r in rows)) for k in rows[0]])
    print('sample',json.dumps(rows[:1],ensure_ascii=True))
counts=collections.Counter(); pars=collections.Counter(); sample={};bad=[]
for folder in report:
    for path in (root/folder).glob('*.txt'):
        try: text=path.read_text(encoding='utf-8-sig')
        except UnicodeDecodeError: bad.append(str(path));continue
        import re
        for command in re.findall(r'\\([a-zA-Z]+)',text):
            counts[command]+=1
            sample.setdefault(command,(path.name,text[max(0,text.index('\\'+command)-30):text.index('\\'+command)+180]))
        pars[(folder,len(re.split(r'\n\s*\n',text.strip())))]+=1
print('commands',counts)
print('command samples',json.dumps(sample,ensure_ascii=True)[:5000])
print('invalid utf8',bad[:10])
