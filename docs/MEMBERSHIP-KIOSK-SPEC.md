# 멤버십 키오스크 (Membership Kiosk) — 아키텍처 결정 + 설계 제안

> 상태: **아키텍처 A 확정 + CRM 계약 확정(초안) + 인증모델 확정 (2026-07-24).** 프론트 셸 스캐폴드 완료(미커밋·미배포). 데이터 플레인은 하드게이트(§8) 대기.
> 작성: membership 세션(홈 `thinkmap-membership`, feat/membership-kiosk).
> 근거 문서: [SITE-SPLIT-PLAN.md](./SITE-SPLIT-PLAN.md)(위성 모델) · CRM-BOARD-SPEC(engine-metrics 계약 패턴) · CONDUCTOR.md(크로스도메인 규율) · `crm-archive/MEMBERSHIP-KIOSK-CONTRACT.md`(crm producer 계약 정본).
>
> **이 문서는 합의서다.** §1 확정. §3 계약은 crm 계약문서와 정합. §2~§6이 구현 기준.

---

## 0. TL;DR — 외울 것 4개

```
① 형태 : 경량 위성(apps/membership) — SITE-SPLIT Phase 6. seat/inventory처럼 완전 독립·에디터 무의존.
② 특이점: 회원 데이터는 thinkmap DB가 아니라 crm 소유(multi-store DB). 기존 위성 5개와 다르게
          "같은 DB 직접읽기"가 아니라 crm과 Edge 계약을 맺는 소비자 위성.
③ 계약 : 회원조회·이벤트쓰기·가입 = crm 발행 Edge(시크릿 게이트). thinkmap Edge가 프록시로
          시크릿을 쥔다(engine-metrics-sync 선례). 브라우저엔 시크릿·전체 고객DB 절대 노출 X.
④ 보안 : 매장 태블릿 = 최소권한. 정확한 전체 번호 매칭만(부분검색·목록 금지)+레이트리밋+직원게이트.
          고객모드(태블릿 가로로 돌려 고객에게, 화면 정방향)는 조회결과 안 보이는 제한 서브뷰.
```

---

## 1. ★아키텍처 결정 — 3안 비교 → **A 확정 (유저 승인 2026-07-24)**

유저 고민: **thinkmap 통합 vs 독립 사이트.** 지휘자 권고 = 경량 위성(hub-and-spoke).
**→ 결론: A(경량 위성) 확정.** 아래 표는 판단 근거(보존).

| | A. 경량 위성 ★권고 | B. 모선 페이지 | C. 완전 독립 사이트 |
|---|---|---|---|
| 위치 | `apps/membership` (thinkmap 모노레포) | 모선 `src/` 안 `page_type=membership` | 별도 레포·별도 배포 |
| 코어 | `@thinkmap/core` 재사용(인증·client·테마) | 모선 코어 직접 | core 복붙 or published |
| 번들 | ~380KB (TipTap 무의존, seat급) | 모선 1.65MB에 합류(무거움) | 독립(경량 가능) |
| SSO | 같은 origin 자동(직원 로그인) | 모선 세션 그대로 | ✗ 별도 로그인 구축 |
| 허브 관리 | site_nodes 레지스트리 등록 | 모선 내부 | ✗ 레지스트리 밖(관리 분산) |
| 병렬 작업 | apps/membership만 건드림=충돌 0 | 배선 hotspot 충돌 | 충돌 0(단 인프라 중복) |
| 배포 | gh-pages 하위폴더 `/thinkmap/membership/` | 모선과 한 배포 | 별도 CI/도메인 |
| CRM 데이터 | Edge 계약 소비 | Edge 계약 소비(동일) | Edge 계약 소비(동일) |
| 다장치 | ✅ 매장 태블릿 = URL 하나 | ✅ | ✅ |

