#!/usr/bin/env python3
"""Boot and execute the real ROM name/font routines in PyBoy 2.7.0.

The name-render screenshot is a debugger probe, not a new menu in the ROM.
All RAM injections are ephemeral; no save files or ROM changes are written.
"""
import argparse
from io import BytesIO
import json
from pathlib import Path
import tempfile
from pyboy import PyBoy
from romlab import read_rom, patch, STARTERS, encode_name

def boot(path):
    boy = PyBoy(str(path), window='null', sound_emulated=False)
    boy.set_emulation_speed(0)
    boy.tick(900, render=False)
    boy.button('start')
    boy.tick(120)
    boy.button('start')
    boy.tick(120)
    return boy

def verify(original, modified, output):
    expected, _ = patch(original)
    if modified != expected:
        raise ValueError('Emulator verification expects the exact default starter patch.')
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    names = ['original-menu.png','patched-menu.png','name-render-probe.png','emulator-report.json']
    if any((output/n).exists() for n in names):
        raise ValueError('Choose a new verification output directory.')
    with tempfile.TemporaryDirectory(prefix='designmon-verify-') as directory:
        rom = Path(directory)/'input.gbc'
        rom.write_bytes(original)
        old = boot(rom)
        try:
            original_pixels = old.screen.image.tobytes()
            old.screen.image.save(output/'original-menu.png')
        finally:
            old.stop(save=False)
        rom.write_bytes(modified)
        boy = boot(rom)
        try:
            same_menu = original_pixels == boy.screen.image.tobytes()
            if not same_menu:
                raise AssertionError('Boot/menu screenshot differs from baseline.')
            boy.screen.image.save(output/'patched-menu.png')
            saved = BytesIO()
            boy.save_state(saved)
            results = []
            for species, _, name, _ in STARTERS:
                saved.seek(0)
                boy.load_state(saved)
                # DI; CALL GetPokemonName; LD A,$42; LD [$c120],A; JR -2.
                code = [0xf3,0xcd,0x5b,0x36,0x3e,0x42,0xea,0x20,0xc1,0x18,0xfe]
                boy.memory[0xc100:0xc100+len(code)] = code
                boy.memory[0xd20e] = species
                boy.register_file.SP = 0xcff0
                boy.register_file.PC = 0xc100
                boy.tick(1, render=False)
                actual = bytes(boy.memory[0xd036:0xd041])
                if boy.memory[0xc120] != 0x42 or actual != encode_name(name)+b'\x50':
                    raise AssertionError('ROM name lookup failed: '+name)
                results.append({'species_id':species,'name':name,'returned_hex':actual.hex(),'passed':True})
            saved.seek(0)
            boy.load_state(saved)
            code = [0xf3]
            for i,(species,_,_,_) in enumerate(STARTERS):
                pos = 0xc3a0+20*(7+i*3)+3
                # Get name, then actual Korean PlaceString -> wTilemap.
                code += [0x3e,species,0xea,0x0e,0xd2,0xcd,0x5b,0x36,
                         0x11,0x36,0xd0,0x21,pos&255,pos>>8,0xcd,0x6f,0x0f]
            # EI; C=60; CALL DelayFrames; DI; JR -2.
            code += [0xfb,0x0e,60,0xcd,0x3c,0x03,0xf3,0x18,0xfe]
            boy.memory[0xc100:0xc100+len(code)] = code
            boy.register_file.SP = 0xcff0
            boy.register_file.PC = 0xc100
            boy.tick(90)
            boy.screen.image.resize((640,576),resample=0).save(output/'name-render-probe.png')
            report = {'emulator':'PyBoy 2.7.0', 'boot_frames':1140,
                      'menu_pixels_equal':same_menu, 'name_lookup_tests':results,
                      'render_probe':'Debugger-injected calls to existing name/font routines; not gameplay.',
                      'limitations':'No full playthrough, starter acquisition, combat or save compatibility test.'}
            (output/'emulator-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
            return report
        finally:
            boy.stop(save=False)

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('original')
    p.add_argument('modified')
    p.add_argument('--output-dir', required=True)
    a = p.parse_args()
    print(json.dumps(verify(read_rom(a.original),read_rom(a.modified),a.output_dir),ensure_ascii=False,indent=2))
