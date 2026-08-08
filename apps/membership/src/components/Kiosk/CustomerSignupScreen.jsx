// 고객 가입폼 — 정돈된 3칸(이름·이메일·전화번호) 줄맞춤 정렬(D).
//   이름·이메일 = 태블릿 키보드, 전화번호 = 탭하면 번호패드 팝업(항상 표시 아님).
//   ★이메일 필수(B): 없으면 셀프가입 불가 → "직원에게 문의" 안내. 자동완성 차단(공용 키오스크).
import { useState } from 'react'
import NumberPadModal from './NumberPadModal'
import { formatPhone } from './kioskUtils'
import { signupMember, CONTRACT_PENDING } from '../../api/membership'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CUSTOM = '__custom__'
const DOMAINS = ['gmail.com', 'naver.com', 'daum.net', 'hanmail.net', 'kakao.com', 'nate.com', 'outlook.com']
const CONSENT_TEXT =
  '사르르목장 소식 전달 및 멤버십 회원 관리 목적으로 개인정보를 수집·이용하는 데 동의합니다.'

// ★initialPhone: 미회원 조회 결과에서 [가입하기]로 넘어올 때 **친 번호를 그대로 들고 온다**
//   (2026-08-08 유저 지시). 손님이 방금 누른 11자리를 다시 누르게 하는 건 어르신 기준에서 특히 나쁘다.
export default function CustomerSignupScreen({ onDone, initialPhone = '010' }) {
  const [digits, setDigits] = useState(initialPhone || '010')
  const [padOpen, setPadOpen] = useState(false)
  const [name, setName] = useState('')
  const [emailLocal, setEmailLocal] = useState('')
  const [emailDomain, setEmailDomain] = useState('')
  const [emailCustom, setEmailCustom] = useState('')
  const [consent, setConsent] = useState(false)
  const [status, setStatus] = useState('idle') // idle | submitting | done | error
  const [errMsg, setErrMsg] = useState('')

  const domain = emailDomain === CUSTOM ? emailCustom.trim() : emailDomain
  const email = `${emailLocal.trim()}@${domain}`
  const emailValid = emailLocal.trim().length > 0 && domain.length > 0 && EMAIL_RE.test(email)
  const submitting = status === 'submitting'

  // ★이메일 필수(B). 전화·이름·이메일·동의 모두 충족해야 셀프가입.
  const canSubmit = digits.length >= 10 && name.trim().length > 0 && emailValid && consent && !submitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    setStatus('submitting'); setErrMsg('')
    try {
      // ★2026-08-04: 반환값을 버리면 안 된다. intake RPC 는 실패도 **HTTP 200 + {ok:false,error}** 로 준다
      //   → 종전엔 "invalid phone" 이어도 축하 화면이 떠서 **손님이 가입된 줄 알고 떠났다**(거짓 성공).
      const r = await signupMember({ phone: digits, name: name.trim(), email, consent: true, source: 'kiosk' })
      if (r && r.ok === false) {
        const why = r.error === 'invalid phone' ? '전화번호를 다시 확인해 주세요.' : (r.error || '가입 처리 실패')
        setStatus('error'); setErrMsg(why); return
      }
      setStatus('done')
    } catch (e) {
      setStatus('error'); setErrMsg(e?.message || '가입 실패')
    }
  }

  if (status === 'done') {
    return (
      <div className="mk-screen mk-customer">
        <div className="mk-card mk-card-member mk-thanks mk-celebrate">
          <div className="mk-confetti" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></div>
          <div className="mk-check" aria-hidden="true">✓</div>
          <div className="mk-badge">가입 완료 🎉</div>
          <p>사르르목장 멤버십에 오신 것을 환영합니다!</p>
          <button className="mk-reset" onClick={onDone}>완료</button>
        </div>
      </div>
    )
  }

  const noauto = { autoComplete: 'off', 'data-lpignore': 'true', 'data-1p-ignore': true }

  return (
    <div className="mk-screen mk-customer">
      {/* 뒤로가기(조회/첫 화면으로) — 어르신 친화 큰 터치영역 */}
      <button type="button" className="mk-back-btn" onClick={onDone}>← 뒤로</button>
      <div className="mk-signup-head">
        <h2>멤버십 가입</h2>
        <p>이름·전화번호·이메일을 입력해 주세요.</p>
      </div>

      {/* 정돈된 3칸 폼(줄맞춤) */}
      <div className="mk-form">
        <label className="mk-form-row">
          <span className="mk-form-label">이름</span>
          <input className="mk-form-input" type="text" value={name}
            onChange={(e) => setName(e.target.value)} placeholder="이름"
            disabled={submitting} name="mk-noauto-name" {...noauto} />
        </label>

        <label className="mk-form-row">
          <span className="mk-form-label">전화번호</span>
          {/* 탭하면 번호패드 팝업(항상 표시 아님) */}
          <button type="button" className="mk-form-input mk-phone-btn" onClick={() => setPadOpen(true)} disabled={submitting}>
            {digits ? formatPhone(digits) : <span className="mk-phone-ph">탭하여 번호 입력</span>}
          </button>
        </label>

        <div className="mk-form-row">
          <span className="mk-form-label">이메일</span>
          <div className="mk-form-input mk-email-inline">
            <input className="mk-email-local" type="text" inputMode="email" value={emailLocal}
              onChange={(e) => setEmailLocal(e.target.value)} placeholder="아이디"
              autoCapitalize="none" spellCheck={false} disabled={submitting} name="mk-noauto-el" {...noauto} />
            <span className="mk-email-at">@</span>
            {emailDomain === CUSTOM ? (
              <input className="mk-email-dom" type="text" value={emailCustom}
                onChange={(e) => setEmailCustom(e.target.value)} placeholder="직접입력"
                autoCapitalize="none" spellCheck={false} disabled={submitting} name="mk-noauto-ed" {...noauto} />
            ) : (
              <select className="mk-email-dom" value={emailDomain}
                onChange={(e) => setEmailDomain(e.target.value)} disabled={submitting}>
                <option value="">도메인 선택</option>
                {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
                <option value={CUSTOM}>직접입력</option>
              </select>
            )}
          </div>
        </div>

        {/* 이메일 없는 손님 안내(B) — 셀프가입은 이메일 필수, 없으면 직원 경로 */}
        <div className="mk-staff-refer">이메일이 없으시면 직원에게 문의 바랍니다.</div>

        <label className="mk-consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>{CONSENT_TEXT}</span>
        </label>

        <button type="button" className="mk-signup-submit" onClick={handleSubmit} disabled={!canSubmit}>
          {submitting ? '가입 중…' : '가입'}
        </button>

        {CONTRACT_PENDING && <div className="mk-note">※ CRM 데이터 연결 대기 — 배포 후 활성화(미리보기).</div>}
        {errMsg && <div className="mk-err">{errMsg}</div>}
      </div>

      <NumberPadModal open={padOpen} digits={digits} onChange={setDigits} onClose={() => setPadOpen(false)} />
    </div>
  )
}
