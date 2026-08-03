# RLS 정책 아키텍처 리팩토링 설계서

> 상태: **설계만(2026-08-01 작성) · 실행은 유저 게이트.** 작성 = thinkmap 통합세션.
> 발주: 지휘자(유저 통찰 "리팩토링이 필요해 보인다"). 정본 참조 = `~/claude-project/docs/ARCHITECTURE-PRINCIPLES.md` §10,
> [ACCESS-TIERS-SPEC.md](./ACCESS-TIERS-SPEC.md), [ACCESS-MODEL.md](./ACCESS-MODEL.md).
> ★진행 중인 무조건 SELECT 하드닝(`migrate-rls-harden-unconditional-select.sql`)은 **지혈**이고, 이 문서는 **수술 도면**이다.

---

## 0. 먼저: 증상 진단이 틀렸다

발주 시점 인식은 "무조건 허용 정책이 17개나 된다"였다. 실측 결과:

| 항목 | 실측값 |
|---|---|
| public 정책 총계 | **153개** (RLS 테이블 54개) |
| 진짜 무조건 허용(`qual='true'`) | **5개** (전부 SELECT) |
| "17"의 정체 | `qual IS NULL`인 INSERT 정책을 무조건 허용으로 오독한 것. INSERT는 조건이 `with_check`에 있다 |

**즉 유출 구멍은 5개뿐이다.** 그러나 유저 직관("리팩토링 필요")은 맞다 — 실제 병은 정책 개수가 아니라 아래 4가지 구조 결함이다.

---

## 1. 전수 분류 (153개)

### 1.1 조건 계층별 분포

| 계층 | 정책 수 | 테이블 수 | 성격 |
|---|---|---|---|
| G. 본인 소유(`auth.uid()`/email) | 62 | 28 | 개인 데이터 |
| D. 마스터+본인 혼합 | 36 | 11 | `is_master() OR uid=…` |
| E. 마스터 전용 | 24 | 21 | 백오피스 |
| C. access-tiers(grant) | 18 | 9 | `can_in_workspace`/`access_can` |
| Z. 스케줄 도메인 헬퍼 | 8 | 3 | `can_view/edit_schedule_owner` |
| A. **무조건 허용** | **5** | **5** | ★하드닝 대상 |
| B. audience(`is_staff`) | **0** | 0 | ★§10.2 미이행 |

### 1.2 헬퍼 인벤토리 — 9개 함수, 4개 패러다임

| 헬퍼 | 사용 정책 수 | 패러다임 |
|---|---|---|
| `is_master()` | 60 | ① 마스터 |
| `is_linked_account()` | 19 | ② 임퍼소네이션 |
| `can_in_workspace()` | 18 | ③ access-tiers |
| `current_workspace()` | 15 | ③ (상수 반환) |
| `is_linked_account_viewer()` | 10 | ② |
| `is_board_member()` | 8 | ④ 보드/roster |
| `can_edit_schedule_owner()` | 5 | ⑤ 스케줄 전용 |
| `can_view_schedule_owner()` | 3 | ⑤ |
| `is_board_member_of_page()` | 1 | ④ |

→ **같은 질문("이 사람이 이걸 볼 수 있나")에 5가지 답변 방식이 공존.** ACCESS-TIERS-SPEC이 겨냥한 수렴이 18개 정책에서만 이뤄졌다.

### 1.3 ★최대 결함 — PERMISSIVE OR-widening (중복 정책)

같은 (테이블, cmd)에 PERMISSIVE 정책이 2~3개 있는 조합이 **14개**다. PERMISSIVE는 **OR 결합**이므로
**가장 느슨한 정책이 실효 조건을 결정**한다.

