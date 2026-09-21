"""Pack publishable source inputs without modifying local source folders."""
from pathlib import Path, PurePosixPath
import argparse, csv, gzip, io, json, tarfile
FOLDERS = ['metadata - copy', 'original_texts - copy', 'translated_texts - copy']
MANIFEST = FOLDERS[0] + '/withheld-original-ids.json'

def permitted(row):
    # Same availability test as countReferences > 0: any nonseparator content.
    return any(str(row.get(f, '')).replace(',', '').strip() for f in ('Manuscripts', 'Publications'))

def public_files(files):
    names = [n for n in files if n.startswith(FOLDERS[0] + '/') and n.endswith('.csv')]
    if len(names) != 1: raise ValueError('Expected exactly one metadata CSV')
    name = names[0]
    reader = csv.DictReader(io.StringIO(files[name].decode('utf-8-sig'), newline=''))
    fields = reader.fieldnames
    if not fields or not {'PIN', 'Manuscripts', 'Publications'}.issubset(fields):
        raise ValueError('Missing publication-policy metadata columns')
    rows = list(reader)
    by_id = {r['PIN']: r for r in rows}
    if len(by_id) != len(rows): raise ValueError('Duplicate metadata IDs')
    withheld = set(json.loads(files.get(MANIFEST, b'[]')))
    result = {}
    for filename, contents in files.items():
        if filename.startswith(FOLDERS[1] + '/') and filename.endswith('.txt'):
            identity = PurePosixPath(filename).stem
            if not permitted(by_id.get(identity, {})):
                withheld.add(identity)
                continue
        result[filename] = contents
    for row in rows:
        if not permitted(row) and 'First line (original)' in row: row['First line (original)'] = ''
    output = io.StringIO(newline='')
    writer = csv.DictWriter(output, fieldnames=fields, lineterminator='\n')
    writer.writeheader()
    writer.writerows(rows)
    result[name] = output.getvalue().encode('utf-8')
    result[MANIFEST] = (json.dumps(sorted(withheld), ensure_ascii=False) + '\n').encode('utf-8')
    return result

def read_archive(source):
    with tarfile.open(source, 'r:gz') as archive:
        files = {}
        for entry in archive:
            if entry.isdir(): continue
            parts = PurePosixPath(entry.name).parts
            if not entry.isfile() or len(parts) != 2 or parts[0] not in FOLDERS or parts[1] in ('.', '..'):
                raise ValueError('Unexpected archive entry: ' + entry.name)
            if entry.name in files: raise ValueError('Duplicate archive entry: ' + entry.name)
            files[entry.name] = archive.extractfile(entry).read()
        return files

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--output', type=Path)
    parser.add_argument('--from-archive', type=Path, help='Filter an archive without importing local edits')
    parser.add_argument('--check', action='store_true', help='Reject an archive containing withheld originals')
    args = parser.parse_args()
    target = args.output or args.root / 'data' / 'collection.tar.gz'
    if args.from_archive or args.check:
        files = read_archive(args.from_archive or target)
    else:
        files = {}
        for folder in FOLDERS:
            for path in sorted((args.root / folder).glob('*.csv' if folder == FOLDERS[0] else '*.txt')):
                files[path.relative_to(args.root).as_posix()] = path.read_bytes()
    filtered = public_files(files)
    if args.check:
        if files != filtered: raise SystemExit('Source archive is not publication-safe; run scripts/archive-sources.py')
        print('Source archive publication policy verified')
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(target.name + '.tmp')
    with temporary.open('wb') as output:
        with gzip.GzipFile(fileobj=output, mode='wb', filename='', mtime=0, compresslevel=9) as compressed:
            with tarfile.open(fileobj=compressed, mode='w|', format=tarfile.PAX_FORMAT) as archive:
                for folder in FOLDERS:
                    info = tarfile.TarInfo(folder + '/')
                    info.type = tarfile.DIRTYPE
                    info.mode = 0o755
                    archive.addfile(info)
                for name, contents in sorted(filtered.items()):
                    info = tarfile.TarInfo(name)
                    info.size = len(contents)
                    info.mode = 0o644
                    archive.addfile(info, io.BytesIO(contents))
    temporary.replace(target)
    print(f'Archived {len(filtered):,} public files; withheld {len(json.loads(filtered[MANIFEST])):,} originals')

if __name__ == '__main__': main()