**→ 권고 = A(경량 위성).** 근거:
- 멤버십은 **다장치·상시(매장 태블릿) 근저 기능** → 모선 무겁게 안 하고(B 탈락) 가볍게 독립.
- 허브 레지스트리(site_nodes)로 관리 → C의 "허브 관리 분산" 우려 해소.
- `@thinkmap/core` 재사용 + 같은 origin SSO(직원이 thinkmap 계정으로 로그인) = C의 인증 중복·드리프트 부채 없음.
- **CRM 데이터 계약은 세 안 모두 동일**(회원 데이터가 다른 프로젝트에 사는 건 프론트 위치와 무관) → 위성이 계약 소비의 부담을 늘리지 않음.
- 미래에 "멤버십을 단독 제품으로 판다"가 되면 위성→독립 레포 졸업 경로 열려 있음(SITE-SPLIT §6).

> ⚠️ 정직한 차이점: 기존 위성 5개는 thinkmap DB(`sqisntxippjzcekyhqyo`)를 **직접** 읽는다.
> 멤버십은 데이터가 **multi-store(`rstazttwlghsorpzsugy`) crm 스키마**에 있어 **Edge 계약으로만** 접근.
> 즉 위성 셸·SSO·번들 이점은 그대로 누리되, **데이터 플레인은 crm과의 계약**이다(§3).

---

## 2. 목표 6기능 → 기능 매핑

| # | 유저 요구 | 이 설계에서 | v1 여부 |
|---|---|---|---|
| 1 | 직원이 회원 여부 확인 | 직원 조회모드(번호패드→결과카드) | v1 |
| 2 | 번호 입력 → 멤버십 DB 조회 | crm `membership-lookup` Edge 계약 | v1 |
| 3 | 이벤트 카운트(팝콘 1일1회) | `membership_events` + 1일1회 서버 유니크 가드 | v1 |
| 4 | POS 포인트 취합 | 회원별 잔액 존재 확인(UnionPOS RemainPoint). **유저결정: 스냅샷 혼란 회피 위해 v1 미표시, v2 라이브로 연기** | v2(라이브) |
| 5 | 직원·고객 입력 편의 | 대형 번호패드·오타방지(확인·백스페이스·클리어) | v1 |
| 6 | 쉬운 회원가입(고객모드, 태블릿 가로회전) | 2단 가입폼(전화+번호패드 / 이름·이메일) → crm `membership-intake` | v1 |

**추가 요구(2026-07-25):**
| # | 유저 요구 | 이 설계에서 | 게이트 |
|---|---|---|---|
| 7 | 검색 결과 인사말 | 결과카드 상단 `안녕하세요, {이름} 멤버십 회원님!`(display_name) | 프론트만 |
| 8 | 팝콘 이벤트 서버기록·1일1회·수령내역·참여완료 | 적립=기존 `membership-event-claim`(1일1회 partial-unique, 적용됨). 수령내역=신규 `membership-history`→crm `membership-events`(읽기 RPC 추가). 오늘 받았으면 버튼 비활성 | crm 읽기 RPC/Edge |
| 9 | 회원 리스트(직원용 검색) | 별도 화면(이름+전화 표+부분검색). 신규 `membership-list`→crm | ★보안결정(§5.2) |

---

## 3. 데이터 모델 & CRM 계약 (data owner = crm)

### 3.1 소유 경계
- **회원 마스터(진실원천) = crm.** `crm.customer_sources`(source='membership', 137명) + `membership-intake`. **crm 소유·불가침.**
- 멤버십은 **소비자**: 조회(읽기) + 이벤트/가입(쓰기 요청)만. 전체 고객DB를 절대 프론트로 끌어오지 않음.
- **이벤트 데이터 위치 결정(제안): crm 도메인(multi-store crm 스키마)에 둔다.**
  - 이유: 팝콘/방문 카운트는 고객 행동 데이터 → 소유자(crm)가 리텐션 분석에 쓸 자산. thinkmap DB에 두면 고객 데이터가 두 프로젝트로 쪼개져 crm이 못 봄. **crm이 owner, 키오스크는 Edge로 append만.**
  - ↳ 이 테이블 신설은 **crm 도메인 마이그** → 지휘자 경유 crm과 계약. (아래는 계약 제안 스키마.)

### 3.2 계약 제안 — crm이 발행할 Edge 3종 (시크릿 게이트)

engine-metrics 선례: thinkmap Edge가 시크릿(`x-api-key`)을 서버에서 쥐고 crm 엔드포인트를 호출. 브라우저엔 시크릿 없음.