| 테이블 | cmd | 정책 수 | 비고 |
|---|---|---|---|
| `app_users` | UPDATE | 3 | `Users can self-update own auth_uid` / `Users can update own auth_uid` = 사실상 중복(레거시 드리프트) |
| `app_users` | INSERT | 3 | `Users can insert own record` / `Users can self-insert own record` = 중복 |
| `worklog_sections` | UPDATE | 3 | master/user/일반 3중 |
| `app_users` | SELECT | 2 | 하드닝 대상 + `Users can view own record` |
| `pages` | SELECT·INSERT·UPDATE·DELETE | 각 2 | worklog 변종이 원본과 병존 |
| `worklog_comments` | SELECT·INSERT | 각 2 | 동일 패턴 |
| 그 외 | — | 2 | `shares`, `worklog_board_members`, `worklog_sections` DELETE/INSERT |

**이것이 리팩토링이 필요한 진짜 이유다:**
- 정책 하나를 조여도 **형제 정책이 남으면 무효** → "조였다"를 정책 한 줄만 보고 검증할 수 없다.
- 실제로 이번 하드닝에서도 대상 5개 테이블의 형제 정책을 전수 확인해야 했다(다행히 전부 좁았음 — `auth.uid()=auth_uid` 또는 `is_master()`).
- 레거시 중복(`Users can insert own record` vs `...self-insert own record`)은 **어느 쪽이 산 정책인지 아무도 모르는 상태**다.

### 1.4 나머지 결함
- **audience 계층 전무**: 153개 중 0개. §10.2 장치2(bare authenticated 금지)는 현재 **전면 미이행**.
- **회귀 안전망 부재**: 정책 변경의 영향을 확인할 자동 검증이 없다 → 아무도 153개를 못 건드린다(오늘 하드닝도 매번 서브에이전트로 코드 전수조사를 해야 했다).

---

## 2. 표준화 — 헬퍼 정본 세트 + 정책 템플릿

### 2.1 헬퍼 정본 3층 (이것만 쓴다)

```
층1 관객(audience)  : is_staff() / is_customer()          ← §10.2, 모든 정책 필수
층2 등급(capability): can_in_workspace(ws, 'viewer'|'editor'|'owner')
                      access_can(ws, kind, id, need)       ← 항목 단위 공유
층3 소유(ownership) : auth.uid() = <owner_col>             ← 개인 데이터
```

**폐지/흡수 대상**
| 현재 헬퍼 | 처리 |
|---|---|
| `is_master()` | 유지(shim). 의미 = `can_in_workspace(current_workspace(),'owner')`. 신규 정책엔 쓰지 않음 |
| `is_board_member()` / `is_board_member_of_page()` | ★**roster 도메인 일관성 규율에 따라 Phase C까지 유지**(CLAUDE.md ⚠️). Phase C에서 층2로 일괄 흡수 |
| `can_view/edit_schedule_owner()` | 층2+층3 조합으로 표현 가능 → Phase C 흡수 대상 |
| `is_linked_account*()` | 임퍼소네이션은 **직교 관심사**(누구로 행동하는가). 층과 별개로 유지하되 정책에선 층2/3 안에 감싼다 |

### 2.2 정책 템플릿 (앞으로 모든 정책은 이 형태로만)

```sql
-- T1. 워크스페이스 자산 — 읽기
CREATE POLICY <t>_select ON <t> FOR SELECT TO authenticated
  USING (is_staff() AND can_in_workspace(<ws_col_or_current>, 'viewer'));

-- T2. 워크스페이스 자산 — 쓰기(INSERT/UPDATE/DELETE 각각, FOR ALL 금지)
CREATE POLICY <t>_insert ON <t> FOR INSERT TO authenticated
  WITH CHECK (is_staff() AND can_in_workspace(<ws>, 'editor'));

-- T3. 개인 데이터 — 본인 + 마스터
CREATE POLICY <t>_select ON <t> FOR SELECT TO authenticated
  USING (is_staff() AND (auth.uid() = <owner> OR can_in_workspace(current_workspace(), 'owner')));

-- T4. 고객 표면 — 본인 것만
CREATE POLICY <t>_select ON <t> FOR SELECT TO authenticated
  USING (is_customer() AND auth.uid() = <owner>);
```

