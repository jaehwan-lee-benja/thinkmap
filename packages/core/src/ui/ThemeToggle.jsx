// 테마 토글 — system → light → dark 순환. localStorage 저장 + 즉시 적용(setThemePref).
// onChange(pref): 앱이 user_preferences 등 크로스디바이스 저장에 쓰라고 콜백. 상세: docs/THEME-SPEC.md
import { useState } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import { getThemePref, setThemePref } from '../theme.js'
import './ThemeToggle.css'

const ORDER = ['system', 'light', 'dark']
const ICON = { system: Monitor, light: Sun, dark: Moon }
const LABEL = { system: '시스템', light: '라이트', dark: '다크' }

export function ThemeToggle({ onChange, className = '' }) {
  const [pref, setPref] = useState(getThemePref)
  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length]
    setPref(next)
    setThemePref(next)
    onChange?.(next)
  }
  const Icon = ICON[pref] || Monitor
  return (
    <button
      type="button"
      className={`theme-toggle ${className}`.trim()}
      onClick={cycle}
      title={`테마: ${LABEL[pref]} (클릭해 전환)`}
      aria-label={`테마 ${LABEL[pref]}, 클릭해 전환`}
    >
      <Icon size={16} />
    </button>
  )
}
