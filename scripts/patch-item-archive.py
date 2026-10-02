"""Apply exactly one local item to the current published archive; preserve other items."""
from pathlib import Path
import argparse, csv, gzip, importlib.util, io, json, tarfile

def patch(files, local, identity, policy):
    # Exact filenames preserve case-distinct IDs. Do not import unrelated local changes.
    csvs=list((local/'metadata - copy').glob('*.csv'))
    if len(csvs)!=1: raise ValueError('Expected one local metadata CSV')
    with csvs[0].open(encoding='utf-8-sig',newline='') as stream:
        reader=csv.DictReader(stream); fields=reader.fieldnames; rows=list(reader)
    matches=[row for row in rows if row['PIN']==identity]
    if len(matches)>1: raise ValueError('Duplicate local metadata ID')
    name=next(name for name in files if name.startswith('metadata - copy/') and name.endswith('.csv'))
    reader=csv.DictReader(io.StringIO(files[name].decode('utf-8-sig'),newline=''))
    if reader.fieldnames!=fields: raise ValueError('Metadata columns differ from the published catalog. Use the full updater.')
    published=list(reader)
    known={row['PIN'] for row in published}|{Path(name).stem for name in files if name.endswith('.txt')}|set(json.loads(files[policy.MANIFEST]))
    if identity not in known: raise ValueError('This is not an existing published ID. Use the full updater to add or rename records.')
    if matches:
        if not any(row['PIN']==identity for row in published): published.append(matches[0])
        else: published=[matches[0] if row['PIN']==identity else row for row in published]
    output=io.StringIO(newline=''); writer=csv.DictWriter(output,fieldnames=fields,lineterminator='\n');writer.writeheader();writer.writerows(published)
    result=dict(files);result[name]=output.getvalue().encode('utf-8')
    for folder in policy.FOLDERS[1:]:
        filename=identity+'.txt'; key=folder+'/'+filename
        # Windows paths are case insensitive; enumeration enforces exact identity.
        actual=next((p for p in (local/folder).iterdir() if p.name==filename),None)
        if actual is None: result.pop(key,None)
        else: result[key]=actual.read_bytes()
    return policy.public_files(result)

def main():
    args=argparse.ArgumentParser();args.add_argument('--root',type=Path,required=True);args.add_argument('--archive',type=Path,required=True);args.add_argument('--id',required=True)
    options=args.parse_args()
    if not options.id or len(options.id)>160 or any(not(c.isalnum() or c in '_ ()-') for c in options.id): raise ValueError('Invalid ID')
    spec=importlib.util.spec_from_file_location('archive_sources',Path(__file__).with_name('archive-sources.py'));policy=importlib.util.module_from_spec(spec);spec.loader.exec_module(policy)
    before=policy.read_archive(options.archive)
    files=patch(before,options.root,options.id,policy)
    if files==before:
        print('This item already matches the published source.')
        return
    temporary=options.archive.with_suffix('.tmp')
    with temporary.open('wb') as output, gzip.GzipFile(fileobj=output,mode='wb',filename='',mtime=0,compresslevel=9) as compressed,tarfile.open(fileobj=compressed,mode='w|',format=tarfile.PAX_FORMAT) as archive:
        for name,contents in sorted(files.items()):
            info=tarfile.TarInfo(name);info.size=len(contents);info.mode=0o644;archive.addfile(info,io.BytesIO(contents))
    temporary.replace(options.archive)
    print('Prepared one-item public archive for '+options.id)

if __name__=='__main__': main()
