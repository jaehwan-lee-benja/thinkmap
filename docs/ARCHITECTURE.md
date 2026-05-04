# ThinkMap 전체 아키텍처 (Architecture Overview)

> 작성일: 2026-04-28
> 작성자: jaehwan-lee-benja
> 목적: ThinkMap 의 데이터 분류 체계와 도메인 확장 패턴을 한 화면에 보이도록 정리. 각 기능 명세서(WORKLOG-SPEC, IMPERSONATION-SPEC 등) 의 상위 컨텍스트.

---

## 0. TL;DR

ThinkMap 은 두 개의 데이터 plane 으로 구성된다.

```
┌─────────────────────────────────────────────────────────────┐
│                    공통 인프라                               │
│  계정 (auth.users / app_users / linked_accounts)            │
│  권한 (RLS, is_master, visibility)                          │
│  검색·코멘트·통계 (각 plane 이 동일 패턴 재사용)              │
└─────────────────────────────────────────────────────────────┘
            │                                   │
            ▼                                   ▼
┌────────────────────────┐         ┌──────────────────────────┐
│  Documents Plane       │         │  Structured Data Plane   │
│  (노션 스타일 자유 문서) │         │  (도메인별 정규화 row)    │
│                        │         │                          │
│  pages                 │         │  업무일지 (worklog)       │
│  └ content_tiptap JSON │         │  └ daily_blocks (v2)     │
│  page tree (parent_id) │         │                          │
│                        │         │  회계 (향후)              │
│  → TipTap 에디터로 자유 │         │  물자 관리 (향후)         │
│    구조 작성            │         │  ...                     │
└────────────────────────┘         └──────────────────────────┘
```

- **Documents plane**: 자유 형식 노트. 한 페이지 = `pages` 한 row + content_tiptap JSON. TipTap 에디터로 위계와 내용 자유.
- **Structured data plane**: 도메인별 row 모델. 항목 단위 쿼리/검색/통계가 핵심. 업무일지(v2) 가 첫 도메인, 회계·물자 등이 같은 패턴으로 추가됨.
- **공통 인프라**: 계정/권한/임퍼소네이션/RLS 는 두 plane 이 공유. 각 plane 이 같은 키(`user_id`, `is_master()`, `visibility`)를 재사용한다.

---

## 1. Documents Plane — 노션 스타일 자유 문서

### 1.1 정체

- 한 페이지 = 자유 형식 본문 + 위계 안의 위치.
- 본문은 TipTap document JSON (`pages.content_tiptap`).
- 위계는 `pages.parent_id` 트리.

### 1.2 적합한 용도

- 매뉴얼, 회의록, 정책 문서, 자유 메모.
- 구조가 미리 정해지지 않은, 사람이 읽도록 만든 글.
- 단가 단위로 항목을 추출/집계할 필요가 없는 데이터.

### 1.3 구성 요소 (현행)

| 요소 | 위치 | 비고 |
|---|---|---|
| 페이지 row | `pages` | `page_type='normal'` (기본) |
| 본문 | `pages.content_tiptap` (JSONB) | TipTap doc 직렬화 |
| 위계 | `pages.parent_id` | 자기참조 트리 |
| 토글/체크리스트 | content_tiptap 내부 toggle 노드 | [TOGGLE-BLOCK-SPEC.md](./TOGGLE-BLOCK-SPEC.md) |
| 공유 | `shares` 테이블 | 페이지/프로젝트 단위 |

### 1.4 제약

- 항목 단위 쿼리·집계 불가 (메모리 순회만).
- 부분 업데이트 어렵고 race 조건에 약함.
- 한 페이지 안에서의 자유 구조라는 강점이 곧 약점.

→ 항목 단위 작업이 핵심이 되는 도메인은 **Structured data plane** 으로 분리한다.

---

## 2. Structured Data Plane — 정규화 row 모델

### 2.1 정체

- 도메인이 명확히 정해진 데이터를, 도메인 전용 테이블의 row 로 저장.
- 행 = 의미 있는 단위 항목 (todo 한 개 / 회계 분개 한 줄 / 자재 한 종 등).
- 항목 단위 쿼리/검색/집계/이력 추적이 가능해야 한다.

### 2.2 도메인 목록과 상태

