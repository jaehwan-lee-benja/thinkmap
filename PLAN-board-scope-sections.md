# 보드-스코프 섹션 마이그레이션 기획서

> 작성: 2026-05-29 · 상태: **초안 / 의사결정 대기**
> 범위: `worklog_sections` 의 소유 단위를 "유저" 에서 "보드(parent_id)" 로 옮기는 구조 변경.
> 관련 문서: [docs/WORKLOG-SPEC.md](docs/WORKLOG-SPEC.md), [docs/IMPERSONATION-SPEC.md](docs/IMPERSONATION-SPEC.md), [PLAN-daily-page-refactor.md](PLAN-daily-page-refactor.md)
> 발단: 2026-05-29 진단 — kbl0226 의 5/28 daily 페이지가 designerbenja 의 5/26 페이지에서 이월된 토글들로 깨진 사고. 진단 SQL: `diagnose-step2-B-E1-E2.sql`, `diagnose-Y.sql`.

---

## 0. 한 줄 요약

**daily 페이지는 "보드(parent_id)" 단위 공유 자원인데, 섹션 마스터·페이지 owner 가 "유저" 에 묶여 있어 단위가 어긋나 있다.** 섹션·페이지 owner 의 의미를 보드 중심으로 재정렬한다.

---

## 1. 배경 — 2026-05-29 사고

### 1.1 관찰 사실 (진단 SQL 결과)

- 5/26 daily (`page_id=131c03b0…`) owner = **designerbenja** (193 row, 정상)
- 5/28 daily (`page_id=546854ed…`) owner = **kbl0226** (141 row, 깨짐)
- 두 페이지의 `parent_id` 가 **동일** (`0fcc0fee…`)
- kbl0226 의 `worklog_sections` 는 global 고정 4개뿐 — user-scope 자유 섹션 **0건**
- kbl0226 의 `worklog_user_settings` 는 row 없음

### 1.2 깨진 경로

`src/utils/createDailyPageV2.js` 의 두 곳이 결합되어 발생:

1. **L151-158 — 섹션 마스터 조회** : `.eq('created_by', userId)` 로 5/28 페이지 owner(kbl0226) 의 user-scope 만 조회 → 0건 → 글로벌 4개만 INSERT
2. **L183-192 — 직전 daily 조회** : `parent_id` 만 필터 (user_id 필터 없음) → designerbenja 의 5/26 페이지를 prev 로 잡음
3. `carryOverEager` 가 5/26 의 미완료 자식들을 그대로 복사 → 자식의 `section_id` 가 designerbenja 의 5/26 섹션 row block_id 를 가리키지만 5/28 엔 그 섹션 row 가 없음 → **고아 토글 = 깨진 화면**

### 1.3 단위 불일치 — 진짜 뿌리

- 사용자의 멘탈 모델: "보드 = 공유 단위". 마스터/일반 유저가 한 보드를 같이 본다.
- 현재 스키마: 섹션 마스터 = 유저 소유 (`worklog_sections.scope='user' AND created_by=user_id`), 페이지 owner = 만든 사람 고정.
- 결과:
  - 같은 보드의 두 마스터가 만든 daily 가 서로 다른 섹션 세트를 갖는다.
  - 한 마스터가 섹션을 rename/삭제해도 다른 마스터의 view 에 반영 안 됨.
  - carry-over 가 "보드의 직전 날짜" 가 아닌 "다른 사람 페이지" 를 끌어옴.
- 5/28 사고는 이 어긋남의 한 증상일 뿐. 단위만 정렬되면 전부 자연 해소.

---

## 2. 목표 모델

### 2.1 단위 재정렬

- 섹션 마스터의 소유 단위를 **보드** 로 옮긴다.
- 페이지 owner (`pages.user_id`) 는 "만든 사람" 메타로만 남기고, 권한 판단은 보드 멤버십으로.
- carry-over 의 prev daily 조회는 **보드 + 날짜** 기준이 자연스러워진다 (owner 무관).

### 2.2 도입할 개념: 보드 멤버십

- 현재 보드를 식별하는 row 는 `pages.parent_id` 가 가리키는 부모 페이지 (folder type).
- 그 부모 페이지를 "보드" 로 격상하기 위해 별도 테이블 (`worklog_boards`) 을 둘지, 또는 부모 `pages` row 에 `is_board boolean` 정도만 둘지는 §5.3 에서 결정.
- 멤버십 row 는 별도 테이블 `worklog_board_members(board_id, user_id, role)` 가 필요.
  - role: `master` / `member` (기존 app_users.role 과 별개로, 보드별 권한)
  - RLS: 자기 보드 멤버십만 SELECT. 보드의 다른 멤버 목록은 master 만.

