#!/usr/bin/env python3
"""Reproducible local Korean Gold source builds. Never downloads a ROM."""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shlex
import shutil
import subprocess
import sys
import urllib.request
import zipfile

SOURCE_URL = "https://github.com/Narishma-gb/pokegold-kr.git"
SOURCE_COMMIT = "f4496dda3003ccc5fc26f2757171a3b111e65307"
ROM_SHA256 = "9c273e86e6120c6a038160ccb0153b8b20425b84fc08a496281c1d1bcac492f6"
RGBDS_VERSION = "1.0.3"
MAC_RGBDS_URL = "https://github.com/gbdev/rgbds/releases/download/v1.0.3/rgbds-macos.zip"
MAC_RGBDS_SHA256 = "dc1804b187895c4e1b730ba9d4b476052979607e613113b72dc7a494f88c898e"
ROM_SIZE = 0x200000
REPOSITORY = Path(__file__).resolve().parents[2]
GOLD_OBJECTS = [
    "audio_gold.o", "home_gold.o", "wip_gold.o", "ram_gold.o", "data/text/common_gold.o",
    "data/maps/map_data_gold.o", "data/pokemon/egg_moves_gold.o", "data/pokemon/evos_attacks_gold.o",
    "engine/movie/credits_gold.o", "engine/overworld/events_gold.o", "gfx/misc_gold.o",
    "gfx/hangul_gold.o", "gfx/sprites_gold.o", "gfx/tilesets_gold.o",
    "data/pokemon/dex_entries_gold.o", "gfx/pics_gold.o",
]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def external(path):
    p = Path(path).expanduser().resolve()
    if p == REPOSITORY or REPOSITORY in p.parents:
        raise ValueError("ROM, game source and reports must stay outside the public repository")
    return p


def run(args, cwd=None, log=None):
    result = subprocess.run([str(a) for a in args], cwd=cwd, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True)
    if log:
        Path(log).write_text(result.stdout)
    if result.returncode:
        raise RuntimeError(f"Command failed ({result.returncode}): {args[0]}\n{result.stdout[-6000:]}")
    return result.stdout.strip()


