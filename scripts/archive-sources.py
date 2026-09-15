"""Pack immutable source inputs into a reproducible archive for CI."""
from pathlib import Path
import gzip,tarfile,io
root=Path(__file__).resolve().parents[1]
(root/'data').mkdir(exist_ok=True)
target=root/'data'/'collection.tar.gz'
count=0
with target.open('wb') as output:
    with gzip.GzipFile(fileobj=output,mode='wb',filename='',mtime=0,compresslevel=9) as compressed:
        with tarfile.open(fileobj=compressed,mode='w|',format=tarfile.PAX_FORMAT) as archive:
            for folder in ['metadata - copy','original_texts - copy','translated_texts - copy']:
                pattern='*.csv' if folder.startswith('metadata') else '*.txt'
                for path in sorted((root/folder).glob(pattern)):
                    contents=path.read_bytes()
                    info=tarfile.TarInfo(path.relative_to(root).as_posix())
                    info.size=len(contents);info.mode=0o644;info.mtime=0
                    archive.addfile(info,io.BytesIO(contents));count+=1
print(f'Archived {count:,} source files into {target.name}: {target.stat().st_size:,} bytes')
