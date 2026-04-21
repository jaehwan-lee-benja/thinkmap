# 분할면(Split Pane) 독립 아키텍처 리팩토링

## Context

현재 분할 뷰에서 양쪽 패널에 서로 다른 계정(임퍼소네이션)을 띄워놓으면, 한쪽을 클릭할 때마다 다른 계정의 데이터가 깜빡이며 뒤섞인다. 원인은 임퍼소네이션, 프로젝트, 페이지 등의 상태가 **전역 1개**로 공유되어 있고, "활성 패널"만 그 상태를 점유할 수 있는 구조이기 때문이다.

**목표**: 각 패널이 자체적으로 데이터를 보유하여, 전환 시 로딩/깜빡임 없이 양쪽 모두 항상 살아있는 상태로 만든다.

---

## 현재 구조 (문제점)

```
App.jsx (전역 1개)
 ├── useImpersonation(session) → impersonatedUser 1개 → effectiveSession 1개
 ├── useProjects(effectiveSession) → projects[] 1개, currentProjectId 1개
 ├── usePages(effectiveSession, projectId) → pages[] 1개, currentPageId 1개
 ├── useSharing(effectiveSession) → sharedWithMe 1개
 ├── useBackup(effectiveSession) → backups 1개
 │
 ├── ProjectContext.Provider (1개) ← Sidebar가 읽음
 ├── PageContext.Provider (1개) ← Sidebar가 읽음
 ├── SharingContext.Provider (1개) ← Sidebar가 읽음
 ├── BackupContext.Provider (1개) ← Sidebar가 읽음
 │
 ├── Pane 0 ─ 전역 데이터 공유
 └── Pane 1 ─ 전역 데이터 공유 (클릭 시 임퍼소네이션 전환 → 리로드 → 깜빡임)
```

### 이미 독립적인 것
- **TipTapTestPage**: `pageId`로 Supabase에서 직접 콘텐츠를 가져옴. 전역 Context 미사용.
- **PageTree**: 순수 props 기반 컴포넌트.
- **useTabs**: 이미 탭별로 `projectId`, `pageId`, `impersonatedUserId`, `impersonatedUserEmail` 저장.

### 전역 상태에 의존하는 것
- **Sidebar.jsx**: `useProjectContext()`, `usePageContext()`, `useSharingContext()`, `useBackupContext()` 4개 Context 소비
- **Header.jsx**: `useProjectContext()` (분할뷰에서 사용 안 함)
- **App.jsx**: `renderPaneContent`에서 활성/비활성 구분하여 `currentPageId` 결정

---

## 목표 구조

```
App.jsx
 ├── useAuth, useUserPreferences, useTabs, useUsers (전역 — 계정 레벨)
 ├── AuthContext.Provider (전역 — 로그인/사용자 관리)
 │
 ├── PaneProvider(pane=0)  ← 독립적인 데이터 소유
 │    ├── effectiveSession (탭의 impersonation 정보로 구성)
 │    ├── useProjects(effectiveSession)
 │    ├── usePages(effectiveSession, projectId)
 │    ├── useSharing(effectiveSession)
 │    ├── useBackup(effectiveSession)
 │    ├── ProjectContext.Provider ← 이 패널의 데이터
 │    ├── PageContext.Provider
 │    ├── SharingContext.Provider
 │    ├── BackupContext.Provider
 │    └── Sidebar + TipTapEditor (변경 없이 Context에서 읽음)
 │
 └── PaneProvider(pane=1)  ← 독립적인 데이터 소유
      └── (동일 구조)
```

**핵심**: Sidebar.jsx는 **한 줄도 수정하지 않는다**. PaneProvider가 각 패널을 감싸며 자체 Context를 제공하므로, Sidebar는 가장 가까운 Provider의 값을 읽게 된다.

---

## 상세 구현 계획

### Step 1. useTabs에 `updateTabInPane` 추가

**파일**: `/src/hooks/useTabs.js`

현재 `updateActiveTab`은 `activePaneIndexRef.current` 기준으로만 동작한다. PaneProvider가 자기 패널의 탭을 직접 업데이트할 수 있도록 `paneIndex`를 지정 가능한 함수를 추가한다.

