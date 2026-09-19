# 디자인몬 어드벤처

**플레이:** [`index.html`](index.html)을 브라우저에서 여세요. 설치·서버·ROM 없이 실행되는 첫 챕터입니다. 저장소 ZIP을 내려받았다면 압축을 먼저 풀어주세요.

- 네 맵 탐험, 8종 동료, 세 외주 프로젝트와 엔딩
- 작업물 제출·설명·범위 합의·휴식, 상태이상과 16개 기술
- 동료 교체·성장·아이템·무료 회복·반복 연습 의뢰
- 키보드 / 클릭 이동 / 모바일 터치, 로컬 자동 저장과 JSON 내보내기·가져오기

배틀은 클라이언트를 처치하는 대신 **진척과 합의를 쌓아 기한 안에 납품**하는 방식입니다. [찾은 원래 기획과 구현 범위](docs/GAME_CONTEXT.md)를 참고하세요. 장편 전체나 3D 리메이크는 아닙니다.

**실제 골드 실행:** [`web/rom/index.html`](web/rom/index.html)에서 본인이 보유한 원본 또는 수정 ROM을 선택하세요. binjgb MIT 런타임을 포함하여 오프라인으로 실행하며 파일을 업로드하지 않습니다. 원작 그래픽과 엔진이 동작합니다. 실행 상태는 ROM 해시별로 저장하고 파일로 옮길 수 있습니다. 외주 규칙은 독립 웹게임에 구현되어 있으며, 골드 ROM의 전투 엔진을 바꾼 것은 아닙니다.

기존 프로토타입은 `legacy/index.html`에 보존했습니다. 루트 `index.html`은 CSS·JS를 포함한 단일 실행 파일입니다. `web/` 수정 후 `python3 tools/build-standalone.py`로 갱신하세요. 정적 호스팅 시 `web/`이 아니라 저장소 전체를 호스팅하고 `/web/`으로 접근하면 ROM 연구실 링크도 유지됩니다.

### 웹 검증

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
# 선택: 원본/수정 ROM을 외부 경로에서 검증
node tests/rom-player.cjs /path/to/game.gbc /path/to/external-output
```

`CHROME_PATH`로 설치된 Chrome을 지정할 수 있습니다. 브라우저 테스트는 사용자 입력으로 맵을 걸어 세 의뢰와 엔딩을 완료하고, 저장 재개 및 모바일 조작을 확인합니다. 출력은 기본 `/tmp/designmon-web-verification`에 저장합니다. `DESIGNMON_TEST_OUTPUT`으로 저장소 밖의 경로를 지정할 수 있습니다.


## Korean Gold ROM research

Open [`tools/rom-lab/index.html`](tools/rom-lab/index.html) directly in a modern browser. No server, installation, network request, or ROM upload is needed. Select an extracted Korean Gold `.gb` / `.gbc` file, edit three starter names, validate, and download an IPS patch, manifest, or modified ROM.

This is the first reverse-engineering experiment, **not a completed Designmon game**. It changes three species display names in the original ROM. Maps, sprites, battle rules, dialogue and the title screen remain original. The pre-existing web prototype in the root is preserved; its referenced `assets/` files were absent from the repository.

Only the exact Korean Gold revision documented in [ROM_RESEARCH.md](docs/ROM_RESEARCH.md) is accepted. The ROM and emulator executable are not included. Default names now follow the recovered game design: 타이포몽, 컬러링, 픽셀러. Existing save nicknames and literal names in dialogue are not rewritten.

### Command line (Python 3.9+, no dependencies)

```sh
python3 tools/rom-lab/romlab.py inspect /path/to/poket_gold_korean.zip
python3 tools/rom-lab/romlab.py patch /path/to/poket_gold_korean.zip --output-dir /path/to/new-output
python3 -m unittest discover -s tests -v
```

Outputs: `designmon-starters.gbc`, `designmon-starters.ips`, `manifest.json`. Existing output files are never overwritten. Keep all ROMs, saves and generated outputs outside the repository. `--names` accepts three names using the currently supported syllables: 일 러 몬 코 딩 타 이 포 몽 컬 링 픽 셀.

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