---

## 3. 스키마 변경

### 3.1 `worklog_sections` 에 `board_id` 추가

```sql
ALTER TABLE worklog_sections
  ADD COLUMN board_id uuid REFERENCES pages(id) ON DELETE CASCADE,
  DROP CONSTRAINT worklog_sections_scope_check,
  ADD CONSTRAINT worklog_sections_scope_check
    CHECK (scope IN ('global','board'));   -- 'user' 폐기 (§4.1 이전)

-- 인덱스
CREATE INDEX idx_worklog_sections_board ON worklog_sections(board_id, sort_order)
  WHERE deleted_at IS NULL AND scope='board';

-- RLS
-- scope='global' : 모두 SELECT
-- scope='board'  : 그 board_id 의 멤버만 SELECT, master 만 INSERT/UPDATE/DELETE
```

- `created_by` 는 metadata 로 유지 (감사 추적용). 권한 판단에는 안 씀.
- `parent_id` (섹션 위계의 부모 섹션) 는 그대로.

### 3.2 `worklog_user_settings` → `worklog_board_user_settings` 로 분해

현재 `worklog_user_settings.section_order` 는 user 단위 jsonb 배열. 보드별 정렬이 달라야 하므로 (user, board) 복합 키로 이동:

```sql
CREATE TABLE worklog_board_user_settings (
  user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  board_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  section_order jsonb NOT NULL DEFAULT '[]',
  -- 미래 확장 여지: 알림, 자동이월 정책 등
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, board_id)
);
```

- 기존 `worklog_user_settings` 는 마이그레이션 종료 후 drop.

### 3.3 `worklog_board_members`

```sql
CREATE TABLE worklog_board_members (
  board_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role     text NOT NULL DEFAULT 'member' CHECK (role IN ('master','member')),
  invited_by uuid REFERENCES auth.users(id),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, user_id)
);
```

- `app_users.role='master'` 와 별개. 전역 마스터 ≠ 보드 마스터. (단 초기 시드는 §4.2 에서 자동 부여)

### 3.4 `pages.is_board` (선택)

부모 페이지가 보드인지 식별. 없어도 "daily 페이지를 가진 모든 parent_id 가 보드" 로 추론 가능하지만, 명시하면 UI/권한 판단 빠름.

```sql
ALTER TABLE pages ADD COLUMN is_board boolean NOT NULL DEFAULT false;
```

§5.3 에서 도입 여부 결정.

---

## 4. 데이터 마이그레이션

**전제: 운영 데이터 손실 없이 1회 마이그레이션. 롤백 시나리오 포함.**

### 4.1 user-scope 섹션을 board-scope 으로 이전

```sql
-- 4.1-a. 각 user-scope 섹션의 "기본 보드" 를 결정.
--   원칙: 그 created_by 가 가장 많이 daily 를 만든 parent_id 를 그 섹션의 board_id 로 매핑.
--   엣지: 여러 보드에 흩어져 있으면 가장 많이 쓴 보드 1개로 통합 (나머지 보드엔 수동으로 다시 추가).

WITH user_section_primary_board AS (
  SELECT
    ws.id AS section_id,
    (SELECT p.parent_id
     FROM pages p
     WHERE p.user_id = ws.created_by AND p.page_type = 'daily'
     GROUP BY p.parent_id
     ORDER BY COUNT(*) DESC
     LIMIT 1) AS board_id
  FROM worklog_sections ws
  WHERE ws.scope = 'user' AND ws.deleted_at IS NULL
)
UPDATE worklog_sections ws
SET scope = 'board', board_id = u.board_id
FROM user_section_primary_board u
WHERE ws.id = u.section_id AND u.board_id IS NOT NULL;
```

- 마이그레이션 후 `scope='user'` 잔존 row 가 있으면 alert (수동 정리 필요).
- **중복 방지**: 같은 보드에 같은 title 섹션이 둘이면 sort_order 가 작은 것 유지, 나머지는 deleted_at 처리하고 daily_blocks 의 section_master_id 를 살아남은 것으로 재매핑.

