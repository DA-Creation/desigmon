#!/usr/bin/env python3
"""Check tracked/new public files for private game payloads before publication."""
from pathlib import Path
import base64,hashlib,re,subprocess
ROOT=Path(__file__).resolve().parents[1]
files=set(subprocess.check_output(['git','ls-files','-z'],cwd=ROOT).decode().split('\0'))
files.update(subprocess.check_output(['git','ls-files','--others','--exclude-standard','-z'],cwd=ROOT).decode().split('\0'))
sha='9c273e86e6120c6a038160ccb0153b8b20425b84fc08a496281c1d1bcac492f6'
problems=[]
for name in sorted(files-{''}):
 p=ROOT/name
 if not p.is_file():continue
 data=p.read_bytes()
 if p.suffix.lower() in {'.gb','.gbc','.sav','.state','.ram','.rtc','.bin','.zip','.png','.wasm'}:problems.append(name+': private/binary artifact extension')
 if hashlib.sha256(data).hexdigest()==sha:problems.append(name+': original ROM content')
 if re.search(rb'GOLD_EMBEDDED_(?:ROM|SOURCE)="[A-Za-z0-9+/=]{80,}',data):problems.append(name+': private embedding assignment')
 if b'"format":"designmon-gold-build-project-v1","' in data and len(data)>500000:problems.append(name+': private source bundle')
 if p.suffix.lower() in {'.js','.html'}:
  for blob in re.findall(rb'(?:data:application/wasm;base64,|base64,)([A-Za-z0-9+/=]{1000,})',data):
   raw=base64.b64decode(blob)
   if hashlib.sha256(raw).hexdigest()==sha:problems.append(name+': embedded original ROM')
if problems:raise SystemExit('\n'.join(problems))
print('Public package check passed ('+str(len(files-{''}))+' files). No private game artifacts found.')
