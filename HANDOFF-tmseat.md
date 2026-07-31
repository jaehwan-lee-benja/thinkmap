# 🪑 tmseat 핸드오프 노트 (자리후/seat 워커 세션)

> **/clear 후 첫 턴에 이 파일 + `~/claude-project/CONDUCTOR.md` + `thinkmap-seat/CLAUDE.md` 를 읽고 재정렬한다.**
> 최종 갱신: 2026-07-31 (컨텍스트 95% 위생 절차, 지휘자 지시)

## 나의 정체·경계
- 나 = thinkmap **자리후(seat) 편집 워커** (코드네임 `tmseat`), worktree `~/claude-project/thinkmap-seat`, branch `feat/seat`.
- **편집만 한다.** git 커밋/머지/배포/마이그 적용 = **thinkmap 통합세션(tm통합)** 단일 창구 → `msg/to-thinkmap.md` 로 요청.
- 인박스 = `msg/to-tmseat.md` (처리 시 블록 아래 `> ✅ 처리(날짜, tmseat): …` 노트). 보고 = `msg/to-conductor.md`. 남의 인박스 블록엔 ✅ 붙이지 않는다.
- 마이그레이션은 **blind-apply 금지**: SQL 초안 → supabase-guardian 검수 → to-conductor에 올려 유저 승인 → tm통합 적용.
- 필수 문서: `docs/SEAT-SPEC.md`(정본). 디자인 예외는 SEAT-SPEC §12.1.

---

## 현재 상태 (2026-07-31 종료 시점)

**브랜치 `feat/seat`, HEAD = `39841df`. 아래 변경은 전부 미커밋 (tm통합 커밋 대기).**

```
 M apps/seat/src/components/Seat/Seat.css
 M apps/seat/src/components/Seat/SeatSystemPage.jsx
 M apps/seat/src/components/Seat/components/OrderRow.jsx
 M apps/seat/src/components/Seat/hooks/useSeatOrders.js
 M apps/seat/src/components/Seat/screens/GuideScreen.jsx
 M apps/seat/src/components/Seat/screens/ManagerScreen.jsx
 M apps/seat/src/components/Seat/screens/StationScreen.jsx
 M apps/seat/vite.config.js
 M docs/SEAT-SPEC.md
?? apps/seat/src/components/Seat/components/SettingsPanel.jsx
?? apps/seat/src/components/Seat/config/seatSettings.js
?? apps/seat/src/components/Seat/hooks/useSeatSettings.js
```

- **마이그레이션 없음.** 오늘 작업은 전부 프론트 + SPEC. DB 스키마 무변경.
- **`npm run build` 통과** (이 worktree에 이제 vite 설치됨 — 예전 "빌드 검증 불가" 제약 해소).
- SEAT-SPEC 갱신 완료(§9 화면명세, §10 R7, §11 카메라, §11.1 신설, §12 구조도, §12.1 방향/세로, §14 결정로그).

---

## 오늘 유저와 직접 결정한 사항 (전부 반영 완료)

### 1. 설정 패널 신설 — 확장 가능한 구조 (SEAT-SPEC §11.1)
- 유저 지시: "카메라 연동은 당장 필요 없으니 **설정 칸을 만들어** 여러 설정이 들어가게 하고, 그중 하나로 카메라 보기/끄기".
- 진입 = 상단 앱바 **우측 끝 '설정' 버튼** → 모달(스크림 클릭·Esc·닫기).
- 저장 = **기기별 localStorage** `seat.settings.v1`. (주방 태블릿마다 역할이 달라 기기 단위가 맞고 마이그 불필요.)
- ★**확장 규칙**: 새 설정은 `config/seatSettings.js` 의 `SEAT_SETTINGS` 배열에 **항목만 append**.
  `SettingsPanel.jsx` 는 그 배열만 보고 그리는 범용 렌더러 — UI 코드 손대지 않는다.
  새 `type` 도입 시에만 렌더 분기 추가. 저장값에 없는 키는 로드 시 기본값으로 채움(하위호환).
- 현재 항목: `cameraEnabled` (토글, **기본 off**).
- 카메라 off = **슬롯 자체를 렌더 안 함**(placeholder도 안 보임) → 스테이션 작업영역이 넓어진다.
  `LiveCameraFeed` 컴포넌트 자체는 무변경(순수 슬롯 경계 유지).

