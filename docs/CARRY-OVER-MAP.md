# 이월(Carry-Over) 시스템 한눈에 보기

> 작성일: 2026-04-23
> 목적: 업무일지 이월 동작 전체를 도식화하여 기능 개선의 기준점 제공
> 관련: [WORKLOG-SPEC.md §4](./WORKLOG-SPEC.md)

---

## 1. 핵심 요약 한 장

```
                         어제로        오늘 ↔       내일로
                         (←이월)       (현재)       (→이월)
 ─────────────────────────────────────────────────────────
 미완료 투두              ✗            N/A          ✓
 완료 투두(하위 미완료)    ✗            N/A          ✓  완료유지
 완료 투두(전부완료)      ✗            N/A          ✗
 pinned 섹션(h2)          ✗            N/A          ✓  섹션째로
 pinned 블록(일반 텍스트)  ✗            N/A          ✓
 일반 토글/텍스트          ✗            N/A          ✗
 고정 섹션 4종             N/A          매일 자동    (템플릿 시드)
 _dismissed 블록           N/A          N/A          ✗  재이월 차단
 visibility 'master'       속성 유지    속성 유지    속성 유지
 visibility 'all'          속성 유지    속성 유지    속성 유지
```

**핵심 원칙**:
- 이월은 **단방향**: 과거 → 미래만. 과거로 되돌리는 경로는 없음.
- 이월은 **deep clone**: 원본에 영향 없는 독립 사본.
- **사용자 의도** 존중: 이월본을 삭제하면 다시 이월되지 않음 (_dismissed).

---

## 2. 시간 축 모식도

```
      ─────▶ 시간 ─────▶

   어제(-1)         오늘(0)         내일(+1)
   ────────        ────────        ────────
    todo A          todo A'         todo A''
    blockId:abc     originId:abc    originId:abc
    isCarry:false   isCarry:true    isCarry:true
    ✓ 원본          └─ 이월본       └─ 재이월본
                        │               │
                        │               ▼
                        │         ※ originBlockId 는 항상
                        │           "최초 원본(abc)" 가리킴
                        │           → 체인 무한 증식 방지
                        ▼
                    carryOverFrom: "어제 날짜"

   이월 원본 날짜(carryOverFrom)는 [이월 04/22] 배지로 표시
```

---

## 3. 무엇이 이월되나? (판정 로직)

`extractCarryOverBlocks` 기준 (`src/utils/worklogUtils.js:27`):

```
어제 페이지의 각 h2 섹션을 스캔하면서 ↓

for (child of h2.content):
  │
  ├─ isTodo && !todoChecked
  │    → "미완료 투두" 로 이월 (하위 블록 전체 포함)
  │
  ├─ isTodo && todoChecked && 하위에 미완료 존재
  │    → "완료이나 하위가 남음" 으로 이월 (완료 상태 유지)
  │
  ├─ isPinned && !isTodo
  │    → "pinned 텍스트 블록" 으로 이월
  │
  └─ blockType === 'h3' (하위 섹션)
       → 재귀 탐색 (당일 이슈 등 하위 섹션 내부도 포함)
```

**h2 섹션 자체의 이월**은 별도로 `extractCarryOverData` 가 처리:
- `isPinned === true` 인 h2 섹션 전체(구조)가 내일 페이지에 복사됨
- 해당 섹션 안의 미완료/pinned 블록들은 위 로직으로 함께 이월

---

## 4. 이월 트리거 (언제 실행되나)

```
┌──────────────────────────────────┬────────────────────────────────┐
│ 트리거                            │ 동작                            │
├──────────────────────────────────┼────────────────────────────────┤
│ 새 daily 페이지 생성               │ Eager — 어제 전체 이월 삽입     │
│ (캘린더 "+" / "오늘" / → 버튼)     │ buildDailyPageTemplate()       │
├──────────────────────────────────┼────────────────────────────────┤
│ 기존 daily 페이지 열기             │ Lazy — 신규 미이월만 삽입       │
│ (페이지 전환, 브라우저 탭 복귀)    │ syncCarryOver()                │
├──────────────────────────────────┼────────────────────────────────┤
│ 이월본 todo 체크/해제              │ Thread — 90일 이내 모든        │
│ (같은 originBlockId 공유)          │ 이월본 자동 동기화              │
│                                  │ syncBlockAcrossPages()         │
├──────────────────────────────────┼────────────────────────────────┤
│ 이월본 삭제                        │ _dismissed 리스트 추가         │
│ (휴지통/Backspace/드래그/멀티선택)  │ → 재이월 차단                  │
│                                  │ block-dismissed 이벤트          │
└──────────────────────────────────┴────────────────────────────────┘
```

