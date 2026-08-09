# 자리후 구조 인벤토리 (리팩토링 라운드 ⑴) — 2026-08-09

> 발주: 유저 「자리후 관련 리팩토링 쭉 하자」 → 지휘부 5축 라운드. **이 문서는 ⑴ 인벤토리 단계 결과**다.
> 수렴(실제 리팩토링)은 지휘부 승인 후. 원칙 = **기능 변경 0**(동작 동일).
>
> 측정 기준: `apps/seat/src` 전수, 2026-08-09 HEAD `b569e4d`. 숫자는 전부 실측이다(추정 아님).

## 0. 한눈에

| 축 | 상태 | 규모 | 위험 |
|---|---|---|---|
| ⑴ 모달 문법 **7벌** | ★심각 — 이미 갈라짐(Esc 6곳 누락) | OrderRow 130줄 | **낮음**(순수 표현) |
| ⑵ `raised`↔`seat_status` **11곳 수기 동기** | ★심각 — 데이터 무결성 축 | 11 지점 | **중간**(쓰기 경로) |
| ⑵ 행 상태 인라인 재유도 | 심각 — `seatRules` 우회 133회 | OrderRow 607줄 | 중간 |
| ⑶ sticky/스크롤포트 규칙 | 문서만 있고 코드 강제 없음 | 신규 유틸 | 낮음 |
| ⑷ 죽은 코드 | 확정 13 CSS 클래스 + 규칙 3개 | ~60줄 삭제 | **없음** |
| ⑸ 회귀 가드 | **부재** — 대조군 리터럴 정본 없음 | SPEC 추가 | 없음 |

**총평**: 큰 것 하나(OrderRow 607줄)와 작고 확실한 것 여럿이다. 위험은 ⑵의 쓰기 경로에만 몰려 있고
나머지는 «지우거나 합치면 끝»이다. **⑷⑸⑴ → ⑶ → ⑵ 순으로 가면 위험이 뒤로 몰린다**(앞이 안전빵, 뒤가 신중).

---

## ⑴ 구조 인벤토리 — 「같은 것을 그리는 코드가 몇 벌인가」

### 1-A. 확인 모달 = **7벌** ★가장 확실한 수렴 대상

| 위치 | 문법 | Esc | X 닫기 | 취소 버튼 |
|---|---|---|---|---|
| `SeatModal.jsx` (공용, 4곳이 사용) | 컴포넌트 | ✅ | (닫기 버튼) | — |
| `OrderRow.jsx:479` 주문번호 수정 | 손수 | ❌ | ❌ | ✅ |
| `OrderRow.jsx:493` 완료 처리 | 손수 | ❌ | ✅ | ❌ |
| `OrderRow.jsx:520` 포장도고려 전달 | 손수 | ❌ | ❌ | ✅ |
| `OrderRow.jsx:548` 줄 삭제 | 손수 | ❌ | ❌ | ✅ |
| `OrderRow.jsx:570` 올리기 전달 취소 | 손수 | ❌ | ❌ | ❌ |
| `OrderRow.jsx:594` 자리순서 리셋 | 손수 | ❌ | ❌ | ✅ |
| `SeatNumpad.jsx:82` 숫자 키패드 | 또 다른 손수(`seat-numpad-scrim`) | ✅ | (닫기) | — |

★**이미 갈라졌다는 증거**: 2026-08-08 유저 지시로 «X 닫기»를 넣은 건 **완료 처리 하나뿐**이고,
나머지 5개는 아직 [취소] 문법이다. Esc 는 손수 6벌 **전부 없다**(공용 `SeatModal` 에만 있다).
= 「두 벌이 되면 한쪽이 낡는다」가 이미 일어났고, 다음 지시가 오면 또 한쪽만 고쳐진다.

**수렴안**: `SeatConfirm`(제목·설명·액션 slot·X 닫기·Esc·스크림) 1벌 → 6곳 교체. 표현만 바뀌고 동작 동일.
예상: OrderRow **-130줄**, 모달 동작 6곳 균일화.

