# HANDOFF — membership 통합세션 인계

> 갱신 **2026-08-18**(08-17 증류 157→107 · 08-18 회원님 카드 경로 규약 교체) · 브랜치 `feat/membership-kiosk`(업스트림 없음) · 워크트리 clean · 테스트 **228 통과/38 skip**
> 읽는 순서: 이 문서 → `docs/MEMBERSHIP-KIOSK-SPEC.md` → `docs/RECEIPT-PRINT-SPEC.md` → `~/claude-project/docs/POPCORN-LOOP-SPEC.md`
> 인박스 `~/claude-project/msg/to-membership.md` · **보고는 `msg/to-orch.md`**(08-11 타깃 변경 — to-conductor 아니다)

## 0. 전판에서 «지운» 주장 (되살아나지 않게 지운 것을 남긴다)

| 지운 주장 | 왜 |
|---|---|
| 「배포 대기 2커밋 → main 머지 → gh-pages push」 | **배포 경로가 바뀌었다**(§2). main 머지는 배포 트리거가 아니고, `main..HEAD` 40커밋이 «미배포»를 뜻하지도 않는다. |
| 「RawBT 무료판 인쇄 여부가 판을 뒤집는다」 | **프린터 = USB 유선 직결 확정**(08-16). 폰 브리지·라이선스 판돈·`fully.bt*` 전부 무효. |
| 「KICC 회신 대기」 / 「워크플로 결과 미수령」 | 각각 종결 · 완주. 남은 산출 없음. |
| `.env.example` 「'1' 이어야 라이브」 | 기본값이 **반전**(`!== '0'`). 샘플이 옛 전제를 사실처럼 가르쳐 파일에서 직접 교정했다. |

> ⚠**이 문서의 백업본은 «낡은 게 정상»이다(2026-08-21~ · 해소되면 이 줄을 지워라).** 관제 신호 **`BOOTDOC_STALE`** 이 이 파일을 잡으면 **새 결함이 아니라** «승인 대기»가 사유다: 미백업 5커밋(문서·스크립트만·앱 코드 0)이 **회원님 푸시 승인**을 기다리는 중이고, 이 파일의 `+95/−141` 이 그 안에 있다. 승인 나면 `git push backup feat/membership-kiosk` **한 번으로 자동 해소**되고, 끝 술어는 **되읽기 blob 일치**다. ★사유를 안 적어 두면 **다음 사람이 매일 이 경보를 새 결함으로 판다.**

## 1. 상태 — 한 줄
팝콘 루프(키오스크 발권 → 카운터 회수 → 손님 폰 QR)는 **현행 진입점에서 라이브**다(§2 실측). 남은 것은 현장에서만 판정되는 것(영수증 컷 1장) + **정책 4건**(orch 보유). 코드 하드 블로커 없음.

## 2. ★배포 토폴로지 — 여기서 가장 많이 틀린다

```
apps/membership ─build:storage▶ dist-storage/ ─┬▶ Supabase Storage(kiosk)      = 자산(JS·CSS·폰트·img)
                                               ├▶ gen-kiosk-edge.mjs ▶ Edge `kiosk` = HTML 한 장 ★진입점
                                               └▶ cf-pages 브랜치 kiosk.html       = 같은 HTML 사본
```
- **일괄 배포 = `bash ~/claude-project/scripts/deploy-kiosk.sh "<메시지>"`**(무-LLM): build → **Edge 짝 가드** → Storage 업로드 → cf-pages push → 자산 200 + 버전 스탬프 단정.
- **왜 Edge 가 HTML 을 내보내나**: Storage 는 HTML 을 `text/plain`+`nosniff` 로 강제한다(태블릿에 **코드 원문**이 떴던 실측). 자산은 정상 타입이라 Storage 그대로.
- ★**자산 해시와 Edge 함수는 «짝»이다.** 빌드만 하고 함수를 재생성하지 않으면 **화면이 통째로 404**(08-14 `efe1e54` 가 그 직전). ⇒ 이제 **사람 기억이 아니라 배포 스크립트가 막는다**(어긋나면 업로드 **전** exit 1). 체크리스트로 옮기지 마라 — 실패의 자리만 옮긴다.
- **읽기 전용 진단(언제든) `bash scripts/verify-kiosk-live.sh`** — 빌드본↔함수 짝 · 3주소 번들 · 자산 도달. 쓰기 0.

### 라이브 주소 3개는 같은 것을 가리키지 않는다 (2026-08-17 실측)
| 주소 | 번들 | 내 최근 커밋 산출물 | 판정 |
|---|---|---|---|
| `…supabase.co/functions/v1/kiosk` | `index-CoenTfBs.js` (v8.11-3) | **있다**(「지금 확인이 안 됩니다」 등 1건씩) | **현행 진입점** |
| `thinkmap.pages.dev/thinkmap/membership/kiosk` | 동일 | 동일 | 현행 사본 |
| `jaehwan-lee-benja.github.io/thinkmap/membership/` | `index-XSLFf59W.js` | **0건**(대조축 옛 문구는 1건 → 도구 죽은 0 아님) | ⚠**살아 있는 구 주소** |