**설계 원칙**: 모든 트리거는 `loadContent()` 단일 진입점을 통과.

---

## 5. 섹션 타입 × 이월 채널

세 종류의 섹션이 **서로 다른 경로로** 유지됩니다:

```
┌──────────────┬──────────────────────────────┬───────────────────────┐
│ 유형          │ 식별                          │ 이월/유지 경로          │
├──────────────┼──────────────────────────────┼───────────────────────┤
│ 고정 섹션     │ section_type='fixed'          │ worklog_sections 테이블│
│ (기본 4종)    │ id: fixed_todo, fixed_notice, │ → 매 daily 생성 시     │
│              │    fixed_wrapup,              │ 템플릿에서 자동 시드    │
│              │    fixed_daily_issue          │                       │
│              │ worklog_sections 행 존재       │                       │
├──────────────┼──────────────────────────────┼───────────────────────┤
│ 사용자        │ attrs.isPinned === true       │ 어제 content_tiptap   │
│ pinned 섹션   │ sectionId: 'sec_xxxxxxxx'     │ 에서 추출 → 내일 페이지│
│              │ (worklog_sections 테이블엔     │ content_tiptap 에     │
│              │  저장 안 됨)                   │ 복사                  │
├──────────────┼──────────────────────────────┼───────────────────────┤
│ 임시 섹션     │ attrs.isPinned === false      │ 이월 안 됨             │
│              │ (사용자가 추가만 하고 핀 안 함)│ 오늘 페이지에만 존재    │
└──────────────┴──────────────────────────────┴───────────────────────┘
```

---

## 6. 권한(visibility) × 이월

```
visibility ='all'
 ├─ 모든 계정이 열람·편집 가능
 ├─ 이월 시 속성 그대로 복사
 └─ 다음 날에도 'all'

visibility ='master'
 ├─ master 계정만 보임 (비관리자는 load 시 필터)
 ├─ 비관리자 저장 시에도 master 섹션 보존 (merge 로직)
 ├─ 이월 시 속성 그대로 복사 (master 유지)
 ├─ fixed 섹션이면 → worklog_sections 테이블에 저장되어 매일 재현
 └─ pinned 섹션이면 → content_tiptap 에만 저장, 어제→오늘→내일 계승
```

**저장 경로 분리**:
- **fixed + master**: `worklog_sections.visibility='master'` (테이블)
- **pinned + master**: 각 daily 페이지의 `content_tiptap` 안 h2 attrs.visibility='master'

---

## 7. 실전 시나리오 타임라인

### 시나리오 A — 미완료 투두 연쇄 이월
```
04/21  todo: "구매 요청"          ← 원본 작성, 미완료
04/22  [이월 04/21] "구매 요청"    ← Eager 이월본1 생성
04/23  [이월 04/21] "구매 요청"    ← Eager 이월본2 생성 (originBlockId = 원본)
04/24  (사용자가 04/23에서 체크)    ← Thread 동기화로 04/21~04/24 전부 ✓
```

### 시나리오 B — master pinned 섹션 연쇄
```
04/23  "새 섹션" 추가 + 🔒(master) + 📌(pin)   ← 오늘 페이지에만
04/24  → 버튼으로 내일 생성                     ← pinned 섹션 이월 → 내일 페이지에 동일 섹션
04/25  생성 시                                  ← 04/24의 pinned 섹션 이월 → 계승
```

### 시나리오 C — 이월본 삭제 후 재이월 차단
```
04/22  "구매 요청" 체크 안 함                   ← 미완료
04/23  [이월 04/22] "구매 요청"                 ← 이월됨
      사용자가 삭제                              ← _dismissed 추가
04/23  페이지 다시 열기                          ← Lazy 이월 실행하지만 _dismissed 에 있어서 재삽입 안 됨
04/24  내일 페이지 생성                         ← 04/23 _dismissed 그대로 계승, 재이월 차단
```

---

## 8. 데이터 속성 사전