### 1-B. 로컬 초안 + 디바운스 저장 = **2벌 (구조 동일)**

- `SeatTextField.jsx` — draft state / 450ms 디바운스 / blur·Enter·언마운트 flush / IME 보호
- `SeatNumpad.jsx` — draft state / 300ms 디바운스 / 닫기·Esc·Enter·언마운트 flush

둘 다 「타이핑 잘림」 수정(2026-08-08)에서 **같은 병을 같은 처방으로** 고친 것이라 뼈대가 같다.
`useDraftValue(value, commit, {delay})` 훅 1벌로 뽑을 수 있다. ※IME·키패드 특수 사정은 각자 남긴다.

### 1-C. 디바운스 저장/리페치 산재 = **12 타이머**

- refetch 250ms 디바운스: `useSeatOrders.js:61` · `useStationStatus.js:56` (**동일 코드 2벌**)
- localStorage 지연 저장: `useStationOrder.js:54` · `useColumnWidths.js:69` (**동일 패턴 2벌**)
- 그 외 토스트 3.5s, 되돌리기 10s, 액자 12s, 포커스 0ms, 축하 효과

**수렴안**: `useDebouncedEffect` 또는 `useDebouncedWriter` 1벌. 우선순위는 낮다(각각은 작다).

### 1-D. localStorage 키 레지스트리 이탈

`config/seatSettings.js` 가 키 레지스트리인데(`seat.settings.v1`·`seat.colwidths.v2`),
`TablingPane.jsx` 가 자기 키 2개(`seat.tablingPane.ratio.v1`·`.zoom.v1`)를 **파일 안에 직접** 들고 있다.
→ 키 목록을 한 곳에서 볼 수 없다(초기화·마이그레이션 때 새는 자리).

### 1-E. sticky 레이어 = 3층 + z-index 13종

| 레이어 | 규칙 | z |
|---|---|---|
| `.seat-tabs` | `top: 0` | 4 |
| `.seat-row-head` | `top: var(--seat-tabs-h)` | 3 |
| `.seat-toolbar-below` | `bottom: 0` | 4 |

z-index 실측: `2,2,3,4,4,5,10,30,60,70,1000,1400,2000` — **척도가 없다**(1000=앱 루트, 1400=스탬프,
2000=모달, 나머지는 즉흥). 새 레이어를 얹을 때마다 «얼마를 줘야 안전한가»를 매번 다시 판단해야 한다.

---

## ⑵ 상태 모델 — 「boolean 산개인가, 상태 기계인가」

### 2-A. `raised` ↔ `seat_status` = **같은 사실의 두 표현** ★위험 축

`seat_status ∈ {pending, raised, canceled}` 와 `raised boolean` 이 **같은 것을 두 번 적는다**.
둘을 손으로 맞추는 지점 **11곳**:

```
OrderRow.jsx  70, 82, 94, 108, 127, 146, 246, 381, 449   (9곳)
useSeatOrders.js:152 · useDemoSeat.js:28                  (2곳)
```

★한 곳이라도 빠뜨리면 «올림인데 pending» 같은 유령 상태가 만들어지고, 스테이션 목록(`isRaisedOrder`)과
통계(`seatStats`)가 서로 다른 답을 낸다. **지금은 우연히 맞아 있을 뿐 구조가 보장하지 않는다.**

**수렴안(기능 변경 0)**: 쓰기 전용 헬퍼 `raisePatch(order, on, method)` / `cancelPatch()` / `restorePatch()`
를 `seatRules.js` 에 두고 11곳이 그것만 부른다. **컬럼은 그대로 둔다**(DB 마이그 없음 = 위험 0).
그 다음 라운드에서 «seat_status 를 파생값으로 강등」을 별건으로 검토.

