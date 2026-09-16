# desigmon
Designmon Adventure

## Korean Gold ROM research

Open [`tools/rom-lab/index.html`](tools/rom-lab/index.html) directly in a modern browser. No server, installation, network request, or ROM upload is needed. Select an extracted Korean Gold `.gb` / `.gbc` file, edit three starter names, validate, and download an IPS patch, manifest, or modified ROM.

This is the first reverse-engineering experiment, **not a completed Designmon game**. It changes three species display names in the original ROM. Maps, sprites, battle rules, dialogue and the title screen remain original. The pre-existing web prototype in the root is preserved; its referenced `assets/` files were absent from the repository.

Only the exact Korean Gold revision documented in [ROM_RESEARCH.md](docs/ROM_RESEARCH.md) is accepted. The ROM and emulator executable are not included. Default names are provisional: 일러몬, 코딩몬, 타이포몬. Existing save nicknames and literal names in dialogue are not rewritten.

### Command line (Python 3.9+, no dependencies)

```sh
python3 tools/rom-lab/romlab.py inspect /path/to/poket_gold_korean.zip
python3 tools/rom-lab/romlab.py patch /path/to/poket_gold_korean.zip --output-dir /path/to/new-output
python3 -m unittest discover -s tests -v
```

Outputs: `designmon-starters.gbc`, `designmon-starters.ips`, `manifest.json`. Existing output files are never overwritten. Keep all ROMs, saves and generated outputs outside the repository. `--names` accepts three names using the currently supported syllables: 일 러 몬 코 딩 타 이 포.

### Optional emulator validation

```sh
python3 -m venv /path/to/rom-venv
/path/to/rom-venv/bin/pip install -r tools/rom-lab/requirements-emulator.txt
/path/to/rom-venv/bin/python tools/rom-lab/verify_emulator.py /path/to/original.gb /path/to/designmon-starters.gbc --output-dir /path/to/new-verification
```

On Windows use the virtual environment's `Scripts/python.exe`. The test boots both ROMs, compares the menu, executes the real name lookup routine for all three starters, and renders their names with the original Korean font. Its screenshot uses temporary debugger calls; the ROM does not add names to the main menu. No save data is written.

Next work: trace starter acquisition and literal dialogue references, then identify and replace a verified sprite asset. See [research findings and remaining validation](docs/ROM_RESEARCH.md).

### Optional browser checks (Node.js)

```sh
npm ci
npx playwright install chromium
node tests/browser.cjs /path/to/original.gb /path/to/designmon-starters.gbc /path/to/designmon-starters.ips /path/to/browser-output
```

Alternatively set `CHROME_PATH` to an installed Chrome executable. The browser test compares downloads against the Python outputs and checks invalid inputs and mobile layout. Its output directory must be outside the repository.
