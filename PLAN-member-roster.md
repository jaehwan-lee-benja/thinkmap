# 멤버 & 배치도 — 구현 청사진 (PLAN)

> 명세: [docs/MEMBER-SPEC.md](docs/MEMBER-SPEC.md). 이 문서는 **코드 통합 지점·마이그레이션 SQL·구현 순서**를 담는다.
> payroll(`PLAN-payroll-page.md`) 통합 패턴을 그대로 따른다.
>
> ⚠ **착수 전제(2026-06-13)**: 다른 세션이 `feature/edge-ensure-daily-page`에서 작업 중이며,
> 한 작업트리를 공유하는 동안 브랜치 전환이 있었다. **다른 세션 종료 후, `main` 기준 전용 브랜치
> (예: `feature/member-roster`)에서 구현**한다. 두 세션이 동시에 git 조작하지 않는다.

---

## 0. 진행 상태

- [x] 명세서 `docs/MEMBER-SPEC.md`
- [x] ARCHITECTURE.md §2.2 도메인 표 등록 + CLAUDE.md 필수문서 링크
- [x] 본 PLAN (마이그레이션 SQL 전문 + 코드 통합 지점)
- [ ] (대기) `migrate-create-members.sql` 파일화 + 사용자 Supabase 실행
- [ ] (대기) `seed-members.sql` 실행
- [ ] (대기) MembersPage + 사이드바 버튼 + App 라우팅
- [ ] (대기) RosterCard(진입) + RosterModal + useMembers/useRoster 훅
- [ ] (대기) 빌드 검증 + 내일 날짜 배치도 입력

---

## 1. 역할(role) 프리셋 — 슬라이드 패턴 분석 결과

배치도 슬라이드에서 반복되는 포지션을 정규화한다. 모달의 역할 선택은 **프리셋 + 자유입력** 병행.

| 프리셋 role | 슬라이드상 세부 업무 |
| --- | --- |
| 커피 | 샷, 스팀, 컵 준비 |
| 아이스크림 | 아이스크림, 계산 |
| 서포트 | 쟁반 셋팅, 주문서 정리, 호출, 계산 |
| 빵자르기 | 카이막 뜨기, 빵, 설거지 |
| 포장 | 카이막·말렌카 포장 |
| 카이막 | 카이막 뜨기/반납대/물기 |
| 설거지 | 설거지 |
| 홀·자리안내 | 홀 관리, 자리 안내 |
| 반납대 | 반납대, 물기 닦기 |
| 마감보조 | 홀, 물기(마감) |
| 매니저 | 매니저 |
| 이사 | 운영 이사 |

- `shift`(선택): `오픈` / `마감` / `종일`.
- 프리셋 목록은 코드 상수 `ROSTER_ROLE_PRESETS`로 두고, 추후 보드별 커스터마이즈 여지 남김(MEMBER-SPEC §11 미해결).

---

## 2. 마이그레이션 SQL (확정안 — `migrate-create-members.sql`)

> 단일 트랜잭션, 재실행 안전. Supabase SQL Editor에 통째로 붙여 실행.
> 전제: `is_master()`(migrate-dynamic-master.sql), `schedule_touch_updated_at()`(migrate-create-schedule-events.sql),
> `worklog_board_members`(migrate-step2-members.sql).
>
> ⚠ **pages CHECK 주의**: 적용 직전 라이브 제약의 현재 허용값을 반드시 확인한다. 다른 브랜치/세션이
> 'dashboard' 등 새 page_type을 추가했을 수 있어, 통째 DROP+ADD 시 누락 위험.
> 먼저 `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='pages_page_type_chk';`
> 로 확인 후, 출력된 목록에 `'members'`만 더해 아래 ADD 문을 조정한다.