### 2-B. 제조옵션 3 boolean = 실제로는 단일 선택

`opt_outdoor` / `opt_takeout` / `opt_outdoor_parallel` 은 **UI 가 이미 단일 드롭다운**이고
(`optValue`/`setOpt` 가 매핑), 리셋할 때마다 셋을 한꺼번에 false 로 쓴다(2곳).
→ `optOf(order)` / `optPatch(v)` 로 감싸면 «셋 중 둘이 켜진» 상태를 코드가 못 만든다.

★이번 주 신호: 3색 버튼에서 «야외병행이 데이터 어느 값이냐»를 **데이터 모델에서 판정해야 했던** 그 모호함이
바로 이 산개 때문이다. 파생 술어(`isParallel`)가 없어서 매번 raw 컬럼을 다시 읽는다.

### 2-C. `seatRules.js` 우회 — 규칙집이 있는데 안 쓴다

- `OrderRow.jsx` 의 상태 컬럼 **직접 참조 133회** (다음이 demoData 49, seatRules 32)
- `seatRules.js` **export 16개 중 3개가 소비처 0**: `isSeatWaiting`(R1 정본!) · `isArchived`(R12 정본) · `hasManufactureOption`
- 대신 같은 판정을 인라인으로 다시 쓴다:
  `SeatOrderScreen.jsx:34-35` `!o.archived_at` (= `isArchived`) / `OrderRow.jsx:578` `opt_takeout || opt_outdoor || opt_outdoor_parallel` (= `hasManufactureOption`)

→ **규칙집이 «참고 문서」로 전락**했다. 규칙을 고쳐도 인라인 사본은 안 따라온다.

### 2-D. 「끝」을 뜻하는 3축 (설계는 옳다, 검증이 없다)

`deleted_at`(삭제) / `seat_status='canceled'`(대기 취소) / `archived_at`(안내 완료) — SPEC §10 R12 가
의도적으로 분리한 것이고 **이건 유지가 맞다**. 다만 조합 검증이 없어 «취소인데 안 아카이브» 같은 중간 상태가
코드로 만들어질 수 있다(현재 UI 는 취소 시 둘을 함께 쓰지만, 그 보장은 한 줄짜리 관습이다).

---

## ⑶ CSS 구조 — sticky 함정 3회의 뿌리

이번 주 sticky 결함 **3연속**(탭바 위치·표 헤더 죽음·툴바)의 원인은 전부 **같은 종류**였다:

1. 스크롤포트(`.seat-main`)에 **패딩**이 있어 sticky 기준점이 밀림
2. 조상 `.seat-table` 의 **`overflow: hidden`** 이 새 스크롤포트를 만들어 자손 sticky 를 재기준화
3. 태블링 액자를 스크롤포트 **안**에 넣을 뻔함(선제 회피)

지금 방어는 **주석과 SPEC 문장뿐**이다. 코드가 강제하는 건 없다.

**수렴안**:
- `.seat-scrollport` 유틸 클래스 1개로 스크롤포트를 **명시**(패딩 금지·overscroll contain 포함),
  `.seat-main` 이 그것을 쓴다. 「스크롤포트는 이 클래스뿐」이 규칙이 된다.
- sticky 오프셋을 토큰화(`--seat-tabs-h` 는 이미 있음) — 새 sticky 층은 토큰만 더한다.
- z-index 척도 상수화(`--z-sticky: 4` / `--z-overlay: 1400` / `--z-modal: 2000` …). 13종 즉흥값 정리.
- ★**개발용 가드**(dev 전용, 프로덕션 무영향): `.seat-main` 조상에 `overflow ≠ visible` 인 상자가 생기면
  콘솔 경고. 이번 주 3회를 **다음에는 5초 만에** 잡는다.

---

## ⑷ 죽은 코드 — 확정분 (삭제만, 위험 0)

**미사용 CSS 클래스 13개** (jsx 참조 0, 동적 조립 불가 확인):