```
[키오스크 브라우저(직원 세션)]
   │  supabase.functions.invoke (thinkmap JWT)
   ▼
[thinkmap Edge: membership-lookup / membership-event / membership-signup]   ← 시크릿 보관, 직원게이트, 레이트리밋
   │  fetch + x-api-key
   ▼
[crm Edge: membership-query / membership-event-claim / membership-intake]   ← crm 소유, 데이터 진실원천
   │
   ▼
[multi-store DB · crm 스키마]
```

**① 회원 조회 `membership-query`** (crm 계약문서 §1.1 — 확정)
- 입력: `{ phone: "01012345678" }` — **정확한 전체 번호만**(부분·prefix·목록 금지, 길이<10 → `{found:false}`).
- 출력(최소 PII, **v1**): `{ found: bool, member_id?: uuid, display_name?: "홍*동", today_event_claimed?: bool }`
  - 이름은 마스킹(가운데 `*`) 기본, 매장 확인용 최소치. 주소·생년월일·타회원 절대 미포함.
  - **포인트는 v1 제외**(유저결정 2026-07-24): 스냅샷 값(UnionPOS `RemainPoint`)이 실시간 아니라 운영 혼란 → query 계약도 v1은 포인트 필드 미반환(crm과 정합). **v2 = 라이브 UnionPOS 조회**로 릴리즈.
- 미발견 시 `{ found: false }`만(존재여부 외 정보 0).

**② 이벤트 적립 `membership-event-claim`**
- 입력: `{ member_id, event_type: "popcorn", date: "2026-07-24" }`
- 서버 가드: `UNIQUE(member_id, event_type, event_date)` → 1일1회. 재요청 시 `{ ok:true, already:true }`(멱등).
- 출력: `{ ok, already, claimed_at }`.

**③ 가입 `membership-intake`**(기존 crm intake 재사용/확장)
- 입력: `{ phone, name, email, consent:true, source:"kiosk" }`. crm intake Edge가 `body.email → p_email`로 캡처(0013 RPC, 정합 확인됨 — crm 측 변경 불요).
- 가입폼(2단): 좌=전화번호(패드+물리키보드), 우=이름·이메일(태블릿 키보드, email `inputmode=email`). 프론트·프록시 Edge 둘 다 이메일 형식 가볍게 검증(최종 검증/정규화=crm).
- crm intake가 dedup(기존 번호면 기존 회원 반환)·검증 담당. 출력: `{ member_id, created: bool }`.

**crm 도메인 테이블 = `crm.membership_events`** (crm 계약문서 §2 / `migrations/0014` 초안 — **crm이 소유·적용**):
- `member_id uuid FK → crm.customers(id)`(★canonical 사람 단위, 소스 병합에도 이벤트 보존) · `event_type`('popcorn') · `event_date` · `claimed_at` · `claimed_by`(직원 감사) · `source default 'kiosk'` · `deleted_at`(오적립=소프트삭제, 하드삭제 금지).
- **partial unique** `(member_id, event_type, event_date) WHERE deleted_at IS NULL` = 1일1회 하드가드(취소 후 재적립 허용).
- RLS on, service_role(RPC)만. Edge는 SECURITY DEFINER RPC(`membership_query`/`membership_event_claim`/`membership_intake`) 경유 → crm 스키마 브라우저 노출 0.

### 3.3 thinkmap 측 신설(내 소유)
- Edge Function 3종(`membership-lookup`/`membership-event`/`membership-signup`) — **프록시·직원게이트·레이트리밋**. 시크릿 `MEMBERSHIP_KIOSK_KEY`(유저가 함수 env 세팅, 값=crm 발급)로 crm Edge 호출. thinkmap DB엔 **회원 테이블을 두지 않는다**(진실원천 crm 단일).
- `membership_kiosk_audit`(thinkmap DB) — 조회/적립 호출 로그(operator·시각·행위). 남용 탐지·레이트리밋 근거·감사용. 민감 PII 없이 member_id + 행위만(번호·이름 미저장).
- **`is_store()` 헬퍼 + 매장 계정 표식**(§5.1) — 프록시 Edge 직원게이트가 `is_master() OR is_store()` 판정에 사용.

---

## 4. 화면 (직원 조회모드 · 고객 가입모드 · 번호패드)

