// 고객 가입모드 — 직원이 태블릿을 가로로 돌려 고객을 향하게 함(물리 회전, 화면 UI는 정방향).
// 2단 레이아웃: 좌=전화번호+번호패드(패드+물리키보드), 우=이름·이메일 텍스트입력(태블릿 키보드)+동의+가입.
// ★조회 결과가 화면에 없음(§5 격리): 고객이 만져도 타인 정보 미노출. 가입은 프록시 Edge(LIVE 게이트).
import { useState } from 'react'
import NumberPad from './NumberPad'
import { signupMember, CONTRACT_PENDING } from '../../api/membership'

// 가벼운 이메일 형식 검증(태블릿 오타 방지용, 최종 검증은 crm intake).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function CustomerSignupScreen({ onDone }) {
  const [digits, setDigits] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [status, setStatus] = useState('idle') // idle | submitting | done | error
  const [errMsg, setErrMsg] = useState('')

  const emailValid = EMAIL_RE.test(email.trim())
  const canSubmit =
    digits.length >= 10 && name.trim().length > 0 && emailValid && consent && status !== 'submitting'

  const handleSubmit = async () => {
    if (!canSubmit) return
    setStatus('submitting'); setErrMsg('')
    try {
      await signupMember({ phone: digits, name: name.trim(), email: email.trim(), consent: true, source: 'kiosk' })
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
        <p>전화번호·이름·이메일을 입력해 주세요.</p>
      </div>
      <div className="mk-signup-grid">
        {/* 좌: 전화번호 + 번호패드(패드+물리키보드). 제출버튼은 우측으로. */}
        <div className="mk-signup-left">
          <NumberPad
            digits={digits}
            onChange={setDigits}
            onSubmit={handleSubmit}
            disabled={status === 'submitting'}
            submitDisabled={!canSubmit}
            hideSubmit
          />
        </div>

        {/* 우: 이름·이메일(태블릿 키보드) + 동의 + 가입 */}
        <div className="mk-signup-right">
          <label className="mk-field">
            <span>이름</span>
            <input
              type="text"
              inputMode="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름"
              autoComplete="off"
              disabled={status === 'submitting'}
            />
          </label>
          <label className="mk-field">
            <span>이메일</span>
            <input
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={status === 'submitting'}
            />
            {email.length > 0 && !emailValid && (
              <span className="mk-field-hint">이메일 형식을 확인해 주세요.</span>
            )}
          </label>

          <label className="mk-consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>개인정보 수집·이용에 동의합니다.</span>
          </label>

          <button
            type="button"
            className="mk-signup-submit"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {status === 'submitting' ? '가입 중…' : '가입'}
          </button>

          {CONTRACT_PENDING && (
            <div className="mk-note">※ CRM 데이터 연결 대기 — 배포 후 활성화(현재 UI 미리보기).</div>
          )}
          {errMsg && <div className="mk-err">{errMsg}</div>}
        </div>
      </div>
    </div>
  )
}