★**구 주소가 죽지 않고 옛 앱을 서빙한다.** ⇒ **«배포했다»가 URL 마다 다른 뜻이 된다.** 어느 표면을 봤는지 안 적으면 두 세션이 정반대 결론을 내고 **둘 다 맞다.** 실제로 08-17 에 그 일이 났다(구 주소를 보고 「미배포」 판정). **판정문에는 반드시 주소를 병기한다.** 기기 북마크가 어느 쪽인지는 **현장 확인 항목**(§6-1).

## 3. 기기 실측 정본
| 항목 | 값 |
|---|---|
| 기종 / OS·브라우저 | CS-273N(KICC 단말, Fully 1.61-play·PLUS 없음) / **Android 8.1 · WebView 126** |
| 화면 | **768x1024 세로** — 시각QA 1순위 |
| 스캐너 / 프린터 | Newland NLS-HR11 Plus(HID) / **키오스크 USB 유선 직결**(08-16) · 80mm |

★「Android 5.1.1 / Chrome 40」은 **폐기된 오가정**이다(두 번 빠졌다 — 설계 전제로, 그리고 주석에 사실처럼 남아 재도입 유발로). **ES5·구형 CSS 제약은 불필요.** legacy 빌드는 무해해 유지하되 **이걸 이유로 기능·CSS를 깎지 마라.**

## 4. 인쇄 — 현행 결론
- 경로 = RawBT 커스텀 스킴, **단일 진입점 `src/receipt/print.js`**. 정본 `docs/RECEIPT-PRINT-SPEC.md`.
- **웹 표준 인쇄는 이 기기에서 영구 불가**(Web Serial/USB/BT — Chromium 소스+BCD 확정). `docs/RECEIPT-PRINT-ALTERNATIVES.md`.
- ★**RawBT 는 단방향** — 성공·실패를 **원리적으로 감지 못 한다.** 그래서 문구는 「인쇄됨」이 아니라 **「요청했습니다 — 종이 확인」**이고, 입력 조건을 링버퍼에 남긴다(`printLog.js` 20건).
- 컷 방언 4종(`feed`/`full`/`partial`/`none`), 기기 설정은 «정본 기본값 + 명시 오버라이드»만 저장(`printerConfig.js`).
- **미해결 «하단 V»** = 컷 바이트가 안 먹혀 ASCII 로 인쇄된 것(0x56='V'). ★**누출 글자 수가 방언을 특정**한다(`feed`→`VB` 2자 · `full`/`partial`→`V` 1자) ⇒ 현장 1장 시험으로 판정. 대기.

## 5. 역할 URL·인증
기본 주소 + `?store=<룸id>`(미지정 시 `VITE_MEMBERSHIP_STORE`). 분기 `components/Kiosk/MembershipKiosk.jsx`(ticket 만 `main.jsx` 에서 인증 앞).

| URL | 화면 | 기기 | 인증 |
|---|---|---|---|
| (없음)/`?role=customer` | 셀프검색·가입·발권 | 키오스크 | 매장 계정 |
| `?role=staff` | 조회+스캔+리스트 **한 화면**·수기 토큰 | 직원 노트북 | 매장 계정 |
| `?role=scan` | 스캔→조회·회수·**인쇄** | 카운터(프린터 기기) | 매장 계정 |
| `?role=printer` | 발권 수신 자동 인쇄 | (USB 확정으로 사실상 미사용) | 매장 계정 |
| `?role=editor` | 템플릿·기기 설정·인쇄 로그 | 매장 계정 이상(마스터 전용 아님·G12) | 매장 계정 |
| `?role=ticket#<b64url>` | 실 CODE128 바코드 | **손님 폰** | ★**무인증** |

★ticket 무인증 근거(SPEC §5.1): 보는 사람이 고객이라 게이트 뒤면 **원리적으로 못 연다**. 안전한 이유 = **서버를 한 번도 안 부른다**(데이터가 프래그먼트에 자족적·프래그먼트는 전송 안 됨) ⇒ 「전 고객DB 노출·익명 조회 오라클」이 생기지 않는다. 회수는 직원 게이트 뒤 서버 판정. 수용 위협 = 위조 URL 의 «표시 사기»(재화 이득 경로 아님).