| 속성               | 의미                                         | 어디에 저장 |
|------------------|------------------------------------------|----------|
| `blockId`         | 블록 고유 ID (`blk_` prefix)                | 토글 attrs |
| `originBlockId`   | 이 이월본의 **최초** 원본 blockId            | 토글 attrs |
| `isCarryOver`     | 이 블록이 이월본인지                          | 토글 attrs |
| `carryOverFrom`   | 어느 날짜에서 이월됐는지 (YYYY-MM-DD)        | 토글 attrs |
| `isPinned`        | 이 블록/섹션을 다음 날로 유지할지             | 토글 attrs |
| `isTodo`          | 체크박스 todo 인지                            | 토글 attrs |
| `todoChecked`     | todo 완료 여부                                | 토글 attrs |
| `visibility`      | 'all' / 'master' (권한)                     | 토글 attrs + worklog_sections |
| `sectionId`       | 섹션 식별자 (fixed_todo, sec_xxxxxxxx)      | 토글 attrs |
| `section_type`    | 'fixed' / 'pinned'                          | worklog_sections 행 |
| `is_default`      | 매 daily 생성 시 자동 포함 여부               | worklog_sections 행 |
| `_dismissed`      | 사용자가 삭제한 blockId / originBlockId 배열  | content_tiptap 루트 |

---

## 9. 현재 제약 / 알려진 엣지케이스

- **이월 방향은 forward-only**: 과거로 끌어오는 기능 없음
- **중복 감지는 같은 섹션 내**: 같은 텍스트가 다른 섹션에 있으면 중복 마킹 안 됨
- **_dismissed 는 영구**: 한 번 삭제하면 다음 날 이후로도 재이월 안 됨 (의도된 동작)
- **legacy 블록**: blockId 없는 과거 페이지는 최초 Lazy 이월 시 backfill 실행
- **Thread 동기화 범위**: 최근 90일(`CARRY_OVER_SYNC_WINDOW_DAYS`) 내
- **pinned 섹션의 visibility 계승**: content_tiptap → content_tiptap 경로로만 유지되므로, pinned 섹션이 없는 하루가 중간에 끼면 그 이후로 이월 체인이 끊김

---

## 10. 향후 개선 후보 (논의용)

### 기능 확장
- [ ] **과거 방향 당겨오기**: "어제 할 일 불러오기" 수동 버튼
- [ ] **이월 취소/복원 UI**: _dismissed 된 항목 다시 살리기
- [ ] **이월 범위 필터**: "오늘은 할 일 섹션만 이월" 옵션
- [ ] **주/월 단위 이월**: 매주 월요일 시작, 매월 1일 시작
- [ ] **이월 대시보드**: 이월 누적일수·완료율 통계

### 신뢰성
- [ ] **pinned 섹션 중앙 저장**: `worklog_sections` 에 pinned 행도 유지 → 연속성 끊겨도 복구 가능
- [ ] **이월 내역 로그**: 언제 어떤 블록이 어디서 왔는지 감사 추적
- [ ] **_dismissed 만료 정책**: N일 지나면 자동 소거 (또는 수동 관리 UI)

### UX
- [ ] **이월 표시 시각화 강화**: 연쇄 이월 시 최초 원본 날짜 시각적 강조
- [ ] **이월본-원본 네비게이션**: 이월본 클릭 시 원본 위치로 점프
- [ ] **반복 이월 경고**: N일 이상 이월된 항목 "묵은 할일" 태그
- [ ] **master-pin 동시 설정 단축**: 자물쇠+핀을 한 번에 적용하는 버튼

### 권한
- [ ] **섹션별 편집 권한**: 보기만 허용 / 편집 허용 세분화
- [ ] **특정 계정 한정 섹션**: master/all 외에 user-group 지정
- [ ] **감사 로그**: 누가 언제 어떤 섹션을 수정했는지

---

## 11. 관련 파일·진입점

| 파일 | 역할 |
|------|------|
| `src/utils/worklogUtils.js` | `extractCarryOverData`, `buildDailyPageTemplate` |
| `src/utils/worklogTemplate.js` | `createWorklogTemplate`, `toCarryOverNode` |
| `src/utils/carryOverPipeline.js` | Eager/Lazy 공용 파이프라인 |
| `src/utils/sectionUtils.js` | h2/h3 식별, 섹션 그룹핑/삽입 |
| `src/utils/blockId.js` | blockId 생성 단일 진입점 |
| `src/components/TipTapEditor/TipTapTestPage.jsx` | `syncCarryOver`, `loadContent`, `saveImmediately` |
| `src/components/TipTapEditor/extensions/ToggleExtension.js` | `carryOverDismissTracker`, `syncBlockAcrossPages` |
| `src/utils/dateUtils.js` | `dailyPageName`, `nextDateKey`, `prevDateKey`, `shiftDateKey` |
| `migrate-worklog-sections.sql` | worklog_sections 정의 + 시드 + RLS |
| `migrate-worklog-sections-master-update.sql` | master UPDATE 정책 |
| `migrate-daily-page-unique.sql` | (parent_id, page_date) UNIQUE 인덱스 |
