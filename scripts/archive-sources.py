"""Pack immutable source inputs into a reproducible archive for CI."""
from pathlib import Path
import gzip,tarfile,io,argparse
root=Path(__file__).resolve().parents[1]
(root/'data').mkdir(exist_ok=True)
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output',type=Path,default=root/'data'/'collection.tar.gz')
target=parser.parse_args().output
target.parent.mkdir(parents=True,exist_ok=True)
folders=['metadata - copy','original_texts - copy','translated_texts - copy']
inputs=[]
for folder in folders:
    pattern='*.csv' if folder.startswith('metadata') else '*.txt'
    paths=sorted((root/folder).glob(pattern))
    if not paths or (pattern=='*.csv' and len(paths)!=1):
        raise SystemExit(f'{folder}: expected '+('exactly one CSV' if pattern=='*.csv' else 'at least one text file'))
    inputs.extend(paths)
count=0
with target.open('wb') as output:
    with gzip.GzipFile(fileobj=output,mode='wb',filename='',mtime=0,compresslevel=9) as compressed:
        with tarfile.open(fileobj=compressed,mode='w|',format=tarfile.PAX_FORMAT) as archive:
            for path in inputs:
                    contents=path.read_bytes()
                    info=tarfile.TarInfo(path.relative_to(root).as_posix())
                    info.size=len(contents);info.mode=0o644;info.mtime=0
                    archive.addfile(info,io.BytesIO(contents));count+=1
print(f'Archived {count:,} source files into {target.name}: {target.stat().st_size:,} bytes')
