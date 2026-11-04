"""Apply pending catalog edits and deletions to the published source archive.

Reads the shards present in --archive (a part of the archive is enough, as long
as metadata.tar and every shard an item's texts belong to are there), applies
the items in --batch and rewrites only the shards whose bytes change, printing
them as JSON; with --report FILE it also writes the batch items' state after
the change (as --inspect describes it) to FILE. With --inspect FILE it instead
writes the published state of the batch's items to FILE and changes nothing.

Batch file: {"items": {ID: {"action": "edit", "metadata": {column: value},
"original": base64 or null, "english": base64 or null} | {"action": "delete"}}}
"""
from pathlib import Path
import argparse, base64, csv, importlib.util, io, json

def valid_id(identity):
    return bool(identity) and len(identity)<=160 and all(c.isalnum() or c in '_ ()-' for c in identity)

def read_metadata(files, policy):
    names=[n for n in files if n.startswith(policy.FOLDERS[0]+'/') and n.endswith('.csv')]
    if len(names)!=1: raise ValueError('Expected exactly one metadata CSV in the archive')
    reader=csv.DictReader(io.StringIO(files[names[0]].decode('utf-8-sig'),newline=''))
    return names[0], reader.fieldnames, list(reader)

def csv_bytes(fields, rows):
    output=io.StringIO(newline=''); writer=csv.DictWriter(output,fieldnames=fields,lineterminator='\n')
    writer.writeheader(); writer.writerows(rows)
    return output.getvalue().encode('utf-8')

def text_keys(identity, policy):
    return [folder+'/'+identity+'.txt' for folder in policy.FOLDERS[1:]]

def published_state(files, ids, policy):
    """What the archive holds for each ID: its metadata row, both texts and
    whether its original is withheld. Absent parts are null."""
    name, fields, rows = read_metadata(files, policy)
    by_id={row['PIN']: row for row in rows}
    withheld=set(json.loads(files[policy.MANIFEST]))
    items={}
    for identity in ids:
        if not valid_id(identity): raise ValueError('Invalid ID: '+repr(identity))
        original, english = (files.get(key) for key in text_keys(identity, policy))
        items[identity]={'metadata': by_id.get(identity),
                         'original': None if original is None else base64.b64encode(original).decode('ascii'),
                         'english': None if english is None else base64.b64encode(english).decode('ascii'),
                         'withheld': identity in withheld}
    return {'fields': fields, 'items': items}

def apply_batch(files, batch, policy):
    """The archive files after every edit and deletion in the batch, with the
    publication policy applied. Other items keep their exact published bytes."""
    name, fields, rows = read_metadata(files, policy)
    withheld=set(json.loads(files[policy.MANIFEST]))
    result=dict(files)
    for identity, item in batch['items'].items():
        if not valid_id(identity): raise ValueError('Invalid ID: '+repr(identity))
        keys=text_keys(identity, policy)
        listed=any(row['PIN']==identity for row in rows)
        known=listed or any(key in result for key in keys) or identity in withheld
        if item['action']=='delete':
            if not known: raise ValueError(f'{identity} is not in the published catalog.')
            rows=[row for row in rows if row['PIN']!=identity]
            for key in keys: result.pop(key, None)
            withheld.discard(identity)
        elif item['action']=='edit':
            if not known: raise ValueError(f'{identity} is not in the published catalog. Add new items with Update-Collection.cmd.')
            row=item['metadata']
            if not isinstance(row, dict) or list(row)!=list(fields) or row.get('PIN')!=identity:
                raise ValueError('Metadata columns differ from the published catalog. Use Update-Collection.cmd for a changed metadata schema.')
            rows=[row if r['PIN']==identity else r for r in rows] if listed else rows+[row]
            for key, value in zip(keys, (item.get('original'), item.get('english'))):
                if value is None: result.pop(key, None)
                else: result[key]=base64.b64decode(value)
            # Whether the original is withheld is decided again by the policy below.
            withheld.discard(identity)
        else: raise ValueError('Unknown action: '+repr(item.get('action')))
    result[name]=csv_bytes(fields, rows)
    result[policy.MANIFEST]=(json.dumps(sorted(withheld), ensure_ascii=False)+'\n').encode('utf-8')
    return policy.public_files(result)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, required=True, help='Directory holding the published shards to change')
    parser.add_argument('--batch', type=Path, required=True, help='JSON file of edits and deletions')
    parser.add_argument('--inspect', type=Path, help='Write the published state of the batch items here and change nothing')
    parser.add_argument('--report', type=Path, help='After applying the batch, write the new state of its items here')
    options=parser.parse_args()
    spec=importlib.util.spec_from_file_location('archive_sources', Path(__file__).with_name('archive-sources.py'))
    policy=importlib.util.module_from_spec(spec); spec.loader.exec_module(policy)
    batch=json.loads(options.batch.read_text(encoding='utf-8'))
    files=policy.read_archive(options.archive, partial=True)
    if policy.MANIFEST not in files: raise SystemExit('metadata.tar is missing from '+str(options.archive))
    if options.inspect:
        options.inspect.write_text(json.dumps(published_state(files, list(batch['items']), policy), ensure_ascii=False), encoding='utf-8')
        return
    result=apply_batch(files, batch, policy)
    present={p.name for p in options.archive.iterdir()}
    missing=sorted({policy.shard_name(n) for n in result}-present)
    if missing: raise SystemExit('Archive shards missing for this change: '+', '.join(missing))
    changed=policy.write_shards(options.archive, result, only=present)
    if options.report:
        options.report.write_text(json.dumps(published_state(result, list(batch['items']), policy), ensure_ascii=False), encoding='utf-8')
    print(json.dumps({'changed': changed}))

if __name__=='__main__': main()
