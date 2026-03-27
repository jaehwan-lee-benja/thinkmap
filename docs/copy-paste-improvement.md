# 토글 블록 복사/붙여넣기 개선 기획서

## 현재 문제

토글 블록을 복사(Cmd+C) 후 붙여넣기(Cmd+V)하면, 토글이 현재 토글 **내부에 중첩**되어 삽입된다.
기대 동작은 현재 토글의 **형제 레벨(같은 깊이)**에 삽입되는 것이다.

### 문제 세부 사항

1. **단일 토글 복사/붙여넣기**: 토글 안에서 Cmd+A → Cmd+C → Cmd+V 시 토글 내부에 중첩됨
2. **멀티셀렉트 복사**: Cmd+클릭으로 여러 토글 선택 후 Cmd+C가 동작하지 않음
3. **멀티셀렉트 삭제**: Backspace 키가 동작하지 않았음 (해결 완료)

---

## 해결 완료된 것

### 1. 멀티셀렉트 Backspace 삭제 (해결)

**원인**: `addKeyboardShortcuts`의 `Backspace` 핸들러가 플러그인 `handleKeyDown`보다 우선 실행되어, 멀티셀렉트 삭제 로직에 도달하지 못함.

**해결**: `Backspace` 키보드 숏컷 최상단에서 멀티셀렉트 상태를 먼저 체크.

```js
// ToggleExtension.js — Backspace 핸들러 시작부
'Backspace': ({ editor }) => {
  const multiState = multiSelectPluginKey.getState(state)
  if (multiState && multiState.selectedPositions.length > 0) {
    return deleteMultiSelected(state, (tr) => editor.view.dispatch(tr))
  }
  // ... 기존 로직
}
```

### 2. addNodeView에 data-type="toggle" 추가 (해결)

**원인**: `addNodeView`에서 생성하는 DOM에 `data-type="toggle"` 속성이 없어서, 일반 복사 시 클립보드 HTML을 `parseHTML`이 토글로 인식하지 못함.

**해결**: `addNodeView` DOM 생성 시 `dom.setAttribute('data-type', 'toggle')` 추가.

### 3. 붙여넣기 핸들러 개선 (부분 해결)

**변경 위치**: `TipTapEditor.jsx`의 `handlePaste`

- HTML 클립보드에 토글 구조가 포함된 경우 감지 (`data-type="toggle"` 또는 `toggle-block` 클래스)
- `PmDOMParser`로 파싱 후 현재 토글의 형제 레벨에 삽입
- 토글 밖에서 붙여넣기 시에도 올바른 위치에 삽입

---

## 미해결 — 멀티셀렉트 복사 (Cmd+C)

### 시도한 접근

#### 접근 1: handleKeyDown에서 Cmd+C 가로채기

```js
// 플러그인 handleKeyDown 내부
if (isMod && (event.key === 'c' || event.key === 'x')) {
  // navigator.clipboard.write()로 클립보드 쓰기
}
```

**실패 이유**: `navigator.clipboard.write()`는 비동기이고, 브라우저 보안 정책에 따라 불안정.

#### 접근 2: handleDOMEvents.copy/cut 사용

```js
// 플러그인 props
handleDOMEvents: {
  copy(view, event) {
    // event.clipboardData.setData()로 동기적 쓰기
    const ser = DOMSerializer.fromSchema(view.state.schema)
    // ... 노드를 HTML로 직렬화
    event.clipboardData.clearData()
    event.clipboardData.setData('text/html', htmlStr)
    event.clipboardData.setData('text/plain', textStr)
    event.preventDefault()
    return true
  }
}
```

**실패 이유**: `copy` 이벤트가 에디터에 도달하지 않음. 드래그 핸들/토글 버튼/체크박스가 `contentEditable=false`이므로 Cmd+클릭 시 에디터 포커스가 사라짐.

#### 접근 3: editor.view.focus() 호출

모든 Cmd+클릭 멀티셀렉트 핸들러(4곳)에서 `editor.view.dispatch()` 후 `editor.view.focus()` 추가.

- 드래그 핸들 click (약 413행)
- 드래그 핸들 shift+click 범위 선택 (약 438행, 445행)
- 토글 버튼 mousedown (약 493행)
- 체크박스 mousedown (약 684행)

**결과**: 아직 불안정. focus가 복원되는 타이밍과 copy 이벤트 발생 타이밍이 어긋나거나, 다른 이유로 copy 이벤트가 에디터에 도달하지 않는 경우가 있음.

### 남은 디버깅 포인트

1. **콘솔 로그 위치** (현재 코드에 남아있음):
   - `ToggleExtension.js` — `handleMultiSelectCopy()`: `[멀티복사]` 로그
   - `ToggleExtension.js` — `handleDOMEvents.copy`: `[DOM이벤트] copy 발생` 로그
   - `TipTapEditor.jsx` — `handlePaste`: `[붙여넣기]` 로그

2. **확인 필요 사항**:
   - Cmd+클릭 후 `document.activeElement`가 에디터 DOM인지 확인
   - `copy` 이벤트가 어디서 발생하는지 (에디터 vs 다른 요소)
   - ProseMirror의 `handleDOMEvents` 등록이 올바른 순서인지

### 추천 다음 접근

**접근 A**: `document` 레벨에서 `copy` 이벤트를 리스너로 잡기

```js
// 에디터 초기화 시 document에 리스너 등록
document.addEventListener('copy', (e) => {
  const pluginState = multiSelectPluginKey.getState(editor.state)
  if (!pluginState || pluginState.selectedPositions.length === 0) return
  // clipboardData에 쓰기
})
```

이 방식은 포커스 위치와 무관하게 동작하므로 가장 안정적일 수 있음.

**접근 B**: Cmd+C 키다운 시 에디터에 프로그래밍적으로 copy 이벤트를 트리거

```js
// handleKeyDown에서
if (isMod && event.key === 'c') {
  // 데이터를 준비하고, 직접 copy 이벤트를 에디터 DOM에 dispatch
  const copyEvent = new ClipboardEvent('copy', { clipboardData: new DataTransfer() })
  // ... 데이터 설정 후 dispatch
}
```

**접근 C**: 멀티셀렉트 시 ProseMirror Selection을 실제 텍스트 범위로 설정

멀티셀렉트된 토글들의 전체 범위를 ProseMirror TextSelection으로 설정하면, 기본 copy가 해당 범위를 복사함. 단, 중간에 선택되지 않은 토글이 있는 경우(비연속 선택) 처리가 필요.

---

## 관련 파일

| 파일 | 역할 |
|------|------|
| `src/components/TipTapEditor/extensions/ToggleExtension.js` | 토글 블록 정의, 멀티셀렉트 플러그인, 키보드 핸들러 |
| `src/components/TipTapEditor/TipTapEditor.jsx` | 에디터 설정, handlePaste, clipboardTextSerializer |

## 현재 코드에 남아있는 디버깅 로그

제거 대상 (문제 해결 후):
- `ToggleExtension.js`: `console.log('[멀티복사]...')`, `console.log('[DOM이벤트]...')`
- `TipTapEditor.jsx`: `console.log('[붙여넣기]...')`
