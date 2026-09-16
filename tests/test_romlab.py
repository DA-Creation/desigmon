import hashlib
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('romlab', Path(__file__).resolve().parents[1]/'tools/rom-lab/romlab.py')
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)

class RomTests(unittest.TestCase):
    def test_checksums_update_header_before_global(self):
        b = bytes(range(256))*4
        out = lab.fix_checksums(b)
        h,g = lab.checksums(out)
        self.assertEqual(out[0x14d],h)
        self.assertEqual(out[0x14e:0x150],g.to_bytes(2,'big'))
        self.assertEqual(out,lab.fix_checksums(out))

    def test_short_header_rejected(self):
        with self.assertRaises(ValueError): lab.inspect(b'wrong')

    def test_encoding_uses_decimal_table_ten(self):
        self.assertEqual(lab.encode_name('타이포몬').hex(),'0988079c0a2704935050')
        self.assertEqual(lab.encode_name('일러몬').hex(),'079f03df049350505050')

    def test_invalid_names(self):
        for name in ['', 'abcdef', '디자인몬', '일'*6]:
            with self.assertRaises(ValueError): lab.encode_name(name)

    def test_hash_gate(self):
        with self.assertRaisesRegex(ValueError,'SHA-256'): lab.patch(b'x'*2097152)

    def test_patch_scope_immutable_input_and_ips_roundtrip(self):
        b = bytearray(2097152)
        for species,_,_,expected in lab.STARTERS:
            i=lab.NAMES_OFFSET+(species-1)*10
            b[i:i+10]=bytes.fromhex(expected)
        original = lab.fix_checksums(b)
        with patch.object(lab,'BASE_SHA256',hashlib.sha256(original).hexdigest()):
            out,manifest = lab.patch(original)
        allowed = {0x14e,0x14f}
        for species,_,_,_ in lab.STARTERS:
            i=lab.NAMES_OFFSET+(species-1)*10
            allowed.update(range(i,i+10))
        self.assertTrue(all(a==b or i in allowed for i,(a,b) in enumerate(zip(original,out))))
        self.assertEqual(lab.apply_ips(original,lab.make_ips(original,out)),out)
        self.assertEqual(manifest['changed_bytes'],23)
        self.assertTrue(lab.inspect(out)['global_checksum_valid'])

    def test_expected_bytes_guard(self):
        b=bytes(2097152)
        with patch.object(lab,'BASE_SHA256',hashlib.sha256(b).hexdigest()):
            with self.assertRaisesRegex(ValueError,'table'): lab.patch(b)

    def test_ips_large_run(self):
        original=bytes(70000);out=b'\x01'*70000
        self.assertEqual(lab.apply_ips(original,lab.make_ips(original,out)),out)

    def test_ips_rle_and_invalid(self):
        self.assertEqual(lab.apply_ips(bytes(8),b'PATCH\x00\x00\x01\x00\x00\x00\x03\x04EOF'),b'\x00\x04\x04\x04\x00\x00\x00\x00')
        for bad in [b'bad',b'PATCH',b'PATCH\x00\x00\x00\x00\x04a',b'PATCHEOFextra',b'PATCH\x00\x00\x08\x00\x01xEOF']:
            with self.assertRaises(ValueError): lab.apply_ips(bytes(8),bad)

if __name__ == '__main__': unittest.main()