```
seat-raised-card / seat-raised-list / seat-raised-no / seat-raised-note   (구 올림 리스트, 카드 UI로 대체)
seat-screen-grid / seat-col-main / seat-col-side                          (구 2열 레이아웃)
seat-status-btn (5줄) / seat-toggle (14줄)                                (구 상단바 현황 버튼·토글)
seat-done-chip / seat-numpad-toggle / seat-toolbar-above / seat-panel-hint
```

→ 규칙 본문 포함 **약 60줄**. `Seat.css` 1674줄 중 ~3.6%.

**기타**:
- `menu_out` — UI 제거(2026-07-31) 후 `demoData.js:21` 에만 남음. **컬럼은 DB 존치가 맞고**(SPEC R5),
  데모 기본값도 정합상 유지가 맞다. → **손대지 않는다**(기록 목적으로만 적음).
- `seatRules` 미사용 export 3개 — 지우는 게 아니라 **소비처를 만드는 게** 정답이다(⑵-C).

---

## ⑸ 회귀 가드 — 현재 **부재**

- SPEC §15 체크리스트 12항 중 **sticky/스크롤포트 항목 없음** — 이번 주 3연속 결함의 축이 빠져 있다.
- 배포 검증용 **대조군 리터럴 세트가 정본화되어 있지 않다**. 지금은 매 배포마다 즉석으로 고른다
  (그 과정에서 실제로 틀렸다: 「`대기열로` 는 신규 리터럴」— 아니었음 / 「JS 해시 불변」— vite 는 참조 CSS 를
  청크 해시에 반영 / 「`--seat-tabs-h` 구1→신4」— 실제 신2).
- 자동 테스트 **0**. `vitest` 는 레포에 있으나 seat 위성에 테스트 파일이 없다.

**수렴안**:
- SPEC §15 에 sticky 4항 추가(스크롤포트는 하나인가 / 패딩 0인가 / 조상 overflow 는 clip 인가 / 새 sticky 층은 토큰을 더했는가).
- SPEC 에 **배포 검증 대조군** 절 신설 — 「이 리터럴이 새 번들에 있으면 반영된 것」의 정본 목록 + 채취 방법(구 번들에서 0 인 것만 쓴다).
- `seatRules.js` 순수 함수에 **vitest 단위 테스트**(R1~R12 판정표). 순수 함수라 비용이 거의 없고,
  ⑵ 수렴의 **안전망**이 된다 → **⑵보다 먼저 깔아야 한다.**

---

## 권고 순서 (위험 오름차순)

| 단계 | 내용 | 위험 | 되돌리기 |
|---|---|---|---|
| **A** | ⑷ 죽은 CSS 60줄 삭제 + ⑸ SPEC §15 sticky 4항·대조군 절 | 없음 | 커밋 되돌리기 |
| **B** | ⑸ `seatRules` 단위 테스트(R1~R12 판정표) | 없음 | — |
| **C** | ⑴ `SeatConfirm` 1벌 → 6곳 교체 (+Esc·X 균일화) | 낮음 | 표현만 |
| **D** | ⑶ `.seat-scrollport` 유틸 + z 척도 + dev 가드 | 낮음 | CSS |
| **E** | ⑵ 쓰기 헬퍼(`raisePatch`/`optPatch`) → 11곳 + 3곳 치환 | **중간** | B 의 테스트가 받쳐줌 |
| **F** | ⑵ `OrderRow` 셀 단위 분해(607줄 → 셀 컴포넌트) | **중간** | DOM 순서 고정 유지 필요 |

★**E·F 는 B(테스트) 없이 하지 않는다.** 자리후는 실영업 중이고, 쓰기 경로 회귀는 주방에서 바로 사고가 된다.
★F 는 열/DOM 순서를 절대 바꾸지 않는다(SPEC §15 «표에 열 추가 시 4곳 동기화» 함정과 같은 자리).
