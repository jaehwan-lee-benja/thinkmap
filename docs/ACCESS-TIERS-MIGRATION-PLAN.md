# ACCESS-TIERS 이관 계획 (Phase A → C)

> 합의안: [ACCESS-TIERS-SPEC.md](./ACCESS-TIERS-SPEC.md) · 모델 = grant(노드×능력) + `can()`
> 이 문서는 **이관 순서·불변식·검증 시나리오**다. 아래 Phase C SQL은 **스케치(적용 금지)** 이며,
> 실제 적용은 단계마다 supabase-guardian 검수 → 사용자 승인 → 통합 세션이 한다.
>
> 상태: **Phase A 프로덕션 적용 완료**(2026-06-25, baseline `baseline/access-tiers`,
> 마이그 `access_tiers_phase_a`, grants=4 시드 검증). Phase C는 미적용 — 본 계획 정교화 중.

---

## 0. 안전 불변식 (모든 cutover 공통)

1. **추가 먼저, 교체 나중.** 새 경로를 만들고 검증한 뒤에야 옛 경로를 끊는다.
2. **무중단·무삭제·무재배정.** 운영 데이터 행은 삭제/소유자 변경하지 않는다.
3. **한 번에 한 테이블.** 정책 교체는 도메인 단위로 쪼개 적용·검증.
4. **is_master()는 건드리지 않는다(가능한 한).** app_users 기반 마스터 판정은 그대로 유효한
   "마스터=워크스페이스 owner" 지름길로 둔다. 새 정책은 `can()`을 쓰고, 둘은 *패리티*로 일치만
   확인한다. is_master 본문 교체(shim화)는 **선택적·최후** 단계(단일 출처 정리용).
5. **되돌릴 수 있는 상태 유지.** 옛 정책 제거 직전까지 언제든 새 정책만 DROP 하면 원복.

### ⚠️ 선결 블로커 — grants 지속 동기화 (2026-07-11, supabase-guardian 발견)
`grants` 백필(Phase A)은 **1회성**이다. 이후 `app_users.role`이 master 로 바뀌거나 신규 승인돼도 그걸 `grants`에 반영하는 트리거·앱 로직이 **없다**(src 전체에 `INSERT INTO grants` 없음, AdminModal 승격/승인 플로우에 grants 언급 전무).
→ **결과:** 어떤 테이블이든 옛 `is_master()` 정책을 제거해 grants 단독으로 만들면, 그 후 추가되는 마스터는 grants row 없이는 **조용히 접근 실패**(에러 없이 빈 결과). is_master() 정책은 지금 **비용 0의 안전망**(OR=넓히기만)이라 제거의 기능 이득이 없다.
→ **규율:** 어떤 cutover(C-P ③ 포함)든 **옛 is_master 정책 제거는 grants 동기화가 자동화된 뒤에만.** 그 전까지는 dual-run(병행)을 유지한다. 최소한 "마스터 추가 시 grants 수동 삽입" 런북이라도 선행.
→ **후속 티켓(미착수):** 마스터 승격/신규 승인(AdminModal → app_users update) 시 `grants(subject_user_id, scope=workspace, capability=owner)` 자동 삽입 + 강등/비활성 시 삭제. 이게 C-P ③·C-1 이후 전 단계의 선결.

---

## 1. 이관 불변식 — "이중 정책(dual-run)" 패턴

PostgreSQL의 permissive RLS 정책은 **OR로 합산**된다. 따라서 기존 정책 옆에 새 정책(_v2)을
함께 켜면, 병행 기간 동안 접근은 **넓어지기만 하고 절대 좁아지지 않는다**(= 데이터 못 보는
사고가 구조적으로 불가능). 좁아질 수 있는 유일한 순간은 *옛 정책 제거 시점*뿐 → 그 직전에
패리티를 재확인한다.

