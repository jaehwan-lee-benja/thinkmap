# 배치도 시각 보드 (Roster Visual Board) 설계서

> **배치도 보드/템플릿 관련 코드·마이그레이션을 만들거나 고치기 전에 이 문서와 [docs/MEMBER-SPEC.md](docs/MEMBER-SPEC.md)를 먼저 본다.**
>
> 작성일: 2026-06-14
> 작성자: jaehwan-lee-benja (with Claude)
> 상태: **설계 합의 단계 → 구현 대기**
> 상위 문서: [docs/MEMBER-SPEC.md](docs/MEMBER-SPEC.md) (Phase 1 멤버/배치도 MVP), [PLAN-member-roster.md](PLAN-member-roster.md)
> 권한 맥락: [docs/ACCESS-MODEL.md](docs/ACCESS-MODEL.md) — 새 패러다임 만들지 않음(B 공개읽기 + 마스터·보드멤버 쓰기 재사용).

---

## 1. 배경 & 목표

기존 Google Slides "멤버 배치도(역할 작전 보드)"는 **포지션 중심 공간 보드**다: 매장의 고정 자리(커피·아이스크림·서포트·빵자르기·포장·설거지·카이막·홀자리안내·마감보조…)에 사람을 끼워넣고, 각 자리에 세부 업무가 붙으며, **요일·인원수마다 자리 구성이 달라진다**(평일 4명 / 토 5·6명 / 일 7·8명).

현재 ThinkMap 구현(Phase 1)은 **데이터 골격 + 멤버 중심 입력 표**까지 완료했다(`roster_assignments`, `RosterCard`, `RosterModal`). 그러나 모달이 단순 표(이름/역할/오픈마감/상태)라, 슬라이드가 주던 **"한눈에 보는 작전 보드"** 가치가 화면에 없다.

**목표**
- 슬라이드의 포지션 중심 공간 보드를 사이트에서 재현한다(표 뷰는 빠른 입력용으로 유지, 보드 뷰를 추가하여 토글).
- 요일·인원수별 슬롯 구성을 **DB 템플릿으로 편집 가능**하게 만든다.
- 슬라이드처럼 멤버를 **드래그로 자리에 배치**한다.
- 직원이 보는 **현장 출력/풀스크린 읽기 뷰**로 슬라이드를 완전히 대체한다.

## 2. 범위 / 비범위

**범위**
- 보드 뷰(포지션 카드 그리드 + 세부업무 + 오픈/마감) — 표/보드 토글.
- `roster_templates` + `roster_template_slots` 신규 테이블(요일·인원수별 슬롯 정의, 보드별 커스텀 + 전역 기본).
- 템플릿 적용 흐름("이 날짜에 적용" → 빈 슬롯 생성).
- dnd-kit 드래그 배치(멤버 풀 → 슬롯).
- 읽기 전용 출력/풀스크린 뷰.

**비범위**
- `roster_assignments` 스키마 변경(불필요 — §4.3 매핑 규칙으로 흡수).
- 급여 매칭(Phase 3, MEMBER-SPEC §8) / 근무 요청 허브(Phase 2, §9).
- 멤버 셀프서비스 입력.

## 3. 핵심 설계 결정

1. **포지션 중심 보드를 기존 배치 row 위에 얹는다 — `roster_assignments` 스키마 무변경.**
   보드 뷰는 `roster_assignments`를 `(role, shift)`로 그룹핑해 템플릿 슬롯에 렌더한다. 멤버를 슬롯에
   드롭하면 그 슬롯의 `role`/`shift`로 배치 row를 생성/수정한다. → 배치 데이터·RLS·급여매칭 키 안전.
2. **템플릿(체제)은 DB 테이블 + 사이트에서 편집·신규저장 가능.** 코드 상수가 아니라
   `roster_templates`/`_slots`에 둔다. 전역 기본(`board_id IS NULL`, 시드) + 보드별 커스텀.
   슬라이드의 **"역할 작전 보드"가 곧 (요일×인원수) 체제 템플릿**이다(§7).
