# 멤버 & 배치도 (Member / Roster) 기능 기획서 / 명세서

> **멤버·배치도 관련 코드·마이그레이션을 만들거나 고치기 전에 이 문서를 먼저 본다.**
>
> 작성일: 2026-06-13
> 작성자: jaehwan-lee-benja (with Claude)
> 상태: **Phase 1 (멤버 마스터 + 배치도 MVP) 완료** · **SITE-SPLIT Phase 5 프론트 분할 완료(2026-07-11)** — 멤버 관리는 독립 위성 `apps/members`(`/thinkmap/members/`)로 이관, 배치도(roster)는 데일리 에디터 결합으로 모선 잔류. member 공유모듈은 `@thinkmap/core`. (Phase 2 근무요청 허브·Phase 3 급여매칭 미착수. 상세=docs/SITE-SPLIT-PLAN.md §8 Phase 5)
> 상위 컨텍스트: [ARCHITECTURE.md](./ARCHITECTURE.md) — Structured Data Plane 의 신규 도메인.
> 권한 맥락: [ACCESS-MODEL.md](./ACCESS-MODEL.md) — 신규 패러다임을 만들지 않고 기존 B(공개형)/C(마스터전용)를 조합한다.

---

## 목차

- [1. 배경 & 목표](#1-배경--목표)
- [2. 범위 / 비범위](#2-범위--비범위)
- [3. 핵심 결정 — 왜 멤버 마스터가 토대인가](#3-핵심-결정--왜-멤버-마스터가-토대인가)
- [4. 용어 정의](#4-용어-정의)
- [5. 데이터 모델](#5-데이터-모델)
- [6. 권한 / RLS](#6-권한--rls)
- [7. 화면 흐름 & 진입점](#7-화면-흐름--진입점)
- [8. 급여 매칭 (후속 연계)](#8-급여-매칭-후속-연계)
- [9. 근무 요청 허브 (후속 Phase)](#9-근무-요청-허브-후속-phase)
- [10. 단계별 로드맵](#10-단계별-로드맵)
- [11. 결정 로그 / 미해결](#11-결정-로그--미해결)
- [12. 수정 전 체크리스트](#12-수정-전-체크리스트)

---

## 1. 배경 & 목표

매장 운영에서 "이 날짜에 누가 어느 역할로 근무했는가"는 (a) 운영 배치(자리·역할 안배),
(b) 급여 계산의 근거, (c) 인사 관리(보건증·계약·교육·상담)의 축이 되는 핵심 데이터다.
지금까지는 Google Slides "멤버 배치도"로 날짜별 역할 배치를 그림처럼 관리하고, 급여는
근태 로그의 **이름 문자열**로만 계산해 왔다. 이름 기반은 동명이인·오타·퇴사 후 재입사에
취약하고, 인사 정보(보건증 만료, 계약 갱신 등)를 묶어둘 곳이 없다.

**목표**
- 직원을 **안정적인 ID로 식별**하는 인사 마스터(`members`)를 세운다.
- 날짜별 **배치도**(누가 어느 역할로 근무/예정)를 사이트에서 구조화된 데이터로 기록한다.
- 배치도가 멤버 ID를 참조하게 하여, 향후 **급여 표와 매칭**해 정확도/오차범위를 검증한다.
- 멤버 마스터 위에 **보건증·계약·교육·상담** 등 인사 도메인을 확장할 토대를 만든다.

## 2. 범위 / 비범위

**범위 (Phase 1 — 이번 작업)**
- `members` 인사 마스터 + 마스터 전용 민감정보(`member_private`) + 인사 이력 허브(`member_records`).
- `roster_assignments` 날짜별 배치(멤버 × 역할 × 상태).
- 멤버 관리 페이지(`page_type='members'`) — 목록/추가/편집, 민감정보는 마스터만.
- 업무일지(daily) 페이지의 **배치도 진입 카드 → 모달**(그 날짜의 배치 입력/편집).
- 연명부 기준 멤버 시드.

**비범위 (후속 Phase)**
- 근무 요청 허브(요청 발송/응답 추적) — §9. Phase 2.
- 급여 표 ↔ 배치도 자동 매칭/오차 리포트 — §8. Phase 3.
- 보건증 만료 알림, 계약 갱신 리마인더 등 능동 알림.
- 로그인 계정 없는 멤버의 자가 입력(셀프서비스).

## 3. 핵심 결정 — 왜 멤버 마스터가 토대인가

1. **급여 매칭의 안정성**: 급여는 현재 이름 문자열로만 직원을 다룬다(멤버 마스터 없음).
   배치도·급여를 신뢰성 있게 잇으려면 글자가 아니라 `member_id`로 연결돼야 한다.
2. **인사 도메인의 축**: 보건증/계약/교육/상담은 모두 "한 사람"에 매달리는 데이터다.
   멤버 마스터가 없으면 각 도메인이 다시 이름으로 흩어진다.
3. **두 종류의 "멤버" 구분**:
   - **보드 멤버십**(`worklog_board_members`) = 로그인 계정(`auth.users`) 기반 협업 권한.
   - **인사 멤버**(`members`) = 실제 근무 직원. **로그인 계정이 없을 수 있다**(연명부상 다수).
   둘은 별개 개념이며, 인사 멤버에 로그인 계정이 생기면 `members.auth_user_id`로 연결만 한다.
   이 분리가 본 설계의 핵심이다.

## 4. 용어 정의

| 용어 | 정의 |
| --- | --- |
| 멤버(member) | 인사 마스터의 한 직원. 로그인 계정 유무와 무관 |
| 배치(assignment) | (날짜, 멤버, 역할) 한 건. 배치도의 한 칸 |
| 보드(board) | 업무일지 캘린더 페이지(`page_type='calendar'`). 배치는 보드에 귀속 |
| 역할(role) | 그 날 맡은 포지션. 자유 텍스트 + 프리셋(커피/아이스크림/오픈서포트/빵자르기/포장/설거지/마감/마감보조 …) |
| 상태(status) | planned(예정) / worked(근무확정) / 향후 requested·accepted·declined(요청 흐름) |
| 민감정보 | 보건증·계약·상담·급여계좌·주민번호 등. 마스터 전용 |

## 5. 데이터 모델

> 마이그레이션: `migrate-create-members.sql` (단일 트랜잭션, 재실행 안전).
> 전제: `is_master()`(migrate-dynamic-master.sql), `schedule_touch_updated_at()`(migrate-create-schedule-events.sql).

### 5.1 `members` — 인사 마스터 (기본정보, 워크스페이스 공개 읽기)

```sql
members (
  id            uuid PK,
  name          text NOT NULL,
  display_order int  DEFAULT 0,
  work_days     text[] DEFAULT '{}',     -- 정규 근무요일 예: {'토','일'} (연명부 기반)
  seniority     text,                    -- '시니어'|'주니어'|'보조'|매니저 등 (표시용)
  phone         text,                    -- 기본 연락처 (배치/요청용. 기본정보로 분류)
  status        text DEFAULT 'active' CHECK (status IN ('active','inactive','resigned')),
  auth_user_id  uuid REFERENCES auth.users(id),  -- 로그인 계정 연결 (있을 때만)
  note          text,
  created_at, updated_at, deleted_at
)
```

### 5.2 `member_private` — 민감 개인정보 1:1 (마스터 전용)

```sql
member_private (
  member_id     uuid PK REFERENCES members(id) ON DELETE CASCADE,
  birth         text,    -- 생일/생년월일 (연명부 표기 그대로)
  resident_no   text,    -- 주민등록번호
  bank_account  text,    -- 급여 계좌
  email_gmail   text,    -- gmail (명세서 전달 등)
  payslip_email text,    -- 급여명세서 수신 메일
  hire_date     date,
  resign_date   date,
  memo          text,
  updated_at
)
```

### 5.3 `member_records` — 인사 이력 허브 1:N (마스터 전용)

보건증/계약/교육/상담을 **테이블을 늘리지 않고** 하나의 허브로 확장한다.

```sql
member_records (
  id          uuid PK,
  member_id   uuid REFERENCES members(id) ON DELETE CASCADE,
  record_type text NOT NULL CHECK (record_type IN
                ('health_cert','contract','training','counseling','other')),
  title       text,
  body        text,
  doc_date    date,      -- 발급/체결/교육/상담 일자
  expires_at  date,      -- 보건증·계약 만료일 (알림 후속 Phase)
  data        jsonb DEFAULT '{}',  -- 타입별 자유 필드
  created_by  uuid,
  created_at, updated_at, deleted_at
)
```

### 5.4 `roster_assignments` — 날짜별 배치 (공개 읽기 / 마스터·보드멤버 편집)

```sql
roster_assignments (
  id           uuid PK,
  board_id     uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,  -- 업무일지 캘린더(보드)
  page_id      uuid REFERENCES pages(id) ON DELETE SET NULL,          -- 해당 daily 페이지(있으면)
  work_date    date NOT NULL,
  member_id    uuid REFERENCES members(id) ON DELETE SET NULL,        -- 멤버 삭제돼도 기록 보존
  member_name  text NOT NULL,        -- 작성 시점 이름 스냅샷 (급여매칭·이력 안정성)
  role         text,                 -- 역할(포지션)
  shift        text,                 -- 오픈/마감 등 (선택)
  status       text DEFAULT 'planned' CHECK (status IN
                 ('planned','worked','requested','accepted','declined','tentative')),
  position     numeric DEFAULT 0,    -- 배치 내 정렬
  note         text,
  created_by   uuid,
  created_at, updated_at, deleted_at,
  UNIQUE (board_id, work_date, member_id)   -- 한 날짜 한 멤버 1건 (deleted 제외는 부분 인덱스로)
)
```

- `member_name` 스냅샷을 둬서 멤버가 이름을 바꾸거나 삭제돼도 과거 배치/급여 매칭이 흔들리지 않는다.
- `member_id`는 살아있는 매칭의 정답 키, `member_name`은 표시/이력 안정용.

### 5.5 `roster_weekday_preset` + `roster_weekday_preset_item` — 요일별 인원배치 버전 (2026-06-28)

> 상세 스키마·RLS·자동 시드·별표 전환 RPC → [PLAN-roster-visual-board.md §13](../PLAN-roster-visual-board.md).
> 마이그: `migrate-roster-weekday-preset.sql`.

한 요일에 **이름붙은 인원배치 버전을 여러 개**(예: '2026 성수기 토요일') 두고, `is_active`(별표/주배치)
버전 1개가 **빈 날짜 자동 시드 소스**가 된다. 기존 `roster_weekday_default`(요일당 1개·무명)를 무손실
이전한다. 부모(버전)는 soft-delete, 자식(인원 줄)은 버전 갱신 시 통째 교체. `member_name` 스냅샷 +
`member_id ON DELETE SET NULL`로 멤버 삭제에도 줄 보존(§5.4 원칙 동일).

## 6. 권한 / RLS

> [ACCESS-MODEL.md §5](./ACCESS-MODEL.md) 결정 순서를 따른다. 새 패러다임을 만들지 않는다.

| 테이블 | SELECT | INSERT/UPDATE/DELETE | 패러다임 |
| --- | --- | --- | --- |
| `members` (기본) | 로그인 사용자(`auth.uid() IS NOT NULL`) | `is_master()` | B(읽기 공개) + 마스터 쓰기 |
| `member_private` | `is_master()` | `is_master()` | C(마스터 전용) |
| `member_records` | `is_master()` | `is_master()` | C(마스터 전용) |
| `roster_assignments` | 로그인 사용자 | `is_master() OR is_board_member(board_id)` | B(공개) + 보드멤버/마스터 쓰기 |
| `roster_weekday_preset` | 로그인 사용자 | `is_master() OR is_board_member(board_id)` | B(공개) + 보드멤버/마스터 쓰기 |
| `roster_weekday_preset_item` | 로그인 사용자 | 부모 preset join 위임(`is_master() OR is_board_member`) | B(공개) + 부모 권한 위임 |

- 신규 헬퍼 `is_board_member(board_id uuid)` — `worklog_board_members`에 (board, auth.uid()) 존재.
  기존 `is_board_member_of_page(page_id)`(보드=페이지의 parent)와 짝을 이루는, board_id 직접 질의판.
  SECURITY DEFINER + STABLE (RLS 재귀 회피).
- 멤버 관리 진입 방어 (**SITE-SPLIT Phase 5 이후 갱신**): 멤버 관리는 독립 위성(`apps/members`, `/thinkmap/members/`)이며
  `pages` row 를 경유하지 않는다. 2단 방어 — (1) 위성 셸 `if (!isMaster)` 게이트(클라이언트, payroll/inventory 패턴),
  (2) `member_private`/`member_records` 테이블 RLS(`is_master()`, C 패러다임 그대로 = 진짜 방어선). 옛 `page_type='members'`
  pages row 와 `findOrCreateMembersPage`는 모선 fetch 대상에서 제외되어 사실상 폐기(§7.1 참조).
  단 `members` **테이블**의 기본정보는 배치도 모달에서 직원도 봐야 하므로 로그인 SELECT를 연다(불변).

## 7. 화면 흐름 & 진입점

### 7.1 멤버 관리 (위성 `apps/members` · `/thinkmap/members/`) — SITE-SPLIT Phase 5
- 진입 = 사이드바 **"멤버 관리"** 버튼 = 위성 링크(`<a href="/thinkmap/members/">`, 마스터 전용 표시). find-or-create 페이지 아님.
- 위성 셸(`MembersApp`): 로그인 게이트 + `if (!isMaster)` 마스터 게이트 → `MembersPage`. member 공유모듈은 `@thinkmap/core`
  (`useMembers`/`sortMembers`·`findOrCreateMembersPage`/`rosterPresets` — 모선 roster 와 공유). MembersPage 는 page 독립(pageId 미사용).
- 목록: 이름/근무요일/직급/상태/연락처. 추가·편집·비활성/퇴사 처리.
- 편집 모달: 기본정보 + (마스터일 때만) 민감정보 탭 + 인사 이력(보건증/계약/교육/상담) 리스트.

### 7.2 배치도 — daily 페이지의 진입 카드 → 모달 (채택안)
> 사용자 요청은 "업무일지의 섹션 → 클릭 시 모달". **TipTap 본문 안 섹션이 아니라**
> daily 페이지 헤더 아래의 **독립 카드**로 구현한다(아래 근거). "더 좋은 방식"으로 채택.

- **근거**: daily 본문은 `daily_blocks` row + TipTap 변환 레이어로 매우 민감하다(2026-05-13
  mass softDelete 사고 이력). 배치도를 본문 노드로 넣으면 변환/이월/실시간 동기화에 얽혀
  위험이 크다. 배치도는 자체 테이블(`roster_assignments`)을 갖는 **독립 구조 데이터**이므로,
  본문 밖 카드 + 전용 모달이 안전하고 책임이 깔끔하다.
- 카드: `WorklogHeader` 바로 아래. "👥 배치도 — N명 배치됨 / 미입력" 요약 + 클릭 시 모달.
- 모달(`RosterModal`): 그 날짜(`work_date`)·보드(`board_id`)의 배치 목록.
  멤버 추가(마스터 목록에서 선택) → 역할 지정 → 상태(예정/근무확정). 저장은 row CRUD.
- 열람은 누구나(로그인), 편집 버튼/입력은 `is_master() || is_board_member`.
- ★모달의 "멤버 관리하기" 버튼(마스터 전용)은 **멤버 위성으로 이동**한다(`/thinkmap/members/`, Phase 5). 모선 내부 페이지 전환 아님 —
  MEMBERS 가 모선 fetch 대상에서 빠졌으므로 옛 find-or-create 네비게이션은 죽은 경로(회귀 이력: Phase 5 배포 전 수정됨).

## 8. 급여 매칭 (후속 연계)

급여(`payroll_sheets`)는 월별 인원 명세를 가진다. 배치도가 쌓이면:
- `roster_assignments`에서 (월, member_id) 별 **근무일수/주말일수**를 집계 → 급여의 표준시간제
  계산(시급×7h×일수)과 대조. 이름이 아니라 `member_id`로 join → 오차 원인(누락/중복) 식별.
- 결과를 "오차범위 리포트"로 표시(급여 페이지 또는 멤버별 뷰). Phase 3.

## 9. 근무 요청 허브 (후속 Phase)

연명부 2번째 탭("추가 근무 필요시 체크명단")의 모집/지원 체크를 구조화:
- 날짜별 필요 인원 대비 배치 인원 부족분 표시.
- 후보(요일·가능여부)에서 선택 → 요청 발송 기록(`status='requested'`) → 응답(`accepted/declined`) 추적.
- 요청 발송 채널(문자/메신저)은 후속 결정. 우선 사이트 내 상태 추적부터.

## 10. 단계별 로드맵

- **Phase 1 (이번)**: 멤버 마스터(+민감정보/이력 허브) + 배치도 입력 MVP + 멤버 관리 페이지.
- **Phase 2**: 근무 요청 허브(필요 인원 안배 / 요청·응답 추적).
- **Phase 3**: 급여 ↔ 배치도 매칭/오차 리포트.
- **Phase 4**: 보건증 만료·계약 갱신 알림, 멤버 셀프서비스, 통계.

## 11. 결정 로그 / 미해결

**결정됨 (2026-07-11) — 멤버 도메인 SITE-SPLIT Phase 5**
- 멤버 관리(MembersPage)를 독립 위성 `apps/members`(`/thinkmap/members/`)로 분리. 배치도(roster)는 데일리 에디터(TipTapTestPage RosterCard) 결합으로 **모선 잔류**.
- member 공유 3모듈(`useMembers`·`sortMembers`/`findOrCreateMembersPage`·`rosterPresets`)을 `@thinkmap/core`로 추출 → 모선 roster 와 위성 members 공유.
- 위성 접근 방어 = 셸 `if(!isMaster)` + 테이블 RLS(불변). 모선은 `page_type='members'` fetch 안 함(pageTypes INDEPENDENT/MASTER_ONLY에서 제거).
- RosterModal "멤버 관리하기" 버튼은 위성 URL로 이동(내부 페이지 전환 회귀 수정, 배포 전).
- roster RLS 는 `is_master()`/`is_board_member()` 유지(access-tiers 전환 아님, 도메인 일관성).

**미해결** — 옛 `page_type='members'` 고아 pages row(과거 find-or-create 생성분)의 soft-delete 여부: 현재 호출처 없어 무해하나 정리 대상. Phase 2(근무요청 허브)·Phase 3(급여매칭)은 members/roster_assignments 테이블 직접 참조 설계라 members 페이지 존재에 무의존(구현 시 hub 가정 금지).

**결정됨 (2026-06-13)**
- 멤버 = 인사 마스터(로그인 계정과 분리). `auth_user_id`로 연결만.
- 멤버 기본정보 = 로그인 SELECT 공개 / 민감정보·이력 = 마스터 전용(C).
- 배치도 = 로그인 SELECT 공개 / 편집 = 마스터·보드멤버(B + 멤버십).
- 배치도 UI = 본문 밖 진입 카드 + 전용 모달(본문 노드 아님).
- 인사 이력은 테이블 증식 없이 `member_records(record_type)` 허브로.

**결정됨 (2026-06-28) — 배치도 시각보드/버전화는 [PLAN-roster-visual-board.md](../PLAN-roster-visual-board.md)로 분리·상세화**
- 역할 레이아웃(자리 구성)은 DB 템플릿(`roster_templates`, 이름붙은 여러 버전 + is_default 풀배치). PLAN §4·§7.
- 요일별 **인원배치**는 이름붙은 여러 버전 + **별표(is_active) 1개**(`roster_weekday_preset`). 별표 버전이
  빈 날짜 자동 시드. "2026 성수기 토요일" 식 보관. PLAN §13 (`migrate-roster-weekday-preset.sql`).
- §11 미해결 "역할 프리셋의 요일·인원수별 템플릿" → DB 템플릿으로 결정(PLAN §7로 이관).

**미해결 (진행하며 합의)**
- [ ] 역할 프리셋의 최종 목록/순서(요일·인원수별 템플릿까지 둘지).
- [ ] `phone`을 기본정보로 둘지 민감정보로 옮길지(현재 기본정보).
- [ ] 배치 상태 기본값: 과거 날짜=worked, 미래=planned 자동 추정 여부.
- [ ] 급여 매칭에서 'worked'만 셀지 'planned' 포함 여부.

## 12. 수정 전 체크리스트

- [ ] RLS 변경 시 [ACCESS-MODEL.md](./ACCESS-MODEL.md) 패러다임을 새로 만들지 않았는가.
- [ ] 민감정보(`member_private`/`member_records`)가 비마스터에 노출되지 않는가(임퍼소네이션 포함).
- [ ] 배치도를 daily 본문(`daily_blocks`)에 섞지 않았는가(독립 테이블 유지).
- [ ] `member_name` 스냅샷을 채워 멤버 변경/삭제에도 이력이 안전한가.
- [ ] 마이그레이션이 재실행 안전(IF NOT EXISTS / DROP POLICY IF EXISTS)한가.