```
① 추가  : 기존 정책 유지한 채 _v2 정책(can 기반)을 함께 생성. 접근 = 기존 OR 신규 ⊇ 기존.
② 검증  : 병행 기간에 "신규 정책 단독으로도 기존과 같은 집합"인지 패리티 쿼리로 확인(= 충분성).
         계정별(마스터/멤버/inactive)로 가시·편집 집합이 동일해야 한다.
③ 제거  : 신규 단독 충분성 확인 후에만 기존 정책 DROP. 직전 패리티 재확인 + 즉시 롤백 대기.
```

> 핵심: ②에서 검증하는 것은 "v2 = v1 (정확히 같은 집합)". v2 ⊋ v1(너무 넓음)도 부적합 —
> 의도 외 노출이므로 잡아낸다. 동일 집합 확인 후에만 ③.

---

## 2. 순서 — 위험 오름차순 (파일럿 먼저)

| 순서 | 대상 | 사용자 집합 | 위험 | 목적 |
|---|---|---|---|---|
| **C-P 파일럿** | payroll (마스터 전용) | 마스터만(2명) | **최저** | grants의 `owner` 경로를 프로덕션에서 첫 검증 |
| **C-1** | goals·dashboard 진입 (마스터 전용) | 마스터만 | 낮음 | 파일럿 패턴 복제 |
| **C-2** | members 기본·daily_blocks·roster (워크스페이스) | 전 멤버 | 중 | grants의 `editor`/`viewer` 경로 검증 |
| **C-3** | shares→grants 이관 + pages·projects·blocks (개인 plane) | 공유 사용자 | **최고** | 라이브 공유 — 마지막, 최대 신중 |
| **C-4** | linked_accounts/임퍼소네이션 제거 | rlawldus0621 등 | 중 | 모든 경로 grants 검증 후 최종 |
| **C-5(선택)** | is_master() shim화 (단일 출처 정리) | 전체 | 중 | grants가 모든 곳의 권위가 된 뒤에만 |

> 왜 payroll 파일럿? 마스터만 접근 → 사용자 집합이 가장 작고, 마스터는 owner grant가 시드·검증돼
> 있어 패리티가 자명. 사고 반경 최소로 "grants 경로가 프로덕션에서 옳게 작동함"을 입증한 뒤 확산.

---

## C-P 파일럿 — payroll (스케치, 적용 금지)

현재: payroll_sheets 정책 = `is_master()` 단일 게이트.
목표: `can_in_workspace(current_workspace(), 'owner')` 로 동일 결과.

```sql
-- ① 추가 (기존 is_master 정책 유지한 채 병행)
CREATE POLICY payroll_select_v2 ON payroll_sheets FOR SELECT
  USING (can_in_workspace(current_workspace(), 'owner'));
-- (INSERT/UPDATE/DELETE도 동일 패턴으로 _v2 추가)
```
```sql
-- ② 검증: 두 경로의 마스터 집합 동일성(차집합 0행이어야 통과)
WITH old AS (SELECT u.id FROM app_users au JOIN auth.users u ON LOWER(u.email)=LOWER(au.email)
             WHERE au.role='master'),
     new AS (SELECT subject_user_id id FROM grants
             WHERE scope_type='workspace' AND scope_id=current_workspace() AND capability='owner')
(SELECT 'old_only' s,id FROM old EXCEPT SELECT 'old_only',id FROM new)
UNION ALL (SELECT 'new_only',id FROM new EXCEPT SELECT 'new_only',id FROM old);
-- 0행 → payroll에 실제 접근하는 집합이 양 경로 동일. 며칠 병행 후 ③.
```
```sql
-- ③ 제거 (검증 통과 후에만)
DROP POLICY "Master can view payroll_sheets" ON payroll_sheets;  -- 실제 정책명으로
```
**롤백:** 원 payroll 정책(is_master 기반) 재생성. _v2는 언제든 DROP 가능.

---

## C-1 — goals·dashboard (스케치)

payroll 파일럿과 동일 패턴(`can_in_workspace(ws,'owner')`). goals 데이터 테이블 +
dashboard 진입 pages 정책. 파일럿에서 owner 경로가 입증됐으므로 복제·검증만.

---

## C-2 — 워크스페이스 협업 도메인 (스케치)

