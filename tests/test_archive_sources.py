import importlib.util
import io
import csv
import json
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('archive_sources', Path(__file__).resolve().parents[1] / 'scripts/archive-sources.py')
archive = importlib.util.module_from_spec(spec)
spec.loader.exec_module(archive)

class PublicationArchiveTests(unittest.TestCase):
    def test_filters_originals_and_incipits_preserving_translations_and_ids(self):
        text = io.StringIO(newline='')
        writer = csv.writer(text)
        writer.writerow(['PIN', 'Manuscripts', 'Publications', 'First line (original)'])
        writer.writerows([['BLOCK', ' , ', '', 'PRIVATE'], ['ALLOW', '', '<a href="https://example.org/a,b">a,b</a>', 'PUBLIC']])
        files = {'metadata - copy/catalog.csv': text.getvalue().encode(),
                 'original_texts - copy/BLOCK.txt': b'PRIVATE',
                 'original_texts - copy/UNKNOWN.txt': b'PRIVATE',
                 'original_texts - copy/ALLOW.txt': b'PUBLIC',
                 'translated_texts - copy/BLOCK.txt': b'English\r\n'}
        result = archive.public_files(files)
        self.assertNotIn('original_texts - copy/BLOCK.txt', result)
        self.assertNotIn('original_texts - copy/UNKNOWN.txt', result)
        self.assertEqual(result['original_texts - copy/ALLOW.txt'], b'PUBLIC')
        self.assertEqual(result['translated_texts - copy/BLOCK.txt'], b'English\r\n')
        self.assertNotIn(b'PRIVATE', result['metadata - copy/catalog.csv'])
        self.assertEqual(json.loads(result[archive.MANIFEST]), ['BLOCK', 'UNKNOWN'])
        self.assertEqual(archive.public_files(result), result)
        self.assertEqual(files['original_texts - copy/BLOCK.txt'], b'PRIVATE')

    def test_missing_policy_columns_and_duplicate_ids_fail_closed(self):
        for data in (b'PIN\nA\n', b'PIN,Manuscripts,Publications\nA,,\nA,,\n'):
            with self.assertRaises(ValueError): archive.public_files({'metadata - copy/catalog.csv': data})

if __name__ == '__main__': unittest.main()