### 2. 시작 갈래(order_origin) 픽커 **완전 제거**
- 유저 지시: "자리안내 '+주문' 버튼 왼쪽 '실내' 부분은 전혀 필요 없어. 그 자체를 없애줘."
- `GuideScreen` 에서 select·`ORIGINS` 상수·`useState` 제거, `.seat-origin-picker` CSS 삭제.
- **결과 행동 변화(유저에게 고지함, 이의 없었음)**: 새 주문은 전부 DB 기본값 `dine_in`(실내) 생성 →
  **모든 주문이 자리후 전달 관문(R8)을 거친다.** 포장·야외 전환은 전달 후 **제조옵션**에서 기록(R9).
- order_origin 은 이제 **UI 어디에도 노출 없음**(열도 없고 픽커도 없음). 내부 로직·DB만.

### 3. "전체에게 전달" 버튼 **삭제** — 원칙 정정
- 유저 질문("이 버튼 뭐하는 거지?") → 조사 결과 `commitOrder(id,'all')` 은 `updated_at` 만 갱신하는 **no-op**.
  모든 필드 수정이 이미 Realtime 으로 즉시 전파되므로 누르나 안 누르나 동일.
- 유저 판단: "버튼 삭제해도 명시전달 원칙에서 벗어나지 않는다" → **맞다**. 원칙을 지탱하는 건
  **상태를 실제로 바꾸는 두 관문**: `seat_delivered`(자리후 전달 체크박스) · `raised`(올리기 전달).
- 삭제 범위: OrderRow 셀 / Guide·Manager 헤더 2곳 / `commitOrder` 의 `'all'` 분기 / CSS 3곳.
- **셀 수 = 10 → 9.** OrderRow·Guide헤더·Manager헤더 3곳 클래스 목록 동일함을 검증했다
  (`grep -o "seat-cell-[a-z]*" | sort -u` 3곳 비교).
- SPEC 에는 기존 A안 결정을 **지우지 않고 정정을 덧붙였다**(§9·§10 R7·§14) — "왜 A안인데 버튼이 없지?" 재발 방지.

### 4. 운용 기기·방향 확정 (SEAT-SPEC §12.1)
- 유저 확인: **제조매니저 = 태블릿 세로 주력** / **카이막·커피 = 가로·세로 둘 다** / 자리안내 = 넓은 화면 우선.

### 5. 제조매니저 **세로형 최적화** (핵심 진행 중 항목)
- 유저가 그린 방향(대화에서 3회 정정하며 확정된 최종형):
  - **테이블링·주문번호는 좌우로 나란히 놓고, 각각 두 줄 높이를 통째로 차지**(= "두줄 병합"은 *높이* 병합이라는 뜻).
  - 그 오른쪽에 **상태(위) / 자리후(아래)** 가 두 줄로 한 칸.
  - **나머지는 전부 오른쪽으로** 몬다.
- 현재 구현 (`Seat.css`, `@media (max-width:1023px)`, `.seat-screen-manager` 스코프):
```
┌────────┬────────┬────────┬────────┬────────┬───────┐
│        │        │  상태  │제조옵션│특이사항│ 확인  │
│테이블링│주문번호├────────┼────────┼────────┴───────┤
│ (2행)  │ (2행)  │ 자리후 │자리순서│ 올림 (2칸 span) │
└────────┴────────┴────────┴────────┴────────────────┘
```
- ★**DOM 은 절대 건드리지 않았다** — CSS Grid `grid-template-areas` 배치만. 이유: OrderRow 는 Guide/Manager 공용이라
  셀 순서를 바꾸면 헤더 2곳까지 3곳 동기화 함정에 걸린다. **세로 대응은 앞으로도 CSS 배치만으로.**
- 세로에선 **헤더 행 숨김**(2줄 카드는 한 줄 헤더와 정렬 불가). 각 셀은 값·placeholder 로 자명.
- 좌측 4셀(테이블링·주문번호·상태·자리후)이 기존 '자리후 단계' 색 밴드 그룹과 정확히 일치 → 밴드 규칙 재사용,
  마디 경계선만 상태 셀 오른쪽으로 이동.

---

## 미완 / 다음 재개 지점

1. **★세로형 우측 배치 다듬기 (바로 이어서 할 일).**
   유저가 "일단 왼쪽 먼저 정리하자, 아마 오른쪽도 변경이 좀 있을 거야"라고 명시했다.
   왼쪽(테이블링/주문번호/상태/자리후)은 확정. **우측(제조옵션·특이사항·확인 / 자리순서·올림) 배치는 유저 피드백 대기 중.**
   768px 에서 특이사항 input 폭(~150px)·올림 3버튼 한 줄 여부를 실제 세로 화면에서 확인받아야 한다.
