# CRM 엔진 완전 데이터 이관 — consumer측 설계 (계획 + 초안)

> 상태: **초안 (2026-07-24)**. 실행은 tm통합 게이트(guardian→유저승인) 후. 지휘부 지시 "완전 데이터 이관",
> 유저 정정 "집계 아니라 **원데이터 저장 + 자유 쿼리/수식 계층**". crm 이 완전 데이터 계약을 lead 로 확정하면 정합.

## ★최종 결정 (유저/지휘부 2026-07-24) — A3 + B2 + C1 통로(FDW). 이하 복제안 SUPERSEDE
- **아키텍처 = 통로(postgres_fdw)**: tm DB(sqisntxippjzcekyhqyo)가 multi-store(rstazttwlghsorpzsugy) `crm` 스키마를
  **외부 테이블로 연결**해 crm 원본을 자기것처럼 쿼리 + 재계산 뷰. **복제 안 함**(이전 A2 substrate/월랜딩 초안 폐기).
- **A3**(라인아이템 풀 그레인) · **B2**(통로가 식별 원본을 탭) · **C1**(직접 통로).
- ★**PII 노출 0 · RLS 최고수위**: 원본은 식별 데이터지만 tm에 **저장·노출 안 함**. 외부 테이블=격리 스키마(crm_fdw,
  REST 미노출·앱 role REVOKE), 앱은 **public 마스터전용 재계산 뷰**만(PII 투사 제거, surrogate=HMAC). is_master()+security_barrier.
- **초안**: `migrate-crm-fdw-conduit.sql`(확장·외부서버·유저매핑·격리스키마·PII-strip 재계산 뷰). 실행=게이트 후.
- ★**트레이드오프(보고)**: 통로=crm DB 실시간 결합 → "crm 없이 독립" 목표와 상충. A3 라이브 쿼리 무거우면 materialized 캐시.
- ★**governance 긴장(보고)**: crm 은 B2/C1 을 R1/R4/C1(PII 확산) 위배로 비권고했음. 유저 명시 오버라이드 → PII-0-out 을
  tm 경계에서 강제하는 조건으로 진행. crm 계약(읽기전용 role·host·테이블/컬럼) 정합 필요.
- ↓ 아래 §1~§8-bis 는 **이력**(집계 v1/v2 → A2 복제안 검토 경위). 최종 설계는 위 통로안.

## 0. 목표 · 원칙
- engine-dash 전체 데이터셋을 tm(thinkmap DB `sqisntxippjzcekyhqyo`)에 **무손실**로 받아, 이후 **crm 없이 독립**으로
  지표를 자유 재계산·파생지표 생성(패리티 작업)한다.
- ★원칙: **집계-렌더 금지.** 저장 = 무손실 원행(raw). 수식 = tm 소유 파생 뷰(원행 위 재계산).
  - 원행은 불변, 수식만 진화 → 유저가 임계값·세그먼트 정의를 뷰 SQL 수정만으로 자유 재가공.
- 권한 = 마스터 전용 RLS(재무·경영). PII 격리(식별자 유입 시 salted-hash 만, 원문 금지).

## 1. 현재 계약 사실 (라이브 v2 · ENGINE-HANDOFF §4)
- `engine-metrics/v2`, 24개월(2024-07 ~ 2026-06), 엔드포인트/시크릿 불변.
- payload 최상위: `schema, source, generated_month, definition, months[], regions{}, business{}, membership{}, rows[]`.
- **`rows[i]` = 29필드**(월 그레인, ↔ months[i]):
  `ym, exp, conv, cum, act, conv_rate, active_rate, rev, visits, aov, drev, unreg, receipts,
   ms_new, ms_cum, ms_active, erev, conv_rev, arev, act_tx, drev_seg, cum_tx, unreg_rev, unreg_ct,
   ms_active_rev, nonmem_pool, nonmem_act, nonmem_act_rev, ms_prev_receipts`.
- `business` = 매출/객단가/단골총마진(각 24배열) + 관리비/임대료/원재료율(상수). `membership` = ms_cum/ms_new/ms_active/ms_active_rev(각 24배열).
- regions/business/membership 는 rows 에서 파생 가능한 **편의 뷰** → tm 은 `rows` 만 원본으로 잡으면 무손실.

## 2. ★granularity — crm 이 lead 로 확정할 결정 (consumer는 어느 쪽도 흡수)
현재 payload 는 **월 단위 집계**다. "수식 자유 재가공"의 깊이는 crm 이 주는 grain 에 좌우된다. 옵션:

| 옵션 | grain | tm 수식 자유도 | PII |
|---|---|---|---|
| **O1 (현재)** | 월 집계 rows(29필드) | 월합 재조합·비율/마진 재정의 | 없음 |
| **O2** | 월 × 세그먼트(경험/결정/활성단골/미등록/멤버십) 인원·매출·거래수 | 세그먼트 재정의·교차 | 없음(집계) |
| **O3** | 고객-월 또는 거래 단위(pseudonymized) | 임계값(예: 3차) 완전 재정의 | ★있음 → salted-hash·서버측·마스터전용 필수 |

- O1 은 이미 라이브. O2 는 rows 에 상당수 포함(erev/conv_rev/arev/act_tx/cum_tx/unreg_rev/unreg_ct 등) → 저비용 확장.
- O3 는 완전 자유도지만 PII 리스크 → crm 이 익명화 계약(해시 키·집계 하한)을 lead 로 정의해야 함.
- **요청(to-crm)**: 완전 계약의 grain 을 O1/O2/O3 중 확정하고, O3 면 익명화 규칙을 명시해달라. consumer 저장층은 grain 불문 흡수(§4).

## 3. consumer 설계 (초안 = `migrate-create-crm-engine-raw.sql`)
무손실 jsonb 랜딩 + 타입 뷰 + 수식 뷰. grain 이 바뀌어도 스키마 무변경.

- **`crm_engine_snapshot`** (generated_month PK) — payload 통째 무손실 + 상수(관리비/임대료/원재료율) + schema/정의. 감사·재처리·grain 변화 흡수.
- **`crm_engine_month`** (ym PK, `row jsonb`) — rows[i] 원본 무손실. 자유 쿼리/수식의 기본 그레인.
- **(미래) `crm_engine_fact`** (grain, grain_key) — O2/O3 채택 시 추가(주석으로 정의만). 식별자=salted-hash.
- **`v_crm_engine_month`** — jsonb→타입 컬럼 얇은 뷰(+raw 컬럼). security_invoker=on → 마스터 RLS 상속.
- **`v_crm_engine_derived`** — ★수식 계층. conv_rate/active_rate/ms_active_rate·세그먼트 객단가 5종·단골총마진(arev/1.1×(1−원재료율))·**활성단골 순이익=단골총마진−관리비**. 재정의는 이 뷰만 수정.

RLS: 두 테이블 `is_master()` FOR ALL. 뷰 security_invoker → 호출자(마스터) 기준. service_role(Edge) 우회.

## 4. sync Edge 변경 (`engine-metrics-sync`, 초안 — 무회귀)
현재는 crm_metrics(region 뷰)만 적재. **한 번 fetch → 원행도 함께 적재**로 확장(기존 board 무회귀 유지):
1. payload fetch(불변) 후:
   - `crm_engine_snapshot` upsert(onConflict generated_month) — payload 통째 + business 상수 + schema/정의.
   - `crm_engine_month` upsert(onConflict ym) — `rows[i]` 각 행을 `row=rows[i]` 로. (없으면 regions/business 로 조립하는 폴백.)
   - 기존 `crm_metrics`(region 뷰) upsert 유지 → 라이브 MetricsLane 무회귀.
2. 응답 요약만(개수). 재무·원행 값 미반환. 시크릿·payload 미로그(현행 유지).
> Edge 실제 코드 변경은 게이트 후. 로직 스케치:
> ```ts
> // rows raw 적재
> const engineRows = Array.isArray(payload.rows) ? payload.rows : []
> if (engineRows.length) {
>   await admin.from('crm_engine_month').upsert(
>     engineRows.filter(r => typeof r?.ym === 'string')
>               .map(r => ({ ym: r.ym, row: r, generated_month: generatedMonth })),
>     { onConflict: 'ym' })
> }
> await admin.from('crm_engine_snapshot').upsert({
>   generated_month: generatedMonth, schema: payload.schema, source: payload.source ?? null,
>   definition: payload.definition ?? null,
>   business_const: { 관리비: payload.business?.관리비 ?? null, 임대료: payload.business?.임대료 ?? null, 원재료율: payload.business?.원재료율 ?? null },
>   payload
> }, { onConflict: 'generated_month' })
> ```

## 5. 렌더 소비 구조
- 운영 보드(MetricsLane, 라이브)는 당분간 crm_metrics(region 뷰) 그대로 → 무회귀.
- 완전 패리티 대시보드(후속 트랙, v2 "거의 같게" 치환)는 **`v_crm_engine_derived` + `v_crm_engine_month`** 를 읽어
  engine-dash 를 재현. 수식/임계값은 뷰에서 tm 이 소유. localStorage 목표·미션 배너 등 UI 상태는 tm 로컬.