| 도메인 | 상태 | 데이터 위치 | 명세서 |
|---|---|---|---|
| **업무일지 (Worklog)** | v1 → v2 리팩토링 기획 (2026-04-28) | v1: `pages.content_tiptap` (JSON) → v2: `daily_blocks` (row) | [WORKLOG-SPEC.md](./WORKLOG-SPEC.md) |
| **회계 (Accounting)** | 향후 | 미정 (예: `accounting_entries`, `accounting_accounts`) | _미작성_ |
| **물자 관리 (Inventory)** | 향후 | 미정 (예: `inventory_items`, `inventory_movements`) | _미작성_ |
| _도메인 추가시 여기에..._ | | | |

> 업무일지 v2 는 단순한 한 기능 리팩토링이 아니라, **structured data plane 의 첫 정착 사례**다. v2 에서 정립되는 패턴(blockId / position / soft delete / 코멘트 연결 / 권한)은 이후 회계·물자 도메인이 그대로 재사용한다.

### 2.3 적합한 용도

- 고정된 단위 항목 (todo, 분개, 입출고).
- 항목 단위 검색·집계·기간별 통계가 사용자 가치의 핵심.
- 항목별 권한·코멘트·이력이 필요한 데이터.

### 2.4 도메인 추가 시 따라야 할 패턴 (체크리스트)

새 structured 도메인을 추가할 때, 아래 항목을 동일한 형태로 채운다.

#### 데이터
- [ ] 도메인 전용 테이블(들). PK 는 의미 있는 안정 식별자 (예: `block_id`, `entry_id`).
- [ ] `user_id` (작성자), `created_at`, `updated_at`, `deleted_at` (soft delete).
- [ ] 위치/순서가 있다면 `position` 컬럼 (numeric, fractional indexing 가능).
- [ ] 도메인 메타(섹션/카테고리/계정코드 등)는 별도 마스터 테이블로 분리, FK.

#### 권한
- [ ] RLS 정책. master/일반/비활성 분기는 `is_master()` 와 `app_users.role` 사용.
- [ ] row 별 권한이 필요하면 `visibility` 컬럼 (`'all' | 'master'` 등).
- [ ] 운영 데이터의 무단 폐기 가능성 점검 (사전 폐기 SQL 은 사용자 명시 승인 필수).

#### UI 진입점
- [ ] 사이드바 또는 GlobalTopBar 의 entry 결정.
- [ ] 캘린더(시간축 도메인) / 목록 / 트리 등 도메인에 맞는 표현.
- [ ] Documents plane 페이지에 임베드되어야 한다면 임베드 노드 형식 정의 (§3 참조).

#### 공통 인프라 통합
- [ ] 코멘트가 필요하면 `worklog_comments` 와 동일한 패턴 (target_type/target_id) 의 도메인별 코멘트 테이블 또는 통합 코멘트 테이블 결정.
- [ ] 검색이 필요하면 `text_content` 컬럼 + pg_trgm 또는 도메인별 search_vector.
- [ ] 통계가 필요하면 SQL view 또는 client 쿼리 hook.

#### 명세
- [ ] `docs/<DOMAIN>-SPEC.md` 파일 작성. v2 worklog 와 같은 구조 (배경 / 데이터 모델 / 흐름 / 위험 / Phase / 결정 로그).
- [ ] 이 문서(ARCHITECTURE.md) §2.2 표에 도메인 추가.

---

## 3. 두 Plane 의 관계

### 3.1 분리 원칙

- 한 도메인은 하나의 plane 에 산다. 같은 데이터를 두 plane 에 중복 저장하지 않는다.
- "이 데이터는 어느 plane?" 의 질문은 **"항목 단위 쿼리·집계가 핵심인가"** 로 판단.
  - 예: 매뉴얼 본문 → Documents (한 덩어리로 읽힘)
  - 예: 일별 todo 한 개 → Structured (집계가 핵심)

### 3.2 임베드 (향후 검토)

Documents 페이지가 structured 도메인의 데이터를 끌어와 보여주는 패턴 (예: 매뉴얼 안에 "이 페이지의 미완료 todo 위젯"). 

- 구현 시 TipTap 의 custom node 로 정의.
- DB 에는 `{type: 'embed', domain: 'worklog', query: {...}}` 같은 placeholder 만 저장. 데이터 사본은 두지 않는다.
- v2 worklog 출범 후 검토. 현재는 비목표.

### 3.3 검색의 통합 (향후 검토)