**규범 3개**
1. **bare authenticated 금지** — 모든 정책은 층1(`is_staff()`/`is_customer()`)을 AND 결합한다. (§10.2 장치2, guardian 상시 검수 항목)
2. **(테이블, cmd)당 PERMISSIVE 정책 1개** — 조건이 여럿이면 OR로 **한 정책 안에** 쓴다. 형제 정책 금지.
3. **`FOR ALL` 금지** — cmd별로 나눠 쓴다(FOR ALL은 SELECT까지 조용히 넓힌다. 실제로 workspaces 등 3테이블이 이 함정에 있다).

---

## 3. ★RLS 회귀 테스트 스위트 (이게 리팩토링의 전제조건)

153개를 손대려면 "무엇이 깨졌는지 즉시 아는 장치"가 먼저 있어야 한다. **안전망 없는 일괄 전환은 반대.**

### 3.1 설계

**계정 유형 × 핵심 테이블 → 기대 행수 매트릭스.**

```
계정 유형(6): master / board_member / member / viewer(grant only) / customer / anon
핵심 테이블(우선 12): app_users · pages · daily_blocks · worklog_sections · worklog_comments
                      · schedule_events · seat_orders · roster_* · payroll_* · goals
                      · workspaces · page_type_access
```

각 칸의 기대값은 **행수**(0 / 1 / N / ALL)로 표기. 예:

| 테이블 | master | member | viewer | customer | anon |
|---|---|---|---|---|---|
| `app_users` | ALL | ALL | ALL | **0** | 0 |
| `app_users`(grant 없는 신규 staff) | — | — | — | — | **1**(자기 행) |
| `worklog_sections` | ALL | ALL | ALL | **0** | 0 |
| `seat_orders` | ALL | ALL | ALL | **0** | 0 |
| `workspaces` | 1 | 1 | 1 | **0** | 0 |

### 3.2 실행 방식 (핵심 기법)

계정별 세션을 실제로 만들지 않고 **JWT 클레임 주입**으로 판정한다:

```sql
-- 한 계정을 흉내내는 방법
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<uuid>","email":"<email>",
                                 "app_metadata":{"audience":"staff"}}';
SELECT count(*) FROM app_users;   -- 기대값과 대조
```

★함정(오늘 guardian이 잡은 것): `SET LOCAL ROLE authenticated`만 하면 `auth.uid()`/`auth.jwt()`가 비어
**익명을 테스트하는 것**이 된다. 반드시 `request.jwt.claims`를 함께 세팅해야 "그 계정"을 테스트한다.

### 3.2.1 ★권한상승 시나리오 테스트 (정책 행수 대조만으로는 못 잡는다)

2026-08-01 사건의 교훈: crm이 **정책만 보고** "자기삽입 → is_master" 승격을 보고했으나, 같은 테이블의
**트리거**(`guard_app_users_privilege`)가 막고 있어 결론이 뒤집혔다. 역으로, 트리거가 꺼지면 정책만으로는
막히지 않는다. → 스위트는 **행수 매트릭스와 별개로 "시나리오 테스트"**를 갖는다.