```javascript
const updateTabInPane = useCallback((paneIndex, fields) => {
  setPanes(prev => {
    const pane = prev[paneIndex]
    if (!pane) return prev
    const newPanes = prev.map((p, i) =>
      i === paneIndex
        ? { ...p, tabs: p.tabs.map(t => t.id === p.activeTabId ? { ...t, ...fields } : t) }
        : p
    )
    save(newPanes)
    return newPanes
  })
}, [save])
```

return에 `updateTabInPane` 추가.

---

### Step 2. PaneProvider 컴포넌트 생성

**새 파일**: `/src/components/PaneProvider.jsx`

Props:
```
session        - 실제 Supabase 세션 (변경 안 됨)
isMaster       - 관리자 여부
pane           - { tabs, activeTabId }
paneIndex      - 0 또는 1
prefs          - useUserPreferences 결과
updateTab      - (fields) => updateTabInPane(paneIndex, fields)
users          - 사용자 목록 (breadcrumb용)
ownEmail       - 본인 이메일 (breadcrumb용)
children
```

내부 동작:
1. `activeTab` 계산: `pane.tabs.find(t => t.id === pane.activeTabId) || pane.tabs[0]`
2. `effectiveSession` 구성:
   ```javascript
   const effectiveSession = useMemo(() => {
     if (!session || !activeTab?.impersonatedUserId) return session
     return {
       ...session,
       user: { ...session.user, id: activeTab.impersonatedUserId, email: activeTab.impersonatedUserEmail },
     }
   }, [session, activeTab?.impersonatedUserId, activeTab?.impersonatedUserEmail])
   ```
3. 훅 호출:
   - `useProjects(effectiveSession, { initialProjectId: activeTab?.projectId, onProjectChange, ... })`
   - `usePages(effectiveSession, currentProjectId, { initialPageId: activeTab?.pageId, onPageChange, ... })`
   - `useSharing(effectiveSession)`
   - `useBackup(effectiveSession)`
4. `onProjectChange` / `onPageChange` 콜백에서 `updateTab({ projectId })` / `updateTab({ pageId })` 호출
5. 백업 목록 상태 관리 (현재 App.jsx 236~261행의 로직 이동)
6. breadcrumb 함수 (`buildBreadcrumb`, `getBreadcrumbSiblings`, `handleBreadcrumbNavigate`) 이동
7. Context Provider 중첩 렌더:
   ```jsx
   <ProjectContext.Provider value={projectCtx}>
   <PageContext.Provider value={pageCtx}>
   <SharingContext.Provider value={sharingCtx}>
   <BackupContext.Provider value={backupCtx}>
     {children}
   </BackupContext.Provider>
   </SharingContext.Provider>
   </PageContext.Provider>
   </ProjectContext.Provider>
   ```

---

### Step 3. App.jsx 리팩토링 (가장 큰 변경)

**파일**: `/src/App.jsx`

#### 제거할 것:
- `useImpersonation(session, isMaster, prefs)` 호출 및 관련 변수
- `useProjects(effectiveSession, ...)` 호출 및 관련 변수
- `usePages(effectiveSession, currentProjectId, ...)` 호출 및 관련 변수
- `useSharing(effectiveSession)` 호출
- `useBackup(effectiveSession)` 호출
- 백업 목록 상태 (`backups`, `refreshBackups`, `handleCreateBackup` 등)
- `projectCtx`, `pageCtx`, `sharingCtx`, `backupCtx` useMemo
- `ProjectContext.Provider`, `PageContext.Provider`, `SharingContext.Provider`, `BackupContext.Provider` JSX
- 탭 전환 임퍼소네이션 sync effect (현재 86~121행)
- `handleProjectChange`, `handlePageChange` 콜백
- `initialProjectId`, `initialPageId` 계산
- `renderPaneContent`의 활성/비활성 pageId 분기 (534행)
- 임퍼소네이션 전환 중 로딩 체크 (521~528행)
- `pendingSidebarRef` 및 관련 지연 로직 (311~320행)
- breadcrumb 함수들 (`buildBreadcrumb`, `getBreadcrumbSiblings`, `handleBreadcrumbNavigate`) → PaneProvider로 이동
- 프로젝트명/페이지경로 탭 동기화 effect (392~418행) → PaneProvider로 이동