### 4.2 보드 멤버십 시드

```sql
-- 그 보드 아래 daily 를 만든 적이 있는 user 는 자동 멤버.
INSERT INTO worklog_board_members (board_id, user_id, role)
SELECT DISTINCT
  p.parent_id,
  p.user_id,
  CASE WHEN au.role = 'master' THEN 'master' ELSE 'member' END
FROM pages p
JOIN app_users au ON au.auth_uid = p.user_id
WHERE p.page_type = 'daily' AND p.parent_id IS NOT NULL
ON CONFLICT DO NOTHING;
```

### 4.3 `worklog_user_settings` → 보드별 분해

```sql
-- 각 user 의 기존 section_order 를, 그 user 가 가장 많이 쓰는 보드의 setting 으로 복사.
-- (한 user 가 여러 보드에 걸쳐 있으면 그 user 가 보드별로 직접 다시 정렬해야 함)
INSERT INTO worklog_board_user_settings (user_id, board_id, section_order)
SELECT
  s.user_id,
  (SELECT p.parent_id FROM pages p
   WHERE p.user_id = s.user_id AND p.page_type = 'daily'
   GROUP BY p.parent_id ORDER BY COUNT(*) DESC LIMIT 1),
  s.section_order
FROM worklog_user_settings s
WHERE s.section_order IS NOT NULL;
```

### 4.4 검증 쿼리

- (a) user-scope 잔존: `SELECT COUNT(*) FROM worklog_sections WHERE scope='user'` → 0
- (b) 보드별 master 최소 1명: `SELECT board_id FROM worklog_board_members WHERE role='master' GROUP BY 1` → 모든 활성 보드 포함
- (c) daily_blocks 의 모든 section_master_id 가 살아있는 worklog_sections.id 와 매칭: `LEFT JOIN` 후 NULL row 카운트 0

### 4.5 롤백

- `worklog_sections` 의 마이그 전 스냅샷을 `worklog_sections_backup_YYYYMMDD` 로 보관.
- `worklog_user_settings` 도 동일.
- 롤백 절차는 동일 column 복원 + scope CHECK 원복.

---

## 5. 코드 변경 지점

### 5.1 `src/utils/createDailyPageV2.js`

**L151-158 (섹션 마스터 조회)** — `created_by = userId` → `board_id = parentId`:

```js
// before
.eq('scope', 'user').eq('created_by', userId)
// after
.eq('scope', 'board').eq('board_id', parentId)
```

**L183-192 (직전 daily 조회)** — 이미 `parent_id` 기준이라 의미상 그대로지만, 보드 단위 시멘틱이 명확해지므로 주석 보강. **`user_id` 필터는 추가하지 않는다 (보드 단위 carry-over 가 의도).**

**L159-164 (section_order 조회)** — `worklog_user_settings` → `worklog_board_user_settings` 로 교체. 키 (`user_id`, `board_id`) 모두 매칭.

### 5.2 섹션 CRUD UI

- `[+ 섹션 추가]` 버튼이 user-scope 가 아닌 board-scope 으로 INSERT 해야 함. 그 보드의 모든 멤버 view 에 즉시 반영.
- 섹션 rename/삭제도 보드 단위. master 권한 체크 (`worklog_board_members.role='master'`).
- 위치: `src/components/TipTapEditor/` 의 섹션 편집 UI (정확한 컴포넌트는 구현 시 grep) + 사이드바의 보드 설정 진입점.

### 5.3 `pages.is_board` 도입 여부

- **도입 찬성**: 권한 판단 시 매번 "daily 페이지를 가진 parent 인가" 추론 불필요. UI 에서 보드 표시 명확.
- **도입 반대**: 컬럼 하나 늘어남. 기존 데이터의 보드 식별이 모호한 케이스 (parent_id 가 null 인 daily 등) 가 있으면 정리 필요.
- **권장**: 도입. backfill SQL = "page_type='daily' 페이지의 parent_id 가 가리키는 모든 부모를 is_board=true".

### 5.4 RLS 정책 재작성

- `worklog_sections` (scope='board'): `EXISTS (SELECT 1 FROM worklog_board_members WHERE board_id=ws.board_id AND user_id=auth.uid())` 로 SELECT. INSERT/UPDATE/DELETE 는 role='master' 추가 조건.
- `worklog_board_user_settings`: 본인 row 만.
- `worklog_board_members`: 본인 row SELECT 가능. master 는 보드 전체.
- `pages` 의 RLS 는 보드 멤버십 기준으로 보완 (현재 user_id 기준).

