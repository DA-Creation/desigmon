# 두 기기 통신 런타임

`web/gold/runtime.js`는 한 SameBoy WASM 모듈 안에 CGB-E 코어 두 개를 둔다. 각 코어의 ROM, RAM, 배터리, 입력, 화면, 오디오와 실행 상태는 분리된다. 게임 데이터는 포함하지 않는다.

```js
const first = await GoldRuntime.create();
const second = first.device(1);
first.open(rom1);
second.open(rom2);
second.loadBattery(save2); // 연결 전에 적용
first.connect('link'); // 'infrared', 'both'도 가능
const { pixels, audio, peer } = first.frame();
// peer.pixels / peer.audio / peer.frameNumber
const both = first.pairState();
first.restorePairState(both);
first.disconnect();
```

`device(0)`은 첫 기기이며 `device(1)`은 같은 모듈의 두 번째 기기다. `loaded`, `frameNumber`, `open`, `frame`, `key`, `release`, `pixels`, `state`, `battery`, `restore`, `loadBattery`, `read`, `write`, `close`는 해당 기기에 적용된다. 기존 첫 기기 C ABI도 유지한다. `frameNumber`는 기존 UI 호환을 위해 쓰기도 가능하다.

`connection`은 `null`, `link`, `infrared`, `both` 중 하나다. 연결 중 한 번의 `frame()`은 두 기기를 함께 진행한다. 두 기기에 각각 호출하면 시간이 두 배 진행되므로 화면 갱신당 한 번만 호출한다. 연결을 해제하면 각 기기의 `frame()`을 따로 호출해야 한다. `close()`나 `open()`으로 한 기기를 교체하면 연결은 해제되며 다른 기기 ROM은 유지된다. `closeAll()`은 두 코어를 해제한다.

직렬 연결은 [SameBoy Cocoa 구현](https://github.com/LIJI32/SameBoy/blob/c458e7c5d2d350fb37a1931c40da9f758d28d240/Cocoa/Document.m)의 bit start/end callback 방식이다. 내부 클록 master의 bit 완료가 다른 코어의 외부 클록 입력을 진행한다. 두 코어를 `GB_run`이 반환하는 8MHz 기준 주기로 번갈아 진행하므로 한쪽 CPU만 배속이어도 통신 시각이 맞는다. 화면 한 단위는 140,448주기다. `runLinkedTicks(0..140448)`와 `ticks`는 프로토콜 검사 도구다. 적외선은 발광 callback을 상대의 `GB_set_infrared_input`에 전달하며 코어의 센서 지연·감쇠 모델을 사용한다.

STOP의 CPU 속도 전환 중에는 코어 내부 상태가 바뀌면서 `GB_run`이 0주기를 반환할 수 있다. 스케줄러는 실제 시간이 진행될 때까지 같은 코어를 계속 실행하며, 케이블 시각에 가상의 주기를 더하지 않는다.

원본 Gold 교환 접수는 두 기기의 클록 선택을 협상한다. 같은 ROM·세이브를 완전히 같은 LCD 위상으로 부팅하면 선택이 계속 충돌할 수 있다. 웹 화면과 실플레이 회귀는 1P를 먼저 부팅한 다음 2P 전원을 켜서 연결한다. 원본 통신 동작에 임의 지연이나 강제 master 선택을 추가하지 않는다.

`pairState()`는 두 ROM이 실행 중이면 연결 해제 상태에서도 쓸 수 있다. 이진 데이터에는 양쪽 native state, 연결 방식, 실행 주기와 목표 시각, 직렬 출력 비트, 적외선 출력, 프레임 번호, 화면, 오디오 필터와 샘플 위상, 입력 및 보류 실행 주기가 들어간다. 포인터나 함수 주소는 저장하지 않는다. 체크섬과 pinned core의 section 크기를 검사한 뒤 두 상태를 복원한다. UI 파일에는 두 ROM의 SHA-256을 함께 저장하고 현재 ROM과 대조해야 한다. 단일 `restore`와 `loadBattery`는 연결 중 거부되며 배터리 내보내기는 허용된다. 복원 뒤 키 입력은 해제된다. 이 전용 pair 형식은 해당 pinned WASM 빌드용이고 다른 에뮬레이터의 교환 형식은 아니다.

## 검증

`node --test tests/gold-link.cjs`는 CC0로 작성한 자체 테스트 ROM/부트 프로그램으로 다음을 확인한다.

- 256개 바이트 × 양쪽 master × 일반/고속 직렬 클록의 1,024회 실제 CPU 프로그램 송수신
- 한쪽 CPU만 2배속인 상태의 양방향 송수신
- 전원을 켜기 전부터 연결한 두 기기의 STOP/배속 전환
- 한 바이트 전송 도중 양쪽 상태 복원 후 같은 CPU 상태·픽셀·오디오·직렬 결과
- 손상된 pair 파일 거부 시 양 기기 상태 유지
- 독립된 화면·오디오·키 입력, 해제 후 독립 실행, 연결 방식 복원
- 적외선 펄스의 상대 센서 감지와 펄스 도중 복원

별도 원본 ROM 검증에서 변경 전 native 코어 출력 1,200프레임과 새 WASM 첫 기기의 모든 픽셀·오디오 샘플이 일치했다. 합성 프로토콜 테스트와 원게임의 실플레이 회귀는 별도로 실행한다.

`GOLD_ROM`을 지정하면 실제 원본 Gold 두 기기를 처음부터 연결해 1,200프레임 동안 부팅·화면·오디오·클록 균형을 검사한다. `GOLD_LINK_SAVE`를 추가하면 양쪽에 해당 배터리 세이브를 읽힌 뒤 같은 검사를 수행한다. ROM과 배터리 파일은 저장소에 포함하지 않는다.

`tests/gold-link-playthrough.cjs`는 버튼 입력으로 교환 준비 퀘스트·포획, 브케인↔꼬리선 교환, 통신 대전 승패와 퇴실, 양쪽 배터리 저장 후 새 코어 이어하기를 검사한다. 통신 대전 중 paired state 복원과 첫 턴 피해도 대조한다. `GOLD_LINK_SAVE`에는 해당 테스트의 정상 준비 세이브를 지정해 퀘스트를 재실행하지 않을 수 있다. 검사 출력 `GOLD_LINK_OUTPUT`은 저장소 밖 경로만 허용하며, 공개 입력 trace에는 버튼과 프레임만 들어간다.
