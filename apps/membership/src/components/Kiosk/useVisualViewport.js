// «보이는 뷰포트»를 재는 훅 — 2026-08-22.
//
// ★왜 필요한가(현장 신고 「도메인 선택이 세로형에서 잘린다」의 물리적 원인 후보):
//   안드로이드 WebView 는 소프트 키보드가 뜰 때 **창을 줄이는 대신 화면을 «밀어 올릴»(pan) 수 있다**
//   (`adjustPan`). 그러면 **레이아웃 뷰포트는 그대로 1024** 인데 **눈에 보이는 영역만 위로 밀린다** ⇒
//   `position: fixed; bottom: 0` 인 시트는 «화면 아래»(키보드 뒤)로 사라진다. **헤드리스로는 재현되지 않는다**
//   — 창 크기를 줄이는 시뮬은 «resize» 쪽이라 pan 을 흉내 내지 못한다.
//   ⇒ 그래서 «레이아웃 뷰포트»가 아니라 **`window.visualViewport`(실제로 보이는 영역)** 를 기준으로 시트를 놓는다.
//
// ★없는 브라우저에서는(구형·비표준) `null` 을 돌려주고, 호출부는 **CSS 기본 배치로 되돌아간다** —
//   즉 이 훅은 «더 나은 배치»를 얹을 뿐 기존 동작을 대체하지 않는다(실패해도 종전과 같아진다).
import { useState, useEffect } from 'react'

export function useVisualViewport(active) {
  const [rect, setRect] = useState(null)
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!active || !vv) { setRect(null); return }
    const read = () => setRect({ top: vv.offsetTop, height: vv.height })
    read()
    vv.addEventListener('resize', read)
    vv.addEventListener('scroll', read)
    return () => { vv.removeEventListener('resize', read); vv.removeEventListener('scroll', read) }
  }, [active])
  return rect
}

// 시트를 열기 «전에» 키보드를 내린다 — pan 자체를 없애는 가장 확실한 수단.
//   ★입력칸에서 포커스를 떼면 IME 가 닫히고 화면이 제자리로 돌아온다. 우리가 그리는 시트는
//   키보드가 필요 없으므로 잃는 게 없다(다시 타이핑하려면 입력칸을 누르면 된다).
export function dismissKeyboard() {
  const el = typeof document !== 'undefined' ? document.activeElement : null
  if (el && typeof el.blur === 'function' && el !== document.body) el.blur()
}