```
┌──────────────────────── 키오스크 (풀스크린) ────────────────────────┐
│ [직원모드 ⇄ 고객모드] 토글            매장/직원 표시        ← 모선   │
├─────────────────────────────────────────────────────────────────────┤
│  직원 조회모드                                                        │
│   ┌── 번호패드 ──┐   ┌── 결과 카드 ────────────────┐                 │
│   │ 1 2 3        │   │ ● 회원  홍*동                │                 │
│   │ 4 5 6        │   │ (포인트=v2 라이브, v1 미표시)│                 │
│   │ 7 8 9        │   │ 오늘 팝콘: [적립하기] / 완료✓ │                 │
│   │ ⌫ 0 ↵조회    │   └─────────────────────────────┘                 │
│   └──────────────┘   (미발견 시 "회원 아님 · 가입 안내" + 고객모드 전환) │
├─────────────────────────────────────────────────────────────────────┤
│  고객 가입모드 (태블릿을 가로로 돌려 고객에게, 화면 정방향) — 2단     │
│   좌: 전화번호[대형 패드+물리키보드]   우: 이름[  ] 이메일[  ]         │
│                                          [ ] 개인정보 동의  [가입]    │
│   ※ 조회 결과·타 회원 정보 표시 안 함(제한 서브뷰)                     │
└─────────────────────────────────────────────────────────────────────┘
```

- **번호패드**: 대형 터치타겟(≥56px, MOBILE-DESIGN ≥36px 상회), 입력 폰트 ≥16px, ⌫/전체지움, 자릿수 그룹 표시(010-1234-5678)로 오타방지, 10자리 미만 조회 비활성.
- **모드 전환**: 직원모드 기본. 고객모드 진입 시 조회 UI 숨김·가입폼만(화면 UI는 정방향 — 직원이 태블릿을 가로로 물리 회전해 고객에게 향함). 복귀는 직원 확인(간단 탭 or PIN, §5).
- **포인트(v1 미표시)**: 결과카드에 포인트 행 없음(유저결정). 스냅샷 값도 표시 안 함 — 실시간 아닌 값의 운영 혼란 회피. **v2에서 라이브 UnionPOS 조회로 부활.**
- **스타일**: 직원모드=건조 스타일(내부도구). 고객모드=고객 대면이라 약간의 온기 허용하되 절제(DESIGN-PHILOSOPHY 준수, 장식 최소).
- **상태 피드백**: 조회중/적립완료/중복(이미 오늘 받음)/미발견을 큰 글씨·색으로 즉시.

---

## 5. 보안 (매장 태블릿 = 유출 시나리오 방어)

1. **최소권한 데이터면**: 조회는 **정확한 전체 번호 1건 매칭만.** 부분검색·prefix·목록·범위조회 **전면 금지**(Edge가 거부). 전체 고객DB 덤프 경로 0.
2. **응답 PII 최소화**: 이름 마스킹, 존재여부+표시명+포인트+오늘이벤트여부만. 타 회원·상세 프로필 미포함.
3. **레이트리밋 & 남용 탐지**: 번호는 추측 가능 → thinkmap 프록시 Edge에서 operator/세션당 조회 레이트리밋 + 감사 로그(§3.3). 임계 초과 시 차단. (열거 스크래핑 방어의 핵심.)
4. **직원 게이트**: §5.1 인증모델 참조. 프록시 Edge가 `is_master() OR is_store()` 만 통과. 미로그인·타 계정 = 조회 불가.
5. **고객모드 격리**: 가입모드(태블릿 가로회전, 화면 정방향)는 **읽기 없이 쓰기(가입 write)만** — 조회 결과가 화면에 없음(고객이 태블릿 만져도 타인 정보 안 보임). 직원모드 복귀에 경량 게이트(직원 탭/PIN) 권장.
6. **시크릿 비노출**: crm 엔드포인트 `MEMBERSHIP_KIOSK_KEY`는 thinkmap 프록시 Edge 서버 env에만. 브라우저 번들·mailbox·git에 값 미기재(engine-metrics 규율 동일).
7. **RLS**: crm 이벤트/회원 테이블은 service_role(RPC)만 접근, 브라우저 직접 PostgREST 금지.

