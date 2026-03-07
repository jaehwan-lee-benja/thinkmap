# ThinkMap 리팩토링 기획서 - 재사용성 중심

> 작성일: 2026-03-07
> 대상: /Users/JaehwanLee/claude-project-pro2013/thinkmap

---

## 1. 현황 분석 요약

### 코드베이스 규모
- JSX 컴포넌트: 20개 (총 ~1,879줄)
- CSS 파일: 15개 (총 ~5,800줄)
- 커스텀 훅: 11개
- 유틸리티: 3개

### 핵심 문제점

| 문제 | 심각도 | 영향 범위 |
|------|--------|----------|
| 모달 4곳 구조 완전 중복 | 높음 | 4개 파일, ~200줄 |
| 이름 수정 로직 4곳 중복 | 높음 | 4개 파일, ~120줄 |
| 외부클릭 닫기 로직 3곳 중복 | 높음 | 3개 파일, ~50줄 |
| CSS 버튼/인풋 스타일 15곳+ 중복 | 중간 | 15개 파일, ~400줄 |
| 애니메이션 keyframes 8곳+ 중복 | 중간 | 8개 파일, ~80줄 |
| Sidebar props drilling (60+개) | 높음 | App.jsx, Sidebar.jsx |
| 하드코딩 색상값 (#1a1a1a 등) | 중간 | 10개+ 파일 |
| 삭제 확인 로직 4곳 중복 | 중간 | 4개 파일, ~60줄 |

---

## 2. 리팩토링 Phase 구성

```
Phase 1 (공통 훅)        -> useClickOutside + useEditableField + useConfirmAction
Phase 2 (공통 CSS)       -> 애니메이션 + 버튼 + 인풋 + 리스트아이템 기본 스타일
Phase 3 (공통 컴포넌트)   -> Modal + ModalHeader + EditableField
Phase 4 (모달 리팩토링)   -> 4개 모달을 공통 컴포넌트 기반으로 재작성
Phase 5 (Props 정리)     -> Context 도입으로 Sidebar props drilling 해소
Phase 6 (CSS 변수 통합)  -> 하드코딩 값 제거, 변수 체계 완성
Phase 7 (정리)           -> 인라인 스타일 제거, 파일 구조 정리
```

---

## 3. Phase 1: 공통 커스텀 훅 추출

> 중복 JS 로직을 재사용 가능한 훅으로 추출

### 1-1. `useClickOutside` 훅

**현재 중복**: PageSelector.jsx, ProjectSelector.jsx, BlockContextMenu.jsx (3곳)

```javascript
// 현재 (3곳에서 반복)
useEffect(() => {
  const handleClickOutside = (event) => {
    if (ref.current && !ref.current.contains(event.target)) {
      setIsOpen(false)
    }
  }
  if (isOpen) document.addEventListener('mousedown', handleClickOutside)
  return () => document.removeEventListener('mousedown', handleClickOutside)
}, [isOpen])
```

**리팩토링 후**:
```javascript
// src/hooks/ui/useClickOutside.js
export function useClickOutside(ref, onClose, isActive = true) {
  useEffect(() => {
    if (!isActive) return
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ref, onClose, isActive])
}
```

**적용 대상**:
- `src/components/Navigation/PageSelector.jsx` (L24-39)
- `src/components/Navigation/ProjectSelector.jsx` (L24-39)
- `src/components/TipTapEditor/components/BlockContextMenu.jsx` (L12-21)

---

### 1-2. `useEditableField` 훅

**현재 중복**: PageSelector, ProjectSelector, PageTree, Header (4곳)

```javascript
// 현재 (4곳에서 반복)
const [editingId, setEditingId] = useState(null)
const [editingName, setEditingName] = useState('')

const handleDoubleClick = (item) => {
  setEditingId(item.id)
  setEditingName(item.name)
}

const handleKeyDown = (e) => {
  if (e.key === 'Enter') { onSave(editingId, editingName); setEditingId(null) }
  if (e.key === 'Escape') { setEditingId(null) }
}
```

**리팩토링 후**:
```javascript
// src/hooks/ui/useEditableField.js
export function useEditableField(onSave) {
  const [editingId, setEditingId] = useState(null)
  const [editingValue, setEditingValue] = useState('')

  const startEdit = useCallback((id, currentValue) => {
    setEditingId(id)
    setEditingValue(currentValue)
  }, [])

  const cancelEdit = useCallback(() => {
    setEditingId(null)
    setEditingValue('')
  }, [])

  const saveEdit = useCallback(() => {
    if (editingValue.trim() && editingId) {
      onSave(editingId, editingValue.trim())
    }
    cancelEdit()
  }, [editingId, editingValue, onSave, cancelEdit])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') saveEdit()
    if (e.key === 'Escape') cancelEdit()
  }, [saveEdit, cancelEdit])

  return {
    editingId, editingValue, setEditingValue,
    startEdit, cancelEdit, saveEdit, handleKeyDown,
    isEditing: (id) => editingId === id,
  }
}
```

**적용 대상**:
- `src/components/Navigation/PageSelector.jsx` (L14-15, L42-60)
- `src/components/Navigation/ProjectSelector.jsx` (L14-15, L42-60)
- `src/components/Sidebar/PageTree.jsx` (L12-13, L34-52)
- `src/components/Navigation/Header.jsx` (L10-11, L22-40)

---

### 1-3. `useConfirmAction` 훅

**현재 중복**: PageSelector, ProjectSelector, PageTree, AdminModal (4곳)

```javascript
// 현재 (4곳에서 반복)
const handleDelete = (id, e) => {
  e.stopPropagation()
  if (items.length <= 1) { alert('마지막 항목은 삭제할 수 없습니다.'); return }
  if (window.confirm('삭제하시겠습니까?')) { onDelete(id) }
}
```

**리팩토링 후**:
```javascript
// src/hooks/ui/useConfirmAction.js
export function useConfirmAction(onConfirm, options = {}) {
  const { minRequired = 0, items = [], blockMessage, confirmMessage } = options

  const execute = useCallback((id, e) => {
    if (e) e.stopPropagation()
    if (minRequired > 0 && items.length <= minRequired) {
      alert(blockMessage || '마지막 항목은 삭제할 수 없습니다.')
      return
    }
    if (confirmMessage && !window.confirm(confirmMessage)) return
    onConfirm(id)
  }, [onConfirm, items.length, minRequired, blockMessage, confirmMessage])

  return { execute, canExecute: items.length > minRequired }
}
```

**적용 대상**:
- `src/components/Navigation/PageSelector.jsx` (L63-72)
- `src/components/Navigation/ProjectSelector.jsx` (L63-72)
- `src/components/Sidebar/PageTree.jsx` (L53-62)
- `src/components/Admin/AdminModal.jsx` (L34-38)

---

## 4. Phase 2: 공통 CSS 스타일 추출

> 15개+ 파일에 산재된 중복 CSS를 공통 스타일로 추출

### 2-1. `_animations.css` (공통 애니메이션)

**현재 중복**:
| 애니메이션 | 중복 파일 수 |
|-----------|------------|
| `fadeIn` | App.css, MindMapView.css, TipTapEditor.css (3곳) |
| `slideUp` (바텀시트) | ProjectModal, ShareModal, BackupModal, AdminModal, TipTapEditor (5곳) |
| `dropdown-appear` | Sidebar.css, ProjectSelector.css, PageSelector.css (3곳) |
| `slideIn` (토스트) | App.css, DeleteToast.css (2곳) |

**생성 파일**: `src/styles/_animations.css`
```css
/* 페이드 인 */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 바텀시트 슬라이드 업 */
@keyframes slideUpModal {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

/* 드롭다운 등장 */
@keyframes dropdownAppear {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 토스트 슬라이드 인 */
@keyframes slideIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 스피너 회전 */
@keyframes spin {
  to { transform: rotate(360deg); }
}
```

**변경 대상**: 위 13개 중복 정의 제거, import로 대체

---

### 2-2. `_modal.css` (모달 기본 스타일)

**현재 중복**: AdminModal.css, ProjectModal.css, BackupModal.css, ShareModal.css (4곳)

동일한 오버레이 + 모달 + 헤더 + 닫기버튼 스타일이 각 파일에 반복 (~50줄 x 4 = ~200줄)

**생성 파일**: `src/styles/_modal.css`
```css
/* 오버레이 */
.modal-overlay { ... }

/* 모달 컨테이너 */
.modal { ... }

/* 모달 헤더 */
.modal-header { ... }

/* 모달 제목 */
.modal-title { ... }

/* 모달 닫기 버튼 */
.modal-close-btn { ... }

/* 모달 콘텐츠 영역 */
.modal-body { ... }

/* 모달 하단 정보 */
.modal-footer { ... }

/* 반응형 - 바텀시트 (공통) */
@media (max-width: 768px) {
  .modal-overlay { align-items: flex-end; }
  .modal {
    width: 100%; max-width: 100%; max-height: 85vh;
    border-radius: 16px 16px 0 0;
    padding-bottom: var(--safe-area-bottom);
    animation: slideUpModal 0.25s ease;
  }
  .modal-close-btn {
    min-width: var(--touch-target-min);
    min-height: var(--touch-target-min);
  }
}
```

---

### 2-3. `_buttons.css` (버튼 기본 스타일)

**현재 중복**: 15곳 이상에서 유사 버튼 스타일 반복

```css
/* 아이콘 버튼 (닫기, 액션 등) */
.icon-btn { ... }
.icon-btn:hover { ... }
.icon-btn--danger:hover { ... }

/* 액션 버튼 (주요 동작) */
.action-btn { ... }
.action-btn--primary { ... }
.action-btn--danger { ... }
.action-btn:disabled { ... }

/* 삭제 버튼 (인라인) */
.delete-btn { ... }

/* 대시 버튼 (추가) */
.dashed-btn { ... }
```

**적용 대상**:
- `.admin-modal-close`, `.project-modal-close`, `.backup-modal-close`, `.share-modal-close` → `.icon-btn`
- `.sidebar-close-button`, `.mindmap-close-button`, `.column-view-close-button` → `.icon-btn`
- `.user-delete-button`, `.page-delete-button`, `.project-delete-button` → `.delete-btn`
- `.backup-create-button`, `.share-add-button`, `.add-user-button` → `.action-btn--primary`
- `.project-modal-add`, `.backup-import-button` → `.dashed-btn`

---

### 2-4. `_inputs.css` (입력필드 기본 스타일)

**현재 중복**: 5곳에서 동일 입력필드 스타일 반복

```css
/* 기본 텍스트 입력 */
.input-field {
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-input);
  border: 1px solid var(--color-border-medium);
  border-radius: var(--border-radius-md);
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
}
.input-field:focus { outline: none; border-color: var(--color-primary); }
.input-field::placeholder { color: var(--color-text-tertiary); }

/* 셀렉트 */
.select-field { ... }

/* 폼 행 (인풋 + 버튼 가로 배치) */
.form-row { display: flex; gap: var(--spacing-sm); }

/* 모바일에서 폼 행 세로 전환 */
@media (max-width: 768px) {
  .form-row--stack { flex-direction: column; }
}
```

**적용 대상**:
- `.add-user-input`, `.add-user-role` (AdminModal.css)
- `.project-edit-input` (ProjectModal.css)
- `.backup-description-input` (BackupModal.css)
- `.share-email-input`, `.share-permission-select` (ShareModal.css)
- `.block-edit-input` (ColumnView.css)

---

### 2-5. `_list-item.css` (리스트 아이템 기본 스타일)

**현재 중복**: Sidebar.css, ProjectSelector.css, PageSelector.css 등 6곳+

```css
/* 기본 리스트 아이템 */
.list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.15s ease;
  user-select: none;
  border: 2px solid transparent;
}
.list-item:hover { background-color: rgba(255, 255, 255, 0.05); }
.list-item--active { background-color: rgba(100, 108, 255, 0.15); border-color: rgba(100, 108, 255, 0.3); }

/* 리스트 아이템 내 액션 버튼 */
.list-item-actions { display: flex; gap: 4px; margin-left: auto; opacity: 0; }
.list-item:hover .list-item-actions { opacity: 1; }

/* 터치 디바이스 */
@media (hover: none) and (pointer: coarse) {
  .list-item { min-height: var(--touch-target-min); }
  .list-item-actions { opacity: 0.7; }
}
```

---

### 2-6. `_badge.css` (상태 배지)

**현재 중복**: AdminModal.css, ShareModal.css (2곳)

```css
.badge { font-size: var(--font-size-xs); padding: 2px 8px; border-radius: 10px; }
.badge--success { background: var(--color-success-bg); color: var(--color-success-text); }
.badge--warning { background: var(--color-warning-bg); color: var(--color-warning-text); }
.badge--danger { background: rgba(239, 68, 68, 0.1); color: rgba(239, 68, 68, 0.7); }
.badge--primary { background: var(--color-primary-bg); color: var(--color-primary); }
```

---

## 5. Phase 3: 공통 React 컴포넌트

> 중복 UI 패턴을 재사용 가능한 컴포넌트로 추출

### 3-1. `<Modal>` 컴포넌트

**현재 중복**: 4개 모달에서 동일 JSX 구조 반복

```jsx
// src/components/Common/Modal/Modal.jsx
export function Modal({ isOpen, onClose, children, className = '' }) {
  if (!isOpen) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${className}`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

export function ModalHeader({ icon: Icon, title, onClose }) {
  return (
    <div className="modal-header">
      <div className="modal-title">
        {Icon && <Icon size={20} />}
        <span>{title}</span>
      </div>
      <button className="modal-close-btn" onClick={onClose}>
        <X size={20} />
      </button>
    </div>
  )
}

export function ModalBody({ children, className = '' }) {
  return <div className={`modal-body ${className}`}>{children}</div>
}
```

**적용 후 (예: ShareModal)**:
```jsx
// 리팩토링 전: ~30줄의 모달 구조 코드
// 리팩토링 후:
<Modal isOpen={isOpen} onClose={onClose} className="share-modal">
  <ModalHeader icon={Share2} title="공유 설정" onClose={onClose} />
  <ModalBody>
    {/* 공유 고유 콘텐츠만 */}
  </ModalBody>
</Modal>
```

---

### 3-2. `<EditableField>` 컴포넌트

**현재 중복**: PageSelector, ProjectSelector, PageTree에서 동일 편집 UI 반복

```jsx
// src/components/Common/EditableField.jsx
export function EditableField({
  value, onChange, onSave, onCancel, onKeyDown,
  placeholder, autoFocus = true, className = ''
}) {
  const inputRef = useRef(null)
  useEffect(() => { if (autoFocus) inputRef.current?.focus() }, [autoFocus])

  return (
    <input
      ref={inputRef}
      className={`input-field ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={onSave}
      placeholder={placeholder}
    />
  )
}
```

---

### 3-3. `<ListSection>` 컴포넌트

**현재 중복**: AdminModal, ShareModal, BackupModal에서 로딩/빈상태/목록 패턴 반복

```jsx
// src/components/Common/ListSection.jsx
export function ListSection({
  title, icon: Icon, items, loading, emptyText,
  renderItem, className = '', headerRight
}) {
  return (
    <div className={`list-section ${className}`}>
      {title && (
        <div className="list-section-header">
          {Icon && <Icon size={16} />}
          <span>{title}</span>
          {headerRight}
        </div>
      )}
      {loading ? (
        <div className="list-section-loading">로딩 중...</div>
      ) : items.length === 0 ? (
        <div className="list-section-empty">{emptyText || '항목이 없습니다.'}</div>
      ) : (
        <div className="list-section-items">
          {items.map(renderItem)}
        </div>
      )}
    </div>
  )
}
```

---

## 6. Phase 4: 모달 리팩토링

> Phase 2-3에서 만든 공통 스타일/컴포넌트를 실제 모달에 적용

### 대상 파일 및 예상 변경량

| 파일 | 현재 줄수 | 예상 줄수 | 절감 |
|------|---------|---------|------|
| AdminModal.jsx | ~180줄 | ~120줄 | -33% |
| AdminModal.css | ~315줄 | ~120줄 | -62% |
| ShareModal.jsx | ~155줄 | ~100줄 | -35% |
| ShareModal.css | ~340줄 | ~100줄 | -71% |
| BackupModal.jsx | ~160줄 | ~110줄 | -31% |
| BackupModal.css | ~460줄 | ~180줄 | -61% |
| ProjectModal.jsx | ~200줄 | ~130줄 | -35% |
| ProjectModal.css | ~285줄 | ~80줄 | -72% |

**총 예상 절감**: ~1,300줄 → ~500줄 제거

### 작업 순서
1. ProjectModal (가장 단순) → 패턴 검증
2. ShareModal
3. BackupModal
4. AdminModal (가장 복잡)

---

## 7. Phase 5: Props Drilling 해소

> App.jsx → Sidebar에 60+개 props 전달 문제 해결

### 현재 문제

```jsx
// App.jsx에서 Sidebar로 전달하는 props (60줄+)
<Sidebar
  isOpen={sidebarOpen}
  onClose={() => setSidebarOpen(false)}
  projects={projects}
  currentProjectId={currentProjectId}
  onProjectSelect={setCurrentProjectId}
  onProjectCreate={createProject}
  onProjectRename={renameProject}
  onProjectDelete={deleteProject}
  pages={pages}
  currentPageId={currentPageId}
  onPageSelect={setCurrentPageId}
  onPageCreate={createPage}
  // ... 50줄 더
/>
```

### 해결: Context 분리

```jsx
// src/contexts/ProjectContext.jsx
export const ProjectContext = createContext(null)

export function ProjectProvider({ children }) {
  const projectData = useProjects(/* ... */)
  return (
    <ProjectContext.Provider value={projectData}>
      {children}
    </ProjectContext.Provider>
  )
}
```

### Context 분리 계획

| Context | 관리 상태 | 사용 컴포넌트 |
|---------|---------|-------------|
| `ProjectContext` | projects, currentProjectId, CRUD | Sidebar, ProjectSelector, ProjectModal |
| `PageContext` | pages, currentPageId, CRUD, tree | Sidebar, PageSelector, PageTree, Editor |
| `SharingContext` | sharing 상태, CRUD | Sidebar, ShareModal |
| `UIContext` | sidebarOpen, modals 상태 | App, Sidebar, Header |

### 리팩토링 후

```jsx
// App.jsx (깔끔해짐)
<ProjectProvider>
  <PageProvider>
    <UIProvider>
      <Sidebar />
      <MainContent />
    </UIProvider>
  </PageProvider>
</ProjectProvider>

// Sidebar.jsx (props 없이 context에서 가져옴)
function Sidebar() {
  const { projects, currentProjectId } = useContext(ProjectContext)
  const { pages, currentPageId } = useContext(PageContext)
  const { sidebarOpen, closeSidebar } = useContext(UIContext)
  // ...
}
```

---

## 8. Phase 6: CSS 변수 통합

> 하드코딩된 색상/크기값을 변수 체계로 통합

### 추가할 변수 (variables.css)

```css
/* 배경색 계열 */
--color-bg-app: #242424;
--color-bg-sidebar: #1a1a1a;
--color-bg-sidebar-alt: #242424;

/* 텍스트 강조 */
--color-text-title: #e0e7ff;

/* 마스터/어드민 테마 */
--color-master-gradient-start: #667eea;
--color-master-gradient-end: #764ba2;
--color-master-text: #a78bfa;

/* 경고/위험 인라인 */
--color-danger: #ef4444;
--color-danger-bg: rgba(239, 68, 68, 0.1);
--color-danger-bg-hover: rgba(239, 68, 68, 0.2);

/* 임퍼소네이션 */
--color-impersonation: rgba(245, 158, 11, 0.9);
```

### 하드코딩 제거 대상

| 값 | 현재 사용 횟수 | 대체 변수 |
|----|-------------|----------|
| `#1a1a1a` | 6곳 (Sidebar.css) | `var(--color-bg-sidebar)` |
| `#242424` | 4곳 (App.css, Sidebar.css) | `var(--color-bg-app)` |
| `#646cff` | 8곳+ | `var(--color-primary)` |
| `#e0e7ff` | 2곳 (App.css) | `var(--color-text-title)` |
| `rgba(239, 68, 68, *)` | 10곳+ | `var(--color-danger-*)` |
| `rgba(100, 108, 255, *)` | 8곳+ | `var(--color-primary-*)` 계열 |

---

## 9. Phase 7: 정리 및 마무리

### 7-1. 인라인 스타일 제거

| 파일 | 인라인 스타일 위치 | CSS 대체 |
|------|----------------|---------|
| GoogleAuthButton.jsx | L11, L24-29, L37-48 | `auth.css` 생성 |
| PageTree.jsx | L107 `paddingLeft` | CSS 변수 + `--depth` 커스텀속성 |
| TableToolbar.jsx | L8-11 `position:fixed` | 동적 위치는 유지 (불가피) |

### 7-2. 파일 구조 정리

```
src/
├── styles/
│   ├── variables.css       (기존 확장)
│   ├── _animations.css     (Phase 2 신규)
│   ├── _modal.css          (Phase 2 신규)
│   ├── _buttons.css        (Phase 2 신규)
│   ├── _inputs.css         (Phase 2 신규)
│   ├── _list-item.css      (Phase 2 신규)
│   └── _badge.css          (Phase 2 신규)
├── components/
│   ├── Common/
│   │   ├── Modal/
│   │   │   ├── Modal.jsx   (Phase 3 신규)
│   │   │   └── Modal.css   (= _modal.css 재활용)
│   │   ├── EditableField.jsx (Phase 3 신규)
│   │   ├── ListSection.jsx   (Phase 3 신규)
│   │   ├── Toast.jsx         (기존)
│   │   └── DeleteToast.jsx   (기존)
│   └── ... (기존 구조 유지)
├── hooks/
│   ├── useClickOutside.js    (Phase 1 신규)
│   ├── useEditableField.js   (Phase 1 신규)
│   ├── useConfirmAction.js   (Phase 1 신규)
│   └── ... (기존 훅 유지)
├── contexts/
│   ├── ProjectContext.jsx    (Phase 5 신규)
│   ├── PageContext.jsx       (Phase 5 신규)
│   ├── SharingContext.jsx    (Phase 5 신규)
│   └── UIContext.jsx         (Phase 5 신규)
└── utils/
    ├── validation.js         (Phase 7 신규)
    └── ... (기존 유지)
```

### 7-3. 불필요한 코드 정리

- 각 모달 CSS에서 공통 스타일로 이동된 부분 삭제
- 중복 keyframes 정의 삭제
- 사용하지 않는 CSS 셀렉터 탐색 및 제거

---

## 10. 우선순위 매트릭스

| 순위 | 항목 | 영향도 | 난이도 | Phase | 예상 절감 |
|------|------|--------|--------|-------|---------|
| 1 | useClickOutside 훅 | 높음 | 낮음 | 1 | ~50줄 |
| 2 | useEditableField 훅 | 높음 | 낮음 | 1 | ~120줄 |
| 3 | useConfirmAction 훅 | 중간 | 낮음 | 1 | ~60줄 |
| 4 | 공통 애니메이션 CSS | 중간 | 낮음 | 2 | ~80줄 |
| 5 | 공통 모달 CSS | 높음 | 중간 | 2 | ~200줄 |
| 6 | 공통 버튼/인풋 CSS | 높음 | 중간 | 2 | ~150줄 |
| 7 | Modal 컴포넌트 | 높음 | 중간 | 3 | ~120줄 |
| 8 | EditableField 컴포넌트 | 중간 | 낮음 | 3 | ~80줄 |
| 9 | 모달 4개 리팩토링 | 높음 | 중간 | 4 | ~500줄 |
| 10 | Context 도입 | 높음 | 높음 | 5 | ~200줄 (Props) |
| 11 | CSS 변수 통합 | 중간 | 낮음 | 6 | 유지보수성 |
| 12 | 파일 정리 | 낮음 | 낮음 | 7 | 코드 품질 |

---

## 11. 주의사항

1. **데스크톱 회귀 방지** — 모든 변경 후 데스크톱/모바일 양쪽 테스트
2. **점진적 교체** — 공통 컴포넌트 생성 후 한 파일씩 교체, 매 Phase 빌드 확인
3. **기존 클래스명 호환** — 공통 CSS 적용 시 기존 클래스명을 급격히 바꾸지 말고, 공통 클래스를 병행 추가 후 점진 전환
4. **Context 과도 분리 금지** — 실제 공유되는 상태만 Context로 추출, 로컬 상태는 컴포넌트에 유지
5. **CSS import 순서** — 공통 스타일 → 변수 → 컴포넌트 순서로 로드하여 우선순위 보장

---

## 12. 기대 효과 요약

| 지표 | 현재 | 목표 |
|------|------|------|
| 총 CSS 줄수 | ~5,800줄 | ~4,200줄 (-28%) |
| 총 JSX 줄수 | ~1,879줄 | ~1,500줄 (-20%) |
| 모달당 CSS | ~300줄 | ~80줄 (-73%) |
| Sidebar props | 60+개 | 0개 (Context) |
| 중복 애니메이션 | 13곳 | 1곳 |
| 중복 버튼 스타일 | 15곳 | 1곳 |
| 신규 컴포넌트 재사용률 | - | 모달 100%, 리스트 100% |