- 유저 자유 쿼리: 마스터가 뷰(또는 원행 jsonb)에 직접 SQL/파생 컬럼 추가 가능(원행 불변 보장).

## 6. 실행 단계 (전부 게이트 후)
1. crm 이 grain(§2) 확정 통지 → consumer 안 정합 확인(뷰 컬럼/폴백 조정).
2. supabase-guardian 검수(신규 테이블·뷰 RLS·security_invoker·PII).
3. 유저 승인 → tm통합 적용(마이그 `migrate-create-crm-engine-raw.sql`) + Edge 확장 배포.
4. 마스터 "지표 새로고침" 1회 → crm_engine_month 24행·snapshot 1행 검증(서버사이드).
5. 후속: 패리티 대시보드 렌더가 뷰 소비.

## 7. crm 에 물을 것 (계약 정합)
- grain 확정: O1/O2/O3? O3 면 익명화 규칙(해시 솔트·집계 하한·마스터전용).
- rows 필드 계약 안정성(29필드 고정? 추가 예정?). 필드 의미 사전(특히 nonmem_*, drev vs drev_seg, receipts vs visits).
- 갱신 주기·generated_month 단조 증가 보장(스냅샷 PK 전제).
- membership 를 rows 밖 별도 배열로 유지할지, rows 에 흡수(이미 ms_* 포함)할지 — 단일 원행 원칙상 rows 흡수 선호.

## 8-bis. ★crm 계약 정합 + consumer 결정 (2026-07-24 확정 방향)
crm 이 lead 설계 통지(`crm-archive/RAW-HANDOFF-DESIGN.md`): 권고 **A2(고객 단위 가명 파생) + B1(HMAC 가명) + C2(tm DB 복제)**.
이로써 §2 의 granularity 는 **A2(≈O2 고객그레인)로 확정 방향** — 월집계(O1)를 넘어 고객×(차수·거래일·월매출) substrate 를 받아 tm 이 공식 자체를 재계산.

**consumer(tmcrm) 결정 — crm 3문항 회신:**
1. **A2로 패리티 충분** → 채택. engine-dash 전 공식(전환·활성·풀·멤버십·세그먼트 객단가·코호트·기간 재정의)이 고객 substrate 로 재계산 가능. A3(라인아이템 162k·메뉴/품목/시간대)는 **메뉴 분석 필요 시 후속** — 지금은 불요.
2. **저장 형태**: `crm_customer_facts` = **wide 타입컬럼**(작고 안정, ~28k) · `crm_customer_day` = **long 타입컬럼 + (d),(cust_key) 인덱스**(수십만, 집계 성능). grain 확정됐으므로 jsonb 보다 타입컬럼(재계산 GROUP BY/row_number 성능). 전방호환용 `extra jsonb` 만 부속. 미등록·상수·원본은 `crm_engine_snapshot` 월 랜딩(jsonb).
3. **sync**: **월 스냅샷 먼저**(단순·멱등). `sold_at` watermark 증분은 customer_day 볼륨이 부담될 때 후속 옵션. customer_facts(~28k)는 매회 full 무방.
- **PII**: B1(HMAC surrogate, phone/name/email/member_code 제외) 수용. cust_key 재식별 불가. tm 테이블 전부 마스터전용 RLS. **위치 C2(tm 복제) 수용**(독립 목표 부합).
- **초안 반영**: 위 결정을 `migrate-create-crm-engine-raw.sql`(A2 substrate + 월 랜딩 + 재계산 뷰 `v_crm_funnel_recompute`)에 구현. §3/§4 의 "월 rows jsonb" 서술은 이 A2 방향으로 대체됨.

**crm(producer) 의존(내 소관 아님, heads-up)**: pgcrypto 확장(HMAC) = to-conductor heads-up 대상 · 가명 export 뷰/Edge = crm db-exec 소유. consumer 는 surrogate 를 받기만 하므로 pgcrypto 불요.

## 8. 정합 체크리스트
- [ ] crm grain 계약 확정(§2) 수신·정합
- [ ] rows 필드 사전 확정(§7)
- [ ] guardian 검수(RLS·security_invoker·PII)
- [ ] 유저 승인 → tm통합 적용(마이그+Edge)
- [ ] 서버사이드 검증(engine_month 24행·snapshot 1행)
- [ ] 무회귀 확인(crm_metrics·MetricsLane 라이브 유지)