#### 유지할 것:
- `useAuth()` — 인증
- `useUserPreferences(session)` — 환경설정 (실제 사용자 기준)
- `useTabs(prefs)` — 탭/패널 관리
- `useUsers(session, isMaster)` — 사용자 목록 (관리자 기능)
- `AuthContext.Provider` — 전역 인증 컨텍스트
- `tabSidebarOpen` 상태 — 탭별 사이드바 열림/닫힘 (UI 상태)
- `splitRatio`, `handleDividerMouseDown` — 분할 리사이즈
- `deleteToast` — 삭제 토스트 (전역 UI)
- `mobileView` — 모바일 뷰 모드

#### `renderPane` 변경:

```jsx
const renderPane = (paneIndex) => {
  const pane = panes[paneIndex]
  if (!pane) return null

  return (
    <PaneProvider
      session={session}
      isMaster={isMaster}
      pane={pane}
      paneIndex={paneIndex}
      prefs={prefs}
      updateTab={(fields) => updateTabInPane(paneIndex, fields)}
      users={users}
      ownEmail={session?.user?.email}
      onDeletePage={(pageName) => setDeleteToast({ key: Date.now(), pageName })}
    >
      <div
        className="pane"
        onMouseDown={() => focusPane(paneIndex)}
      >
        <PaneTabBar
          pane={pane}
          paneIndex={paneIndex}
          onSwitch={(tabId) => switchTab(paneIndex, tabId)}
          onAdd={() => addTab(paneIndex, { ... })}
          onRemove={(tabId) => removeTab(paneIndex, tabId)}
          onReorder={(from, to) => reorderTab(paneIndex, from, to)}
          onMoveTab={(fromPane, fromTabIndex, toIndex) => moveTabToPane(fromPane, fromTabIndex, paneIndex, toIndex)}
        />
        <PaneContent
          paneIndex={paneIndex}
          tabSidebarOpen={tabSidebarOpen}
          onToggleSidebar={(tabId) => toggleTabSidebar(tabId)}
          mobileView={mobileView}
          onMobileViewChange={setMobileView}
        />
      </div>
    </PaneProvider>
  )
}
```

PaneTabBar와 PaneContent는 PaneProvider 내부에서 Context를 통해 자체 projects/pages에 접근. 또는 기존 TabBar/renderPaneContent를 PaneProvider children으로 전달하되, breadcrumb 관련은 PaneProvider가 제공하는 별도 Context나 props로 전달.

#### AuthContext 변경:

`authCtx`에서 임퍼소네이션 관련 값은 **활성 패널의 탭 정보**에서 파생:
```javascript
const activeTab = panes[activePaneIndex]?.tabs?.find(t => t.id === panes[activePaneIndex]?.activeTabId)
const isImpersonating = !!activeTab?.impersonatedUserId
const impersonatedEmail = activeTab?.impersonatedUserEmail || null

const handleStartImpersonation = (userId, userEmail) => {
  updateTabInPane(activePaneIndex, {
    impersonatedUserId: userId,
    impersonatedUserEmail: userEmail,
    projectId: null,
    pageId: null,
  })
  prefs.saveLastImpersonation(userId, userEmail)
}

const handleStopImpersonation = () => {
  updateTabInPane(activePaneIndex, {
    impersonatedUserId: null,
    impersonatedUserEmail: null,
    projectId: null,
    pageId: null,
  })
  prefs.clearLastImpersonation()
}
```

---

### Step 4. PaneProvider 내부에서 breadcrumb 처리

PaneProvider는 자체 `projects`, `pages`, `users` 데이터에 접근 가능하므로, breadcrumb 함수를 여기서 정의하고 TabBar에 전달한다.

별도 Context(`PaneDataContext`) 또는 props 방식으로 TabBar에 전달:
- `buildBreadcrumb(tab)` — PaneProvider의 projects/pages 사용
- `getBreadcrumbSiblings(part)` — PaneProvider의 projects/pages/users 사용
- `handleBreadcrumbNavigate(type, id)` — project/page 선택 시 PaneProvider의 `setCurrentProjectId`/`setCurrentPageId` 호출, user 선택 시 `updateTab`으로 임퍼소네이션 변경

