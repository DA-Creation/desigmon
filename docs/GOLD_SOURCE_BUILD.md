# 한국어 골드의 동일 바이너리 재빌드

2026-10-08 실측. 제공된 한국어 골드 ROM 전체 2,097,152바이트와 **차이가 0인 빌드**를 만들었다. 원본 SHA-256은 `9c273e86e6120c6a038160ccb0153b8b20425b84fc08a496281c1d1bcac492f6`이다. 원본 게임 파일, 외부 디스어셈블리와 생성 결과는 공개 저장소에 포함하지 않는다.

이 결과는 바이너리 보존 증거다. 모든 이벤트를 사람이 이해하는 소스로 해석했다거나, 모든 경로의 웹 실행을 검증했다는 뜻은 아니다.

## 고정된 빌드 입력

- [Narishma-gb/pokegold-kr](https://github.com/Narishma-gb/pokegold-kr/tree/f4496dda3003ccc5fc26f2757171a3b111e65307) 커밋 `f4496dda3003ccc5fc26f2757171a3b111e65307`.
- [RGBDS 1.0.3](https://github.com/gbdev/rgbds/releases/tag/v1.0.3). macOS 공식 배포 ZIP SHA-256 `dc1804b187895c4e1b730ba9d4b476052979607e613113b72dc7a494f88c898e`.
- 사용자가 가진 동일 한국어 골드 ROM. ZIP에서는 크기가 맞는 `.gb`/`.gbc` 한 개만 읽으며 동봉 EXE를 실행하지 않는다.
- Python 3.9 이상, Git, Make, C 컴파일러. macOS에서 확인했다. 다른 OS는 RGBDS 1.0.3 실행 파일 디렉터리를 `--rgbds-dir`로 지정한다.

## 실행

`PRIVATE_WORK`는 **공개 저장소 밖**의 빈 작업 디렉터리다. 스크립트는 입력 ROM을 제자리 수정하지 않고, 동일 이름의 증거 폴더를 덮어쓰지 않는다.

```sh
python3 tools/gold-source/gold_source.py prepare --workspace "$PRIVATE_WORK" --rom /path/to/poket_gold_korean.zip
python3 tools/gold-source/gold_source.py build --workspace "$PRIVATE_WORK" --label baseline --require-identical
python3 tools/gold-source/gold_source.py demo --workspace "$PRIVATE_WORK" --label edit-demo
python3 tools/gold-source/gold_source.py build --workspace "$PRIVATE_WORK" --label restored --require-identical
```

`prepare`는 고정된 외부 소스와 해시가 일치하는 RGBDS 실행 파일을 준비한다. 이후 빌드는 오프라인에서도 가능하다. `builds/<label>/`에 ROM, 심벌, 링커 맵, 로그와 `manifest.json`이 생긴다. 사용자가 ASM/PNG를 편집한 뒤에는 `build`를 새 label로 실행하고, 의도한 수정본에는 `--require-identical`을 붙이지 않는다.

`demo`는 깨끗한 소스에 세 가지 임시 수정을 적용한다. 치코리타 HP 45→46, 막치기 위력 40→41, 치코리타 종 이름→타이포몽이다. 실제 RGBDS로 재빌드한 후 연결된 `BaseData`, `Moves`, `PokemonNames` 심벌의 바이트와 변경 범위를 검증한다. 세 파일은 성공·실패 여부와 관계없이 원상복구한다. 디스크의 마지막 빌드 결과는 수정본이므로 원본 실행으로 돌아갈 때는 위의 `restored` 빌드도 실행한다.

확인 결과:

| 빌드 | 원본과 다른 바이트 | 결과 SHA-256 |
|---|---:|---|
| baseline-v1 | 0 | `9c273e86e6120c6a038160ccb0153b8b20425b84fc08a496281c1d1bcac492f6` |
| edit-demo-v1 | 11 | `c568339ecec1a5eff4bf7293a88b244d6cf11f703fc8f8eb89235c2daf522048` |
| restored-v1 | 0 | `9c273e86e6120c6a038160ccb0153b8b20425b84fc08a496281c1d1bcac492f6` |
| explicit-v1 (`-O` 없이 링크) | 0 | `9c273e86e6120c6a038160ccb0153b8b20425b84fc08a496281c1d1bcac492f6` |

이 편집 실험은 빌드/바이너리 검증이며 전투 중 효과의 실행 검증을 대신하지 않는다.

## 원본 overlay와 명시적 바이트 소스

upstream은 WIP이며 `rgblink -O baserom_g.bin`으로 소스가 지정하지 않은 부분을 원본에서 보존한다. 원본 빌드 맵을 읽어 다음을 측정했다.

| 출처 | 바이트 |
|---|---:|
| 명시적 소스/에셋 링커 섹션 | 1,114,530 (53.144932%) |
| 원본 overlay에 의존하는 영역 | 982,622 |
| 그 영역 중 0이 아닌 바이트 | 89,738 |

**53.14%는 해석률도 게임 완성률도 아니다.** 명시적 섹션에도 원시 데이터/압축 에셋이 있고, overlay의 많은 부분은 패딩이다. 미해석 이벤트·대사를 남김없이 고수준 편집할 수 있다는 증거가 아니다.

모든 바이트를 명시적인 로컬 ASM 입력으로 만들고 overlay 없이 링크할 수 있다.

```sh
python3 tools/gold-source/gold_source.py explicit --workspace "$PRIVATE_WORK" --label explicit --require-identical
# opaque-source/overlay.asm 또는 정식 ASM 편집 후:
python3 tools/gold-source/gold_source.py explicit --workspace "$PRIVATE_WORK" --label explicit-edited --reuse-opaque
```

첫 명령은 빈 구간을 사용자 ROM에서 `db`/`ds` 문장으로 물질화해 `opaque-source/overlay.asm`에 보존한다. 두 번째 명령은 이 파일을 재생성하지 않고 편집 상태 그대로 조립한다. 실제 링크에는 `-O`가 없으며 2,097,152바이트 모두 명시적 섹션에 속한다. 원본과 바이트 동일함을 확인했다. **이 원시 바이트 표현은 이벤트나 대사의 의미를 해석한 소스로 부르면 안 된다.** 정식 섹션의 크기를 변경하여 원시 섹션과 겹치면 링커가 오류를 내며, 포인터와 배치를 함께 수정해야 한다.

## 로컬 소스 탐색 manifest

```sh
python3 tools/gold-source/gold_source.py index --workspace "$PRIVATE_WORK" --output "$PRIVATE_WORK/source-index.json" --include-source
```

현재 1,915개 ASM/INC 파일, 27,264개 ROM 심벌, 16,671개 소스 라벨 연결을 내보낸다. 실제 빌드 의존성 그래프에 있는 파일은 1,657개다. 파일별 해시·원문·줄 수·의존 여부, 라벨의 소스 줄과 bank/address/offset, 링커 섹션 및 overlay 구간이 들어간다. 원문이 포함된 manifest는 게임 소스이므로 공개 저장소에 넣지 않는다.

`rom_symbol_anchors`는 전역 라벨 이름을 링크된 심벌과 연결한 **탐색 보조값**이다. 각 파일의 정확한 전체 바이트 범위가 아니며, 조건부 include 때문에 의존성에 있어도 해당 버전에서 활성화되지 않을 수 있다. 기존 영문 맵 파일이 존재한다는 이유로 한국판 시나리오 복구 완료로 처리하지 않는다.

## 브라우저 안에서 소스와 PNG 재빌드

RGBDS 1.0.3의 assembler/linker/checksum/PNG converter를 Emscripten 4.0.15로 WASM 컴파일했다. 공개 배포에는 RGBDS 및 Emscripten 런타임과 관련 라이선스만 포함한다. 게임 보조 그래픽 도구의 WASM은 공개 저장소에 넣지 않고 로컬 소스 프로젝트에 담는다. 프로젝트에 든 JavaScript를 평가하지 않는다.

```sh
python3 tools/gold-source/build_rgbds_wasm.py --source /path/to/rgbds-1.0.3 --emsdk /path/to/emsdk --python /path/to/python3 --bison-dir /path/to/bison/bin
python3 tools/gold-source/build_private_graphics_tools.py --workspace "$PRIVATE_WORK" --emsdk /path/to/emsdk --python /path/to/python3
python3 tools/gold-source/gold_source.py project --workspace "$PRIVATE_WORK" --output "$PRIVATE_WORK/gold-source-project.json"
node tools/gold-source/test_source_build.cjs "$PRIVATE_WORK/gold-source-project.json" /path/to/private-test-output
```

`project`의 private JSON에는 7,767개 소스/PNG/바이너리 파일과 고정된 Makefile의 그래픽 변환 4,590단계가 들어간다. PNG를 바꾸면 관련 팔레트, 크기, 1/2bpp와 LZ 압축을 의존 순서에 따라 갱신한다. PNG 원본을 그대로 변환하는 4,590단계를 **모두** WASM으로 실행한 결과도 원본 SHA-256과 동일했다(3,668개 생성 에셋, Node/WASM 48.36초). PNG의 런타임 팔레트를 직접 정의하는 `.pal`/ASM도 별도 편집 대상이다.

전체 16개 ASM 번역 단위와 opaque ASM도 WASM으로 조립한다. 웹 빌드에서는 크기가 바뀐 그래픽이 패딩을 사용할 수 있도록 opaque ASM을 먼저 `backdrop.gbc`로 링크하고 그 **소스에서 생성한 배경 바이트** 위에 정식 소스를 링크한다. 입력 원본 ROM을 그대로 복사해 완성본이라고 표시하는 방식이 아니다. 위의 네이티브 `explicit` 명령은 `-O` 없이 같은 결과를 만들 수 있는 별도 검증 경로다. 은폐된 의미의 해석률은 이 절차로 달라지지 않는다.

웹 링커의 overlay 옵션 자체는 배경 영역과의 충돌을 막지 않는다. 따라서 두 링커 맵을 추가 대조해, 0이 아닌 바이트가 있는 opaque 섹션의 **전체 할당 영역**을 정식 소스가 침범하면 빌드를 거부한다. 그 섹션 내부의 0바이트도 함께 보호한다. 전부 0인 opaque 섹션은 확장용 패딩으로 사용할 수 있으며, 원시 영역을 해석된 소스로 바꾸려면 `opaque.asm`의 해당 할당도 명시적으로 옮기거나 줄여야 한다. 이 검사는 주소·포인터의 의미까지 증명하지 않으므로 크기 변경 후 실행 검증은 여전히 필요하다. `tests/gold-source-overlap.cjs`는 게임 데이터가 없는 합성 ASM으로 침범 거부·패딩 사용·명시적 할당 이동을 실제 WASM 링커에서 검사한다.

UI 연결 API는 `web/gold/source-build.js`의 `DesignmonSourceProject`다. Node에서도 같은 클래스를 `require`할 수 있다.

```js
const project = await DesignmonSourceProject.import(fileOrJSONString);
project.list("chikorita");        // path, text, encoding, changed, size
const value = project.read(path); // string 또는 Uint8Array
project.write(path, value);
const result = await project.build({onProgress: ({completed, total}) => {}});
// result.rom, result.sha256, result.identicalToOriginal, result.symbols, result.map
const savedProjectJSON = project.export();
```

HTTP에서는 Worker, 로컬 파일에서는 메인 WASM을 사용한다. 단일 HTML이 `GOLD_STANDALONE`을 설정하면 내장 팩토리를 사용하고 외부 Worker를 열지 않는다. 기본 파일 선택은 로컬 파일 읽기이며 서버 업로드를 하지 않는다. Makefile의 의존 관계나 명령 자체를 바꾼 경우에는 native `project`를 다시 실행해 빌드 계획도 갱신해야 한다.