3. **공간형 슬롯 — 격자 스냅 좌표.** 슬롯은 매장 자리처럼 보드의 위치를 가진다(`grid_row`,`grid_col`).
   기본 레이아웃은 슬라이드처럼 **오픈 조(위 행) / 마감 조(아래 행) / 상시(맨 아래)** 2~3행 격자.
   빈 슬롯도 **점선 박스로 항상 표시**되어, 거기에 멤버를 넣고 뺀다.
4. **체제 불러오기 + 편집 + 신규 버전 저장(사이트 내).**
   - 드롭다운에서 체제(예: `토 6명`) 선택 → 점선 슬롯 격자 로드.
   - 슬롯 추가/삭제/이동(드래그)·역할/세부업무 편집을 화면에서 직접.
   - 변형 레이아웃을 **"다른 이름으로 저장"** → 새 `roster_templates` 버전 생성(보드별 또는 전역).
5. **MEMBER-SPEC §7.2 경계 유지.** 보드는 여전히 daily 본문(TipTap/`daily_blocks`) 밖의
   독립 카드/모달이다. 본문 노드로 넣지 않는다(mass-delete류 위험 회피).
6. **표 뷰 보존.** 보드 뷰는 시각 확인·드래그·출력용, 표 뷰는 빠른 일괄 입력용. 모달 상단 토글.
7. **role 정규화 권고.** 보드 그룹핑 안정성을 위해 `role`은 프리셋 키 우선(자유 메모는 `note`).
   기존 자유텍스트 데이터는 보드의 "미배치" 영역으로 흘러도 안전(§4.3).

## 4. 데이터 모델

> 마이그레이션: `migrate-create-roster-templates.sql` (단일 트랜잭션, 재실행 안전).
> 전제: `is_master()`, `is_board_member(board_id)`(migrate-create-members.sql), `schedule_touch_updated_at()`.

### 4.1 `roster_templates` — 보드 레이아웃 템플릿

```sql
roster_templates (
  id          uuid PK,
  board_id    uuid REFERENCES pages(id) ON DELETE CASCADE,  -- NULL = 전역 기본(시드)
  weekday     text,        -- '평일'|'토'|'일'|null(무관). 자동 추천 키
  headcount   int,         -- 기준 인원수(5~8). 자동 추천 키. null = 가변
  name        text NOT NULL,        -- 예: "일 7명 일반", "토 5명"
  is_default  boolean NOT NULL DEFAULT false,  -- 같은 (weekday,headcount) 중 기본
  display_order int NOT NULL DEFAULT 0,
  created_by  uuid,
  created_at, updated_at, deleted_at
)
```

### 4.2 `roster_template_slots` — 템플릿의 자리(공간 슬롯) 정의

```sql
roster_template_slots (
  id          uuid PK,
  template_id uuid NOT NULL REFERENCES roster_templates(id) ON DELETE CASCADE,
  grid_row    int  NOT NULL DEFAULT 0,   -- 격자 행 (0=오픈조, 1=마감조, 2=상시). 격자 스냅 좌표
  grid_col    int  NOT NULL DEFAULT 0,   -- 격자 열 (자리 가로 위치). 드래그로 변경
  role        text NOT NULL,             -- ROSTER_ROLE_PRESETS 키 (커피/아이스크림/…)
  tasks       text,                      -- 세부 업무 표시 (예: "샷, 스팀, 컵준비")
  shift       text,                      -- '오픈'|'마감'|'종일'|null (배치 매핑 키)
  label       text,                      -- 슬롯 별칭(선택, 예: "마감보조(홀,물기)")
  capacity    int  NOT NULL DEFAULT 1,   -- 한 슬롯 정원(보통 1, 필요 시 2)
  created_at, updated_at
)
```

- `(grid_row, grid_col)` = 보드상 위치. 격자에 스냅. 기본 시드는 오픈조(row0)/마감조(row1)/상시(row2).
- 슬롯의 배치 매핑은 `(role, shift)`로 `roster_assignments`와 연결(§4.3). `grid_*`는 표시 위치 전용.

### 4.3 슬롯 ↔ 배치 매핑 규칙 (스키마 무변경의 핵심)

