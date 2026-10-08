#!/usr/bin/env python3
"""Build MIT RGBDS 1.0.3 as self-contained browser/worker/Node factories."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--source", required=True, help="Dedicated clean gbdev/rgbds v1.0.3 clone")
parser.add_argument("--emsdk", required=True)
parser.add_argument("--python", default="python3")
parser.add_argument("--bison-dir")
parser.add_argument("--output", default=str(Path(__file__).resolve().parents[2] / "web/vendor/rgbds"))
args = parser.parse_args()
source, output = Path(args.source).resolve(), Path(args.output).resolve()
revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=source, text=True).strip()
if revision != "307846b03ea89ee57bf75f179d5f8051175ac60d":
    raise SystemExit("Expected RGBDS v1.0.3 commit 307846b03ea89ee57bf75f179d5f8051175ac60d")
env = dict(os.environ)
if args.bison_dir:
    env["PATH"] = str(Path(args.bison_dir).resolve()) + os.pathsep + env["PATH"]
emxx = Path(args.emsdk).resolve() / "upstream/emscripten/em++.py"
flags = "-sMODULARIZE=1 -sEXPORT_NAME=RGBDS -sEXPORTED_RUNTIME_METHODS=FS,callMain " \
        "-sENVIRONMENT=web,worker,node -sINVOKE_RUN=0 -sALLOW_MEMORY_GROWTH=1 " \
        "-sSTACK_SIZE=8388608 -sSINGLE_FILE=1 -sEXIT_RUNTIME=1"
subprocess.run(["make", "clean"], cwd=source, env=env, check=True, stdout=subprocess.DEVNULL)
subprocess.run(["make", "-j4", "rgbasm", "rgblink", "rgbfix", f"CXX={args.python} {emxx}",
                "CXXFLAGS=-O2", f"LDFLAGS={flags}"], cwd=source, env=env, check=True)
subprocess.run(["make", "-j4", "rgbgfx", f"CXX={args.python} {emxx}",
                "CXXFLAGS=-O2 -sUSE_LIBPNG=1", "PNGCFLAGS=", "PNGLDFLAGS=", "PNGLDLIBS=",
                f"LDFLAGS=-sUSE_LIBPNG=1 {flags}"], cwd=source, env=env, check=True)
output.mkdir(parents=True, exist_ok=True)
manifest = {"source": "https://github.com/gbdev/rgbds", "commit": revision,
            "rgbds_version": "1.0.3", "license": "MIT", "factories": {},
            "emscripten_version": (emxx.parent / "emscripten-version.txt").read_text().strip()}
for tool in ("rgbasm", "rgblink", "rgbfix", "rgbgfx"):
    data = (source / tool).read_text() + f"\nif (typeof globalThis !== 'undefined') globalThis.{tool.upper()} = RGBDS;\n"
    (output / (tool + ".js")).write_text(data)
    manifest["factories"][tool] = {"global": tool.upper(), "bytes": len(data.encode()),
                                  "sha256": hashlib.sha256(data.encode()).hexdigest()}
shutil.copyfile(source / "LICENSE", output / "LICENSE.rgbds.txt")
licenses = {"LICENSE": "emscripten", "system/lib/libcxx/LICENSE.TXT": "libcxx",
            "system/lib/libcxxabi/LICENSE.TXT": "libcxxabi", "system/lib/libc/musl/COPYRIGHT": "musl",
            "cache/ports/libpng/libpng-1.6.39/LICENSE": "libpng", "cache/ports/zlib/zlib-1.3.1/LICENSE": "zlib"}
for relative, name in licenses.items():
    shutil.copyfile(emxx.parent / relative, output / ("LICENSE." + name + ".txt"))
(output / "build.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(json.dumps({"output": str(output), "tools": list(manifest["factories"])}))
