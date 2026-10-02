import importlib.util, csv, io, json, tempfile, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def load(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
patcher=load('patcher','patch-item-archive.py');policy=load('policy','archive-sources.py')
FIELDS=['PIN','Title','Manuscripts','Publications','First line (original)']
def metadata(rows):
    stream=io.StringIO(newline='');writer=csv.DictWriter(stream,fieldnames=FIELDS,lineterminator='\n');writer.writeheader();writer.writerows(rows);return stream.getvalue().encode()
class ItemPatch(unittest.TestCase):
    def test_only_selected_item_and_publication_policy(self):
        a=dict(zip(FIELDS,['AB1','First','M','','اول']));b=dict(zip(FIELDS,['AB2','Second','M','','دوم']))
        files={'metadata - copy/items.csv':metadata([a,b]),policy.MANIFEST:b'[]\n','original_texts - copy/AB1.txt':b'old','translated_texts - copy/AB1.txt':b'old translation','translated_texts - copy/AB2.txt':b'keep'}
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            for folder in policy.FOLDERS:(root/folder).mkdir()
            a.update(Title='Corrected',Manuscripts='');b['Title']='Unrelated local draft'
            (root/'metadata - copy/items.csv').write_bytes(metadata([a,b]))
            (root/'original_texts - copy/AB1.txt').write_text('withheld original')
            (root/'translated_texts - copy/AB1.txt').write_text('corrected translation')
            (root/'translated_texts - copy/AB2.txt').write_text('unrelated local draft')
            result=patcher.patch(files,root,'AB1',policy)
            rows=list(csv.DictReader(io.StringIO(result['metadata - copy/items.csv'].decode())))
            self.assertEqual(rows[0]['Title'],'Corrected');self.assertEqual(rows[0]['First line (original)'],'')
            self.assertEqual(rows[1]['Title'],'Second');self.assertEqual(result['translated_texts - copy/AB2.txt'],b'keep')
            self.assertNotIn('original_texts - copy/AB1.txt',result);self.assertEqual(result['translated_texts - copy/AB1.txt'],b'corrected translation')
            self.assertIn('AB1',json.loads(result[policy.MANIFEST]))
            with self.assertRaises(ValueError):patcher.patch(files,root,'NEW',policy)
if __name__=='__main__':unittest.main()