- 한 슬롯 = `(role, shift)` 키. 보드 뷰는 그 날짜 배치 row들을 `(role, shift)`로 그룹핑해 슬롯에 채운다.
- 같은 키에 여러 명이면 `position` 오름차순으로 슬롯 안에 나란히.
- 어떤 슬롯에도 안 맞는 배치(자유텍스트 role 등)는 보드 하단 **"미배치/기타"** 영역에 칩으로 표시 →
  드래그로 슬롯에 넣으면 role/shift 정규화됨.
- 드롭 동작: 멤버를 슬롯 X에 드롭 → 해당 멤버의 배치 row를 `role=X.role, shift=X.shift`로 upsert
  (없으면 add, 있으면 update). UNIQUE(board_id, work_date, member_id) 유지(한 멤버 1 row/일).

## 5. 권한 / RLS

[ACCESS-MODEL.md](docs/ACCESS-MODEL.md) 패러다임 재사용. 새 패러다임 없음.

| 테이블 | SELECT | INSERT/UPDATE/DELETE |
| --- | --- | --- |
| `roster_templates` | 로그인 사용자 | 전역(`board_id IS NULL`): `is_master()` / 보드별: `is_master() OR is_board_member(board_id)` |
| `roster_template_slots` | 로그인 사용자 | 부모 template의 권한을 따름(template join으로 검사) |

- 배치(`roster_assignments`) 권한은 기존 그대로(MEMBER-SPEC §6). 보드 뷰의 드래그/편집 버튼은
  `is_master() || is_board_member`일 때만 노출(`canEdit`).

## 6. UI 설계

### 6.1 모달 구조 (`RosterModal` 확장)
- 헤더에 **[보드] / [표]** 토글. 기본값 = 보드.
- **보드 뷰(공간형)**:
  - 상단 바: **체제 불러오기 드롭다운**(요일×인원수, 예 `토 6명`) + "이 날짜에 적용" + **[레이아웃 편집]** 토글.
    - 자동 추천: 날짜의 요일 + 현재 배치 인원수로 기본 체제를 미리 선택해 제안.
  - 본문: **격자 보드**. 오픈 조(위) / 마감 조(아래) / 상시(맨 아래) 행에 자리 슬롯 배치.
    - **슬롯(점선 박스)** = `역할명` + `세부업무` + 들어온 멤버 칩. 빈 슬롯도 점선으로 표시.
    - 멤버를 슬롯에 드롭 → 그 슬롯의 `role/shift`로 배치 upsert. 칩을 빼면 배치 제거.
  - 좌측/하단 **멤버 풀**: 마스터 멤버 중 미배치자 칩(드래그 소스).
  - 하단 **미배치/기타**: 슬롯에 안 맞는(자유역할) 배치 칩.
- **표 뷰**: 현행 유지(빠른 일괄 입력·상태 변경).

### 6.1b 레이아웃 편집 모드 + 버전 저장 (사이트 내)
- **[레이아웃 편집]** ON → 슬롯 추가/삭제, 드래그로 위치(grid) 이동, 역할·세부업무·오픈마감 인라인 편집.
- **저장 동작**:
  - "이 체제 갱신" → 현재 템플릿(`roster_templates`)의 슬롯을 덮어쓰기(권한: 전역=마스터 / 보드=마스터·보드멤버).
  - **"다른 이름으로 저장"** → 새 `roster_templates` 버전 생성(이름·요일·인원수 지정) + 슬롯 복제.
    보드별 커스텀(`board_id` 지정)으로 저장하거나, 마스터는 전역 기본으로도 저장 가능.
- 편집은 **템플릿(슬롯 구성)** 만 바꾸며, 이미 그 날짜에 배치된 사람(`roster_assignments`)은 건드리지 않는다.

### 6.2 드래그 (dnd-kit — 이미 의존성 보유: @dnd-kit/core·sortable)
- 멤버 풀 칩 → 슬롯 드롭존. 드롭 시 §4.3 upsert.
- 슬롯 간 멤버 이동 = role/shift 변경. 슬롯 내 재정렬 = `position` 변경.
- 칩을 풀로 되돌리면 배치 제거(또는 role/shift 비움).

