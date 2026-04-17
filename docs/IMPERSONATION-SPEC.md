# 임퍼소네이션 시스템 명세서

> 작성일: 2026-04-17
> 상태: 구현 완료, 문서화
> 관련: 업무일지 통합 접근은 별도 체계 — [WORKLOG-SPEC.md](./WORKLOG-SPEC.md) 10-2절 참조

---

## 1. 개요

임퍼소네이션은 **다른 사용자의 데이터를 해당 사용자 관점에서 조회/편집**하는 기능이다. 실제 Supabase 세션은 변경하지 않고, 클라이언트 측에서 `effectiveSession`을 조작하여 데이터 조회 대상을 전환한다.

### 두 가지 모드

| 모드 | 트리거 | viewerMode | 편집 가능 | 용도 |
|---|---|---|---|---|
| **뷰어 모드** | 관리자 패널 "활동하기" | `true` | X (읽기 전용) | 마스터가 다른 사용자의 데이터를 열람 |
| **연결 계정 전환** | 브레드크럼 계정 선택 또는 상단바 계정 전환 | `false` | O (편집 가능) | 연결 계정의 데이터를 편집 |

---

## 2. 핵심 메커니즘: effectiveSession

```javascript
// PaneProvider.jsx:38-45
const effectiveSession = useMemo(() => {
  if (!session || !activeTab?.impersonatedUserId) return session
  return {
    ...session,
    user: {
      ...session.user,
      id: activeTab.impersonatedUserId,
      email: activeTab.impersonatedUserEmail,
    },
  }
}, [session, activeTab?.impersonatedUserId, activeTab?.impersonatedUserEmail])
```

- 실제 Supabase 세션 토큰은 변경하지 않음
- `session.user.id`와 `session.user.email`만 대상 계정으로 덮어씀
- 모든 하위 훅(`useProjects`, `usePages`, `useSharing`, `useBackup`)이 이 세션을 받아 사용
- RLS는 실제 JWT 토큰 기준 → `is_linked_account_viewer()` / `is_linked_account()` 함수로 접근 권한 확인

---

## 3. 데이터 흐름

```
로그인 (session.user.id = B)
  │
  ├─ 기본 상태: effectiveSession = session (본인 B)
  │    └─ useProjects(.eq('user_id', B)) → B의 프로젝트만
  │         └─ usePages(.eq('project_id', ...)) → B의 페이지만
  │
  ├─ 연결 계정 전환 (브레드크럼에서 A 선택):
  │    ├─ activeTab.impersonatedUserId = A의 auth_uid
  │    ├─ activeTab.viewerMode = false
  │    └─ effectiveSession.user.id = A
  │         └─ useProjects(.eq('user_id', A)) → A의 프로젝트 (RLS is_linked_account 통과)
  │              └─ usePages → A의 페이지 (편집 가능)
  │
  └─ 뷰어 모드 (관리자 패널 → 활동하기):
       ├─ activeTab.impersonatedUserId = 대상의 auth_uid
       ├─ activeTab.viewerMode = true
       └─ effectiveSession.user.id = 대상
            └─ 동일하게 대상의 프로젝트/페이지 조회 (읽기 전용)
            └─ 토글 열기/닫기만 가능 (viewer_toggle_overrides에 저장)
```

---

## 4. 진입점

### 4.1 관리자 패널 "활동하기" (뷰어 모드)

```
AdminModal.jsx → handleActAsUser()
  1. get_user_id_by_email(email) RPC로 대상의 auth.uid 조회
  2. onStartImpersonation(authUid, email, true)  ← viewerMode=true
  3. 모달 닫힘
  4. 상단에 관리자 바 표시 ("뷰어 종료하기" 버튼)
```

- 마스터만 사용 가능
- 모든 사용자 대상 가능 (app_users 목록)

### 4.2 브레드크럼 계정 선택 (연결 계정 전환)

```
TabBar.jsx → 브레드크럼 user 세그먼트 클릭
  → getBreadcrumbSiblings({ type: 'user' })
    → 마스터: 모든 사용자 목록
    → 일반 사용자: 연결 계정(linked_accounts) 목록
  → handleBreadcrumbNavigate('user', id)
    → updateTab({ impersonatedUserId, impersonatedUserEmail })
    → viewerMode는 설정하지 않음 (false)
```

### 4.3 상단바 계정 전환 드롭다운

```
GlobalTopBar.jsx → 계정 전환 드롭다운
  → 연결 계정이 있는 경우에만 표시
  → 뷰어 모드 중에는 숨김
  → startImpersonation(la.linked_auth_uid, la.linked_email) 호출
```

### 4.4 종료

| 경로 | 동작 |
|---|---|
| 뷰어 종료하기 (상단 관리자 바) | `handleStopImpersonation()` → 모든 임퍼소네이션 상태 초기화 |
| 브레드크럼에서 본인 계정 선택 | `updateTab({ impersonatedUserId: null, viewerMode: false, ... })` |
| 상단바 "내 계정" 선택 | 동일 |

