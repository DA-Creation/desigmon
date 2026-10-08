# 원본 게임 실행 코어 빌드

게임 로직은 ROM 안의 SM83 명령을 실행하며, JavaScript로 간소화한 별도 규칙으로 대체하지 않는다. SameBoy의 CGB-E 코어를 Emscripten 4.0.15로 컴파일하고 160×144 화면·오디오·입력·저장 버퍼를 `tools/gold-runtime/wrapper.c`로 연결한다.

고정 소스: [SameBoy c458e7c5d2d350fb37a1931c40da9f758d28d240](https://github.com/LIJI32/SameBoy/tree/c458e7c5d2d350fb37a1931c40da9f758d28d240). `web/vendor/sameboy-build.json`에 실행 파일 및 공개 부트 ROM의 SHA-256이 있다. Nintendo 부트 ROM은 포함하지 않는다.

준비한 SameBoy 체크아웃에서 RGBDS 1.0.3으로 공개 부트 ROM을 빌드한다. 디렉터리는 저장소 밖에 둔다.

```sh
make -C /path/to/SameBoy bootroms RGBDS=/path/to/rgbds-1.0.3/bin/
python3 tools/gold-runtime/build.py \
  --source /path/to/SameBoy \
  --emcc /path/to/emsdk/upstream/emscripten/emcc.py \
  --python /path/to/python3
python3 tools/build-standalone.py
```

`--python`에는 Emscripten이 지원하는 Python 버전을 지정한다(확인 환경 Python 3.12.14). 빌드는 고정 소스 커밋을 확인하며 코어와 부트 ROM을 단일 JavaScript 파일에 포함한다. WebAssembly를 실행할 때 `.wasm`을 네트워크로 가져올 필요가 없다. 루트 HTML은 CSS, 라이브러리, 라이선스를 모두 포함한다.

API:

```js
const runtime = await GoldRuntime.create();
runtime.open(romBytes);                 // CGB-E, host RTC
runtime.key('A', true);
const {pixels, audio} = runtime.frame(); // RGBA + stereo signed 16-bit PCM
runtime.key('A', false);
const state = runtime.state();
const battery = runtime.battery();      // 32 KiB SRAM + RTC
runtime.restore(state);
```

정확한 재현 테스트는 `open(bytes, {deterministic:true})`를 사용한다. 일반 플레이는 실제 시간과 동기화하는 RTC 모드다. 단일기기 상태 파일은 현재 ROM SHA-256을 함께 기록해야 한다. 연결 상태의 두 기기는 [통신 API](GOLD_LINK_RUNTIME.md)의 paired snapshot을 사용한다.

`tests/gold-runtime.cjs`는 외부 `GOLD_ROM`을 지정하면 부팅·오디오·입력·저장 복원을 실행한다. `GOLD_NATIVE_FRAMES`에는 같은 고정 코어와 `native_verify.c`로 생성한 외부 출력 파일을 지정한다. 1,200프레임의 모든 픽셀·PCM 샘플을 WASM 결과와 비교한다. 새 코어에서 같은 검사와 [실제 게임 자연 입력 검증](GOLD_VERIFICATION.md)을 다시 실행한다.