- Documents plane 의 자유 텍스트 검색 + Structured plane 의 항목 검색을 한 검색바로 통합할지.
- pg_trgm 인덱스를 양쪽에 동일한 형태로 두면 union 쿼리 가능.
- v2 worklog 검색이 베타 노출된 후 패턴 확정.

---

## 4. 공통 인프라

### 4.1 계정 / 권한

| 요소 | 위치 | 역할 |
|---|---|---|
| `auth.users` | Supabase Auth | 로그인 본체 |
| `app_users` | 우리 테이블 | role, status (가입 승인 시스템) |
| `linked_accounts` | 우리 테이블 | 한 사람이 여러 auth 계정을 묶을 때 |
| `is_master()` | RLS 함수 | 마스터 계정 분기. 모든 plane 에서 사용 |
| `shares` | 우리 테이블 | Documents plane 의 페이지 공유 (Structured plane 도 필요시 같은 형태로 확장) |

### 4.2 임퍼소네이션

다른 사람 시점으로 보기. 두 plane 모두에 영향을 주되, 별도 체계로 운영. [IMPERSONATION-SPEC.md](./IMPERSONATION-SPEC.md) 참조.

### 4.3 디자인 원칙

[DESIGN-PHILOSOPHY.md](./DESIGN-PHILOSOPHY.md) — 건조한 스타일, 폰트 크기/장식 최소화. 두 plane 모두 적용.

### 4.4 코멘트

- 현재: `worklog_comments` 가 worklog 도메인에 한정.
- 검토: 도메인별로 두는 게 깔끔한가, vs 통합 `comments` 테이블 (target_domain + target_id) 로 가는 게 깔끔한가.
- 도메인이 늘어나는 시점에 결정 (회계 명세 작성 시점 무렵).

---

## 5. 의사결정 가이드 — "이 데이터는 어디에?"

새 기능을 설계할 때 다음 질문을 순서대로 묻는다.

1. **사람이 읽도록 만든 글인가, 항목 단위 데이터인가?**
   - 글 → Documents
   - 항목 → Structured

2. **항목별 쿼리·검색·통계·코멘트 중 하나라도 핵심 가치인가?**
   - 예 → Structured 가 강하게 권장
   - 아니오 → Documents 로 충분할 수 있음

3. **항목별 권한이 다른가?**
   - 예 → Structured (row 컬럼으로 자연스러움)
   - 아니오 → Documents 도 가능

4. **위계가 자유로운가, 정해진 카테고리인가?**
   - 자유 → Documents
   - 정해진 카테고리 → Structured (마스터 테이블 + FK)

> 모호하면 Documents 로 시작하고, 항목 단위 가치가 드러나면 Structured 로 옮긴다. 반대 방향은 비용이 크다 (worklog v1 → v2 가 그 사례).

---

## 6. 참고 문서

| 문서 | 다루는 범위 |
|---|---|
| [WORKLOG-SPEC.md](./WORKLOG-SPEC.md) | 업무일지 v2 리팩토링 기획 (Structured plane 첫 도메인) |
| [WORKLOG-SPEC.v1.md](./WORKLOG-SPEC.v1.md) | 업무일지 v1 (Documents plane 안에서 운영하던 마지막 스냅샷) |
| [TOGGLE-BLOCK-SPEC.md](./TOGGLE-BLOCK-SPEC.md) | 토글 블록 명세 (Documents plane 의 핵심 노드, Structured 도메인의 UI 에서도 일부 재사용) |
| [CARRY-OVER-MAP.md](./CARRY-OVER-MAP.md) | 이월 시스템 시각화 (worklog 전용) |
| [DESIGN-PHILOSOPHY.md](./DESIGN-PHILOSOPHY.md) | 건조한 스타일 디자인 철학 (두 plane 공통) |
| [IMPERSONATION-SPEC.md](./IMPERSONATION-SPEC.md) | 임퍼소네이션 (공통 인프라) |
| [copy-paste-improvement.md](./copy-paste-improvement.md) | TipTap 복붙 개선 (Documents plane) |
| [sub-page-feature.md](./sub-page-feature.md) | 하위 페이지 기능 (Documents plane) |

---

## 7. 변경 로그

| 일자 | 변경 |
|---|---|
| 2026-04-28 | 문서 신규. 두 plane 모델 정립 + worklog v2 가 첫 Structured 도메인이라는 위치 확정 |