### 6.3 현장 출력/풀스크린 읽기 뷰
- "전체화면/인쇄" 버튼 → `canEdit` 무관 읽기 전용 보드. 칩만 표시, 입력 UI 제거.
- 인쇄 CSS(`@media print`)로 슬라이드 1장처럼 깔끔히. (table print-only 선례 참고: PLAN-table-print-only.md)

## 7. 시드 템플릿 (슬라이드에서 추출 — 초기값, 이후 in-app 편집)

세부업무 매핑(PLAN-member-roster §1 + 슬라이드):

| role | tasks |
| --- | --- |
| 커피 | 샷, 스팀, 컵준비 |
| 아이스크림 | 아이스크림, 계산 |
| 서포트 | 쟁반 셋팅, 주문서 정리, 호출 |
| 빵자르기 | 카이막 뜨기, 빵, 설거지, 반납대 |
| 포장 | 카이막, 포장(카이막·말렌카) |
| 카이막 | 카이막 뜨기, 반납대, 물기닦기 |
| 홀·자리안내 | 홀 관리, 자리 안내 |
| 마감보조 | 홀, 물기(마감) |

초기 시드 템플릿(전역 기본, `board_id IS NULL`) — 사용자 확인(2026-06-14, "대략 맞음"):

| 체제 | 오픈 조 (grid_row 0) | 마감 조 (grid_row 1) | 상시 (grid_row 2) |
| --- | --- | --- | --- |
| **평일 4명** | 커피·아이스크림·서포트 | 설거지·커피·마감 | — |
| **토 5명** | 커피·아이스크림·서포트·빵자르기 | 설거지·커피·아이스크림·서포트·마감 | 홀·자리안내 |
| **토 6명** | 커피·아이스크림·서포트·빵자르기·포장 | 설거지·커피·아이스크림·서포트·마감 | 홀·자리안내 |
| **일 7명** | 커피·아이스크림·서포트·빵자르기·포장 | 설거지·커피·아이스크림·서포트·마감보조 | 홀·자리안내 |
| **일·토 8명** | 커피·아이스크림·서포트·빵자르기·포장 | 설거지·커피·아이스크림·서포트·마감·마감보조 | 홀·자리안내, 반납대 |

각 슬롯의 `grid_col`은 위 나열 순서대로 0,1,2…. 시드는 슬라이드 작전 보드 기준 "대략"이며,
실제 운영에 맞게 **in-app 편집/신규 버전 저장**으로 다듬는다(그래서 DB 편집 가능으로 결정).
시드 SQL은 `seed-roster-templates.sql`로 분리.

## 8. 단계별 구현 로드맵

- **Phase A — 보드 뷰(읽기+그룹핑)** ✅ *완료*: 표/보드 토글, `(role,shift)` 그룹핑 렌더,
  포지션 카드+세부업무. 스키마/마이그레이션 없이 기존 배치만으로 시각화.
- **Phase B — DB 템플릿(공간형) + 체제 불러오기**: `roster_templates`/`_slots` 마이그레이션
  (`grid_row/col` 포함) + 시드(§7) + 체제 드롭다운 + "이 날짜에 적용"(점선 슬롯 격자 로드).
- **Phase C — 드래그 배치** ✅ *완료(2026-06-16)*: dnd-kit 멤버 풀↔자리·자리 간 이동(role 변경)·자리→풀
  빼기. PointerSensor 활성거리 6px로 기존 클릭-배치·버튼 클릭 보존(모바일/접근성). DragOverlay 칩. (`RosterBoardView.jsx`)
- **Phase D — 레이아웃 편집 + 버전 저장(사이트 내)** ✅ *완료(2026-06-16 검증)*: 슬롯 추가/삭제/드래그
  이동(네이티브 포인터 — 자유좌표엔 dnd-kit보다 적합)·역할/세부업무 편집, 주방 사각형 이동/리사이즈,
  "이 체제 갱신"(`replaceSlots`+주방좌표) / "새 버전 저장"(`createTemplate`). 빌드 green + 코드 흐름 검증.