---

## 5. 탭 상태 구조

각 탭이 독립적으로 임퍼소네이션 상태를 가진다.

```javascript
// useTabs.js — 탭 하나의 상태
{
  id: "tab-uuid",
  projectId: "project-uuid" | null,
  pageId: "page-uuid" | null,
  impersonatedUserId: "auth-uuid" | null,    // 대상 사용자
  impersonatedUserEmail: "email" | null,      // 대상 이메일
  viewerMode: false,                          // true면 읽기 전용
  noAutoPage: false,
  projectName: "cached name",
  pagePath: [{ id, name, parentId }, ...],
}
```

- 탭 전환 시 해당 탭의 임퍼소네이션 상태가 자동 적용
- 앱 재시작 시 마지막 임퍼소네이션 상태 자동 복원 (`useUserPreferences`)

---

## 6. 뷰어 모드 토글 오버라이드

뷰어 모드에서는 편집이 불가하지만, **토글 블록의 열기/닫기**는 허용된다. 이 상태는 별도 저장된다.

```javascript
// user_preferences.viewer_toggle_overrides (JSONB)
{
  "page-uuid": {
    "0": true,    // 0번째 토글 열림
    "3": false,   // 3번째 토글 닫힘
  }
}
```

- `TipTapTestPage.jsx`의 `applyToggleOverrides()` — 렌더링 시 적용
- `extractToggleStates()` — 변경 시 추출하여 저장
- 뷰어 종료 후에도 유지 (다음 방문 시 같은 토글 상태)

---

## 7. RLS 보안 계층

클라이언트의 `effectiveSession`은 UI용이고, 실제 데이터 접근은 RLS가 제어한다.

### 핵심 함수 (`fix-linked-account-rls.sql`)

```sql
-- 읽기 권한: linked_accounts에 viewer 또는 editor로 등록되어 있는지
is_linked_account_viewer(owner_user_id UUID) → BOOLEAN

-- 쓰기 권한: linked_accounts에 editor로 등록되어 있는지
is_linked_account(owner_user_id UUID) → BOOLEAN

-- 전환 가능 계정 목록: 현재 JWT 이메일 기반으로 연결 계정 조회
get_linked_accounts() → TABLE(linked_email, linked_auth_uid, permission)
```

### RLS 정책 적용 범위

| 테이블 | SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| projects | 본인 OR is_linked_account_viewer | 본인 OR is_linked_account |
| pages | 본인 OR is_linked_account_viewer | 본인 OR is_linked_account |
| blocks | 본인 OR is_linked_account_viewer | 본인 OR is_linked_account |
| block_history | 본인 OR is_linked_account_viewer | 본인 OR is_linked_account |
| backups | 본인 OR is_linked_account_viewer | 본인 OR is_linked_account |

---

## 8. 관련 파일

| 파일 | 역할 |
|---|---|
| `src/components/PaneProvider.jsx:38-51` | effectiveSession 생성, 모드 판별 |
| `src/components/PaneProvider.jsx:353-399` | 브레드크럼 계정 전환 핸들러 |
| `src/App.jsx:356-375` | handleStartImpersonation / handleStopImpersonation |
| `src/components/Admin/AdminModal.jsx:90-101` | 관리자 "활동하기" 트리거 |
| `src/components/GlobalTopBar/GlobalTopBar.jsx` | 계정 전환 드롭다운, 관리자 바 |
| `src/components/TabBar/TabBar.jsx` | 브레드크럼 렌더링 |
| `src/hooks/useLinkedAccounts.js` | 연결 계정 조회 (get_linked_accounts RPC) |
| `src/hooks/useUserPreferences.js` | 임퍼소네이션 상태 저장/복원 |
| `src/hooks/useTabs.js` | 탭별 임퍼소네이션 상태 관리 |
| `src/hooks/useProjects.js:42-46` | effectiveSession 기반 프로젝트 조회 |
| `src/hooks/usePages.js` | effectiveSession 기반 페이지 조회 |
| `create-linked-accounts.sql` | linked_accounts 테이블 + RLS |
| `fix-linked-account-rls.sql` | RLS 함수 수정 (auth.users 직접 조회) |
| `add-viewer-toggle-overrides.sql` | 뷰어 토글 오버라이드 컬럼 |

---

## 9. 알려진 제약사항

1. **effectiveSession은 클라이언트 조작** — Supabase JWT 토큰은 실제 로그인 사용자 기준. RLS가 `is_linked_account` 함수로 별도 검증하므로 보안은 유지되지만, RPC 호출 등에서 혼동 가능
2. **프로젝트 소유 기반** — `useProjects`가 `effectiveSession.user.id` 기준으로 조회하므로, 임퍼소네이션 없이는 다른 사용자의 프로젝트에 접근 불가
3. **업무일지와의 충돌** — 업무일지는 모든 계정이 동일하게 접근해야 하는데, 현재 프로젝트 소유 구조와 맞지 않음 → 별도 해결 필요 (WORKLOG-SPEC.md 10-2절)