```sql
BEGIN;

-- ── 0) 헬퍼: 이 board(업무일지 캘린더)의 멤버인가? ───────────────────────────
--   is_board_member_of_page(page_id) 의 board_id 직접판. SECURITY DEFINER로 RLS 재귀 회피.
CREATE OR REPLACE FUNCTION is_board_member(p_board_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM worklog_board_members m
    WHERE m.board_id = p_board_id AND m.user_id = auth.uid()
  );
$$;

-- ── 1) members — 인사 마스터 (기본정보) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  display_order int  NOT NULL DEFAULT 0,
  work_days     text[] NOT NULL DEFAULT '{}',
  seniority     text,
  phone         text,
  status        text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','inactive','resigned')),
  auth_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_members_active
  ON members (display_order) WHERE deleted_at IS NULL AND status='active';
CREATE UNIQUE INDEX IF NOT EXISTS uq_members_name_alive
  ON members (name) WHERE deleted_at IS NULL;   -- 살아있는 동명 방지(시드 dedup 겸용)

DROP TRIGGER IF EXISTS trg_members_touch ON members;
CREATE TRIGGER trg_members_touch BEFORE UPDATE ON members
  FOR EACH ROW EXECUTE FUNCTION schedule_touch_updated_at();

-- ── 2) member_private — 민감 개인정보 1:1 (마스터 전용) ─────────────────────
CREATE TABLE IF NOT EXISTS member_private (
  member_id     uuid PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  birth         text,
  resident_no   text,
  bank_account  text,
  email_gmail   text,
  payslip_email text,
  hire_date     date,
  resign_date   date,
  memo          text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_member_private_touch ON member_private;
CREATE TRIGGER trg_member_private_touch BEFORE UPDATE ON member_private
  FOR EACH ROW EXECUTE FUNCTION schedule_touch_updated_at();

-- ── 3) member_records — 인사 이력 허브 1:N (마스터 전용) ────────────────────
CREATE TABLE IF NOT EXISTS member_records (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  record_type text NOT NULL CHECK (record_type IN
                ('health_cert','contract','training','counseling','other')),
  title       text,
  body        text,
  doc_date    date,
  expires_at  date,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_member_records_member
  ON member_records (member_id, record_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_member_records_expiry
  ON member_records (expires_at) WHERE deleted_at IS NULL AND expires_at IS NOT NULL;
DROP TRIGGER IF EXISTS trg_member_records_touch ON member_records;
CREATE TRIGGER trg_member_records_touch BEFORE UPDATE ON member_records
  FOR EACH ROW EXECUTE FUNCTION schedule_touch_updated_at();

-- ── 4) roster_assignments — 날짜별 배치 ────────────────────────────────────
CREATE TABLE IF NOT EXISTS roster_assignments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id     uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  page_id      uuid REFERENCES pages(id) ON DELETE SET NULL,
  work_date    date NOT NULL,
  member_id    uuid REFERENCES members(id) ON DELETE SET NULL,
  member_name  text NOT NULL,
  role         text,
  shift        text,
  status       text NOT NULL DEFAULT 'planned' CHECK (status IN
                 ('planned','worked','requested','accepted','declined','tentative')),
  position     numeric NOT NULL DEFAULT 0,
  note         text,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_roster_board_date
  ON roster_assignments (board_id, work_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_roster_member_date
  ON roster_assignments (member_id, work_date) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_roster_board_date_member_alive
  ON roster_assignments (board_id, work_date, member_id)
  WHERE deleted_at IS NULL AND member_id IS NOT NULL;
DROP TRIGGER IF EXISTS trg_roster_touch ON roster_assignments;
CREATE TRIGGER trg_roster_touch BEFORE UPDATE ON roster_assignments
  FOR EACH ROW EXECUTE FUNCTION schedule_touch_updated_at();

-- ── 5) RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE members            ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_private     ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_records     ENABLE ROW LEVEL SECURITY;
ALTER TABLE roster_assignments ENABLE ROW LEVEL SECURITY;

-- members: 로그인 사용자 SELECT(기본정보 공개) / 쓰기 마스터
DROP POLICY IF EXISTS members_select ON members;
CREATE POLICY members_select ON members FOR SELECT
  USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS members_write ON members;
CREATE POLICY members_write ON members FOR ALL
  USING (is_master()) WITH CHECK (is_master());
-- 주의: FOR ALL 정책과 FOR SELECT 정책이 공존하면 SELECT는 OR로 합쳐진다.
--       members_write(ALL)의 USING이 비마스터 SELECT를 막지 않도록, SELECT는 위 정책으로 별도 허용.

-- member_private / member_records: 마스터 전용 (payroll/goals 패턴)
DROP POLICY IF EXISTS member_private_master_all ON member_private;
CREATE POLICY member_private_master_all ON member_private FOR ALL
  USING (is_master()) WITH CHECK (is_master());
DROP POLICY IF EXISTS member_records_master_all ON member_records;
CREATE POLICY member_records_master_all ON member_records FOR ALL
  USING (is_master()) WITH CHECK (is_master());

-- roster: 로그인 SELECT 공개 / 쓰기 마스터 OR 보드멤버
DROP POLICY IF EXISTS roster_select ON roster_assignments;
CREATE POLICY roster_select ON roster_assignments FOR SELECT
  USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS roster_write ON roster_assignments;
CREATE POLICY roster_write ON roster_assignments FOR ALL
  USING (is_master() OR is_board_member(board_id))
  WITH CHECK (is_master() OR is_board_member(board_id));

-- ── 6) pages.page_type 에 'members' 허용 ───────────────────────────────────
--   ★ 아래 목록은 적용 직전 라이브 제약과 대조해 조정할 것(상단 주의 참조).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pages_page_type_chk') THEN
    ALTER TABLE pages DROP CONSTRAINT pages_page_type_chk;
  END IF;
END $$;
ALTER TABLE pages ADD CONSTRAINT pages_page_type_chk
  CHECK (page_type IN ('normal','daily','calendar','frame','engine','schedule','payroll','members'));

COMMIT;
```