### 5.1 인증 모델 — "매장 계정 1회 로그인" (지휘자 확정 2026-07-24)
- **매장 태블릿 = "매장 계정"으로 1회 로그인 → 세션 유지.** 직원은 재로그인 없이 계속 빠르게 사용(속도 확보). 같은 origin SSO(§6).
- **회원 조회(PII)는 이 매장 로그인 뒤에서만.** 미로그인 시 조회 차단. crm `membership-query`는 이 게이트 뒤 프록시 Edge에서만 호출.
- **고객 가입모드 = 읽기 없이 쓰기만**(신규 가입 write). 태블릿을 가로로 돌려(화면 정방향) 고객이 직접 입력해도 남의 회원정보 못 봄.

### 5.2 ★회원 리스트(#9) — 보안 결정 게이트 (미해결)
- 회원 리스트(이름+전화 **전량** + 부분검색)는 **§5.1·§5의 "정확 번호 1건만·목록/부분검색 금지·덤프 경로 0" 원칙을 뒤집는다.** 매장 공용 태블릿에 전 회원 PII 다운로드 = 유출 시 최악 벡터.
- 선택지(유저 결정): (A) 구현+직원게이트+엄격 레이트리밋(list:6/60s)+감사 / (B) **is_master 전용**(공용 store 제외) / (C) 전화 **마스킹**(끝 4자리) / (D) 리스트 없이 정확 번호 조회 유지(최안전).
- **권고 = B+C**(master 전용 + 마스킹) 또는 최소 A. 결정에 따라 crm `membership_list` RPC가 전화 전체/마스킹을 확정. 승인 전 crm Edge·프록시 미배포(프론트는 미리보기).

**★"매장 계정" 권한등급 — 권고(지휘자 경유 확정 대기):**
- **신규 전용 `store`(매장) 역할 + `is_store()` 도메인 헬퍼.** 기존 master/staff 재사용 아님.
- 근거: (a) **최소권한** — 매장 태블릿은 공용·상시 로그인이라 유출면이 큼. master를 붙이면 전체 관리권한이 매장에 노출(부적합). store는 **멤버십 3엔드포인트 외 아무 권한 없음**(게이트가 프록시 Edge에만, RLS 확장 안 함). (b) **유출 시 이 계정만 회수** + `MEMBERSHIP_KIOSK_KEY` 로테이션으로 격리 대응. (c) roster/member 선례대로 **access-tiers 아닌 도메인 헬퍼**(`is_store()`) 유지 — 지금 Phase C 조율 불필요하되 **전환 경로는 열어둔다**(Phase C 도메인 일괄 수렴 시 함께 재평가, ACCESS-TIERS-MIGRATION-PLAN §C-2 예외 등재).
- 구현: `app_users.is_store` bool 컬럼 + `is_store()` 헬퍼 — 소규모 마이그(`migrate-membership-kiosk-thinkmap.sql`, 유저 승인 게이트). 프록시 Edge 게이트 = `is_master() OR is_store()`.
  - ★self-escalation 차단: 새 컬럼이라 가드 트리거(`guard_app_users_privilege`)를 **같은 트랜잭션에서 is_store까지 확장**(비마스터 self-set 차단). guardian 🔴 지적 반영.

**store 계정 = `sarurufarm.partner@gmail.com`(매니저, 유저결정 2026-07-24):**
- **프로비저닝 = pre-insert(이메일 사전삽입).** 마이그가 `{email, role:'user', status:'pending', is_store:true}` 삽입(가드 트리거 임시 DISABLE — 직접 SQL은 JWT 없어 is_master()=false, 런북). `ensureAppUser`(useAuth.js)가 **email로 매칭**하므로 매니저가 태블릿 첫 로그인 시 이 row를 찾아 auth_uid만 바인딩(is_store 보존→가드 UPDATE 통과). 로그인 선후 무관(ON CONFLICT 멱등).
- **최소권한**: `status='pending'` — 키오스크 게이트(is_store())는 status 무관이라 태블릿 조작엔 충분하고, `active`가 주는 워크스페이스 editor grant는 자동 부여 안 함. 매장 계정=키오스크 전용. 모선 접근 필요 시 마스터가 별도 승인.
- Claude는 매니저 Google 자격증명 미취급 — 실제 로그인은 매니저가 태블릿에서.

