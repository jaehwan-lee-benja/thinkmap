// 고객 가입폼 — 정돈된 3칸(이름·이메일·전화번호) 줄맞춤 정렬(D).
//   이름·이메일 = 태블릿 키보드, 전화번호 = 탭하면 번호패드 팝업(항상 표시 아님).
//   ★이메일 필수(B): 없으면 셀프가입 불가 → "직원에게 문의" 안내. 자동완성 차단(공용 키오스크).
import { useState } from 'react'
import NumberPadModal from './NumberPadModal'
import { formatPhone } from './kioskUtils'
import MaskedPhone from './MaskedPhone'
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
  const [domOpen, setDomOpen] = useState(false)
  const [name, setName] = useState('')
  const [emailLocal, setEmailLocal] = useState('')
  const [emailDomain, setEmailDomain] = useState('')
  const [emailCustom, setEmailCustom] = useState('')
  const [consent, setConsent] = useState(false)
  const [status, setStatus] = useState('idle') // idle | submitting | done | dup | error
  const [errMsg, setErrMsg] = useState('')
  const [pending, setPending] = useState(false)   // 승격 전(=아직 조회 안 됨)

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
      // ★2026-08-08 — **거짓 성공 경로를 막는다.** 종전 조건은 «명시적으로 ok:false 가 아니면 성공»이라
      //   `null`·`{}`(빈 본문·204·프록시가 본문을 삼킨 경우)에도 **축하 화면이 떴다.**
      //   ⇒ 성공은 «성공 신호가 온 것»으로만 인정한다.
      if (!r || !(r.ok === true || r.member_id)) {
        setStatus('error')
        setErrMsg('가입 응답을 받지 못했습니다. 직원에게 문의해 주세요.')
        return
      }
      // ★서버 실제 반환(2026-08-08 crm RPC 원문 실측):
      //     { ok:false, error:'invalid phone' } | { ok:true, dup:true } | { ok:true, dup:false, merged:bool }
      //   ⚠**`dup:true` 는 «이미 회원»이라 새로 저장된 게 없다.** 종전엔 이걸 그대로 «가입 완료 🎉»로
      //   보여줬다 — 유저가 겪은 «축하까지 봤는데 가입이 안 됐다»의 정체다(실측: 그 번호는 7/26 에 이미
      //   등록돼 있었고 오늘 새 행은 생기지 않았다).
      if (r.dup === true) { setStatus('dup'); return }
      // `merged:false` = 아직 **canonical 연결 전**(승격 배치 대기) ⇒ **지금은 조회로 안 나온다.**
      //   손님에게 «바로 조회된다»고 약속하지 않는다 — 직원 경로로 안내한다.
      setPending(r.merged === false)
      setStatus('done')
    } catch (e) {
      setStatus('error'); setErrMsg(e?.message || '가입 실패')
    }
  }

  // ★이미 회원 — «축하»가 아니라 «이미 되어 있다»를 말한다(거짓 축하 금지).
  if (status === 'dup') {
    return (
      <div className="mk-screen mk-customer">
        <div className="mk-card mk-card-member mk-thanks">
          <div className="mk-badge">이미 멤버십 회원이세요</div>
          <p>이 번호는 <b>이미 가입</b>되어 있습니다.<br />처음 화면에서 번호를 넣어 조회해 보세요.</p>
          <p className="mk-note">조회가 안 되면 <b>직원에게 문의</b>해 주세요 — 확인해 드립니다.</p>
          <button className="mk-reset" onClick={onDone}>처음으로</button>
        </div>
      </div>
    )
  }

  if (status === 'done') {
    return (
      <div className="mk-screen mk-customer">
        <div className="mk-card mk-card-member mk-thanks mk-celebrate">
          <div className="mk-confetti" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></div>
          <div className="mk-check" aria-hidden="true">✓</div>
          <div className="mk-badge">가입 완료 🎉</div>
          <p>사르르목장 멤버십에 오신 것을 환영합니다!</p>
          {/* ★조회가 «지금»은 안 되는 경우를 숨기지 않는다(승격 배치 대기). 시간을 약속하지 않고 사람에게 연결한다. */}
          {pending && <p className="mk-note">조회는 <b>직원에게 말씀해 주시면</b> 바로 확인해 드립니다.</p>}
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
            {/* ★가입 폼에서도 가린다 — 이름·이메일을 채우는 동안 번호가 **화면에 오래 떠 있다**(노출 시간이 가장 길다).
                고쳐야 하면 탭해서 패드를 열면 되고, 그 안에 «번호 보기»가 있다. */}
            {digits ? <MaskedPhone digits={digits} /> : <span className="mk-phone-ph">탭하여 번호 입력</span>}
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
              /* ★네이티브 `<select>` 를 뺐다(2026-08-08 유저 실측: 「도메인 이메일 누르는게 화면이 잘린다」).
                 안드로이드 WebView 의 select 팝업은 **우리 CSS 밖**에서 그려져 위치·크기를 우리가 통제할 수
                 없다 — 뷰포트를 넘으면 잘리는 걸 막을 방법이 없다. ⇒ 팝업을 안 쓰고 **우리가 그리는 시트**로
                 바꿨다(2택 시트와 같은 문법). 어르신 기준 큰 터치 타겟이라는 이점도 같이 온다. */
              <button type="button" className="mk-email-dom mk-dom-btn" onClick={() => setDomOpen(true)} disabled={submitting}>
                {emailDomain || <span className="mk-phone-ph">도메인 선택</span>}
              </button>
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

      {/* 도메인 선택 시트 — 화면 밖으로 나갈 수 없다(우리가 그리므로 항상 뷰포트 안). */}
      {domOpen && (
        <div className="mk-pick-overlay" role="dialog" aria-modal="true" aria-label="이메일 도메인 선택"
          onClick={(e) => { if (e.target === e.currentTarget) setDomOpen(false) }}>
          <div className="mk-pick mk-dom-sheet">
            <div className="mk-pick-q">이메일 주소를 고르세요</div>
            <div className="mk-dom-grid">
              {DOMAINS.map((d) => (
                <button key={d} type="button" className={`mk-dom-opt ${emailDomain === d ? 'is-on' : ''}`}
                  onClick={() => { setEmailDomain(d); setDomOpen(false) }}>@{d}</button>
              ))}
              <button type="button" className="mk-dom-opt"
                onClick={() => { setEmailDomain(CUSTOM); setDomOpen(false) }}>직접 입력</button>
            </div>
            <button type="button" className="mk-reset" onClick={() => setDomOpen(false)}>닫기</button>
          </div>
        </div>
      )}

      <NumberPadModal open={padOpen} digits={digits} onChange={setDigits} onClose={() => setPadOpen(false)} mask />
    </div>
  )
}
