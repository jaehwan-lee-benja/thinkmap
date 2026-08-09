# 영수증 인쇄 — RawBT 대안 경로 조사 보고 (2026-08-09)

> 컷 구조 라운드 ⑸ 「RawBT 대안 평가(조사만)」. **갈아타자는 제안이 아니라 지도**다.
> 정본 명세는 [RECEIPT-PRINT-SPEC.md](RECEIPT-PRINT-SPEC.md) — 이 문서는 그 §10(미해결)의 근거다.
> 방법: 5각 웹 조사 → 20소스 정독 → 99주장 추출 → 3표 적대적 검증(25건 검증, 15 확정 / 10 기각).

## 0. 한 줄 결론

**웹 표준으로 프린터에 직접 붙는 길은 이 기기에서 전부 막혀 있고, 그 판정은 기기를 바꾸지 않으면 시간이 지나도 뒤집히지 않는다.**
대신 **키오스크 앱(Fully Kiosk)의 네이티브 JS 브리지**가 성립 후보다 — 그 경로는 현행 두 약점(«결과를 모른다»·«컷 주체가 둘»)을 **원리적으로 동시에** 없앤다.
단, **프린터가 블루투스인지 USB인지가 갈림길**이다(§4).

## 1. 판정표

| 경로 | 판정 | 이 기기(Android 8.1 / WebView 126)에서의 결론 |
|---|---|---|
| Web Bluetooth (`navigator.bluetooth`) | **불가** (확정) | WebView 미구현. getter 자체가 비노출 = `navigator.bluetooth` 는 `undefined` |
| WebUSB (`navigator.usb`) | **불가** (확정) | WebView 미구현. ★**객체는 존재하는데 동작하지 않는다** — 존재 검사는 오탐 |
| Web Serial (`navigator.serial`) | **불가** (확정) | WebView 마일스톤 미배정(webview: null). Chrome for Android 조차 M148 예정 |
| `rawbt:` 커스텀 스킴 (현행) | 동작하나 **단방향** | 결과를 알 수 없다 — 저자 코드로 확증(§3) |
| 커스텀 스킴 결과 감지 일반해 | **미성립** (근거 부족) | `intent://` fallback 감지 주장은 전원 반대로 기각 |
| ★**Fully Kiosk `fully.bt*` JS 브리지** | **조건부 성립** | 벤더 공식 API. 반환값 + 콜백 있음. **BT SPP 전용**, PLUS 기능 |
| Kiosk Browser `KBBluetooth` | 조건부 성립 | 다른 제품 — **앱 교체 필요**. 벤더 문서 단독 근거 |
| RawBT 후행 피드·자동 컷 설정 경로 | **미확인** | 공식 문서 도메인 `rawbt.ru` 가 **DNS 해석 불가**(§5) |

## 2. 왜 웹 표준은 «영구히» 불가인가

- 근거가 이 기기의 **정확한 버전 브랜치**에서 나왔다: Chromium `branch-heads/6478`(= WebView/Chrome 126)의
  `not-webview-exposed.txt` 에 「Web Bluetooth is not implemented on WebView」 / 「WebUSB is not implemented on WebView」와
  해당 인터페이스·getter 가 비노출로 열거된다. MDN browser-compat-data 도 `webview_android: false` 로 일치.
- **Chrome for Android 의 숫자를 이 키오스크에 읽어 넣으면 안 된다.** Fully Kiosk 는 기기의 System WebView 를
  그대로 렌더 엔진으로 쓴다(벤더 원문: 「It can only show the web pages as well as the available Android Webview can.」).
  세 API 의 차단은 «WebView 임베딩 모드» 기준이라 provider 를 Chrome 으로 바꿔도 결과가 같다.
- ★**시효**: Android 8.1 은 WebView M13x 이후 지원이 끊겨 **126 에서 더 올라가지 않는다.**
  장래 어떤 마일스톤이 WebView 에 이 API 들을 넣더라도 **이 태블릿엔 오지 않는다.**
  ⇒ 「기다리면 열린다」는 선택지는 없다. 기기 교체가 전제다.

★실무 함정(높은 신뢰도): **`navigator.usb` 는 존재하면서 동작하지 않는다**(MDN 주석: 「WebView exposes navigator.usb,
but does not support WebUSB」). 피처 감지를 객체 존재로 하면 «지원함»으로 오판한다. 실패는 `requestDevice()`
호출 시점에 `NotFoundError: No device selected` 로만 드러난다 — 그런데 그 문자열은 사용자가 chooser 를
취소했을 때도 같다. ⇒ **어떤 경우에도 객체 존재로 분기하지 말 것.**

## 3. 현행 `rawbt:` 경로가 결과를 모르는 이유 (확증)

