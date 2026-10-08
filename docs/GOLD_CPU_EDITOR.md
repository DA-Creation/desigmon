# 골드 CPU 코드 읽기·수정

`web/gold/cpu.js`는 Game Boy SM83 기계어를 텍스트로 읽고 같은 바이트로 재조립하는 브라우저·Node 공용 라이브러리다. 기본 opcode 공간 전체와 CB 접두 명령 256개를 처리한다. 알려진 11개 미정의 opcode와 선택 범위 끝에서 잘린 명령은 `DB`로 보존한다. 원본 ROM·원본 코드·그래픽은 포함하지 않는다.

이 기능은 **CPU 명령 편집기**다. 맵 이벤트 스크립트, 한글 대사, 포인터, 압축 그래픽을 자동으로 분류하거나 고급 게임 소스로 복원하지 않는다. ROM에는 코드와 데이터가 섞여 있으므로 순차 디스어셈블 결과가 모두 실제 실행되는 코드라는 뜻도 아니다. 게임 전체가 바이트 단위로 재조립되는 것과 모든 플레이 경로의 정확성을 검증하는 것은 별개다.

## 사용

브라우저에서는 `<script src="cpu.js"></script>`로 `GoldCPU`를 사용한다. Node에서는 `require('./web/gold/cpu.js')`로 읽는다. 네트워크나 모듈 로더가 필요 없다.

```js
const records = GoldCPU.disassemble(rom, {
  offset: 0x4000, length: 0x100, address: 0x4000
});
const source = records.map(record => record.text).join('\n');
const identicalBytes = GoldCPU.assemble(source, 0x4000);

// 두 바이트 명령의 즉시값 변경. 원본 rom은 변경되지 않는다.
const proposal = GoldCPU.assemblePatch(rom, 0x4000, 2, 'LD A, $2A', 0x4000);
// proposal.before와 현재 ROM의 예상 바이트를 비교한 뒤
// 별도 ROM 편집기가 proposal.after를 복사본에 적용한다.
```

| API | 반환값 |
| --- | --- |
| `decode(bytes, offset = 0, cpuAddress = offset & 0xFFFF)` | 명령 한 개. 범위 밖 오프셋은 오류 |
| `disassemble(bytes, {offset, length, address})` | 선택 범위의 모든 바이트를 포함하는 레코드 배열 |
| `assemble(text, startAddress = 0)` | 재조립한 `Uint8Array` |
| `assembleDetailed(text, startAddress = 0)` | `bytes`, `records`, `labels`, `startAddress`, `size` |
| `assemblePatch(bytes, offset, length, text, cpuAddress)` | 입력을 변경하지 않는 `{offset, address, length, before, after}` |

명령 레코드에는 `offset`, `address`, `size`, `bytes`, `opcode`, `prefixed`, `mnemonic`, `operands`, `text`, `valid`, `truncated`, `kind`, `flow`, `conditional`, `target`이 있다. `target`은 정적으로 정해지는 JR·JP·CALL·RST 목적지이며, `JP HL`처럼 런타임 값이 필요한 경우에는 `null`이다. 데이터 레코드의 `valid: false`는 해당 바이트가 ROM에서 불법이라는 판정이 아니다.

`offset`은 파일 위치, `address`는 CPU 주소다. 전환 ROM 뱅크의 파일 위치가 `$8000` 이상이어도 CPU 주소는 보통 `$4000..$7FFF`다. **뱅크 번호와 CPU 주소를 호출자가 구분해야 한다.** API가 MBC 상태를 추측하지 않는다. 선택 범위를 넘는 바이트는 읽지 않으며, CPU 주소 계산은 16비트에서 순환한다.

## 텍스트 형식

```asm
entry: LD A, $2A
       LDH [$FF80], A
       JR NZ, entry
       LD HL, SP-1
       STOP $00
       DB $D3, $ED
```

- 대소문자 구분 없이 명령, 레지스터, 라벨을 읽는다. `;` 뒤는 주석이다.
- `$2A`, `0x2A`, `%00101010`, `42` 숫자와 라벨, `label+2`·`label-2`를 지원한다. 범위 초과를 잘라내지 않고 오류로 거부한다.
- `JR $4567`은 상대 바이트가 아니라 **절대 CPU 목적 주소**다. 재조립 주소에서 signed 8비트 범위에 도달할 수 있어야 한다.
- `LDH [$FF80], A`는 `$FF00` 페이지의 실제 주소다. 입력에서 `[$80]`도 허용한다.
- `ADD SP, -128`, `LD HL, SP+127`은 부호 있는 8비트 값이다.
- `STOP`의 두 번째 바이트는 `$00`이 아니어도 그대로 보존한다. 이 표기는 모든 STOP 변형의 실제 하드웨어 동작을 보장하지 않는다.
- `DB`는 코드와 무관한 바이트를 명시적으로 보존한다. `STOP`, `SUB C`, `XOR A`, `[HLI]`·`[HLD]`, `JP [HL]`의 일반적인 축약도 읽는다.

이 형식은 전체 RGBDS 문법이 아니다. `INCLUDE`, `SECTION`, 매크로, 링크, 뱅크 재배치, 일반 표현식, 지역 라벨 스코프는 제공하지 않는다. `assemblePatch`는 선택한 길이와 다른 결과를 거부한다. 게임 포인터 재배치·ROM 해시 확인·체크섬 갱신·패치 적용·실행 중인 에뮬레이터의 재시작은 상위 편집기에서 담당한다.

## 검증

```sh
node tests/gold-cpu.cjs
# 선택: 로컬 ROM 128개 뱅크의 모든 바이트를 재조립하여 비교
GOLD_ROM_PATH=/path/to/original.gb node tests/gold-cpu.cjs
# 선택: 저장소 밖에 받은 독립 opcode 표와 의미·크기를 대조
GOLD_OPCODE_ORACLE=/path/to/Opcodes.json node tests/gold-cpu.cjs
```

기본 테스트는 925,838회의 바이트 일치 검사를 포함한다. 모든 기본 opcode에 대해 다음 바이트 256값과 주소 경계 6곳, 모든 CB opcode, 16비트 피연산자 형식 8개의 65,536값, JR의 전체 부호 범위, 잘린 선택 범위, 라벨·오류·동일 길이 패치·브라우저 전역 export를 확인한다. 한국어 골드 원본의 2,097,152바이트도 16 KiB 뱅크별로 손실 없이 재조립했다. 이 검증은 명령 텍스트 코덱의 정확성에 대한 근거이며 게임 시나리오 전체의 런타임 검증이 아니다.

명령 정의는 [Pan Docs의 SM83 명령 집합](https://github.com/gbdev/pandocs/blob/master/src/CPU_Instruction_Set.md), [RGBDS의 gbz80 참조](https://github.com/gbdev/rgbds/blob/master/man/gbz80.7)를 확인했다. 독립 대조표는 [gbdev/gb-opcodes](https://github.com/gbdev/gb-opcodes/blob/master/Opcodes.json)이며 정상 테스트 실행에는 다운로드가 필요 없다.
