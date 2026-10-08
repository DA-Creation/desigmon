#!/usr/bin/env python3
"""Build pinned SameBoy core with an explicit Emscripten path. No game files."""
import argparse,base64,hashlib,json,shutil,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--emcc',type=Path,required=True);p.add_argument('--python',type=Path,required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[2];vendor=root/'web/vendor';vendor.mkdir(exist_ok=True)
expected='c458e7c5d2d350fb37a1931c40da9f758d28d240'
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=a.source,text=True).strip()==expected
excluded={'debugger.c','sm83_disassembler.c','symbol_hash.c','rewind.c','cheats.c','cheat_search.c'}
sources=[str(x) for x in (a.source/'Core').glob('*.c') if x.name not in excluded]
exports=['malloc','free','gold_open','gold_close','gold_frame','gold_key','gold_pixels','gold_audio','gold_frames','gold_state_size','gold_state_write','gold_state_read','gold_battery_size','gold_battery_write','gold_battery_read','gold_read','gold_write','gold_pc']
exports += ['gold_'+name+'_device' for name in ['open','close','loaded','frame','key','pixels','audio','audio_size','frames','set_frames','state_size','state_write','state_read','battery_size','battery_write','battery_read','read','write','pc','ticks']]
exports += ['gold_connect','gold_disconnect','gold_connection','gold_pair_frame','gold_pair_ticks','gold_pair_state_size','gold_pair_state_write','gold_pair_state_read']
args=[str(a.python),str(a.emcc),str(root/'tools/gold-runtime/wrapper.c'),*sources,'-I'+str(a.source/'Core'),'-O3','-std=gnu11','-D_GNU_SOURCE','-DGB_INTERNAL','-DGB_DISABLE_DEBUGGER','-DGB_DISABLE_REWIND','-DGB_DISABLE_CHEATS','-DGB_DISABLE_CHEAT_SEARCH','-DGB_VERSION="'+expected[:12]+'"','-sMODULARIZE=1','-sEXPORT_NAME=SameBoyCore','-sENVIRONMENT=web,node','-sALLOW_MEMORY_GROWTH=1','-sSINGLE_FILE=1','-sFILESYSTEM=0','-sEXPORTED_RUNTIME_METHODS=["HEAPU8"]','-sEXPORTED_FUNCTIONS='+json.dumps(['_'+v for v in exports]),'-o',str(vendor/'sameboy.js')]
subprocess.run(args,check=True)
boot=(a.source/'build/bin/BootROMs/cgb_boot.bin').read_bytes();(vendor/'sameboy-boot.js').write_text('globalThis.SAMEBOY_BOOT="'+base64.b64encode(boot).decode()+'";\n')
shutil.copy(a.source/'LICENSE',vendor/'LICENSE.sameboy')
(vendor/'sameboy-build.json').write_text(json.dumps({'source':'https://github.com/LIJI32/SameBoy','commit':expected,'emscripten':'4.0.15','model':'CGB-E','sha256':hashlib.sha256((vendor/'sameboy.js').read_bytes()).hexdigest(),'boot_sha256':hashlib.sha256(boot).hexdigest()},indent=2)+'\n')
