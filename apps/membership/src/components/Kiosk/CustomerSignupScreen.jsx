// 고객 가입모드 — 직원이 태블릿을 가로로 돌려 고객을 향하게 함(물리 회전, 화면 UI는 정방향).
// 2단 레이아웃: 좌=이름·이메일(태블릿 키보드)+동의+가입, 우=전화번호 번호패드(패드+물리키보드).
// 어르신 이용 많음 → 대형 UI. 이메일은 @앞 직접입력 + @뒤 도메인 드롭다운(일반 가입 사이트 방식).
// ★조회 결과가 화면에 없음(§5 격리): 고객이 만져도 타인 정보 미노출. 가입은 프록시 Edge(LIVE 게이트).
import { useState } from 'react'
import NumberPad from './NumberPad'
import { signupMember, CONTRACT_PENDING } from '../../api/membership'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CUSTOM = '__custom__'
// 일반 가입 사이트 도메인 목록(+ 직접입력).
const DOMAINS = ['gmail.com', 'naver.com', 'daum.net', 'hanmail.net', 'kakao.com', 'nate.com', 'outlook.com']
const CONSENT_TEXT =
  '사르르목장 소식 전달 및 멤버십 회원 관리 목적으로 개인정보를 수집·이용하는 데 동의합니다.'

export default function CustomerSignupScreen({ onDone }) {
  const [digits, setDigits] = useState('')
  const [name, setName] = useState('')
  const [emailLocal, setEmailLocal] = useState('')
  const [emailDomain, setEmailDomain] = useState('')       // '' | 도메인 | CUSTOM
  const [emailCustom, setEmailCustom] = useState('')
  const [consent, setConsent] = useState(false)
  const [status, setStatus] = useState('idle') // idle | submitting | done | error
  const [errMsg, setErrMsg] = useState('')

  const domain = emailDomain === CUSTOM ? emailCustom.trim() : emailDomain
  const email = `${emailLocal.trim()}@${domain}`
  const emailValid = emailLocal.trim().length > 0 && domain.length > 0 && EMAIL_RE.test(email)

  const canSubmit =
    digits.length >= 10 && name.trim().length > 0 && emailValid && consent && status !== 'submitting'

  const handleSubmit = async () => {
    if (!canSubmit) return
    setStatus('submitting'); setErrMsg('')
    try {
      await signupMember({ phone: digits, name: name.trim(), email, consent: true, source: 'kiosk' })
      setStatus('done')
    } catch (e) {
      setStatus('error'); setErrMsg(e?.message || '가입 실패')
    }
  }

  // 가입 완료 — 축하 애니메이션(컨페티 + 체크마크 팝)
  if (status === 'done') {
    return (
      <div className="mk-screen mk-customer">
        <div className="mk-card mk-card-member mk-thanks mk-celebrate">
          <div className="mk-confetti" aria-hidden="true">
            <i /><i /><i /><i /><i /><i /><i /><i />
          </div>
          <div className="mk-check" aria-hidden="true">✓</div>
          <div className="mk-badge">가입 완료 🎉</div>
          <p>사르르목장 멤버십에 오신 것을 환영합니다!</p>
          <button className="mk-reset" onClick={onDone}>완료</button>
        </div>
      </div>
    )
  }

  const submitting = status === 'submitting'

  return (
    <div className="mk-screen mk-customer">
      <div className="mk-signup-head">
        <h2>멤버십 가입</h2>
        <p>이름·이메일과 전화번호를 입력해 주세요.</p>
      </div>
      <div className="mk-signup-grid">
        {/* 좌: 이름·이메일 + 동의 + 가입 */}
        <div className="mk-signup-left">
          <label className="mk-field">
            <span>이름</span>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="이름" autoComplete="off" disabled={submitting}
            />
          </label>

          <div className="mk-field">
            <span>이메일</span>
            <div className="mk-email-row">
              <input
                className="mk-email-local"
                type="text" inputMode="email" value={emailLocal}
                onChange={(e) => setEmailLocal(e.target.value)}
                placeholder="이메일 아이디" autoComplete="off" autoCapitalize="none" spellCheck={false}
                disabled={submitting}
              />
              <span className="mk-email-at">@</span>
              <div className="mk-email-domain">
                {emailDomain === CUSTOM ? (
                  <input
                    type="text" inputMode="url" value={emailCustom}
                    onChange={(e) => setEmailCustom(e.target.value)}
                    placeholder="직접 입력" autoComplete="off" autoCapitalize="none" spellCheck={false}
                    disabled={submitting}
                  />
                ) : (
                  <select value={emailDomain} onChange={(e) => setEmailDomain(e.target.value)} disabled={submitting}>
                    <option value="">도메인 선택</option>
                    {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
                    <option value={CUSTOM}>직접 입력</option>
                  </select>
                )}
              </div>
            </div>
            {emailDomain === CUSTOM && (
              <button type="button" className="mk-reset mk-email-back" onClick={() => { setEmailDomain(''); setEmailCustom('') }}>
                ← 목록에서 선택
              </button>
            )}
            {(emailLocal.length > 0 || domain.length > 0) && !emailValid && (
              <span className="mk-field-hint">이메일 주소를 확인해 주세요.</span>
            )}
          </div>

          <label className="mk-consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>{CONSENT_TEXT}</span>
          </label>

          <button type="button" className="mk-signup-submit" onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? '가입 중…' : '가입'}
          </button>

          {CONTRACT_PENDING && (
            <div className="mk-note">※ CRM 데이터 연결 대기 — 배포 후 활성화(현재 UI 미리보기).</div>
          )}
          {errMsg && <div className="mk-err">{errMsg}</div>}
        </div>

        {/* 우: 전화번호 번호패드(패드+물리키보드) */}
        <div className="mk-signup-right">
          <span className="mk-pad-label">전화번호</span>
          <NumberPad
            digits={digits}
            onChange={setDigits}
            onSubmit={handleSubmit}
            disabled={submitting}
            submitDisabled={!canSubmit}
            hideSubmit
          />
        </div>
      </div>
    </div>
  )
}