RawBT 저자(402d)의 살아있는 저장소가 이를 못 박는다:

- `rawbt_ws_server` README 의 프론트엔드 예제에서 **안드로이드 분기는** `window.location.href = data` **한 방이고
  결과 핸들러가 전무**하다. 같은 예제의 **PC 분기는** `socket.onerror` 로 **피드백이 있다**
  ⇒ 단방향성은 「안드로이드 URI 분기 고유의 성질」임이 저자 코드로 확정된다.
- 공식 데모 앱 `DemoRawBtPrinter` 도 `Intent(ACTION_VIEW)` + `startActivity()` 만 쓴다
  (`startActivityForResult` 가 아니다) — **네이티브에서조차 이 경로엔 반환이 없다.**
- 서드파티 훅에서 발견되는 `onSuccess` 는 URL 생성 직후 발화하는 **가짜 성공**이다.

RawBT 에 반환 채널이 있는 다른 경로는 존재하지만 둘 다 이 키오스크에서 **도달 불가**:
로컬 WebSocket 서버(`ws://127.0.0.1:40213/`)는 PC 데스크톱 데몬이고, 공식 AIDL SDK(콜백 있음)는
**네이티브 앱 바인딩 전용**이라 웹 페이지에서 못 쓴다(게다가 「Do not use it in real projects before the first release」 알파 경고).

⇒ **결과를 알려면 스킴 호출을 개선하는 게 아니라 «양방향 네이티브 브리지»로 옮겨야 한다.**

## 4. ★성립 후보 — Fully Kiosk `fully.bt*` (조건부)

우리가 **이미 쓰고 있는 앱**의 공식 기능이다. 벤더 페이지에 프린터가 **명시된 예시 용도**로 적혀 있다
(「Communicate to Bluetooth devices (printers etc.)」), 그리고 `<!-- Print on Bluetooth Printer -->` 주석의
완성 예제가 `btOpenByUuid('0000110a-0000-1000-8000-00805f9b34fb')`(Serial Port/printing 프로파일) +
`btSendByteData(new Uint8Array([...]))` 를 쓴다 — **raw ESC/POS 바이트 전송이 벤더 의도된 용법**이다(마케팅 추론이 아니다).

API 표면: `btGetDeviceListJson()` · `btOpenByMac/Uuid/Name(...)`(SPP 전용, **GATT 미지원**) ·
`btIsConnected()` · `btSendStringData/btSendHexData/btSendByteData()` · `btClose()` ·
`bind('onBtConnectSuccess'|'onBtConnectFailure'|'onBtDataRead', …)`

**이 경로가 우리 두 약점에 정확히 대응한다:**
- 바이트 스트림 전체를 **우리가 소유**한다 ⇒ 중간 앱이 없으니 **컷 주체가 하나**로 확정된다
  (RawBT 의 후행 피드·자동 컷 설정이 **논외**가 된다 — §5 의 미확인 항목을 씨름 없이 소거한다).
- 반환값(boolean) + 콜백으로 **연결·전송 결과를 페이지가 안다.**

**조건과 단서(전부 중요):**
1. ★**BT SPP 전용이다.** API 이름 전체 덤프에 `fully.usb*` 상당물이 **없다.**
   ⇒ **프린터가 USB 연결이면 이 경로는 무효다.** 우리 코드 주석에는 두 경로가 다 기록돼 있다
   (`receiptTemplate.js`: 「USB 유선(RawBT USB + ESC/POS general)은 raw 패스스루」/「BT 경로에선 RawBT 가 비트맵으로 바꿔준다」)
   ⇒ **현장 실물이 지금 어느 쪽인지 확인이 선행**이다. USB 라면 남는 선택지는 BT 프린터·BT 어댑터로 바꾸거나 자체 브리지 앱 제작.
2. **PLUS 기능**이고 `Advanced Web Settings ▸ Enable JavaScript Interface` 를 **명시 활성화**해야 한다.
   단 「All PLUS features are unlimited FREE to try」 ⇒ **구매 전에 오늘 검증 가능**하다(프로덕션 상시 운영은 라이선스).
3. ★**보안**: JS 인터페이스를 켜면 **로드되는 모든 페이지**에 앱·기기·로컬 파일 접근이 열린다
   (벤더 경고: 「any website can read ALL your local files, change the device settings etc.」)
   ⇒ **URL Whitelist 병행이 필수 조건**이다. 이건 협상 대상이 아니다.
4. boolean 은 「SPP 소켓에 바이트를 넘겼다」이지 **「종이가 나왔다」가 아니다.** 종이 레벨까지 알려면
   `onBtDataRead` 로 프린터 상태를 되읽어야 한다(ESC/POS `DLE EOT` 실시간 상태 조회 지원 여부 확인 필요).