> ⚠ **RLS 검증 노트**: Postgres에서 한 테이블에 `FOR ALL`(USING `is_master()`) + `FOR SELECT`(USING
> `auth.uid() IS NOT NULL`)가 함께 있으면, SELECT 시 두 정책이 **OR**로 평가되어 비마스터도 기본정보를
> 읽을 수 있다(의도대로). 쓰기(INSERT/UPDATE/DELETE)는 `FOR ALL` 정책만 적용되어 마스터로 제한된다.
> 적용 후 `phase07-step2-rls.sql` 말미처럼 `pg_policies` 조회로 실제 반영을 확인할 것.

---

## 3. 멤버 시드 (`seed-members.sql`)

> 연명부(직원 연명부_240404)의 'ver.250204' + '명세서 전달' + '직원 현황_250803' 종합.
> 재실행 안전 — 살아있는 동명이 없을 때만 INSERT(`uq_members_name_alive` + WHERE NOT EXISTS).
> 민감정보(생일/계좌/메일)는 시드에 넣지 않는다(마스터가 멤버 관리 페이지에서 입력).

```sql
BEGIN;
INSERT INTO members (name, work_days, seniority, status)
SELECT v.name, v.work_days, v.seniority, 'active'
FROM (VALUES
  ('김지연', ARRAY['월','화','수','목','금'], '매니저'),
  ('김가을', ARRAY['목','금','토','일'],     '시니어'),
  ('장원희', ARRAY['월','화'],               NULL),
  ('조우영', ARRAY['월','화'],               NULL),
  ('안선영', ARRAY['목','금'],               NULL),
  ('신민정', ARRAY['목','금'],               NULL),
  ('공가영', ARRAY['목','금'],               NULL),
  ('배미진', ARRAY['토','일'],               NULL),
  ('이다경', ARRAY['토'],                    NULL),
  ('장아린', ARRAY['토','일'],               NULL),
  ('김도윤', ARRAY['토','일'],               NULL),
  ('김한빈', ARRAY['토'],                    '주니어'),
  ('이다혜', ARRAY['토'],                    NULL),
  ('김동화', ARRAY['토'],                    NULL),
  ('유지현', ARRAY['일'],                    NULL),
  ('서효경', ARRAY['일'],                    NULL),
  ('문지선', ARRAY['일'],                    NULL),
  ('김향숙', ARRAY['일'],                    NULL),
  ('이재환', ARRAY['토'],                    '대표')
) AS v(name, work_days, seniority)
WHERE NOT EXISTS (
  SELECT 1 FROM members m WHERE m.name = v.name AND m.deleted_at IS NULL
);
COMMIT;

SELECT name, work_days, seniority, status FROM members ORDER BY display_order, name;
```

---

## 4. 코드 통합 지점 (구현 시 정확한 위치)