| # | 시나리오 | 방법 | 기대 |
|---|---|---|---|
| S-1 | 자기삽입 승격(INSERT 경로) | 비마스터 클레임으로 `insert app_users(email, role='master', status='active')` → 저장값 확인 → ROLLBACK | `role='user'`, `status='pending'` 강제 하향 |
| S-2 | 자기승격(UPDATE 경로) | 비마스터가 자기 행 `role='master'` UPDATE → ROLLBACK | `RAISE EXCEPTION` 발생 |
| S-3 | ★**가드 우회**(트리거 DISABLE 창) | 트리거를 DISABLE한 상태에서 S-1 재실행 → 즉시 재ENABLE | 정책 `with_check`가 role/status를 고정해 여전히 차단(이중 방어 확인) |
| S-4 | 비활성 마스터 | `status='inactive'` 마스터 클레임으로 `is_master()` 호출 | `false` (오프보딩 결함 회귀 방지) |
| S-5 | 미승인 신규 가입자 | `status='pending'` 계정으로 `app_users` 자기 행 조회 | **1 rows**(자기 상태 확인 가능 — 승인 게이트 동작 전제) |
| S-6 | 고객 audience | `audience='customer'` 클레임으로 내부 테이블 조회 | 전부 **0 rows** |

★S-3은 **쓰기 트리거를 잠시 끄는** 파괴적 테스트다 → 반드시 트랜잭션 안에서 하고, 프로덕션에서는
저트래픽 시간대에만. (가드 DISABLE 런북과 동시 실행 금지 — [[is_staff 폴백 의존성]] 참조.)
★S-5는 오늘 guardian이 잡은 🔴(하드닝 초안이 승인 게이트를 무력화)의 **회귀 방지 테스트**다.

### 3.3 산출물
- `tools/rls-suite/matrix.json` — 기대값 표(사람이 읽고 고치는 정본)
- `tools/rls-suite/run.js` — 주입·조회·대조 실행기. 종료코드로 통과/실패. **service_role 키 필요(로컬 전용)**
- 출력: 실패 칸만 `테이블 · 계정유형 · 기대 N · 실제 M` 형태로

### 3.4 게이트로 승격
- **모든 RLS 마이그의 필수 선행·사후 단계**로 편입(배포의 번들해시 대조처럼).
- guardian 검수 요청 시 "스위트 통과 결과"를 첨부한다.

---

## 4. Phase C 일괄 전환 계획

> ACCESS-TIERS-MIGRATION-PLAN의 Phase C(대기 상태)를 이 문서가 구체화한다. **스펙 개정 함의는 §5**.

| 단계 | 내용 | 게이트 |
|---|---|---|
| **C-0** | 회귀 스위트 구축(§3) + 현 상태 baseline 스냅샷 | 스위트가 **현 정책에서 전부 통과**해야 시작 |
| **C-1** | audience 이행 완료 — `is_staff()`/`is_customer()` 신설 + 전 계정 태깅 + **폴백 제거**(하드닝 STEP 1·3) | 태깅 5/5, 토큰 회전 확인 |
| **C-2** | **중복 정책 정리** — 14개 조합의 형제 정책을 1개로 병합. ★기능 변경 0(합집합을 그대로 한 정책에 OR로 옮김) | 스위트 통과(행수 불변) |
| **C-3** | `FOR ALL` 정책 분해(cmd별) — workspaces·workspace_groups·page_type_access 외 전수 | 스위트 통과 |
| **C-4** | 템플릿 적용 — 층1 결합을 153개 전체로. 배치는 **도메인별**(daily → worklog → schedule → roster/payroll → seat → pages) | 배치마다 스위트 + 실사용 스모크 |
| **C-5** | 도메인 헬퍼 흡수 — schedule·board 헬퍼를 층2로. roster 도메인은 이 단계에서 일괄(CLAUDE.md 규율) | 스위트 + 도메인 오너 확인 |
| **C-6** | §10.2 장치3·4 — 내부 스키마 PostgREST 노출 분리, 고객 표면 Edge 규범 | 별도 설계 필요 |

### 4.1 배치 원칙
- **한 배치 = 한 도메인**. 배치당 단일 트랜잭션, 롤백은 그 배치만.
- 배치 전후로 스위트 실행. **행수가 하나라도 변하면 즉시 중단**(C-2·C-3은 기능 불변이 목표).
- C-4부터는 행수가 **의도적으로** 변한다(customer 차단) → 기대값 표를 먼저 갱신하고 그 표로 검증.

