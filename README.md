# 디자인몬 어드벤처 / 한국어 골드 웹 편집기

[`index.html`](index.html)을 브라우저에서 열고 보유한 한국어 골드 ROM 또는 ZIP을 선택합니다. 서버·설치 없이 실행됩니다. 게임 파일은 외부로 전송하지 않습니다.

원본 게임 전체를 SameBoy CGB 코어의 WebAssembly 빌드로 실행합니다. 지도·시나리오·전투·음악·그래픽은 ROM의 원래 코드와 데이터를 사용합니다. 독립적으로 만들었던 작은 RPG는 [`web/index.html`](web/index.html)에 남아 있으며, 골드 복각 실행기의 기본 화면은 루트 `index.html`입니다.

- 방향키 이동, **X** 확인, **Z** 취소, **Enter** 시작, **Shift** 선택. 화면 버튼도 사용할 수 있습니다.
- 실행 상태 저장/이어하기, 게임 내 세이브 `.sav` 가져오기·내보내기.
- 2기기 케이블·적외선 통신, 1P/2P 조작 선택과 양기기 상태 저장·복원.
- 251종 능력치·진화·레벨업 기술, 251개 기술, 몬스터·트레이너·맵 캐릭터 픽셀과 팔레트 편집.
- 맵 이벤트·스크립트·텍스트, SM83 코드와 전체 ROM 바이트 편집.
- 로컬 소스 프로젝트를 열어 ASM·PNG·바이너리 파일을 수정하고 **브라우저 안에서 RGBDS로 재빌드**.
- 수정 ROM·IPS 패치·편집 프로젝트 내보내기. 편집은 되돌리기/다시 실행을 지원합니다.

원본 SHA-256은 `9c273e86e6120c6a038160ccb0153b8b20425b84fc08a496281c1d1bcac492f6`입니다. 다른 판본이나 이미 수정한 ROM을 원본으로 잘못 처리하지 않도록 이 값으로 확인합니다. 수정본은 원본과 편집 프로젝트로 다시 열 수 있습니다.

## 전체 소스 프로젝트

[소스 준비·재빌드](docs/GOLD_SOURCE_BUILD.md)를 따라 보유한 ROM에서 비공개 프로젝트를 생성합니다. 게임 소스/ROM/추출 에셋은 이 저장소에 포함하지 않습니다. 웹 편집기의 **전체 소스 → 소스 프로젝트 열기**에서 생성한 JSON을 선택합니다. 파일 적용 후 **빌드 · 실행**으로 실행합니다. PNG는 파일 교체로 불러오며 팔레트·타일·압축 변환도 빌드에 포함됩니다.

빠른 ROM 필드/픽셀 편집은 원래 데이터 공간 내에서 동작합니다. 길이가 커지는 시나리오·이미지 수정은 전체 소스 빌드를 사용하며, 실제 뱅크 용량이나 연결 주소에 문제가 있으면 오류를 표시합니다. 비정상 포인터와 미해석 원시 영역을 임의로 정상화하지 않습니다.

[원래 디자인몬 기획과 외주 작업 규칙](docs/GAME_CONTEXT.md)은 별도 문서에 보관합니다. 현재 원본 실행기는 골드 전투 규칙을 그대로 사용합니다.

## 빌드와 검증

```sh
npm ci
npm test
# 보유 ROM이 있을 때 전체 데이터와 실제 실행 검증
GOLD_ROM=/outside/repo/original-gold.gb npm run test:gold
# 공개 단일 HTML 갱신
python3 tools/build-standalone.py
# 보유 ROM/소스를 포함하는 개인용 HTML. 출력은 저장소 밖이어야 합니다.
python3 tools/build-standalone.py --private-rom /outside/repo/gold.zip \
  --private-source /outside/repo/gold-source-project.json \
  --output /outside/repo/play/index.html
```

[검증 범위와 남은 제약](docs/GOLD_VERIFICATION.md), [CPU 편집](docs/GOLD_CPU_EDITOR.md), [소스 재빌드](docs/GOLD_SOURCE_BUILD.md)를 참고하세요. 바이트가 동일한 재빌드와 일부 플레이 경로 검증을 전체 플레이 경로의 완전 검증으로 표시하지 않습니다.

[코어 빌드](docs/GOLD_RUNTIME_BUILD.md)와 [통신 API](docs/GOLD_LINK_RUNTIME.md)를 함께 제공합니다. SameBoy, RGBDS, fflate 및 빌드 런타임의 라이선스는 `web/vendor/`와 `tools/gold-source/runtime/`에 있습니다. 원본 게임 파일, 개인용 실행 파일, 저장 데이터는 GitHub에 올리지 않습니다.
