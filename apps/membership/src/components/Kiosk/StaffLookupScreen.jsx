// 직원 조회모드 — 번호패드 입력 → 조회 → 결과 카드(인사말·회원여부·팝콘 이벤트·수령내역).
// 데이터는 프록시 Edge(LIVE 게이트) 경유. 팝콘 1일1회는 서버(crm.membership_events partial-unique)가 강제.
import { useState } from 'react'
import NumberPad from './NumberPad'
import { lookupMember, claimEvent, getEventHistory, CONTRACT_PENDING } from '../../api/membership'

const EVENT_TYPE = 'popcorn'

// 오늘 날짜(로컬) YYYY-MM-DD.
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// claimed_at(ISO) → "N월 N일 N시에 팝콘 수령"
function formatClaim(claimedAt) {
  const d = new Date(claimedAt)
  if (isNaN(d)) return String(claimedAt)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours()}시에 팝콘 수령`
}

export default function StaffLookupScreen({ onGoSignup }) {
  const [digits, setDigits] = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | found | notfound | error
  const [result, setResult] = useState(null)
  const [history, setHistory] = useState([])   // [{event_date, claimed_at}] 최신순
  const [claiming, setClaiming] = useState(false)
  const [errMsg, setErrMsg] = useState('')

  const reset = () => { setDigits(''); setStatus('idle'); setResult(null); setHistory([]); setErrMsg('') }

  // 수령 내역 로드(있으면). 미배포/실패해도 조회 자체는 유지(내역만 빈 목록).
  const loadHistory = async (memberId) => {
    try {
      const h = await getEventHistory(memberId, EVENT_TYPE)
      setHistory(Array.isArray(h?.events) ? h.events : [])
    } catch { setHistory([]) }
  }

  const handleLookup = async () => {
    setStatus('loading'); setErrMsg(''); setHistory([])
    try {
      const r = await lookupMember(digits)
      if (r?.found) { setResult(r); setStatus('found'); loadHistory(r.member_id) }
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
      loadHistory(result.member_id) // 내역 갱신
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
          onChange={(v) => { setDigits(v); if (status !== 'idle') { setStatus('idle'); setResult(null); setHistory([]) } }}
          onSubmit={handleLookup}
          submitLabel="조회"
          disabled={status === 'loading'}
        />
      </div>

      <div className="mk-col mk-result">
        {CONTRACT_PENDING && status === 'idle' && (
          <div className="mk-note">※ CRM 데이터 연결 대기 — 배포 후 활성화(현재 UI 미리보기).</div>
        )}
        {status === 'idle' && <div className="mk-placeholder">번호를 입력하고 조회하세요.</div>}
        {status === 'loading' && <div className="mk-placeholder">조회 중…</div>}

        {status === 'found' && result && (
          <div className="mk-card mk-card-member">
            {/* 1. 기본 인사말 */}
            <div className="mk-greeting">안녕하세요, {result.display_name || '회원'} 멤버십 회원님!</div>
            <div className="mk-badge">● 멤버십 회원</div>

            {/* 2. 사르르 팝콘 이벤트 */}
            <div className="mk-event-section">
              <div className="mk-event-label">멤버십 이벤트 참여</div>
              {result.today_event_claimed ? (
                <button className="mk-claim-btn" disabled>
                  오늘({todayStr()}): 참여 완료 ✓
                </button>
              ) : (
                <button className="mk-claim-btn" onClick={handleClaim} disabled={claiming}>
                  {claiming ? '적립 중…' : '사르르 팝콘 이벤트 참여'}
                </button>
              )}
              {result._justClaimed && <div className="mk-claimed">팝콘 수령 완료 🍿</div>}

              {/* 수령 내역 */}
              {history.length > 0 && (
                <ul className="mk-history">
                  {history.map((h, i) => (
                    <li key={h.claimed_at || i}>{formatClaim(h.claimed_at)}</li>
                  ))}
                </ul>
              )}
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
