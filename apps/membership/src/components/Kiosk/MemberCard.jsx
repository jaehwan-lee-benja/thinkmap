// 공용 회원 카드 — 브랜드 히어로(인사말)+본문(이벤트·참여내역·스탬프). 고객뷰·직원뷰 공용.
import { formatClaimPrefix, todayStr } from './kioskUtils'

const EVENT_LABEL = '팝콘 이벤트'   // 이벤트명(태그 강조). 이벤트가 늘면 엔티티로 확장.
const STAMP_GOAL = 10               // ★증폭: N회 참여 시 아이스크림(시안, 데이터모델=crm 조율).

export default function MemberCard({ member, history = [], claiming, errMsg, onClaim, onReset, resetLabel = '새 조회', variant = 'card' }) {
  if (!member) return null

  // ★#1 날짜버그 수정: "오늘 참여 완료"는 오늘(로컬=KST) 날짜의 참여 기록이 있을 때만.
  //   서버 today_event_claimed(UTC 경계 오판 의심) 대신 참여내역의 event_date(=참여 당시 KST 날짜)로 판정.
  //   내역이 없을 때만 서버 플래그로 폴백(미리보기 등).
  const today = todayStr()
  const claimedToday = history.length
    ? history.some((h) => String(h.event_date || '').slice(0, 10) === today)
    : !!member.today_event_claimed

  // ★#4 스탬프(시안): 참여 누적으로 아이스크림까지 진행. 현재 사이클 진행도.
  const count = history.length
  const inCycle = count % STAMP_GOAL
  const cycleFilled = count > 0 && inCycle === 0 ? STAMP_GOAL : inCycle // 딱 달성 순간은 가득 표시
  const remain = STAMP_GOAL - cycleFilled
  const reached = count > 0 && inCycle === 0

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

          {/* ★#4 스탬프 진행(시안) — 아이스크림까지 */}
          <div className="mk-stamp" aria-label={`아이스크림까지 ${remain}회`}>
            <div className="mk-stamp-head">
              <span className="mk-stamp-title">🍦 아이스크림까지</span>
              <span className="mk-stamp-count">{cycleFilled}/{STAMP_GOAL}</span>
            </div>
            <div className="mk-stamp-dots" aria-hidden="true">
              {Array.from({ length: STAMP_GOAL }).map((_, i) => (
                <span key={i} className={`mk-stamp-dot ${i < cycleFilled ? 'is-on' : ''}`} />
              ))}
            </div>
            <div className="mk-stamp-msg">
              {reached ? '🎉 아이스크림을 받으실 수 있어요!' : `${remain}번 더 모으면 아이스크림 🍦`}
            </div>
          </div>

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
