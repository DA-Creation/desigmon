#!/usr/bin/env python3
"""Compile pinned game graphics utilities privately; publish only Emscripten glue."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--workspace", required=True)
parser.add_argument("--emsdk", required=True)
parser.add_argument("--python", default="python3")
args = parser.parse_args()
workspace = Path(args.workspace).resolve()
repo = Path(__file__).resolve().parents[2]
if workspace == repo or repo in workspace.parents:
    raise SystemExit("Private game utilities must stay outside the public repo")
source = workspace / "pokegold-kr"
revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=source, text=True).strip()
if revision != "f4496dda3003ccc5fc26f2757171a3b111e65307":
    raise SystemExit("Unexpected game source commit")
emscripten = Path(args.emsdk).resolve() / "upstream/emscripten"
private = workspace / "private-wasm-tools"
public = Path(__file__).parent / "runtime"
private.mkdir(exist_ok=True)
public.mkdir(exist_ok=True)
manifest = {"source_commit": revision, "private_wasm": {}, "public_glue_license": "MIT/NCSA (Emscripten)"}
for name in ("gfx", "gbcpal", "lzcompress", "png_dimensions"):
    target = private / (name + ".js")
    subprocess.run([args.python, str(emscripten / "emcc.py"), str(source / "tools" / (name + ".c")),
                    "-O2", "-std=c17", "-o", str(target), "-sMODULARIZE=1", "-sEXPORT_NAME=PG_" + name.upper(),
                    "-sEXPORTED_RUNTIME_METHODS=FS,callMain", "-sENVIRONMENT=web,worker,node", "-sINVOKE_RUN=0",
                    "-sALLOW_MEMORY_GROWTH=1", "-sSTACK_SIZE=8388608", "-sEXIT_RUNTIME=1"], check=True)
    # C code is compiled exclusively into the private .wasm. This generated JS is
    # Emscripten's generic filesystem/runtime, supplied with its license.
    glue = target.read_text() + f'\nif(typeof globalThis!=="undefined")globalThis.PG_{name.upper()}=PG_{name.upper()};\n'
    (public / (name + ".js")).write_text(glue)
    data = (private / (name + ".wasm")).read_bytes()
    manifest["private_wasm"][name] = {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
shutil.copyfile(emscripten / "LICENSE", public / "LICENSE.emscripten.txt")
(private / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(json.dumps({"private_output": str(private), "public_runtime_only": str(public)}))