| 테이블 | 새 SELECT(_v2) | 새 WRITE(_v2) | 비고 |
|---|---|---|---|
| members(기본) | `can(ws, viewer)` | `can(ws, owner)` | 열람 공개 / 마스터 편집 |
| daily_blocks | `can(ws, viewer)` (행 visibility='master'면 `can(ws, owner)`) | `can(ws, editor)` | 행가림 WITH CHECK 유지 |
| roster_assignments | `can(ws, viewer)` | `can(ws, editor)` | 보드멤버 제한 → 전원편집으로 평탄화(SPEC §6) |

검증(예 — daily_blocks): 멤버/마스터/inactive 각 계정의 가시 블록 수가 기존과 동일한지.
visibility='master' 블록이 비마스터에게 안 보이는지 **반드시 별도 확인**(행가림 회귀 위험).

> ★ roster 쓰기를 "마스터+보드멤버"에서 "전 멤버"로 넓히는 건 *의도된 행동 변경*(SPEC 합의).
> 이 한 건만 "패리티(동일)"가 아니라 "의도적 확대"이므로, 검증은 "보드멤버 아닌 멤버도
> 편집되는가"를 확인하는 방향. 사용자 재확인 1줄 권장.

---

## C-3 — shares → grants + 개인 plane (스케치, 최고 위험)

**(1) 복사(병행):** shares를 grants(resource)로 미러. shares는 그대로 둔다.
```sql
INSERT INTO grants (subject_user_id, workspace_id, scope_type, scope_id, resource_kind, capability)
SELECT s.shared_with_user_id, current_workspace(), 'resource', s.resource_id, s.resource_type,
       CASE WHEN s.permission='editor' THEN 'editor' ELSE 'viewer' END
FROM shares s
WHERE s.shared_with_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM grants g WHERE g.subject_user_id=s.shared_with_user_id
                  AND g.scope_type='resource' AND g.scope_id=s.resource_id
                  AND COALESCE(g.resource_kind,'')=s.resource_type);
```

**(2) 계층 결정 — project 공유가 하위 page를 덮는 처리 (확정 필요):**
현재 pages 정책은 `shares.resource_type='project' AND resource_id=pages.project_id`로
프로젝트 공유가 그 하위 페이지 전체를 커버한다. 이를 grants에서 어떻게 풀지 — **두 안:**
- **(가) 정책 안에서 이중 호출** *(권고 — 안정적)*: pages 정책이 page grant와 project grant를
  각각 확인. `access_can`은 단순·범용으로 유지, 계층 로직은 정책에 명시적.
  ```sql
  CREATE POLICY pages_select_v2 ON pages FOR SELECT USING (
    auth.uid() = user_id
    OR access_can(current_workspace(), 'page',    id,         'viewer')
    OR access_can(current_workspace(), 'project', project_id, 'viewer')  -- 프로젝트→페이지 상속
  );
  ```
- **(나) `access_can` 본문에 계층 상속 내장**: "project grant가 그 project의 모든 page를
  덮는다"를 함수가 알게. SPEC의 "단일 호출" 지향엔 맞지만, 함수가 도메인 트리(project→page)를
  알아야 해 결합도↑. 그룹(매장) 계층 도입 시 재검토.
- **결정: (가) 채택.** 안정 우선 — access_can을 도메인 무지(generic)로 유지하고, 어느 노드가
  어느 하위를 덮는지는 각 정책이 명시. (group 계층은 나중에 같은 이중호출 방식으로 확장)

**(3) 정책 교체:** pages/projects/blocks SELECT/UPDATE/INSERT/DELETE를 위 _v2 패턴으로.
`is_linked_account*()` 절은 C-4까지 **남겨둔다**(병행).

**검증:** 이관 전후 각 사용자 가시/편집 page·project 집합 동일성(아래 §검증 시나리오).
프로젝트 단위 공유 케이스를 **반드시 샘플 포함**.

---

## C-4 — 임퍼소네이션 정리 (스케치)

