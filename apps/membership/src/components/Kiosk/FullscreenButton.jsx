// 전체화면 토글 버튼 — Fullscreen API(데스크톱·Android). iOS Safari 는 이 API 미지원 →
//   그쪽은 "홈 화면에 추가"(manifest fullscreen + apple-mobile-web-app-capable)로 전체화면(버튼은 자동 숨김).
//   키오스크 코너에 작게. 매장 직원이 세팅 시 1회 탭.
import { useState, useEffect } from 'react'

const docEl = () => document.documentElement
const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement)
const supported = typeof document !== 'undefined' &&
  !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)

export default function FullscreenButton() {
  const [fs, setFs] = useState(false)

  useEffect(() => {
    const onChange = () => setFs(isFs())
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
    }
  }, [])

  if (!supported) return null

  const toggle = () => {
    if (isFs()) {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)
    } else {
      const el = docEl()
      ;(el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)
    }
  }

  return (
    <button className="mk-fs-btn" onClick={toggle} title="전체화면" aria-label="전체화면 전환">
      {fs ? '⤢' : '⛶'}
    </button>
  )
}