---

### Step 5. 활성/비활성 개념 정리

`activePaneIndex`는 **유지하되 역할을 축소**:
- **유지**: 키보드 포커스, GlobalTopBar의 임퍼소네이션 표시, AdminModal의 임퍼소네이션 대상
- **제거**: 데이터 로딩 결정, 콘텐츠 표시 분기, 사이드바 지연 열기

패널의 파란색 활성 표시(`.pane-active`)도 제거하거나 미세한 시각 효과로 변경 가능.

---

### Step 6. 정리 및 삭제

- `/src/hooks/useImpersonation.js` — 삭제 가능 (effectiveSession 구성 로직이 PaneProvider의 useMemo 3줄로 대체)
- App.jsx의 디버그 콘솔 로그 전부 제거
- `pendingSidebarRef` 및 관련 지연 로직 제거 (더 이상 필요 없음)
- `isImpSwitching` 관련 코드 제거

---

## 수정 대상 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| **`/src/components/PaneProvider.jsx`** | **신규 생성** — 핵심 컴포넌트 |
| **`/src/App.jsx`** | 대폭 리팩토링 — 전역 데이터 훅 제거, PaneProvider 도입 |
| **`/src/hooks/useTabs.js`** | `updateTabInPane` 함수 추가 |
| `/src/hooks/useImpersonation.js` | 삭제 또는 미사용 |
| `/src/components/Sidebar/Sidebar.jsx` | **변경 없음** |
| `/src/components/Sidebar/components/PageTree.jsx` | **변경 없음** |
| `/src/components/TipTapEditor/TipTapTestPage.jsx` | **변경 없음** (이미 독립적) |
| `/src/hooks/useProjects.js` | **변경 없음** (PaneProvider에서 호출) |
| `/src/hooks/usePages.js` | **변경 없음** |
| `/src/hooks/useSharing.js` | **변경 없음** |
| `/src/hooks/useBackup.js` | **변경 없음** |
| `/src/components/GlobalTopBar/GlobalTopBar.jsx` | **변경 없음** (AuthContext에서 읽는 값만 달라짐) |

---

## 구현 순서 (안전한 순서)

1. **Step 1**: `useTabs.js`에 `updateTabInPane` 추가 (순수 추가, 기존 코드 영향 없음)
2. **Step 2**: `PaneProvider.jsx` 생성 (새 파일, 기존 코드 영향 없음)
3. **Step 3**: `App.jsx` 리팩토링 (빅뱅 — 전역 훅 제거 + PaneProvider 적용)
4. **Step 4-6**: 정리 (콘솔 로그 제거, 미사용 코드 삭제, 활성 표시 조정)

---

## 검증 방법

1. **기본 동작**: 단일 모드에서 프로젝트/페이지 탐색, 에디터 편집, 사이드바 열기/닫기
2. **분할 뷰 — 같은 계정**: 양쪽에서 같은 계정의 서로 다른 페이지 편집
3. **분할 뷰 — 다른 계정**: 양쪽에서 서로 다른 계정 임퍼소네이션, 사이드바 열어서 각자의 페이지 확인
4. **패널 전환 깜빡임**: 양쪽 다른 계정 상태에서 패널 간 클릭 시 깜빡임/데이터 뒤섞임 없음
5. **탭 드래그**: 같은 패널 내 순서 변경, 패널 간 이동
6. **새 탭 추가/닫기**: 빈 탭 생성 → breadcrumb으로 프로젝트/페이지 선택
7. **AdminModal 임퍼소네이션**: GlobalTopBar에서 계정 전환 → 활성 패널에만 적용
8. **빌드 성공**: `npx vite build` 에러 없음

---

## 주의사항

- 두 패널이 같은 페이지를 동시에 편집하면 서로 덮어쓸 수 있음 (기존 리스크, 이번 범위 밖)
- `useProjects`가 2개 인스턴스로 동시 실행되므로 같은 사용자의 기본 프로젝트 중복 생성 가능성 있으나, 실질적으로 분할 뷰에서 같은 계정의 프로젝트 없는 상태는 거의 발생 안 함
- `expandedPages`는 실제 사용자 기준 (임퍼소네이션 무관) — 현재 동작 유지
