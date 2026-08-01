// 공용 회원 카드 — 브랜드 히어로(인사말)+본문(이벤트·참여내역·스탬프). 고객뷰·직원뷰 공용.
import { formatClaimPrefix, todayStr } from './kioskUtils'

const EVENT_LABEL = '팝콘 이벤트'   // 이벤트명(태그 강조). 이벤트가 늘면 엔티티로 확장.
const STAMP_GOAL = 10               // ★증폭: N회 참여 시 아이스크림(시안, 데이터모델=crm 조율).

export default function MemberCard({ member, history = [], claiming, redeeming, errMsg, onClaim, onRedeem, onReset, resetLabel = '새 조회', variant = 'card' }) {
  if (!member) return null

  // ★오늘 참여 여부 = 서버 today_event_claimed(0017에서 KST 교정됨). 프론트 KST 우회 제거.
  const today = todayStr()
  const claimedToday = !!member.today_event_claimed

  // ★스탬프 = crm 실값(0017). current_stamps(0~9)/threshold, rewards_available.
  const stamp = member.stamp || null
  const goal = stamp?.threshold ?? STAMP_GOAL
  const filled = Math.max(0, Math.min(goal, stamp?.current_stamps ?? 0))
  const remain = goal - filled
  const rewardsAvail = stamp?.rewards_available ?? 0

  return (
    <div className={`mk-card mk-member-card ${variant === 'hero' ? 'mk-member-card-hero' : ''}`}>
      <div className="mk-member-hero">
        <div className="mk-member-badge-row">
          <span className="mk-member-badge">멤버십 회원</span>
          {/* ★#2 인증 체크 = 텍스트 뒤로(절제 SVG) */}
          <svg className="mk-verified" viewBox="0 0 24 24" aria-label="인증 회원" role="img">
            <circle cx="12" cy="12" r="11" />
            <path d="M6.8 12.5 L10.4 16 L17.2 8.4" />
          </svg>
        </div>
        <div className="mk-greeting">
          안녕하세요,<br /><b>{member.display_name || '회원'}</b> 회원님!
        </div>
        {variant === 'hero' && (
          <img className="mk-hero-pose" src={`${import.meta.env.BASE_URL}img/cow-pose-welcome.png`} alt="" aria-hidden="true" />
        )}
      </div>

      <div className="mk-member-body">
        <div className="mk-event-section">
          <div className="mk-event-label">멤버십 이벤트</div>
          {claimedToday ? (
            <div className="mk-event-done">오늘({today}) 참여 완료 ✓</div>
          ) : (
            <>
              <div className="mk-event-todo">오늘은 아직 참여 전이에요.</div>
              <button className="mk-claim-btn" onClick={onClaim} disabled={claiming || !onClaim}>
                {claiming ? '적립 중…' : <>사르르 <span className="mk-evt-tag">{EVENT_LABEL}</span> 참여</>}
              </button>
            </>
          )}
          {member._justClaimed && <div className="mk-claimed">참여 완료 🎉</div>}
          {member._justRedeemed && <div className="mk-claimed">아이스크림 수령 완료 🍦🎉</div>}

          {/* ★스탬프 진행(실값) — 아이스크림까지. crm stamp 있을 때만. */}
          {stamp && (
            <div className="mk-stamp" aria-label={`아이스크림까지 ${remain}회`}>
              <div className="mk-stamp-head">
                <span className="mk-stamp-title">🍦 아이스크림까지</span>
                <span className="mk-stamp-count">{filled}/{goal}</span>
              </div>
              {/* ★S9 종이 도장판 — 찍힌 칸=마스코트 도장(미세 회전으로 손도장 느낌), 마지막 칸=쿵 모션 */}
              <div className="mk-stampcard" aria-hidden="true">
                {Array.from({ length: goal }).map((_, i) => (
                  <span key={i} className={`mk-stamp-cell ${i < filled ? 'is-on' : ''} ${i === filled - 1 && member._justClaimed ? 'is-new' : ''}`}>
                    {i < filled && (
                      <img className="mk-stamp-ink" src={`${import.meta.env.BASE_URL}img/cow-mark-white.png`} alt="" style={{ transform: `rotate(${((i * 37) % 17) - 8}deg)` }} />
                    )}
                  </span>
                ))}
              </div>
              {rewardsAvail > 0 ? (
                <div className="mk-reward-ready">
                  <span className="mk-reward-msg">🍦 아이스크림 {rewardsAvail}개 수령 가능!</span>
                  {onRedeem && (
                    <button className="mk-reward-btn" onClick={onRedeem} disabled={redeeming}>
                      {redeeming ? '수령 중…' : '수령'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="mk-stamp-msg">{remain}번 더 모으면 아이스크림 🍦</div>
              )}
            </div>
          )}

          {history.length > 0 && (
            <div className="mk-history-wrap">
              <div className="mk-history-title">참여 내역</div>
              <ul className="mk-history">
                {history.map((h, i) => (
                  <li key={h.claimed_at || i}>
                    {formatClaimPrefix(h.claimed_at)} <span className="mk-evt-tag">{EVENT_LABEL}</span> 참여
                  </li>
                ))}
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
