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

## 해결 완료 — 멀티셀렉트 복사 (Cmd+C) + 붙여넣기 중첩 문제

### 근본 원인 분석

**붙여넣기 중첩 원인**: ProseMirror의 `Slice` 객체에 `openStart`/`openEnd` 값이 설정되면, 피팅 알고리즘(`replaceRange`)이 토글 노드의 `defining: true` 속성을 경계로 인식하여 내부에 삽입함.

**멀티셀렉트 복사 실패 원인**: `contentEditable=false` 요소(드래그 핸��, 토글 버튼, 체크박스)를 Cmd+클릭하면 에디터가 포커스를 잃어서, `copy` 이벤트가 에디터의 `handleDOMEvents`에 도달하지 않음.

### 이전 시도 (접근 1~3) — 실패

1. `handleKeyDown`에서 `navigator.clipboard.write()` → 비동기 + 보안 정책 불안정
2. `handleDOMEvents.copy` → 에디터 포커스 상실로 이벤트 미도달
3. `editor.view.focus()` 복원 → 타이밍 불일치

### 최종 해결 — ProseMirror 공식 클립보드 파이프라인 활용

#### 1) `transformCopied` + `transformPasted` 플러그인 (붙여넣기 중첩 해결)

```js
new Plugin({
  props: {
    transformCopied(slice) {
      if (slice.content.firstChild?.type.name === 'toggle') {
        return new Slice(slice.content, 0, 0) // 완결된 블록으로 취급
      }
      return slice
    },
    transformPasted(slice) {
      if (slice.content.firstChild?.type.name === 'toggle') {
        return new Slice(slice.content, 0, 0)
      }
      return slice
    },
  },
})
```

`openStart=0, openEnd=0`으로 강제하면 ProseMirror 피팅 알고리즘이 토글을 "완결된 블록"으로 인식하여 형제 레벨에 삽입함.

#### 2) `document` 레벨 copy/cut 리스너 + `serializeForClipboard` (멀티셀렉트 복사 해결)

```js
// 멀티셀렉트 플러그인의 view() lifecycle에서 등록/해제
view(editorView) {
  const handleCopy = (event) => {
    const filtered = collectMultiSelectedNodes(editorView.state)
    if (filtered.length === 0) return
    const slice = new Slice(Fragment.from(nodes), 0, 0)
    const { dom, text } = editorView.serializeForClipboard(slice)
    event.clipboardData.clearData()
    event.clipboardData.setData('text/html', dom.innerHTML)
    event.clipboardData.setData('text/plain', text)
    event.preventDefault()
  }
  document.addEventListener('copy', handleCopy)
  return { destroy() { document.removeEventListener('copy', handleCopy) } }
}
```

- `document` 레벨이므로 에디터 포커스 유무와 무관하게 동작
- `view.serializeForClipboard()`는 ProseMirror 내부에서 사용하는 공식 함수로, `data-pm-slice` 메타데이터를 자동 포함

#### 3) `handlePaste` 정리

`TipTapEditor.jsx`의 `handlePaste`에서 토글 HTML 수동 파싱 로직(섹션 1)을 제거. `transformPasted`가 공식 파이프라인에서 처리하므로 불필요. 텍스트 여러 줄 붙여넣기(섹�� 2)만 유지.

---

## 관련 파일

| 파일 | 역할 |
|------|------|
| `src/components/TipTapEditor/extensions/ToggleExtension.js` | 토글 블록 정의, 멀티셀렉트 플러그인, 키보드 핸들러 |
| `src/components/TipTapEditor/TipTapEditor.jsx` | 에디터 설정, handlePaste, clipboardTextSerializer |

## 디버깅 로그

모두 제거 완료.