### 4.1 라우팅 — `src/App.jsx`
- import 추가: `import MembersPage from './components/Members/MembersPage'` (PayrollPage import 옆, line ~9).
- 라우팅 분기: `if (pageType === 'payroll') {...}` 블록(line ~155-171) **다음**에 추가:
  ```jsx
  if (pageType === 'members') {
    return <MembersPage key={`pane-${paneIndex}-${pageId}`} pageId={pageId}
             session={effectiveSession} isMaster={isMaster} />
  }
  ```
  - 멤버 페이지 진입은 마스터 전용 표시지만, 기본정보 열람은 비마스터도 가능하므로 **접근 거부는 하지 않는다**.
    민감정보 탭은 컴포넌트 내부에서 `isMaster`로 게이팅. (payroll처럼 통째 거부 ❌)

### 4.2 사이드바 버튼 — `src/components/Sidebar/Sidebar.jsx`
- 급여명세서 버튼(line ~195-240)의 find-or-create 패턴을 복제해 **"멤버 관리"** 버튼 추가.
  - 위치: 급여명세서 버튼 바로 아래, `{isMaster && (...)}` 블록 안.
  - page_type='members' 페이지 find-or-create → `handlePageSelect(id)`.
  - 생성 시 `name:'멤버 관리', page_type:'members'`.

### 4.3 배치도 진입 카드 — `src/components/TipTapEditor/TipTapTestPage.jsx`
- `<WorklogHeader .../>` (line 1513-1527) **바로 다음**, 툴바 전에 삽입:
  ```jsx
  {currentPage?.page_type === 'daily' && (
    <RosterCard
      boardId={currentPage.parent_id}
      pageId={currentPageId}
      workDate={currentPage.page_date}
      session={session}
      isMaster={isMaster}
      canEdit={!isImpersonating}
    />
  )}
  ```
- `RosterCard`가 요약(“👥 배치도 · N명”)을 보여주고, 클릭 시 내부에서 `RosterModal`을 portal로 띄운다.
  daily 본문(`daily_blocks`)/TipTap과 **완전 분리** → mass-delete류 위험 없음.

### 4.4 신규 컴포넌트 / 훅
| 파일 | 책임 |
| --- | --- |
| `src/hooks/useMembers.js` | members SELECT(활성/전체), CRUD(마스터), member_private/records 로드·저장 |
| `src/hooks/useRoster.js` | roster_assignments (board_id, work_date) 로드 + add/update/remove |
| `src/components/Members/MembersPage.jsx` + `.css` | 멤버 목록/추가/편집 모달(기본+민감 탭+이력) |
| `src/components/Roster/RosterCard.jsx` | daily 진입 카드(요약+모달 트리거) |
| `src/components/Roster/RosterModal.jsx` + `.css` | 날짜별 배치 입력/편집(멤버 선택·역할·상태) |
| `src/utils/rosterPresets.js` | `ROSTER_ROLE_PRESETS`, `ROSTER_SHIFTS`, status 라벨 |

---

## 5. 구현 순서 체크리스트 (다른 세션 종료 후)

1. [ ] `main` 최신화 후 `feature/member-roster` 브랜치 생성. 본 PLAN/SPEC/문서수정 cherry 정리.
2. [ ] `migrate-create-members.sql` 파일화 → 사용자 Supabase 실행(라이브 CHECK 대조 후).
3. [ ] `seed-members.sql` 실행 → 멤버 19명 확인.
4. [ ] `rosterPresets.js`, `useMembers.js`, `useRoster.js`.
5. [ ] `MembersPage` + 사이드바 버튼 + App 라우팅 → 멤버 목록/편집 동작.
6. [ ] `RosterCard` + `RosterModal` → daily 카드/모달 동작.
7. [ ] `npm run build` 통과(현 셸 node v19 → vitest 대신 build/lint 중심).
8. [ ] 내일(2026-06-14, 일) daily 페이지 열어 배치도 입력 시연.
9. [ ] 회귀 점검: daily 본문/이월/실시간 영향 0(배치도는 독립 테이블).

---

## 6. 세션 충돌 메모 (2026-06-13)
- 작업 중 작업트리 브랜치가 `main`→`feature/edge-ensure-daily-page`로 전환됨(다른 세션).
- 본 PLAN/SPEC와 ARCHITECTURE/CLAUDE 수정은 uncommitted 상태로 보존됨.
- 구현은 다른 세션 종료 후 `main` 기준 전용 브랜치에서 재개(사용자 지시).
