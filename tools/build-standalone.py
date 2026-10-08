#!/usr/bin/env python3
"""Build the offline Gold entry point. Private game inputs may only leave the repo."""
from pathlib import Path
import argparse,base64,gzip,hashlib,re,zipfile
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'web/gold/index.html'
SHA='9c273e86e6120c6a038160ccb0153b8b20425b84fc08a496281c1d1bcac492f6'
def build(rom=None,source_project=None):
    html=SOURCE.read_text()
    def css(m): return '<style>\n'+(SOURCE.parent/m[1]).read_text()+'\n</style>'
    def js(m): return '<script>\n'+(SOURCE.parent/m[1]).read_text().replace('</script','<\\/script')+'\n</script>'
    html=re.sub(r'<link rel="stylesheet" href="([^"]+)">',css,html)
    html=re.sub(r'<script src="([^"]+)"></script>',js,html)
    values='globalThis.GOLD_STANDALONE=true;'
    if rom is not None:
        assert hashlib.sha256(rom).hexdigest()==SHA,'Unexpected ROM revision'
        values+='globalThis.GOLD_EMBEDDED_ROM="'+base64.b64encode(rom).decode()+'";'
    if source_project is not None:
        values+='globalThis.GOLD_EMBEDDED_SOURCE="'+base64.b64encode(gzip.compress(source_project,mtime=0)).decode()+'";'
    licenses='\n\n'.join(p.read_text() for p in [ROOT/'web/vendor/LICENSE.sameboy',ROOT/'web/vendor/LICENSE.fflate',*sorted((ROOT/'web/vendor/rgbds').glob('LICENSE*')),ROOT/'tools/gold-source/runtime/LICENSE.emscripten.txt'] if p.exists())
    licenses='\n'.join(line.rstrip() for line in licenses.splitlines())
    html=html.replace('</body>','<script type="text/plain" id="thirdPartyLicenses">'+licenses.replace('</script','<\\/script')+'</script></body>')
    return html.replace('<script>','<script>'+values+'</script><script>',1)
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,default=ROOT/'index.html');p.add_argument('--private-rom',type=Path);p.add_argument('--private-source',type=Path);a=p.parse_args()
    output=a.output.resolve()
    if a.private_rom or a.private_source:
        if output==ROOT or ROOT in output.parents:p.error('Private output must be outside the repository')
    rom=None
    if a.private_rom:
        if zipfile.is_zipfile(a.private_rom):
            with zipfile.ZipFile(a.private_rom) as z:
                names=[n for n in z.namelist() if n.lower().endswith(('.gb','.gbc'))]
                if len(names)!=1:p.error('Archive must contain one ROM')
                rom=z.read(names[0])
        else:rom=a.private_rom.read_bytes()
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(build(rom,a.private_source.read_bytes() if a.private_source else None))
    print('Built '+str(output)+' ('+str(output.stat().st_size)+' bytes)')
if __name__=='__main__':main()
