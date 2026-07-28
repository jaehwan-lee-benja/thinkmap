// 공용 회원 카드 — 세련화(C): 브랜드 히어로(인사말)+본문(이벤트·수령내역). 고객뷰·직원뷰 공용.
import { formatClaim, todayStr } from './kioskUtils'

export default function MemberCard({ member, history = [], claiming, errMsg, onClaim, onReset, resetLabel = '새 조회', variant = 'card' }) {
  if (!member) return null
  return (
    <div className={`mk-card mk-member-card ${variant === 'hero' ? 'mk-member-card-hero' : ''}`}>
      {/* 히어로(선호 레이아웃 복귀): 인증 배지 pill + 인사말, 인사말 아래 환영 포즈 소 은은히.
          ★소 크롭 상단배치 제거(유저정정), 배지는 절제되게 작게. */}
      <div className="mk-member-hero">
        <div className="mk-member-badge-row">
          {/* 인증 배지 — 정본 팔레트 인라인 SVG(작게·절제) */}
          <svg className="mk-verified" viewBox="0 0 24 24" aria-label="인증 회원" role="img">
            <circle cx="12" cy="12" r="11" />
            <path d="M6.8 12.5 L10.4 16 L17.2 8.4" />
          </svg>
          <span className="mk-member-badge">멤버십 회원</span>
        </div>
        <div className="mk-greeting">
          안녕하세요,<br /><b>{member.display_name || '회원'}</b> 회원님!
        </div>
        {/* 환영 포즈 소(전신) — 인사말 아래 빈 공간에 은은히(hero 변형에서만) */}
        {variant === 'hero' && (
          <img className="mk-hero-pose" src={`${import.meta.env.BASE_URL}img/cow-pose-welcome.png`} alt="" aria-hidden="true" />
        )}
      </div>

      {/* 본문 — 이벤트 참여 + 수령내역 */}
      <div className="mk-member-body">
        <div className="mk-event-section">
          <div className="mk-event-label">멤버십 이벤트</div>
          {member.today_event_claimed ? (
            <div className="mk-event-done">오늘({todayStr()}) 참여 완료 ✓</div>
          ) : (
            <button className="mk-claim-btn" onClick={onClaim} disabled={claiming || !onClaim}>
              {claiming ? '적립 중…' : '사르르 팝콘 이벤트 참여'}
            </button>
          )}
          {member._justClaimed && <div className="mk-claimed">참여 완료 🎉</div>}

          {history.length > 0 && (
            <div className="mk-history-wrap">
              <div className="mk-history-title">참여 내역</div>
              <ul className="mk-history">
                {history.map((h, i) => <li key={h.claimed_at || i}>{formatClaim(h.claimed_at)}</li>)}
              </ul>
            </div>
          )}
        </div>

        {errMsg && <div className="mk-err">{errMsg}</div>}
        {onReset && <button className="mk-reset" onClick={onReset}>{resetLabel}</button>}
      </div>
    </div>
  )
}