def write_json(path, value):
    path = external(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def input_rom(path):
    path = external(path)
    if path.suffix.lower() == ".zip":
        with zipfile.ZipFile(path) as archive:
            entries = [i for i in archive.infolist() if not i.is_dir()
                       and Path(i.filename).suffix.lower() in (".gb", ".gbc")
                       and i.file_size == ROM_SIZE]
            if len(entries) != 1:
                raise ValueError("ZIP must contain exactly one 2 MiB GB/GBC ROM")
            data = archive.read(entries[0])
    else:
        data = path.read_bytes()
    if len(data) != ROM_SIZE or digest(data) != ROM_SHA256:
        raise ValueError("Input is not the verified Korean Gold revision; refusing to build")
    return data


def source_dir(workspace):
    source = external(workspace) / "pokegold-kr"
    if run(["git", "rev-parse", "HEAD"], cwd=source) != SOURCE_COMMIT:
        raise ValueError("Source checkout must be at the pinned commit")
    input_rom(source / "baserom_g.bin")
    return source


def tool_dir(workspace, override=None):
    folder = external(override) if override else external(workspace) / "rgbds-1.0.3-bin"
    for name in ("rgbasm", "rgblink", "rgbfix", "rgbgfx"):
        version = run([folder / name, "--version"])
        if not re.search(r"\bv?1\.0\.3\b", version):
            raise ValueError(f"{name}: expected RGBDS {RGBDS_VERSION}, found {version}")
    return folder


def prepare(args):
    workspace = external(args.workspace)
    rom = input_rom(args.rom)
    workspace.mkdir(parents=True, exist_ok=True)
    source = workspace / "pokegold-kr"
    if not source.exists():
        run(["git", "clone", SOURCE_URL, source])
        run(["git", "checkout", "--detach", SOURCE_COMMIT], cwd=source)
    elif run(["git", "rev-parse", "HEAD"], cwd=source) != SOURCE_COMMIT:
        raise ValueError("Existing checkout has another commit; use a new workspace")
    target = source / "baserom_g.bin"
    if target.exists() and target.read_bytes() != rom:
        raise ValueError("Refusing to replace an existing different base ROM")
    if not target.exists():
        target.write_bytes(rom)
    if not args.rgbds_dir:
        if platform.system() != "Darwin":
            raise ValueError("On non-macOS, supply --rgbds-dir with RGBDS 1.0.3 binaries")
        archive_path = workspace / "rgbds-macos-1.0.3.zip"
        if not archive_path.exists():
            urllib.request.urlretrieve(MAC_RGBDS_URL, archive_path)
        if digest(archive_path.read_bytes()) != MAC_RGBDS_SHA256:
            raise ValueError("RGBDS release SHA-256 mismatch")
        target_dir = workspace / "rgbds-1.0.3-bin"
        target_dir.mkdir(exist_ok=True)
        with zipfile.ZipFile(archive_path) as archive:
            # Deliberately extract only the four verified release executables.
            for name in ("rgbasm", "rgblink", "rgbfix", "rgbgfx"):
                target = target_dir / name
                data = archive.read(name)
                if target.exists() and target.read_bytes() != data:
                    raise ValueError(f"Refusing to replace different executable: {name}")
                target.write_bytes(data)
                target.chmod(0o755)
    tools = tool_dir(workspace, args.rgbds_dir)
    print(json.dumps({"source": str(source), "rgbds": str(tools), "rom_sha256": ROM_SHA256}))


def coverage(map_path, original):
    mapped = bytearray(ROM_SIZE)
    sections = []
    bank = None
    for line in map_path.read_text().splitlines():
        match = re.match(r"(\w+) bank #(\d+):", line)
        if match:
            bank = int(match[2]) if match[1] in ("ROM0", "ROMX") else None
        section = re.search(r'SECTION: \$([\da-f]+)-\$([\da-f]+).*\["(.*)"\]', line)
        if section and bank is not None:
            address, end = int(section[1], 16), int(section[2], 16) + 1
            offset = address + (0 if bank == 0 else bank * 0x4000 - 0x4000)
            size = end - address
            if offset < 0 or offset + size > ROM_SIZE:
                raise ValueError("Invalid ROM section in linker map")
            mapped[offset:offset + size] = b"\1" * size
            sections.append({"name": section[3], "bank": bank, "address": address,
                             "offset": offset, "length": size})
    gaps, start = [], None
    for i, value in enumerate(mapped + b"\1"):
        if not value and start is None:
            start = i
        if value and start is not None:
            gaps.append({"offset": start, "length": i - start,
                         "nonzero_bytes": sum(v != 0 for v in original[start:i])})
            start = None
    return {"kind": "linker_section_provenance_not_semantic_completion",
            "rom_bytes": ROM_SIZE, "linked_section_bytes": sum(mapped),
            "overlay_bytes": ROM_SIZE - sum(mapped),
            "overlay_nonzero_bytes": sum(g["nonzero_bytes"] for g in gaps),
            "linked_section_percent": round(100 * sum(mapped) / ROM_SIZE, 6),
            "sections": sections, "overlay_ranges": gaps,
            "limitation": "Sections can contain opaque data and generated graphics. Unmapped ranges "
                          "come from the input ROM through rgblink -O, including padding. This is "
                          "not a percentage of decoded scripts, gameplay coverage or correctness."}


def build(args):
    workspace = external(args.workspace)
    source = source_dir(workspace)
    tools = tool_dir(workspace, args.rgbds_dir)
    dirty = run(["git", "diff", "--name-only", "HEAD"], cwd=source).splitlines()
    if args.require_identical and dirty:
        raise ValueError("Baseline verification requires clean tracked sources")
    output = workspace / "builds" / args.label
    if output.exists():
        raise ValueError("Output label exists; use a new --label to retain previous evidence")
    output.mkdir(parents=True)
    run(["make", "-j", str(args.jobs), f"RGBDS={tools}/", "gold"], cwd=source,
        log=output / "build.log")
    original = input_rom(source / "baserom_g.bin")
    result = (source / "pokegold.gbc").read_bytes()
    if len(result) != ROM_SIZE:
        raise ValueError("Unexpected ROM size")
    differences = [i for i, (a, b) in enumerate(zip(original, result)) if a != b]
    for name in ("pokegold.gbc", "pokegold.map", "pokegold.sym"):
        shutil.copyfile(source / name, output / name)
    report = {"source_repository": SOURCE_URL, "source_commit": SOURCE_COMMIT,
              "rgbds_version": RGBDS_VERSION, "input_sha256": ROM_SHA256,
              "output_sha256": digest(result), "size": len(result),
              "identical": result == original, "different_bytes": len(differences),
              "difference_offsets": differences, "changed_source_files": dirty,
              "coverage": coverage(source / "pokegold.map", original)}
    write_json(output / "manifest.json", report)
    if args.require_identical and result != original:
        raise ValueError(f"Baseline mismatch: {len(differences)} changed bytes; see {output}")
    print(json.dumps({"output": str(output), "identical": report["identical"],
                      "sha256": report["output_sha256"], "different_bytes": len(differences)}))
    return report


def parse_symbols(path):
    symbols = {}
    for line in path.read_text().splitlines():
        match = re.match(r"([\da-f]{2}):([\da-f]{4}) (\S+)$", line)
        if match:
            bank, address = int(match[1], 16), int(match[2], 16)
            if (bank == 0 and address < 0x4000) or (bank < 128 and 0x4000 <= address < 0x8000):
                offset = address if bank == 0 else bank * 0x4000 + address - 0x4000
                symbols[match[3]] = {"bank": bank, "address": address, "offset": offset}
    return symbols


def make_index(args):
    source = source_dir(args.workspace)
    symbols = parse_symbols(source / "pokegold.sym")
    # Use the build's own dependency scanner. Merely existing in the checkout does
    # not establish that a source file contributes bytes to this Korean ROM.
    roots = ["audio.asm", "home.asm", "wip.asm", "ram.asm", "data/text/common.asm",
             "data/maps/map_data.asm", "data/pokemon/egg_moves.asm",
             "data/pokemon/evos_attacks.asm", "engine/movie/credits.asm",
             "engine/overworld/events.asm", "gfx/misc.asm", "gfx/hangul.asm",
             "gfx/sprites.asm", "gfx/tilesets.asm", "data/pokemon/dex_entries_gold.asm",
             "gfx/pics_gold.asm", "includes.asm"]
    dependencies = set(roots)
    for root in roots:
        dependencies.update(run(["tools/scan_includes", root], cwd=source).split())
    records = []
    tracked = run(["git", "ls-files"], cwd=source).splitlines()
    for relative in tracked:
        if not relative.endswith((".asm", ".inc")):
            continue
        content = (source / relative).read_text()
        anchors = []
        for number, line in enumerate(content.splitlines(), 1):
            match = re.match(r"^([A-Za-z_][A-Za-z_0-9]*)(?:::|:)", line)
            if match and match[1] in symbols:
                anchors.append({"name": match[1], "line": number, **symbols[match[1]]})
        record = {"path": relative, "sha256": digest(content.encode()),
                  "line_count": len(content.splitlines()), "in_build_dependency_graph": relative in dependencies,
                  "rom_symbol_anchors": anchors}
        if args.include_source:
            record["content"] = content
        records.append(record)
    original = input_rom(source / "baserom_g.bin")
    result = {"format": "designmon-gold-source-index-v1", "source_commit": SOURCE_COMMIT,
              "rom_sha256": digest((source / "pokegold.gbc").read_bytes()),
              "files": records, "rom_symbols": symbols,
              "coverage": coverage(source / "pokegold.map", original),
              "anchor_semantics": "Global label name matches against linked ROM symbols. Anchors are "
                                  "source-navigation hints, not exact per-file byte extents. A dependency "
                                  "can be inactive under a conditional. Missing matches and inherited "
                                  "English map sources must not be called decoded Korean content."}
    write_json(args.output, result)
    print(json.dumps({"output": str(external(args.output)), "files": len(records),
                      "rom_symbols": len(symbols), "includes_source": args.include_source}))


def edit_demo(args):
    source = source_dir(args.workspace)
    if run(["git", "status", "--porcelain", "--untracked-files=no"], cwd=source):
        raise ValueError("Demo requires clean tracked sources; it never overwrites user edits")
    edits = [
        ("data/pokemon/base_stats/chikorita.asm", "db  45,  49,  65,  45,  49,  65", "db  46,  49,  65,  45,  49,  65"),
        ("data/moves/moves.asm", "move POUND,        EFFECT_NORMAL_HIT,         40,", "move POUND,        EFFECT_NORMAL_HIT,         41,"),
        ("data/pokemon/names.asm", 'dname "치코리타"', 'dname "타이포몽"'),
    ]
    originals = {}
    try:
        for relative, old, new in edits:
            target = source / relative
            content = target.read_text()
            if content.count(old) != 1:
                raise ValueError(f"Unexpected source revision: {relative}")
            originals[target] = content
            target.write_text(content.replace(old, new))
        args.require_identical = False
        report = build(args)
        symbols = parse_symbols(source / "pokegold.sym")
        before = input_rom(source / "baserom_g.bin")
        after = (source / "pokegold.gbc").read_bytes()
        hp = symbols["BaseData"]["offset"] + (152 - 1) * 32 + 1
        power = symbols["Moves"]["offset"] + 2
        name = symbols["PokemonNames"]["offset"] + (152 - 1) * 10
        checks = {"chikorita_hp": before[hp] == 45 and after[hp] == 46,
                  "pound_power": before[power] == 40 and after[power] == 41,
                  "chikorita_name": after[name:name + 10].hex() == "0988079c0a2704995050"}
        allowed = {0x14E, 0x14F, hp, power, *range(name, name + 10)}
        checks["only_expected_fields_and_checksum_changed"] = set(report["difference_offsets"]) <= allowed
        write_json(external(args.workspace) / "builds" / args.label / "edit-verification.json",
                   {"checks": checks, "offsets": {"hp": hp, "power": power, "name": name},
                    "runtime_verified": False})
        if not all(checks.values()):
            raise ValueError("Edit demonstration did not match the expected linked fields")
        print(json.dumps({"edit_checks": checks, "source_files_restored": True}))
    finally:
        for target, content in originals.items():
            target.write_text(content)


def opaque_assembly(original, gaps):
    """Materialize unknown bytes, without pretending they have decoded semantics."""
    lines = ["; Generated locally from the verified, user-owned ROM.",
             "; OPAQUE FALLBACK: these are editable bytes, not decoded scenario scripts.",
             "; Never publish this file or the generated game ROM."]
    for gap in gaps:
        cursor, end = gap["offset"], gap["offset"] + gap["length"]
        while cursor < end:
            bank = cursor // 0x4000
            chunk_end = min(end, (bank + 1) * 0x4000)
            address = cursor if bank == 0 else 0x4000 + cursor % 0x4000
            location = f"ROM0[${address:04x}]" if bank == 0 else f"ROMX[${address:04x}], BANK[${bank:02x}]"
            lines.extend(["", f'SECTION "Opaque fallback {cursor:06x}", {location}',
                          f"Opaque_{cursor:06x}::"])
            while cursor < chunk_end:
                if original[cursor] == 0:
                    zero_end = cursor + 1
                    while zero_end < chunk_end and original[zero_end] == 0:
                        zero_end += 1
                    if zero_end - cursor >= 16:
                        lines.append(f"\tds {zero_end - cursor}, 0")
                        cursor = zero_end
                        continue
                step = min(cursor + 16, chunk_end)
                lines.append("\tdb " + ", ".join(f"${v:02x}" for v in original[cursor:step]))
                cursor = step
    return "\n".join(lines) + "\n"


def explicit_build(args):
    workspace = external(args.workspace)
    source = source_dir(workspace)
    tools = tool_dir(workspace, args.rgbds_dir)
    output = workspace / "builds" / args.label
    if output.exists():
        raise ValueError("Output label exists; choose a new evidence label")
    output.mkdir(parents=True)
    run(["make", "-j", str(args.jobs), f"RGBDS={tools}/", "gold"], cwd=source,
        log=output / "structured-source-build.log")
    original = input_rom(source / "baserom_g.bin")
    provenance = coverage(source / "pokegold.map", original)
    opaque = workspace / "opaque-source"
    opaque.mkdir(exist_ok=True)
    asm = opaque / "overlay.asm"
    if not args.reuse_opaque:
        if asm.exists():
            raise ValueError("Opaque source already exists; --reuse-opaque preserves and compiles edits")
        if (source / "pokegold.gbc").read_bytes() != original:
            raise ValueError("First materialization requires a byte-identical baseline build")
        asm.write_text(opaque_assembly(original, provenance["overlay_ranges"]))
        write_json(opaque / "provenance.json", provenance)
    elif not asm.exists():
        raise ValueError("No opaque source to reuse")
    run([tools / "rgbasm", "-o", output / "opaque.o", asm], cwd=source,
        log=output / "opaque-assembly.log")
    link = [tools / "rgblink", "-Weverything", "-Wtruncation=1", "-l", "layout.link",
            "-n", output / "pokegold.sym", "-m", output / "pokegold.map", "-o", output / "pokegold.gbc",
            *GOLD_OBJECTS, output / "opaque.o"]
    # Crucially: there is no -O / base-ROM overlay in this link command.
    run(link, cwd=source, log=output / "explicit-link.log")
    run([tools / "rgbfix", "-Weverything", "-Cjv", "-k", "01", "-l", "0x33",
         "-m", "MBC3+TIMER+RAM+BATTERY", "-r", "3", "-p", "0", "-t", "POKEMON_GLD",
         "-i", "AAUK", output / "pokegold.gbc"], cwd=source, log=output / "checksum.log")
    result = (output / "pokegold.gbc").read_bytes()
    final_coverage = coverage(output / "pokegold.map", original)
    changes = [i for i, (a, b) in enumerate(zip(original, result)) if a != b]
    report = {"source_commit": SOURCE_COMMIT, "rgbds_version": RGBDS_VERSION,
              "input_sha256": ROM_SHA256, "output_sha256": digest(result), "size": len(result),
              "identical": result == original, "different_bytes": len(changes),
              "difference_offsets": changes, "linker_uses_base_rom_overlay": False,
              "opaque_source_sha256": digest(asm.read_bytes()),
              "explicit_rom_section_bytes": final_coverage["linked_section_bytes"],
              "original_section_provenance": provenance,
              "limitation": "Every byte has a local source representation, but fallback db/ds regions "
                            "remain opaque. This does not decode their event, text or game semantics."}
    write_json(output / "manifest.json", report)
    if len(result) != ROM_SIZE or final_coverage["overlay_bytes"]:
        raise ValueError("Explicit link did not cover the complete ROM")
    if args.require_identical and result != original:
        raise ValueError("Explicit source build differs from the original")
    print(json.dumps({"output": str(output), "identical": report["identical"],
                      "sha256": report["output_sha256"], "explicit_rom_bytes": final_coverage["linked_section_bytes"],
                      "fallback_bytes_still_opaque": provenance["overlay_bytes"]}))


def export_project(args):
    source = source_dir(args.workspace)
    opaque = external(args.workspace) / "opaque-source" / "overlay.asm"
    if not opaque.exists():
        raise ValueError("Run explicit once before exporting a complete source project")
    allowed = {".asm", ".inc", ".blk", ".bin", ".2bpp", ".1bpp", ".lz", ".gbcpal",
               ".dimensions", ".pal", ".rle", ".tilemap", ".link", ".png"}
    files = {}
    for path in sorted(source.rglob("*")):
        relative = path.relative_to(source)
        if any(part.startswith(".") for part in relative.parts) or not path.is_file():
            continue
        if path.suffix not in allowed:
            continue
        data = path.read_bytes()
        if path.suffix in {".asm", ".inc", ".link"}:
            files[str(relative)] = {"encoding": "utf8", "data": data.decode("utf-8")}
        else:
            files[str(relative)] = {"encoding": "base64", "data": base64.b64encode(data).decode()}
    files["opaque.asm"] = {"encoding": "utf8", "data": opaque.read_text()}
    plan = run(["make", "-n", "-B", f"RGBDS={tool_dir(args.workspace, args.rgbds_dir)}/", "gold"], cwd=source)
    graphics = []
    for line in plan.splitlines():
        tokens = shlex.split(line.split(" || ", 1)[0])
        if not tokens:
            continue
        tool = Path(tokens[0]).name
        argv = tokens[1:]
        if tool not in ("rgbgfx", "gfx", "gbcpal", "lzcompress", "png_dimensions", "cp", "cat", "tr"):
            continue
        if tool == "rgbgfx":
            flag = "-o" if "-o" in argv else "-p"
            output = argv[argv.index(flag) + 1]
        elif tool == "gfx":
            output = argv[argv.index("-o") + 1]
        elif tool == "gbcpal":
            output = next(v for v in argv if not v.startswith("-"))
        elif tool in ("lzcompress", "png_dimensions", "cp"):
            output = argv[-1]
        else:
            output = argv[argv.index(">") + 1]
        paths = [v.split("=", 1)[1] if v.startswith("--png=") else v for v in argv]
        paths = [v[4:] if v.startswith("gbc:") else v for v in paths]
        paths = [v for v in paths if v in files]
        # The first occurrence is the output argument; repeated occurrences are input reads.
        if output in paths:
            paths.remove(output)
        graphics.append({"tool": tool, "argv": argv, "inputs": sorted(set(paths)), "output": output})
    private_tools = external(args.workspace) / "private-wasm-tools"
    if not private_tools.is_dir():
        raise ValueError("Build private graphics WASM tools before exporting PNG-enabled projects")
    for name in ("gfx", "gbcpal", "lzcompress", "png_dimensions"):
        files[f".tools/{name}.wasm"] = {"encoding": "base64", "data": base64.b64encode((private_tools / (name + ".wasm")).read_bytes()).decode()}
    units = []
    for obj in GOLD_OBJECTS:
        unit = obj.replace("_gold.o", ".asm")
        if obj in ("data/pokemon/dex_entries_gold.o", "gfx/pics_gold.o"):
            unit = obj[:-2] + ".asm"
        units.append({"source": unit, "object": obj})
    result = {"format": "designmon-gold-build-project-v1", "source_commit": SOURCE_COMMIT,
              "rgbds_version": RGBDS_VERSION, "base_rom_sha256": ROM_SHA256,
              "files": files, "assembly_units": units, "graphics_steps": graphics, "build_state": {"pendingFiles": []},
              "source_index": {"files": [], "rom_symbols": parse_symbols(source / "pokegold.sym")},
              "coverage": coverage(source / "pokegold.map", input_rom(source / "baserom_g.bin")),
              "limitation": "Opaque fallback bytes are not decoded scenario source. The PNG conversion "
                            "steps are pinned to the exported source revision and must be regenerated "
                            "if the Makefile changes. Keep this source and private utility WASM project private."}
    write_json(args.output, result)
    print(json.dumps({"output": str(external(args.output)), "files": len(files), "assembly_units": len(units), "graphics_steps": len(graphics)}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("prepare", "build", "index", "demo", "explicit", "project"):
        command = commands.add_parser(name)
        command.add_argument("--workspace", required=True, help="Private workspace outside this repository")
        if name != "index":
            command.add_argument("--rgbds-dir")
        if name in ("build", "demo", "explicit"):
            command.add_argument("--label", required=True, help="New evidence folder name")
            command.add_argument("--jobs", type=int, default=4)
            command.add_argument("--require-identical", action="store_true")
            if name == "explicit":
                command.add_argument("--reuse-opaque", action="store_true")
        elif name == "prepare":
            command.add_argument("--rom", required=True, help="Owned ROM or ZIP; exact hash enforced")
        else:
            command.add_argument("--output", required=True)
            if name == "index":
                command.add_argument("--include-source", action="store_true")
    args = parser.parse_args()
    if hasattr(args, "label") and not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]*", args.label):
        parser.error("--label must be a simple folder name")
    try:
        {"prepare": prepare, "build": build, "index": make_index, "demo": edit_demo,
         "explicit": explicit_build, "project": export_project}[args.command](args)
    except (ValueError, RuntimeError, OSError, zipfile.BadZipFile) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