- **Phase E — 출력/풀스크린 읽기 뷰** ✅ *완료(2026-06-16)*: `RosterPrintView.jsx`(읽기 전용, 흰 종이 스타일 —
  앱 다크테마 무관) + 모달 "전체화면·인쇄" 버튼(canEdit 무관) + `@media print` 격리·가로 페이지. 모달 내 포털 오버레이로 결정(§10).

## 9. 마이그레이션 안전 체크리스트

- [ ] `IF NOT EXISTS` / `DROP POLICY IF EXISTS`로 재실행 안전.
- [ ] RLS: 전역 템플릿 쓰기=마스터, 보드 템플릿 쓰기=마스터·보드멤버. 슬롯은 부모 권한 위임.
- [ ] `is_board_member()` 헬퍼 존재 전제(migrate-create-members.sql 선적용 확인).
- [ ] `roster_assignments` 무변경 확인(보드는 매핑으로 흡수).
- [ ] 시드는 별도 파일(`seed-roster-templates.sql`)로, 마이그레이션과 분리.
- [ ] 적용 전 supabase-guardian 검수.

## 10. 결정 로그 / 미해결

**결정됨 (2026-06-14)**
- 보드 뷰는 `roster_assignments` 위에 매핑으로 얹는다(스키마 무변경).
- 템플릿은 DB 테이블(편집 가능). 전역 기본 + 보드별 커스텀.
- 표 뷰 보존 + 보드 뷰 토글. card+modal 경계 유지(본문 노드 아님).
- 풀세트(보드+템플릿+드래그+편집+출력) 목표, Phase A→E 점진 구현.
- **슬롯은 공간형(격자 스냅 좌표 `grid_row/col`)**. 오픈조/마감조/상시 2~3행. 빈 슬롯도 점선 표시.
- **"체제 불러오기"** = (요일×인원수) 템플릿 로드. 시드는 §7 표(슬라이드 기준 "대략", 이후 다듬음).
- **보드(템플릿) 자체를 사이트에서 편집**하고 **새 버전으로 저장** 가능(Phase D).
- 템플릿 편집은 슬롯 구성만 바꾸고 기존 배치(`roster_assignments`)는 보존.

**미해결**
- [ ] 슬롯↔배치 매핑을 `(role,shift)` 그룹핑으로 갈지, 추후 `roster_assignments.slot_key` 추가가 필요할지
      (한 role에 오픈/마감 외 동일키 다인원이 잦으면 재검토).
- [ ] 템플릿 자동 추천 키: weekday 자동(날짜) + headcount(현재 배치 인원) 추천 방식 확정.
- [ ] role 정규화: 기존 자유텍스트 배치 데이터 마이그레이션 여부(우선 "미배치" 영역으로 흡수).
- [x] 출력 뷰를 모달 안에 둘지, 별도 라우트/페이지로 뺄지. → **모달 내 포털 오버레이로 결정**(Phase E, RosterPrintView).

## 11. MEMBER-SPEC 갱신 필요 항목 (구현 시 동기화)
- §11 미해결 "역할 프리셋의 요일·인원수별 템플릿" → **DB 템플릿으로 결정** 반영.
- §7.2에 보드 뷰(표/보드 토글, 드래그, 출력 뷰) 추가 기술.
- §10 로드맵에 본 보드 작업(Phase A~E) 위치 명시.

## 12. 그날 인원 구성 워크플로우 — 명단 ↔ 배치 2-레이어 (2026-06-16 합의)

### 12.1 개념: 한 사람의 그날 = 두 개의 독립 속성
- **① 명단 상태**(오늘 일하나?): 후보 / 오프 / 예정 / **확정**
- **② 자리**(어디서?): 미배치 / role(커피·포장…)
- **확정 리스트** = 명단 상태가 '확정'인 사람(자리 유무 무관). **작전판 배치** = 그 사람의 `role` 필드.
- **독립**: 확정만 하고 자리는 비워둘 수 있음(작전판의 "확정·미배치 풀"). 자리를 빼도 명단은 확정 유지.
- **종속**: 자리는 확정자에게만 줄 수 있음. 확정을 취소하면 그 자리도 자동 제거.
- → "확정=명단, 배치=그 위에 얹는 레이어". 한 사람에 묶이지만 서로 강제하지 않음.