## 6. 미결 — 소유자별
**6-1 내 축**: ⑴**구 gh-pages 가 옛 앱 서빙**(§2 · 08-17 신규) — 폐기 안내 배포 or 북마크 실사, 기기 확인은 현장 ⑵프린터 설정 노출(직원 허브 `cut`/`scheme` 한 줄) = **파킹**(재개 지시 한 줄) ⑶D 시트 어휘·F 상태 기계화 = 보류 지지받음.
**6-2 orch 보유 정책 4**: G4 어제 티켓 · G8 종이 손님 감사화면 · G10' 가입폼 타이머 · G7 「1번호=1회원」.
**6-3 남의 축**: **crm** = POS 이력 없는 신규 가입자가 canonical 승격까지 조회 불가(셀프가입 직후 「회원 아님」 — 사업 영향 최대) · **현장** = 컷 1장 시험 · **orch** = 히스토리 재작성 잔여(reflog 가 원문 객체를 붙들어 옛 SHA 로 고객번호가 아직 읽힌다 + `thinkmap.pre-rewrite.git` 미러 처분이 한 세트).

## 7. 작업 규율
- **하드 게이트**: 배포·마이그·푸시는 유저 승인 없이 안 한다. **남이 받은 «유저 직접 발주»는 내 배포 승인이 아니다.** 게이트 직전까지 끝내고 대기.
- **DB DDL**: SQL 제시 → supabase-guardian → 유저 승인 → 소유 세션 적용. 회원 데이터는 **crm 소유**, 우리는 Edge 계약 소비자.
- ★**mailbox 편집은 `msg-edit.sh` 로만**(2026-08-20): `✅` 부착 = `sh ~/claude-project/warroom/msg-edit.sh mark <함파일> '<헤더 부분문자열>'` · 본문 추가 = `… append <함파일> <본문파일>`. **파이썬·에디터로 «전체 읽기→치환→전체 쓰기» 금지** — 여러 세션이 같은 함을 그렇게 만지면 **lost update** 로 **남의 `✅` 가 사라지거나 되살아난다**(08-18 실물 2건). 그 도구는 잠금·원자 교체·되읽기 확인을 강제한다.
- **보고** to-orch append(헤더는 `python3 ~/claude-project/scribe/tools/hdr.py` 로 찍고 끝에 `· 작성:` 줄) · 인박스 처리 후 `✅` · **전달은 복사하지 않는다**(「인박스 확인해」만) · 유저 결정 필요 시 **AskUserQuestion 금지**(to-orch 에 옵션+권고).
- **완료·마디 보고는 «4칸 양식»**(정본 `~/claude-project/msg/양식정본.md` §7 — 여기 베끼지 마라, 낡은 사본이 먼저 읽혀서 이긴다): **결과 / 검증(무엇으로 쟀나) / 개선 N·후퇴 N / 이탈**. ★**빈 칸은 지우지 말고 «해당 없음»·«미측정»으로 남긴다** — 칸을 지우면 다음 사람도 안 적고, 그러면 «위반 없음»과 «안 적었음»이 구별되지 않아 **진짜 위반을 원리적으로 못 잰다.**
- ★**회원님 카드는 직접 발행하지 않는다**(2026-08-18 규약): **도메인 → orch → conductor → 회원님**. 나는 «요지+사실»만 to-orch 에 올리고 문면은 scribe, 발행은 conductor 다. **낱장 금지**(기존 묶음 카드의 항목으로). 긴급 예외 = 즉시 위험 ∧ 지연이 위험을 키움 ∧ 되돌리기<지연, **셋 다** 맞을 때만이고 그때도 동시 통지.
- ★**부팅문서(`HANDOFF`·`CLAUDE.md`·기억)를 고친 턴에는 «백업 게이트»를 같은 턴에 올린다**(2026-08-19): 그 문서는 **다음 세션이 읽는 유일한 출처**인데 로컬 1부뿐이면 사고 한 번에 통째로 사라진다. ★단 **푸시는 유저 승인 게이트라 내가 밀지 않는다** — 같은 턴에 **요청까지** 끝내고 대기한다(승인 오면 `git push backup feat/membership-kiosk`, 끝 술어 = **되읽기**로 blob 일치 확인). 규율 둘이 충돌하지 않게 «푸시»가 아니라 «요청»을 의무로 둔다.
- **커밋 메시지에 고객 식별정보 금지**(08-11 히스토리 재작성의 원인 — 지우는 값이 지우기보다 비쌌다). `<uuid>`·「고객A」로.
- 배포 후 **시각QA**(768x1024: 팔레트·잘림·정렬·콘솔).