2. **세로 실화면 검증 미수행** — 코드/빌드만 통과. 유저 태블릿(또는 창 폭 1023px 이하)에서 육안 확인 필요.
   특히 헤더 숨김이 괜찮은지(칸별 라벨 필요 여부)를 유저에게 물어둔 상태 — 답 대기 중.
3. **카이막·커피 세로 대응 미착수** — 가로·세로 둘 다 쓴다고 확인됨. 현재 3분할은 `min-width:1024px` 에서만 3열,
   세로에선 세로 적층. 카메라 off 기본값이면 세로에서도 작업영역은 확보되지만 별도 최적화는 아직 안 했다.
4. **SEAT-SPEC §14 기존 미해결(이월)** — 제조옵션만 체크·미올림 주문이 Manager/Station "대기중"·"올림" 양쪽에서 누락
   (`isWaitingOrder` vs `isRaisedOrder` 틈). 정책 결정 필요. order_origin 픽커 제거로 전 주문이 dine_in 이 되었으니 **재검토 가치 커짐**.
5. **카메라 `streamUrl` 저장 위치**(env vs Supabase config) 미결 — 하드웨어 입고 후.
6. **Roboto self-host** — 현재 시스템 폰트스택 우선. 후속 개선 여지.

---

## 로컬 개발 환경 (오늘 새로 세팅 — 다음 세션에서 재사용)

- **worktree 에 의존성 설치됨** (`npm install` 완료). `apps/seat` 에서 `npm run dev` / `npm run build` 둘 다 동작.
- **dev 서버 = 포트 5177**, base `/thinkmap/seat/`.
  - 맥: `http://localhost:5177/thinkmap/seat/`
  - 같은 와이파이 기기: **`http://mac-mini.local:5177/thinkmap/seat/`**
- **`.env` 를 메인 repo(`~/claude-project/thinkmap/.env`)에서 복사해 넣었다.** worktree 는 gitignore 파일을 안 가져오므로
  새 worktree마다 필요. `.gitignore` 14행이 `.env` 라 커밋 위험 없음.
- **`vite.config.js` 에 `allowedHosts: ['.local']` 추가** (dev 전용, 빌드·배포 무영향). 이유는 아래.
- ★**Supabase Auth 리디렉트 허용목록은 "숫자 IP 호스트"를 매칭하지 못한다**(오늘 로그로 실증).
  `http://192.168.0.6:5177/...` 도, 기존에 있던 `http://172.30.1.x:5173/**` 도 전부 거부 → Site URL(`localhost:5173`)로 폴백.
  `localhost` / `*.github.io` / `*.local` 같은 **이름 호스트는 정상 통과.**
  → **LAN 테스트는 IP 대신 반드시 mDNS 이름(`mac-mini.local`)으로.**
  유저가 대시보드에 `http://localhost:5177/thinkmap/seat/**`, `http://mac-mini.local:5177/thinkmap/seat/**` 추가 완료(로그인 확인됨).
  진단 기법: `mcp__claude_ai_Supabase__get_logs(service:'auth')` 의 `referer` 필드가 곧 "수락된 redirect_to" —
  거부되면 Site URL 이 찍힌다. `/auth/v1/authorize` 응답의 `sb-request-id` 로 개별 probe 를 매칭할 수 있다.
- 배포본(별개, 오늘 변경 미반영): `https://jaehwan-lee-benja.github.io/thinkmap/seat/`
- 유저 Gmail 임시보관함에 로컬 주소 안내 초안 넣어둠(제목 "자리후 로컬 개발 주소 (같은 와이파이)"). 발송은 안 함.
- ⚠️ Supabase 대시보드 경고: **조직 quota 초과 — 2026-08-29 부터 프로젝트 제한** 예고. 유저에게 고지함, 미조치.

---

## 반복해서 부딪힌 함정 (재발 방지)

- **OrderRow 는 Guide/Manager 공용** → 셀 순서·컬럼을 바꾸면 **두 화면 헤더 2곳도 함께** 수정. 변경 후
  `grep -o "seat-cell-[a-z]*" | sort -u` 3곳 비교로 검증. **현재 9열.**
- 세로 대응은 **CSS Grid 배치만** — DOM 재배열 금지(위 함정 직결).
- seat 위성은 Material 3 예외(§12.1) → **design-guardian 비적용**.
- `--md-*` 토큰은 `.seat-app`/`.pv-center` 스코프만 — `@thinkmap/core` 로 누수 금지.
- 훅(inbox) 오발화: 내 ✅ 기록 자체가 다음 턴 훅을 한 번 트리거할 수 있음(정상).
