#!/usr/bin/env python3
"""Hash-gated Korean Gold experiments. Standard library only; never edit in place."""
import argparse
import hashlib
import json
import math
from collections import Counter
from pathlib import Path
import zipfile

BASE_SHA256 = '9c273e86e6120c6a038160ccb0153b8b20425b84fc08a496281c1d1bcac492f6'
BASE_SHA1 = 'c0ff3999e1093e1af59ef3eea3f1bfd7c1f18a65'
NAMES_OFFSET = 0x1B0C4A
CHARMAP = {'일':'079f', '러':'03df', '몬':'0493', '코':'093a',
           '딩':'0369', '타':'0988', '이':'079c', '포':'0a27'}
STARTERS = [
    (152, '치코리타', '일러몬', '0901093a043e09885050'),
    (155, '브케인', '코딩몬', '054a0929079e50505050'),
    (158, '리아코', '타이포몬', '043e06c6093a50505050'),
]

def read_rom(path):
    path = Path(path)
    if path.suffix.lower() == '.zip':
        with zipfile.ZipFile(path) as archive:
            entries = [i for i in archive.infolist() if i.filename.lower().endswith(('.gb', '.gbc'))]
            if len(entries) != 1 or not 0x150 <= entries[0].file_size <= 8*1024*1024:
                raise ValueError('ZIP must contain exactly one ROM (maximum 8 MiB).')
            return archive.read(entries[0])
    return path.read_bytes()

def checksums(data):
    if len(data) < 0x150:
        raise ValueError('Not a complete Game Boy header.')
    header = 0
    for b in data[0x134:0x14d]:
        header = (header-b-1) & 255
    total = (sum(data)-data[0x14e]-data[0x14f]) & 65535
    return header, total

def fix_checksums(data):
    out = bytearray(data)
    out[0x14d] = checksums(out)[0]
    out[0x14e:0x150] = checksums(out)[1].to_bytes(2, 'big')
    return bytes(out)

def encode_name(name):
    if not 1 <= len(name) <= 5 or any(c not in CHARMAP for c in name):
        raise ValueError('Use 1–5 supported Hangul syllables: ' + ''.join(CHARMAP))
    return b''.join(bytes.fromhex(CHARMAP[c]) for c in name).ljust(10, b'\x50')

def inspect(data):
    header, total = checksums(data)
    sha = hashlib.sha256(data).hexdigest()
    return {
        'bytes':len(data), 'sha256':sha, 'sha1':hashlib.sha1(data).hexdigest(),
        'known_korean_gold':sha == BASE_SHA256,
        'header_title':data[0x134:0x143].rstrip(b'\0').decode('ascii', 'replace'),
        'entry_bytes':data[0x100:0x104].hex(),
        'entry_jump':int.from_bytes(data[0x102:0x104], 'little') if data[0x101] == 0xc3 else None,
        'cgb_flag':hex(data[0x143]), 'mapper_code':hex(data[0x147]),
        'rom_size_code':hex(data[0x148]), 'ram_size_code':hex(data[0x149]),
        'header_checksum_valid':header == data[0x14d],
        'global_checksum_valid':total == int.from_bytes(data[0x14e:0x150], 'big'),
        'banks':[
            {'bank':i//0x4000, 'offset':i, 'bytes':len(chunk),
             'entropy_bits_per_byte':round(-sum((n/len(chunk))*math.log2(n/len(chunk)) for n in Counter(chunk).values()), 4)}
            for i in range(0, len(data), 0x4000) for chunk in [data[i:i+0x4000]]
        ]
    }

