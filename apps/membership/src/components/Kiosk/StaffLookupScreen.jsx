// 직원 조회모드 — 번호패드 입력 → 조회 → 결과 카드(회원여부·표시명·포인트·오늘 이벤트).
// ★조회/적립은 계약 미확정(STUB). lookupMember/claimEvent 배선 시 아래 handleLookup/handleClaim 만 채운다.
import { useState } from 'react'
import NumberPad from './NumberPad'
import { lookupMember, claimEvent, CONTRACT_PENDING } from '../../api/membership'

// 오늘 날짜(로컬) YYYY-MM-DD.
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const EVENT_TYPE = 'popcorn' // v1 단일 이벤트(팝콘). 확장은 SPEC §7.

export default function StaffLookupScreen({ onGoSignup }) {
  const [digits, setDigits] = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | found | notfound | error
  const [result, setResult] = useState(null)
  const [claiming, setClaiming] = useState(false)
  const [errMsg, setErrMsg] = useState('')

  const reset = () => { setDigits(''); setStatus('idle'); setResult(null); setErrMsg('') }

  const handleLookup = async () => {
    setStatus('loading'); setErrMsg('')
    try {
      const r = await lookupMember(digits)
      if (r?.found) { setResult(r); setStatus('found') }
      else { setResult(null); setStatus('notfound') }
    } catch (e) {
      setStatus('error'); setErrMsg(e?.message || '조회 실패')
    }
  }

  const handleClaim = async () => {
    if (!result?.member_id) return
    setClaiming(true); setErrMsg('')
    try {
      const r = await claimEvent(result.member_id, EVENT_TYPE, todayStr())
      setResult((prev) => ({ ...prev, today_event_claimed: true, _justClaimed: !r?.already }))
    } catch (e) {
      setErrMsg(e?.message || '적립 실패')
    } finally {
      setClaiming(false)
    }
  }

  return (
    <div className="mk-screen mk-staff">
      <div className="mk-col">
        <NumberPad
          digits={digits}
          onChange={(v) => { setDigits(v); if (status !== 'idle') { setStatus('idle'); setResult(null) } }}
          onSubmit={handleLookup}
          submitLabel="조회"
          disabled={status === 'loading'}
        />
      </div>

      <div className="mk-col mk-result">
        {CONTRACT_PENDING && status === 'idle' && (
          <div className="mk-note">※ CRM 데이터 계약 확정 후 실제 조회가 연결됩니다(현재 UI 미리보기).</div>
        )}
        {status === 'idle' && <div className="mk-placeholder">번호를 입력하고 조회하세요.</div>}
        {status === 'loading' && <div className="mk-placeholder">조회 중…</div>}

        {status === 'found' && result && (
          <div className="mk-card mk-card-member">
            <div className="mk-badge">● 회원</div>
            <div className="mk-name">{result.display_name || '(이름 비공개)'}</div>
            {/* 포인트는 v1 미표시 — 스냅샷 혼란 회피, v2 라이브 UnionPOS 로 연기(SPEC §4·유저결정 2026-07-24). */}
            <div className="mk-event">
              오늘 팝콘:{' '}
              {result.today_event_claimed
                ? <strong className="mk-claimed">{result._justClaimed ? '적립 완료 ✓' : '이미 받음 ✓'}</strong>
                : <button className="mk-claim-btn" onClick={handleClaim} disabled={claiming}>
                    {claiming ? '적립 중…' : '적립하기'}
                  </button>}
            </div>
            {errMsg && <div className="mk-err">{errMsg}</div>}
            <button className="mk-reset" onClick={reset}>새 조회</button>
          </div>
        )}

        {status === 'notfound' && (
          <div className="mk-card mk-card-none">
            <div className="mk-badge mk-badge-none">회원 아님</div>
            <p>가입되어 있지 않습니다.</p>
            <button className="mk-signup-cta" onClick={onGoSignup}>고객 가입모드로 →</button>
            <button className="mk-reset" onClick={reset}>새 조회</button>
          </div>
        )}

        {status === 'error' && (
          <div className="mk-card mk-card-err">
            <div className="mk-badge mk-badge-none">조회 오류</div>
            <p className="mk-err">{errMsg}</p>
            <button className="mk-reset" onClick={reset}>다시</button>
          </div>
        )}
      </div>
    </div>
  )
}