### 12.2 상태 매핑 (roster_assignments 1 row/멤버/일 — 스키마 거의 무변경)
- **후보(요일)**: `members.work_days`∋해당 요일 & 그날 row 없음 → 파생(저장 안 함)
- **예정(추가)**: `status='planned'`
- **오프**: `status='off'` (신규)
- **확정**: `status='confirmed'` (신규)
- `role`: null=확정·미배치, 값=배치됨
- worked/requested/accepted/declined/tentative: 근무요청 허브·급여 매칭용 유지
- 급여 카운트 대상에 'confirmed' 포함, 'off'는 제외(ROSTER_COUNTED_STATUSES).
- 마이그: status CHECK에 'off','confirmed' 추가 — `migrate-roster-status-add-off-confirmed.sql` (재실행 안전, supabase-guardian 검수 후 운영 적용).

### 12.3 UI: 풀스크린 좌우 분할 (2026-06-16 사용자 선택)
- 데일리 RosterCard에서 열면 **풀스크린(페이지형)** 펼침(중앙 모달 아님). 날짜 맥락 유지.
- **좌(작전판)**: 홀+주방 네모 + 역할 슬롯 — 확정 인원의 자리 배치.
- **우(명단 관리)**: 섹션 = 요일 해당 인원 / 오프 / 추가 예정 / **확정 리스트**.
  - 요일 해당 인원 칩: `[확정] [오프]`
  - 추가 예정: 멤버 선택 추가(예정) → `[확정]`
  - 확정 리스트: 확정자. 좌측 자리로 드래그(역할 부여), 빼면 "확정·미배치"로 복귀.
- 기존 표 뷰·모달은 빠른 입력용으로 유지(토글).

### 12.4 Phase (R 시리즈)
- **R1 — 데이터/상태**: status 마이그(off/confirmed) + `rosterPresets` 상태·라벨 + 훅 헬퍼(confirm/off).
- **R2 — 풀스크린 좌우 컨테이너**: RosterModal을 풀스크린 좌우 분할로(또는 RosterWorkspace 분리), 좌=기존 보드.
- **R3 — 명단 관리 패널**: 요일/오프/추가예정/확정 섹션 + 확정·오프 액션.
- **R4 — 확정↔보드 연동**: 보드=확정자 표시, "확정·미배치 풀", 확정 취소 시 자리 제거.

### 12.5 구현 정정 (2026-06-16 최종)
- **확정은 파생 기본**: 요일 해당 멤버는 클릭 없이도 확정 인원으로 표시(row 없음). 변수(오프/추가/배치) 때만 row 생성. → "변수 없으면 기존 할당 인원 그대로".
- **좌우 통합 DnD**: 좌=작전판(자리판)만, 우=확정 인원 리스트(=배치 드래그 소스). 우측 칩을 좌측 자리로 드래그/클릭 배치, 우측 리스트로 끌면 미배치. 푸터는 표 뷰 전용, 멤버 관리하기=헤더.
- **홀·주방 네모 + 배경 비율 = 보드 공통**: `roster_board_layout`(board당 1행, hall_*/kitchen_*/field_ratio). 슬롯(카드)만 체제별. 마이그: `migrate-roster-board-layout.sql`, `migrate-roster-layout-field-ratio.sql`.
- 상태: `migrate-roster-status-add-off-confirmed.sql`로 'off'·'confirmed' 추가.

## 13. 요일별 인원배치 버전 (별표 활성) — 2026-06-28 합의

### 13.1 배경
§12 의 요일 기본(`roster_weekday_default`)은 (board, weekday) 당 **1개·무명**이었다. 사용자 요청:
한 요일에 **"2026 성수기 토요일"** 처럼 이름붙은 인원배치를 **여러 개** 두고, 그 중 하나에
**별표(주배치)** 를 줘서 그게 빈 날짜 자동 시드 소스가 되게 한다. 즉 §12 의 요일 기본을
역할 레이아웃(`roster_templates`)이 이미 가진 **"이름붙은 여러 버전 + is_default"** 패턴과
대칭으로 격상한다.