def patch(data, names=None):
    if hashlib.sha256(data).hexdigest() != BASE_SHA256:
        raise ValueError('Source SHA-256 mismatch. Only the verified Korean Gold ROM is accepted.')
    names = names or [s[2] for s in STARTERS]
    if len(names) != 3:
        raise ValueError('Exactly three names are required.')
    out = bytearray(data)
    records = []
    for (species, old, _, expected), name in zip(STARTERS, names):
        offset = NAMES_OFFSET+(species-1)*10
        before = data[offset:offset+10]
        if before.hex() != expected:
            raise ValueError('Unexpected name table bytes.')
        after = encode_name(name)
        out[offset:offset+10] = after
        records.append({'species_id':species, 'offset':offset, 'old_name':old,
                        'new_name':name, 'before_hex':before.hex(), 'after_hex':after.hex()})
    out = fix_checksums(out)
    manifest = {'format':'designmon-gold-patch-v1', 'source_sha256':BASE_SHA256,
                'output_sha256':hashlib.sha256(out).hexdigest(),
                'scope':'Species display names only; graphics, dialogue and game rules are unchanged.',
                'records':records, 'changed_bytes':sum(a != b for a,b in zip(data,out))}
    return out, manifest

def make_ips(before, after):
    if len(before) != len(after) or len(after) > 0xffffff:
        raise ValueError('IPS creation requires equal ROM lengths below 16 MiB.')
    result = bytearray(b'PATCH')
    i = 0
    while i < len(before):
        if before[i] == after[i]:
            i += 1
            continue
        start = i
        while i < len(before) and before[i] != after[i] and i-start < 65535:
            i += 1
        if start == 0x454f46:
            raise ValueError('IPS reserved EOF offset.')
        result += start.to_bytes(3,'big')+(i-start).to_bytes(2,'big')+after[start:i]
    return bytes(result+b'EOF')

def apply_ips(data, ips):
    """Strict no-resize IPS reader, also supports RLE records."""
    if not ips.startswith(b'PATCH'):
        raise ValueError('Invalid IPS header.')
    out = bytearray(data)
    p = 5
    while True:
        if ips[p:p+3] == b'EOF':
            if p+3 != len(ips):
                raise ValueError('Unexpected trailing IPS data.')
            return bytes(out)
        if p+5 > len(ips):
            raise ValueError('Truncated IPS record.')
        offset = int.from_bytes(ips[p:p+3],'big')
        size = int.from_bytes(ips[p+3:p+5],'big')
        p += 5
        if size:
            payload = ips[p:p+size]
            if len(payload) != size:
                raise ValueError('Truncated IPS payload.')
            p += size
        else:
            if p+3 > len(ips):
                raise ValueError('Truncated RLE payload.')
            size = int.from_bytes(ips[p:p+2],'big')
            payload = bytes([ips[p+2]])*size
            p += 3
        if not size or offset+size > len(out):
            raise ValueError('IPS record exceeds ROM bounds.')
        out[offset:offset+size] = payload

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    check = commands.add_parser('inspect')
    check.add_argument('rom')
    check.add_argument('--output')
    build = commands.add_parser('patch')
    build.add_argument('rom')
    build.add_argument('--output-dir', required=True)
    build.add_argument('--names', nargs=3)
    args = parser.parse_args()
    data = read_rom(args.rom)
    if args.command == 'inspect':
        report = json.dumps(inspect(data), ensure_ascii=False, indent=2)+'\n'
        if args.output:
            with open(args.output, 'x') as f: f.write(report)
        else:
            print(report, end='')
    else:
        out, manifest = patch(data, args.names)
        dest = Path(args.output_dir)
        dest.mkdir(parents=True, exist_ok=True)
        products = {'designmon-starters.gbc':out,
                    'designmon-starters.ips':make_ips(data,out),
                    'manifest.json':(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode()}
        if any((dest/n).exists() for n in products):
            raise ValueError('Output exists; choose a new directory. Files are never overwritten.')
        if apply_ips(data, products['designmon-starters.ips']) != out:
            raise ValueError('IPS round-trip verification failed.')
        for name, content in products.items():
            with (dest/name).open('xb') as f: f.write(content)
        print(json.dumps(manifest,ensure_ascii=False,indent=2))

if __name__ == '__main__':
    main()