**선결:** rlawldus0621가 *자기 계정으로* partner 데이터 전부 보이고 편집됨을 실증(SPEC §5 ③).
이는 partner 데이터의 워크스페이스/그룹 귀속(§11, 기본=워크스페이스 자산 §2.7) 확정 + 그
데이터 정책이 C-2/C-3에서 can()으로 바뀐 뒤 성립.

- **편집(linked):** 위 실증 후 정책의 `is_linked_account*()` 절 제거 → `linked_accounts` 폐기.
  프론트 `effectiveSession`/연결계정 전환 UI 제거.
- **뷰어모드:** 세션교체 제거. "권한 미리보기"(읽기전용 `can()` 시뮬레이션)로 대체.

---

## C-5 (선택, 최후) — is_master() shim화

grants가 모든 도메인에서 권위가 된 뒤, 단일 출처 정리를 원하면:
```sql
CREATE OR REPLACE FUNCTION is_master() RETURNS boolean AS $$
  SELECT can_in_workspace(current_workspace(), 'owner');
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;
```
**선결:** C-P 파일럿의 패리티 쿼리가 지속적으로 0행(완전 일치)임을 확인.
**롤백:** 원 is_master(app_users 기반, migrate-dynamic-master.sql:8) 재적용.
> 필수가 아니다 — app_users 기반 is_master를 영구히 둬도 모델은 정상 작동. 정리 차원의 선택.

---

## 단계별 cutover 체크리스트 (재사용)

각 cutover(C-P~C-3)는 이 순서를 따른다:

- [ ] 새 정책 _v2 작성 (기존과 "같거나 넓게" 설계)
- [ ] supabase-guardian 검수 → 사용자 승인
- [ ] 통합 세션: _v2 추가(기존 유지, 병행 시작)
- [ ] 패리티 쿼리 실행 — 계정별(마스터/멤버/inactive) 가시·편집 집합 v2 = v1 확인
- [ ] 행가림(visibility)·계층(project→page) 등 특수 케이스 별도 확인
- [ ] (며칠) 병행 관찰 — 회귀 신고 없음
- [ ] 패리티 재확인 직후 기존 정책 DROP
- [ ] DROP 후 즉시 재검증 — 이상 시 _v2 유지한 채 기존 정책 재생성(롤백)

---

## 검증 시나리오 (테스트 계정)

프로덕션 시드 기준 계정으로 각 단계 검증:

| 계정 | grant | 기대 |
|---|---|---|
| designerbenja / kbl0226 | (ws, owner) | 전부(마스터 데이터 포함) 보고 편집 |
| rlawldus0621 / sarurufarm.partner | (ws, editor) | 워크스페이스 협업 데이터 보고 편집, payroll/goals ✗ |
| self.c.design | grant 없음(inactive) | 아무것도 ✗ (deny) |

**도메인별 패리티 쿼리**(예시 — 각 cutover 전후 동일 수치여야):
```sql
-- payroll: 마스터만 보여야
SELECT count(*) FROM payroll_sheets;            -- 마스터 세션: >0, 멤버 세션: 0
-- daily_blocks: 멤버는 visibility='all'만, 마스터는 전부
SELECT count(*) FROM daily_blocks WHERE deleted_at IS NULL;  -- 세션별 비교
-- pages 공유: 프로젝트 공유받은 멤버가 그 프로젝트 하위 페이지를 보는가
SELECT count(*) FROM pages WHERE project_id = '<공유된 project>';  -- 공유 수신 세션
```

---

## 전체 롤백 전략

- Phase A는 추가 전용 → 롤백 = 4 테이블 + 헬퍼 DROP(기존 무영향).
- C-P~C-3는 각 단계가 "기존 보존 + _v2 추가 → 검증 → 기존 제거" 구조 → 기존 제거 직전까지
  _v2만 DROP 하면 원복. 기존 제거는 검증 완료 후 최후.
- 데이터는 복사만(이관), 원본 shares/linked는 C-4 전까지 유지 → 데이터 손실 경로 없음.
- is_master는 C-5 전까지 무변경 → 전수 영향 변경은 맨 마지막 단 한 번(선택).