### 13.2 사용자 요구 7단계 → 시스템 매핑
1. 기초 자리 배치(풀배치) = `roster_templates` is_default(풀배치 마스터). (기존)
2. 각 자리에 인원 매칭, 요일과 엮임 = 인원배치 버전의 item. (격상)
3. 요일별 1차 자동 불러옴 = 활성 버전 빈 날짜 자동 시드. (기존 시드 로직 재사용)
4. 그날 변경 없으면 요일판이 곧 확정(§12.5 파생), 변경 가능. (기존)
5. **이 버전을 이름붙여 추가 기록** = 새 `roster_weekday_preset` 버전. (신규)
6. 다음주부터 이 버전으로 갱신 = **별표(is_active) 전환**. (신규)
7. 같은 요일 여러 버전 중 하나가 '주(主)' = 요일당 is_active 1개. (신규)

### 13.3 데이터 모델 (`migrate-roster-weekday-preset.sql`)
```
roster_weekday_preset       (부모) id, board_id, weekday(CHECK '일'~'토'), name('기본'..),
                                   is_active(별표/주, 요일당 1개), display_order,
                                   created_by(→auth.users SET NULL), timestamps, deleted_at
roster_weekday_preset_item  (자식) id, preset_id, member_id(→members SET NULL), member_name,
                                   role, shift, status, position, created_at, deleted_at
```
- `is_active` 요일당 1개 = 부분 유니크 인덱스 `(board_id, weekday) where is_active and deleted_at is null`.
- **활성 전환은 RPC `roster_weekday_preset_set_active(uuid)`로 단일 트랜잭션 처리**(guardian 주의-2, 2026-06-28).
  앱에서 두 UPDATE("다른 것 false → 대상 true")를 따로 쏘면 중간에 활성 0개 순간이 생겨 비원자적 →
  함수 바디 안에서 묶음. SECURITY INVOKER(기본): 두 UPDATE 모두 RLS 적용 → 보드멤버·마스터만 전환.
- 자동 시드 소스 = 그 요일 `is_active` 버전의 item. 나머지 버전은 모달에서 골라 "채우기".
- **자동 시드는 §12.5 파생의 사전 단계**다: 빈 날짜(`rows.length===0`)에서 활성 버전을 row로 깐 뒤,
  그래도 미포함된 work_days 멤버는 여전히 §12.5 파생(row 없는 후보)으로 표시된다.
- 버전 갱신(`replaceItems`)은 자식 줄을 **통째 하드 교체**(delete→insert). `_item.deleted_at`은 부모
  soft-delete 대칭·향후 자식 단위 복구 확장용 컬럼이며 현재 앱 흐름은 사용하지 않는다(방어적 필터만).
- 기존 `roster_weekday_default` 는 마이그로 `name='기본', is_active=true` 버전으로 **무손실 이전**(멱등).
  기존 테이블은 롤백 안전 위해 남겨둔다(앱은 새 테이블만 읽음). 정리는 후속.
  ※ 적용 전 통합세션/guardian이 현행 `roster_weekday_default` 컬럼(member_id·member_name·role·shift·
    status·position)을 `\d`로 확인할 것(이전 블록이 이 6개 컬럼을 가정).

### 13.4 RLS
- `roster_*` 도메인 일관성: `is_master() OR is_board_member(board_id)`(기존 weekday_default 와 동일).
  같은 모달·같은 권한이므로 여기만 access-tiers(`can_in_workspace`)로 가르지 않는다.
  roster 도메인 전체의 access-tiers 전환은 별도 일괄 과제(supabase-guardian 판단).
- 자식(`_item`)은 부모 버전 join으로 권한 위임.

### 13.5 UI (RosterModal / RosterMemberPanel 확장)
- 우측 명단 패널 하단: **버전 드롭다운**(이 요일의 버전 목록, 별표 표시) +
  `[새 버전으로 저장…]`(이름 prompt) + `[이 버전 갱신]` + `[별표(주배치) 지정]` + `[채우기]` + `[삭제]`.
- 자동 시드: 빈 날짜 열면 활성(별표) 버전만 자동으로 깐다(§12.5 가드 유지).
- canEdit(`is_master || is_board_member`)일 때만 저장/별표/삭제 노출. 열람은 누구나.
