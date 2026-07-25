// 고객 가입모드 — 직원이 태블릿을 가로로 돌려 고객을 향하게 함(물리 회전, 화면 UI는 정방향). 최소 필드(번호·이름·동의).
// ★조회 결과가 화면에 없음(§5 격리): 고객이 만져도 타인 정보 미노출. 가입은 프록시 Edge(LIVE 게이트).
import { useState } from 'react'
import NumberPad from './NumberPad'
import { signupMember, CONTRACT_PENDING } from '../../api/membership'

export default function CustomerSignupScreen({ onDone }) {
  const [digits, setDigits] = useState('')
  const [name, setName] = useState('')
  const [consent, setConsent] = useState(false)
  const [status, setStatus] = useState('idle') // idle | submitting | done | error
  const [errMsg, setErrMsg] = useState('')

  const canSubmit = digits.length >= 10 && name.trim().length > 0 && consent && status !== 'submitting'

  const handleSubmit = async () => {
    if (!canSubmit) return
    setStatus('submitting'); setErrMsg('')
    try {
      await signupMember({ phone: digits, name: name.trim(), consent: true, source: 'kiosk' })
      setStatus('done')
    } catch (e) {
      setStatus('error'); setErrMsg(e?.message || '가입 실패')
    }
  }

  if (status === 'done') {
    return (
      <div className="mk-screen mk-customer">
        <div className="mk-card mk-card-member mk-thanks">
          <div className="mk-badge">가입 완료 🎉</div>
          <p>멤버십에 오신 것을 환영합니다.</p>
          <button className="mk-reset" onClick={onDone}>완료</button>
        </div>
      </div>
    )
  }

  return (
    <div className="mk-screen mk-customer">
      <div className="mk-signup-head">
        <h2>멤버십 가입</h2>
        <p>전화번호와 이름을 입력해 주세요.</p>
      </div>
      <div className="mk-signup-body">
        <NumberPad
          digits={digits}
          onChange={setDigits}
          onSubmit={handleSubmit}
          submitLabel="가입"
          disabled={status === 'submitting'}
          submitDisabled={!canSubmit}
        />
        <div className="mk-signup-fields">
          <label className="mk-field">
            <span>이름</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름"
              autoComplete="off"
            />
          </label>
          <label className="mk-consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>개인정보 수집·이용에 동의합니다.</span>
          </label>
          {CONTRACT_PENDING && (
            <div className="mk-note">※ CRM 데이터 계약 확정 후 실제 가입이 연결됩니다(현재 UI 미리보기).</div>
          )}
          {errMsg && <div className="mk-err">{errMsg}</div>}
        </div>
      </div>
    </div>
  )
}