5. 검증 수단: Fully 의 `Enable Webview Contents Debugging` + `chrome://inspect` 로 **앱 수정 없이** 실기기 확인 가능해 보인다.

**신뢰도 한계**: 근거가 **벤더 문서 단독**이고 CS-273N / Android 8.1 실기기 3자 성공 리포트는 찾지 못했다.
⇒ **실기기 검증 없이 「성립」으로 확정하지 말 것.**

## 5. RawBT 설정 경로 — 확인 실패(정직하게)

질문 ⑸(후행 피드·자동 컷 설정 메뉴 명칭·경로)에 대해 **3표 검증을 통과한 주장이 0건**이다.
유일한 1차 문서처 `rawbt.ru` 가 2026-08-09 현재 **DNS NXDOMAIN/ENOTFOUND** 로 열리지 않는다.
저자 GitHub 저장소들은 API·데모 코드만 담고 엔드유저 설정 트리를 제공하지 않는다.

⇒ **현장 메뉴 명칭을 문서에 확정 기재하면 안 된다.** 대응 두 갈래:
1. 기기에서 RawBT 앱 설정 화면을 **직접 스크린샷으로 채집**해 `docs/` 에 사내 정본화.
2. 편집기의 **컷 방식 = 「컷 안 보냄」** 으로 컷 주체를 RawBT 하나로 정한다
   ([SPEC §7-3](RECEIPT-PRINT-SPEC.md)) — 설정 씨름 없이 증상을 없애는 쪽.
   ★이번 조사 결과로 ②의 값이 더 커졌다: RawBT 설정 문서가 **소실됐기 때문에** 「설정을 정확히 만져서 고친다」는
   경로 자체의 신뢰도가 낮아졌다.

## 6. 남은 질문(다음 사람이 이어받을 순서)

1. **프린터가 BT 인가 USB 인가** — §4-1. 이 하나가 대안 지도 전체를 가른다. **최우선.**
2. CS-273N 실기기에서 `fully.bt*` 가 실제로 동작하는가 — 연결 성공 / `GS V` 컷·`GS k` CODE128·`GS ( k` QR·`GS v 0` 래스터 정상 출력 / `onBtConnectFailure` 발화.
3. `onBtDataRead` 로 「종이 없음·커버 열림·출력 완료」까지 알 수 있는가(프린터가 `DLE EOT`/`GS r` 응답을 지원하는지).
4. RawBT 를 계속 쓸 경우 설정 화면 스크린샷 정본화(§5-1).
5. Kiosk Browser 로 갈아탈 값이 있는지 — JS 인터페이스의 토글·화이트리스트·유료 티어 전제조건이 벤더 문서에 침묵.

## 7. 기각된 주장(다음 사람이 되살리지 않도록)

- 「`intent://` 의 `S.browser_fallback_url` 로 핸들러 부재를 감지해 성공/실패를 알 수 있다」 → **기각(0-3)**.
  Fully Kiosk 는 Chrome 이 아니라 **WebView 임베더**라 Chrome 의 intent 처리 규칙이 그대로 적용된다고 가정할 수 없다.
- 「Fully Kiosk 를 진짜 Chrome for Android 로 바꾸면 Web Bluetooth 가 열린다」 → **기각(1-2)**. 키오스크 잠금을 포기하는 대가도 별개 문제.
- 「WebView 가 API 를 켜는 스위치를 아예 갖고 있지 않다(구조적 결함)」 → **기각(0-3)**. 결론(불가)은 같지만 사유를 이렇게 단정하지 말 것.
- 「Web Serial 은 Android 전체에서 미구현」 → **기각(0-3)**. Chrome for Android 는 138+ 부분 지원이 있다(이 기기와는 무관).
- 「Kiosk Browser 의 `sendBytes` 가 미연결 시 false 를 반환해 동기 신호를 준다」 → **기각(1-2)**. 반환·피드백 세부는 추가 확인 필요.

## 8. 조사 메모

- 소스 사망: `rawbt.ru` DNS 불가 ⇒ RawBT 인용은 저자 GitHub(`402d/*`)로 재-앵커링해야 한다.
- 로그인 벽: `issues.chromium.org` 이슈 본문 verbatim 확인 불가, `bugs.chromium.org`(Monorail) 폐기.
  다만 세 API 비지원 결론은 **Chromium 소스 트리 + MDN BCD 로 독립 확증**돼 트래커에 의존하지 않는다.
- 비용: 이 조사는 워크플로우 **에이전트 102개 / 약 3.9M 토큰**을 썼다(예상보다 큼 — 다음엔 각을 좁혀 발주할 것).