---

## 6. 배포

- SITE-SPLIT Phase 6 위성. `apps/membership`, base `/thinkmap/membership/`, `envDir=../../`(thinkmap 공유 .env=직원 인증용 thinkmap DB), gh-pages 하위폴더 `-e membership --add`(§10 배포 절차 준수).
- 같은 origin(github.io) = 직원 SSO 자동. 매장 태블릿은 URL 하나 북마크.
- **site_nodes 등록**: `{name:'멤버십 키오스크', kind:'satellite', domain:'membership', url:'/thinkmap/membership/', required_role:'member'(직원)|'master', status:'dev'→'live'}`. 배선(siteNodesSeed + Sidebar 런처)은 모선 세션과 조율(hotspot).
- crm Edge/테이블 신설·시크릿 발급 = **crm 도메인 배포**(지휘자 경유 계약·승인).

---

## 7. 미해결·조사 항목 (구현 전 결정)

- [x] **아키텍처 A/B/C 유저 선택** (§1) — **A(경량 위성) 확정, 유저 승인 2026-07-24.**
- [x] **회원별 포인트(#4)** — crm 조사: 회원별 잔액 존재(UnionPOS `RemainPoint`), 단 스냅샷. **유저결정 2026-07-24: v1 미표시**(스냅샷 혼란 회피) → 결과카드 포인트행 제거·query 계약 v1 포인트 제외. **v2 = 라이브 UnionPOS 로 연기.**
- [x] **crm 계약 확정** — 계약문서 `crm-archive/MEMBERSHIP-KIOSK-CONTRACT.md` + `migrations/0014` 초안. Edge 3종 시그니처·`crm.membership_events`·시크릿 `MEMBERSHIP_KIOSK_KEY` 확정(초안). 실행은 §10 하드게이트.
- [x] **직원 인증 역할** — 확정: 매장 계정 1회 로그인(§5.1) + 신규 `is_store` 표식/`is_store()` 헬퍼. **store 계정 = `sarurufarm.partner@gmail.com`**(유저결정 2026-07-24) — 마이그에서 pre-insert(pending+is_store, §5.1) → 첫 로그인 시 auth_uid 바인딩.
- [ ] **이벤트 종류 확장성** — 팝콘 외 이벤트(event_type) 추가 UX(마스터가 이벤트 정의?). **v1은 'popcorn' 단일 하드코딩.**

---

## 8. 진행 상태 & 하드게이트

**완료(미커밋·미배포):**
- ✅ 아키텍처 A 확정 · CRM 계약 확정(초안) · 인증모델 확정.
- ✅ 프론트 위성 셸 스캐폴드 `apps/membership`(빌드 그린, 번들 374KB): 셸+모드전환+번호패드+조회/가입 화면. Edge 호출은 `src/api/membership.js`(프록시 invoke 배선, `VITE_MEMBERSHIP_LIVE` 게이트 — off면 미리보기).
- ✅ thinkmap 프록시 Edge 3종 초안(`supabase/functions/membership-*`) — 직원게이트+레이트리밋+시크릿 프록시(미배포).

**하드게이트(실행 전 승인 — crm 계약문서 §6과 정합):**
1. **[supabase-guardian + 유저]** `crm.membership_events` + RPC(0014) — crm 소유, crm이 db-exec 적용.
2. **[유저]** `MEMBERSHIP_KIOSK_KEY` 발급(crm) + crm Edge 시크릿 + **thinkmap 프록시 Edge env 동일값** 세팅.
3. **[crm 배포]** membership-query·event-claim Edge + membership-intake 확장.
4. **[thinkmap 통합세션 배포]** thinkmap 프록시 Edge 3종 배포 + 위성 gh-pages(`-e membership --add`).
5. **[유저 승인]** `migrate-membership-kiosk-thinkmap.sql` 적용(is_store+가드확장+audit+store계정 seed `sarurufarm.partner@gmail.com`) — guardian 재검수(가드확장·트리거DISABLE seed) → 유저 → thinkmap 통합세션 적용.
6. **[모선 조율]** site_nodes + Sidebar 런처 배선(hotspot, 모선 세션과).