## 8. 반복된 함정 (전판 5 + 이번 4)
1. **렌더됨 ≠ 읽힘** — 손님 폰 바코드가 캔버스엔 그려졌지만 잘려 스캔 불가였다. canvas 374px 을 **측정해 놓고 가용 폭과 대조하지 않았다.** 통과 조건은 «실제 스캐너로 읽혔다».
2. **값 대신 물리 키코드** — 직원 PC 는 한글 IME 기본이라 스캐너 입력이 조합돼 깨진다(실측 `뮻-뮻1234`). `e.key` 아니라 **`e.code`**.
3. **폭·해상도는 실측** — 시뮬 3종에 없던 **768x1024** 가 실기기였고 그게 「버튼 잘림」의 원인.
4. **확인 못 하는 성공을 주장하지 마라** — 인쇄 경로는 throw 를 안 해 폴백이 죽은 코드였고 종이가 안 나와도 «인쇄됨»을 반환했다. 근거 없으면 «없다»가 아니라 **«공개돼 있지 않다»**.
5. **폐기된 전제가 주석에 남아 재도입을 부른다** — 전제가 뒤집히면 SPEC 만이 아니라 **주석·죽은 조건·샘플 파일**까지 지운다(이번 `.env.example`).
6. ★**«비교는 통과, 대상이 틀림»** — 하네스가 번호패드 `010` 프리필을 몰라 11자리를 다 눌러 **3장이 죄다 회원 카드를 찍었다.** 비교 자체는 성공했다. ⇒ **무엇을 비교했는지**를 먼저 의심한다. 같은 이유로 **가드는 스크립트 본문에서 뽑아 시험**한다(복사본 시험 금지). §2 의 «주소 병기»도 같은 뿌리다.
7. ★**가드는 «있는 것»이 아니라 «막는 것»이 증거** — 새 가드는 **일부러 어긋내 exit≠0** 을 확인한다. 배포 술어가 「판정 없음」을 통과로 착지시키던 것을 이 규율이 잡았다.
8. ★**통과가 증거가 아니면 실패도 증거가 아니다** — 모든 실패를 한 빨강 카드로 그리면 **서버 순단이 «가짜 쿠폰»처럼 보여 직원이 유효 참여권을 거부한다.** 실패는 **«다음 행동»**으로 가르고, 열거는 «거부» 쪽에 둬 **모르는 실패가 지연으로** 떨어지게 한다.
9. ★**「별개 커밋」 라운드에서 `git add -A` 금지** — 한 번 섞여 `reset --soft` 로 되돌렸다. 경로 명시 스테이징.
(보너스: 좁은 grep 술어는 **위음성**을 낸다 — 미니파이된 `orientation: portrait` 를 공백 있는 패턴으로 찾아 0건이 나온 적 있다.)

## 9. 재실행 가능한 도구 (경로 동반)
| 도구 | «사람 눈» 대신 판정하는 것 |
|---|---|
| `bash scripts/verify-kiosk-live.sh` | 빌드본↔Edge 짝 · 3주소 번들 · 자산 도달. **쓰기 0** |
| `node scripts/gen-kiosk-edge.mjs` | HTML→Edge 함수(같은 입력=같은 출력 ⇒ 해시로 변경 판정) |
| `tests/kiosk/receiptBytes.spec.js` | ESC/POS **바이트 계약**: 방언별 컷 1회·컷 뒤 0바이트·누출 글자 수 |
| `tests/kiosk/kioskCss.spec.js`+`cssRules.js` | **규칙 단위**(컨텍스트,셀렉터)→선언집합 대조 · 죽은 클래스 0 · 동적 클래스 «면제 이유» 생존 · 파서 자체 시험 4 |
| `tests/kiosk/scanFailureAxis.spec.js` | 현장 실패 문자열 10종 **주입** → 전부 «지연»으로 착지하는지 |
| `~/claude-project/scripts/deploy-kiosk.sh` | 배포 술어 + **Edge 짝 가드**(어긋나면 업로드 전 exit 1) |

## 부록 — 파일 지도
`apps/membership/src/`: `main.jsx`(ticket 분기) · `components/Kiosk/`(MembershipKiosk·CustomerView·StaffView·ScanView·PrinterView·TicketView·ReceiptEditor·MemberCard·**EventTicketCard**·**useTicketScan**·**ScanResultPanel**·useMembershipChannel·ticketLink·kioskUtils) · `api/membership.js`(단일 `callProxy`·LIVE 게이트) · `receipt/`(print·receiptTemplate·printerConfig·printLog)
SPEC: `docs/MEMBERSHIP-KIOSK-SPEC.md` · `docs/RECEIPT-PRINT-SPEC.md` · `docs/RECEIPT-PRINT-ALTERNATIVES.md` · `docs/KIOSK-FIELD-RUNBOOK.md`(기준일 08-04 — **주소 절이 낡음**) · `~/claude-project/docs/POPCORN-LOOP-SPEC.md`
북극성 정렬 `docs/NORTH-STAR-REACH-membership.md` · env 샘플 `.env.example` 9~15행