### 4.2 롤백
- 정책 DDL만이므로 데이터 무손실. 배치별 역방향 SQL을 같은 파일에 동봉.
- ★단 C-1의 폴백 제거는 **구 JWT 세션을 끊는다** → 되돌려도 재로그인이 필요할 수 있음. 영업시간 외 적용 권장.

---

## 5. 스펙 개정 함의 (문서만, 이 설계서는 스펙을 고치지 않는다)

- **ACCESS-TIERS-SPEC**: §2 모델에 **층1(관객)** 추가 필요. 현재 "노드 × 능력" 2축인데 §10.2로 **관객 × 노드 × 능력** 3축이 됐다.
- **ACCESS-MODEL**: 헬퍼 인벤토리(§)를 위 §1.2 실측표로 갱신. "3 패러다임"이 실제로는 5개다.
- **ACCESS-TIERS-MIGRATION-PLAN**: Phase C를 위 C-0~C-6으로 대체. C-0(스위트)가 신설 선행조건.
- **CLAUDE.md**: 신규 RLS 규범에 "bare authenticated 금지 + 형제 정책 금지 + FOR ALL 금지" 3줄 추가 제안.

---

## 6. 권고 (통합세션 판단)

1. **지금 당장 할 것 = 하드닝 5개(지혈)뿐.** 실유출은 아직 0이지만 유일한 실존 구멍이다.
2. **C-0(회귀 스위트)를 다음 우선순위로.** 이게 없으면 나머지 전부가 "무서워서 못 건드리는" 상태로 남는다. 투자 대비 효과가 가장 크다.
3. **C-2(중복 정책 정리)를 C-4보다 먼저.** 기능 불변이라 위험이 낮고, 끝나면 "정책 1개 = 실효 조건"이 되어 이후 모든 작업의 검증 비용이 급감한다.
4. **C-4~C-5는 서둘 이유 없다.** 오늘 시점 실제 위험은 낮고(계정 5개·전원 직원), 고객 계정이 생기는 시점(게임 재출발)이 진짜 데드라인이다. → **게임 재출발 전까지 C-0~C-3 완료**를 목표로 제안.

---

## 7. 추적 필요 후속 과제 (SQL 주석에 두지 말 것 — 여기가 정본)

| # | 과제 | 왜 | 게이트 |
|---|---|---|---|
| F-1 | ★**신규 직원 온보딩 시 `app_metadata.audience='staff'` 세팅 경로** 구현(Admin API/Edge) | 현재 코드베이스에 audience 세팅 코드가 **0건**. 하드닝 STEP 3(폴백 제거) 후 입사자는 `is_staff()`가 영구 false → 앱 사용 불가 | ★STEP 3의 **차단 전제**. 미구현 시 STEP 3 적용 금지 |
| F-2 | 나머지 정책 §10.2 정렬(bare authenticated 금지 전면 적용) | 153개 중 audience 결합은 하드닝 5개뿐. 규범 완전 이행은 별건 | Phase C-4 |
| F-3 | `guard_app_users_privilege` 임시 DISABLE 런북에 **경고 추가** | 그 창에서 `is_staff()` 폴백도 함께 열리고, grants-sync가 승격을 워크스페이스 editor로 자동 전환 | 런북 문서 수정(즉시 가능) |
| F-4 | 고객 표면 audience 태깅(`is_customer()` 실사용) | 현재 `is_customer()`는 항상 false(태깅 코드 0건). 게임 재출발 시 첫 적용 | §10.3 2단계 |
| F-5 | `pages_insert_worklog` 등 "승인 무관 개방" 정책 재검토 | `page_type IN ('calendar','daily') AND auth.uid() IS NOT NULL` — 미승인 계정도 통과. 현재 유일 방어선이 **클라이언트 게이트**뿐 | Phase C-4 (별건 위험) |
