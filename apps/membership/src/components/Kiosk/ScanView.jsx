// 카운터 회수 단독 화면(?role=scan) — ★하위호환용으로 유지한다.
//   직원 허브(?role=staff)가 조회·스캔·리스트를 통합했지만, 카운터 노트북에 **이 주소가 이미
//   북마크/시작페이지로 걸려 있을 수 있어** 끊지 않는다. 로직·UI 는 허브와 **같은 모듈을 공유**한다.
//   차이는 입력 방식 하나뿐: 여기는 **전용 입력창**(포커스 유지), 허브는 **전역 리스너**(포커스 안 뺏음).
import { useState, useRef, useEffect } from 'react'
import { CONTRACT_PENDING } from '../../api/membership'
import { charFromKey, ASCII_TOKEN_RE } from './scanInput'
import { useTicketScan } from './useTicketScan'
import ScanResultPanel from './ScanResultPanel'
import BackofficeHomeButton from './BackofficeHomeButton'

export default function ScanView() {
  const scan = useTicketScan()
  const [token, setToken] = useState('')
  const [printMsg, setPrintMsg] = useState('')
  const inputRef = useRef(null)
  const bufRef = useRef('')
  const setBuf = (v) => {
    bufRef.current = v
    setToken(v)
    if (inputRef.current && inputRef.current.value !== v) inputRef.current.value = v
  }

  // 리더 입력 대비 — 이 화면은 스캔 전용이라 포커스를 유지해도 충돌 대상이 없다.
  useEffect(() => {
    const t = setInterval(() => { if (inputRef.current && document.activeElement !== inputRef.current) inputRef.current.focus() }, 800)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="mk-scan">
      <BackofficeHomeButton />
      <h2 className="mk-scan-title">팝콘 티켓 스캔</h2>
      <input
        ref={inputRef}
        className="mk-scan-input"
        type="text" autoFocus
        placeholder="바코드 스캔 또는 토큰 입력 후 엔터"
        value={token}
        onKeyDown={(e) => {
          const code = e.code || ''
          if (code === 'Enter' || code === 'NumpadEnter' || (!code && e.key === 'Enter')) {
            e.preventDefault(); const v = bufRef.current; setBuf(''); scan.doLookup(v); return
          }
          if (code === 'Backspace' || (!code && e.key === 'Backspace')) { e.preventDefault(); setBuf(bufRef.current.slice(0, -1)); return }
          if (code === 'Escape' || (!code && e.key === 'Escape')) { e.preventDefault(); setBuf(''); return }
          if (e.ctrlKey || e.metaKey || e.altKey) return
          const ch = charFromKey(e)
          if (ch) { e.preventDefault(); setBuf((bufRef.current + ch).slice(0, 32)) }
        }}
        onChange={(e) => {
          const v = String(e.target.value || '').toUpperCase()
          if (v && ASCII_TOKEN_RE.test(v) && v.length > bufRef.current.length) setBuf(v)
          else if (inputRef.current) inputRef.current.value = bufRef.current
        }}
        onCompositionStart={() => { if (inputRef.current) inputRef.current.value = bufRef.current }}
        onCompositionEnd={() => { if (inputRef.current) inputRef.current.value = bufRef.current }}
        onPaste={(e) => {
          const t = (e.clipboardData && e.clipboardData.getData('text')) || ''
          const clean = t.toUpperCase().replace(/[^0-9A-Z]/g, '')
          if (clean) { e.preventDefault(); setBuf((bufRef.current + clean).slice(0, 32)) }
        }}
        autoComplete="off" name="mk-noauto-scan" data-lpignore="true" data-1p-ignore
        autoCapitalize="characters" spellCheck={false} lang="en"
      />
      {CONTRACT_PENDING && <div className="mk-note">※ LIVE 플래그 꺼짐 — 배포 환경에서 활성.</div>}
      <div className="mk-note">직원 허브(<b>?role=staff</b>)에서 조회·스캔·리스트를 한 화면에서 쓸 수 있습니다.</div>
      <ScanResultPanel scan={scan} printMsg={printMsg} setPrintMsg={setPrintMsg} />
    </div>
  )
}