### 5.5 임퍼소네이션 영향

[docs/IMPERSONATION-SPEC.md](docs/IMPERSONATION-SPEC.md) 의 effectiveSession 기반 동작은 그대로. 단, 임퍼소네이션 중 createDailyPageV2 호출 시 `userId = effectiveSession.user.id` 가 되는 건 변하지 않으므로, **임퍼소네이션 중에 daily 페이지를 만들면 그 페이지 owner 가 임퍼소네이션 대상 user 가 된다** (현재와 동일). 단 섹션은 board-scope 이라 어느 owner 든 동일 세트.

---

## 6. UI 변경

- 사이드바: 보드 (parent 페이지) 우클릭 → "보드 설정" 메뉴 추가. 그 안에 섹션 관리 / 멤버 관리 탭.
- 기존 "내 섹션 추가" UI 는 → "이 보드의 섹션 추가" 로 라벨링 변경. master 가 아니면 disabled.
- 마스터 권한 표시 (왕관 아이콘) 위치 확인 — 보드별 role 도 같이 표시할지 결정 필요.

---

## 7. 단계별 롤아웃

### Phase 1 — 스키마 + 데이터 마이그 (단방향, 1회)
1. backup 테이블 생성
2. 컬럼 추가 (`worklog_sections.board_id`, `pages.is_board`)
3. 신규 테이블 (`worklog_board_members`, `worklog_board_user_settings`)
4. 데이터 마이그 SQL 실행 (§4.1-4.3)
5. 검증 쿼리 통과 확인 (§4.4)

### Phase 2 — 코드 전환
6. `createDailyPageV2.js` 의 두 곳 (§5.1) 수정 + 로컬에서 designerbenja, kbl0226 각각 신규 daily 만들어 5/26-스타일 카드 구성 확인
7. 섹션 CRUD UI 가 board-scope INSERT 하도록 (§5.2)
8. RLS 정책 deploy (§5.4)

### Phase 3 — 정리
9. `scope='user'` CHECK constraint 제거. user-scope 잔존 row alert 정리.
10. `worklog_user_settings` drop.
11. WORKLOG-SPEC.md 갱신 (§2.x, §3.2.3 보드-스코프 반영).

---

## 8. 미해결 질문 (의사결정 대기)

| # | 질문 | 영향 |
|---|---|---|
| Q1 | 보드 식별을 `pages.is_board` 컬럼으로 할지, 별도 `worklog_boards` 테이블로 할지 | §3.4, §5.3 |
| Q2 | 한 user 의 user-scope 섹션이 여러 보드에 흩어져 쓰였을 때 기본 보드 1개로 강제 통합할지, 보드마다 복사할지 | §4.1 |
| Q3 | `app_users.role='master'` 가 보드 master 로 자동 승격되는 게 맞는가, 보드별 수동 승격이 안전한가 | §3.3, §4.2 |
| Q4 | 임퍼소네이션으로 daily 를 만들 때 그 페이지 owner 를 보드 representative 로 강제 고정할지, 그대로 임퍼소네이션 대상으로 둘지 | §5.5 |
| Q5 | 5/28 같은 과거 사고 페이지 — 삭제했지만, 비슷한 형태의 깨진 페이지가 다른 user/날짜에도 있는지 전수 스캔 SQL 추가할지 | §9 |

---

## 9. 위험 / 안전망

- **자동 테스트 없음** (PLAN-daily-page-refactor.md §0 참조). 5.1 코드 변경 후 designerbenja / kbl0226 두 계정으로 각각 신규 daily 생성 → 섹션 카드 정상 / carry-over 정상 수동 확인 필요.
- **prod 1회 실행 마이그**. 백업 테이블 + 검증 쿼리 통과 후에만 후속 단계.
- **부분 적용 금지**: §3 스키마와 §5.1 코드는 같은 배포에 함께 들어가야 함. 컬럼만 추가하고 코드를 안 바꾸면 신규 daily 가 여전히 user-scope 쿼리.

---

## 10. 결정 / 변경 이력

| 날짜 | 결정 | 비고 |
|---|---|---|
| 2026-05-29 | 초안 작성 — 단위 불일치 진단 후 board-scope 채택 방향 | 5/28 사고 진단 직후 |
